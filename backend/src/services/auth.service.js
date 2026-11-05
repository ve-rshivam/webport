
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ConfigError, ValidationError } from './validators.js';
import { clientIp, deviceFingerprint, userAgent } from '../lib/security.js';

const BCRYPT_ROUNDS = 10;
export const TEMP_PASSWORD_TTL_MINUTES = 72 * 60;
export const OTP_TTL_MINUTES = 10;
export const SESSION_TTL_DAYS = 7;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new ConfigError('JWT_SECRET is not configured on the server.');
  return secret;
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_SYMBOLS = '!@#$%&*?';

export function generateTemporaryPassword(length = 12) {
  const pick = (alphabet) => alphabet[crypto.randomInt(0, alphabet.length)];
  const chars = [
    pick('ABCDEFGHJKLMNPQRSTUVWXYZ'),
    pick('abcdefghijkmnopqrstuvwxyz'),
    pick('23456789'),
    pick(PASSWORD_SYMBOLS),
  ];
  while (chars.length < length) chars.push(pick(PASSWORD_ALPHABET));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function hashSecret(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

export async function verifySecret(plain, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(String(plain), hash);
  } catch {
    return false;
  }
}

export function signPortalToken({ userId, email, role, sessionId, fingerprint }) {
  return jwt.sign(
    { sub: userId, email, role, sid: sessionId, type: 'portal', ...(fingerprint ? { fp: fingerprint } : {}) },
    jwtSecret(),
    { expiresIn: `${SESSION_TTL_DAYS}d`, algorithm: 'HS256' }
  );
}

export function verifyPortalToken(token) {
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (payload.type !== 'portal') throw new Error('wrong token type');
    return payload;
  } catch {
    throw new ValidationError('Session expired or invalid. Please sign in again.', 401);
  }
}

export async function issueSession(prisma, user, req = null) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const fingerprint = req ? deviceFingerprint(req) : null;

  const baseData = {
    sessionToken: sessionId,
    sessionTokenExpiry: expiresAt,
    lastLoginAt: new Date(),
  };
  const deviceData = fingerprint
    ? {
        sessionFingerprint: fingerprint,
        sessionUserAgent: userAgent(req),
        sessionIp: clientIp(req),
        lastActiveAt: new Date(),
      }
    : {};

  try {
    await prisma.user.update({ where: { id: user.id }, data: { ...baseData, ...deviceData } });
  } catch (err) {
            if (!fingerprint || !['P2021', 'P2022'].includes(err?.code)) throw err;
    await prisma.user.update({ where: { id: user.id }, data: baseData });
  }

  const token = signPortalToken({ userId: user.id, email: user.email, role: user.role, sessionId, fingerprint });
  return { token, sessionId, expiresAt };
}

export function createPortalAuth(prisma) {
  return async function portalAuth(req, res, next) {
    try {
      const header = req.headers.authorization ?? '';
      if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }
      const payload = verifyPortalToken(header.slice(7).trim());
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.sessionToken || user.sessionToken !== payload.sid) {
        return res.status(401).json({ success: false, message: 'Session is no longer valid. Please sign in again.' });
      }
      if (user.sessionTokenExpiry && user.sessionTokenExpiry.getTime() < Date.now()) {
        return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
      }
                  if (user.sessionFingerprint && payload.fp !== user.sessionFingerprint) {
        return res.status(401).json({
          success: false,
          message: 'This session is bound to another device. Please sign in again.',
        });
      }
      if (user.lastActiveAt && Date.now() - new Date(user.lastActiveAt).getTime() > 5 * 60 * 1000) {
        prisma.user
          .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
          .catch(() => {});
      }
      req.user = user;
      next();
    } catch (err) {
      return res.status(err.status ?? 401).json({ success: false, message: err.message });
    }
  };
}
