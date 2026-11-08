import crypto from 'node:crypto';
import sharp from 'sharp';
import { badRequest } from './errors.js';

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 25_000_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ACTIVE_CONTENT = /<\?php|<script[\s>]|<svg[\s>]|<!doctype\s+html|javascript:|onerror\s*=|onload\s*=/i;

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function assertNoActiveContent(buffer) {
  if (ACTIVE_CONTENT.test(buffer.toString('latin1'))) {
    throw badRequest('The image contains embedded active content.', 'UNSAFE_IMAGE');
  }
}

/**
 * Decode the image, apply orientation, and write a completely new image. This
 * removes EXIF/XMP/ICC/comment chunks, strips trailing polyglot payloads, and
 * prevents malformed containers from surviving the upload boundary.
 */
export async function sanitizeImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) {
    throw badRequest('The image could not be decoded.', 'INVALID_IMAGE');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw badRequest('The image must be 3 MB or smaller.', 'IMAGE_TOO_LARGE');
  }

  const type = detectImageType(buffer);
  if (!type) {
    throw badRequest('Only PNG, JPEG, or WebP images are accepted.', 'UNSUPPORTED_IMAGE');
  }
  assertNoActiveContent(buffer);

  let metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: false,
    }).metadata();
  } catch {
    throw badRequest('The image could not be decoded.', 'INVALID_IMAGE');
  }

  if (!metadata.width || !metadata.height) {
    throw badRequest('The image has no readable dimensions.', 'INVALID_IMAGE');
  }
  if (Number(metadata.pages ?? 1) > 1 || metadata.pageHeight && metadata.pageHeight !== metadata.height) {
    throw badRequest('Animated images are not accepted for payment proof.', 'UNSUPPORTED_IMAGE');
  }
  if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw badRequest('The image dimensions are too large.', 'IMAGE_DIMENSIONS');
  }

  let pipeline = sharp(buffer, {
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
    animated: false,
  }).rotate();

  if (type === 'image/png') {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else if (type === 'image/jpeg') {
    pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
  } else {
    pipeline = pipeline.webp({ quality: 88, effort: 4 });
  }

  let output;
  try {
    output = await pipeline.toBuffer({ resolveWithObject: true });
  } catch {
    throw badRequest('The image could not be re-encoded safely.', 'INVALID_IMAGE');
  }

  const data = output.data;
  if (!data || data.length < 16 || data.length > MAX_UPLOAD_BYTES) {
    throw badRequest('The sanitized image is too large or invalid.', 'IMAGE_TOO_LARGE');
  }
  if (detectImageType(data) !== type) {
    throw badRequest('The sanitized image type could not be verified.', 'INVALID_IMAGE');
  }
  assertNoActiveContent(data);

  return {
    buffer: data,
    mime: type,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    bytes: data.length,
    width: output.info.width,
    height: output.info.height,
  };
}

export async function parseImageDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    String(dataUrl ?? '').trim()
  );
  if (!match) {
    throw badRequest('Upload the proof as a PNG, JPEG, or WebP data URL.', 'INVALID_IMAGE');
  }

  const declared = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const body = match[2].replace(/\s+/g, '');
  if (body.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 16) {
    throw badRequest('The image must be 3 MB or smaller.', 'IMAGE_TOO_LARGE');
  }

  let buffer;
  try {
    buffer = Buffer.from(body, 'base64');
  } catch {
    throw badRequest('The image could not be decoded.', 'INVALID_IMAGE');
  }
  if (buffer.length < 16 || buffer.length > MAX_UPLOAD_BYTES) {
    throw badRequest('The image must be between 16 bytes and 3 MB.', 'INVALID_IMAGE');
  }

  const detected = detectImageType(buffer);
  if (!detected || detected !== `image/${declared}`) {
    throw badRequest('The file contents do not match the declared image type.', 'INVALID_IMAGE');
  }

  return sanitizeImageBuffer(buffer);
}

export async function sanitizeImageDataUrl(dataUrl) {
  const sanitized = await parseImageDataUrl(dataUrl);
  return {
    ...sanitized,
    dataUrl: `data:${sanitized.mime};base64,${sanitized.buffer.toString('base64')}`,
  };
}
