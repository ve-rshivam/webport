
import crypto from 'node:crypto';

export function clientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? '').split(',')[0];
  return String(req.ip || first || '').trim() || null;
}

export function userAgent(req) {
  const value = req?.headers?.['user-agent'];
  return String(Array.isArray(value) ? value[0] : value ?? '').slice(0, 255) || null;
}

export function ipSubnet(ip) {
  const value = String(ip ?? '').replace(/^::ffff:/, '');
  if (!value) return 'unknown';
  if (value.includes(':')) {
    return value.split(':').slice(0, 4).join(':') + '::/64';
  }
  const parts = value.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : value;
}

export function deviceFingerprint(req) {
  if (!req) return null;
  const material = `${userAgent(req) ?? ''}|${ipSubnet(clientIp(req))}`;
  return crypto.createHash('sha256').update(material).digest('hex');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const IMAGE_SIGNATURES = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

export function inspectImageDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl ?? '').trim());
  if (!match) return { ok: false, mime: null };
  const declared = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length < 16) return { ok: false, mime: null };

  const startsWith = (signature) => signature.every((byte, index) => buffer[index] === byte);
  const isPng = startsWith(IMAGE_SIGNATURES[0].bytes);
  const isJpeg = startsWith(IMAGE_SIGNATURES[1].bytes);
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  const detected = isPng ? 'png' : isJpeg ? 'jpeg' : isWebp ? 'webp' : null;
  if (!detected) return { ok: false, mime: null };
  if (declared === 'jpg' ? detected !== 'jpeg' : declared !== detected) {
    return { ok: false, mime: null };
  }
  return { ok: true, mime: detected };
}

export function isTrustedOrigin(origin, allowlist) {
  if (!origin) return true; 
  try {
    const parsed = new URL(origin);
    return allowlist.some((allowed) => {
      try {
        return new URL(allowed).origin === parsed.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
