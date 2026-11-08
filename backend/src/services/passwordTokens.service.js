import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { ValidationError } from './validators.js';
import { clientIp, userAgent } from '../lib/security.js';

export const PASSWORD_TOKEN_PURPOSES = Object.freeze({
  RESET: 'PASSWORD_RESET',
  ONBOARDING: 'ONBOARDING',
});

export const RESET_TOKEN_TTL_MINUTES = 15;
export const ONBOARDING_TOKEN_TTL_MINUTES = 72 * 60;
export const MAX_PASSWORD_TOKEN_ATTEMPTS = 2;

function hashToken(rawToken) {
  return `sha256:${crypto.createHash('sha256').update(String(rawToken)).digest('hex')}`;
}

function newRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function issuePasswordToken({
  userId,
  purpose,
  ttlMinutes,
  req = null,
  requestedById = null,
  client = prisma,
}) {
  if (!Object.values(PASSWORD_TOKEN_PURPOSES).includes(purpose)) {
    throw new ValidationError('Unsupported password token purpose.');
  }
  if (!userId) throw new ValidationError('A user is required to issue a password token.');

  const rawToken = newRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + Number(ttlMinutes) * 60 * 1000);

  await client.passwordToken.updateMany({
    where: { userId, purpose, consumedAt: null, lockedAt: null },
    data: { consumedAt: new Date() },
  });

  const record = await client.passwordToken.create({
    data: {
      userId,
      purpose,
      tokenHash,
      expiresAt,
      maxAttempts: MAX_PASSWORD_TOKEN_ATTEMPTS,
      requestIp: clientIp(req),
      requestUserAgent: userAgent(req),
      requestedById,
    },
  });

  return { rawToken, tokenHash, expiresAt, record };
}

export function tokenHashFor(rawToken) {
  return hashToken(rawToken);
}

export async function findValidPasswordToken(rawToken, client = prisma) {
  if (!rawToken) return null;
  const token = await client.passwordToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!token) return null;
  if (token.consumedAt || token.lockedAt) return null;
  if (token.expiresAt.getTime() <= Date.now()) return null;
  if (token.attempts >= token.maxAttempts) return null;
  return token;
}

/**
 * Atomically claims one of the two permitted attempts. Call this before
 * validating the submitted password so a failed completion really consumes an
 * attempt; call completePasswordToken after success, or failPasswordToken when
 * validation fails.
 */
export async function claimPasswordToken(rawToken, client = prisma) {
  const token = await client.passwordToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!token) {
    throw new ValidationError('This password setup link is invalid or has expired. Request a new one.');
  }
  if (token.consumedAt) {
    throw new ValidationError('This link has already been used. Request a new one.', 409);
  }
  if (token.lockedAt || token.attempts >= token.maxAttempts) {
    throw new ValidationError(
      `This link is locked. Email ${process.env.SUPPORT_EMAIL || 'support@rshivam.dev'} for a manual reset review.`,
      423
    );
  }
  if (token.expiresAt.getTime() <= Date.now()) {
    throw new ValidationError('This password setup link is invalid or has expired. Request a new one.');
  }

  const claimed = await client.passwordToken.updateMany({
    where: {
      id: token.id,
      consumedAt: null,
      lockedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: token.maxAttempts },
    },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    throw new ValidationError(
      `This link is locked. Email ${process.env.SUPPORT_EMAIL || 'support@rshivam.dev'} for a manual reset review.`,
      423
    );
  }

  return { ...token, attempts: token.attempts + 1 };
}

export async function failPasswordToken(tokenId, attempts, maxAttempts, client = prisma) {
  if (attempts >= maxAttempts) {
    await client.passwordToken.update({
      where: { id: tokenId },
      data: { lockedAt: new Date() },
    });
  }
  return {
    locked: attempts >= maxAttempts,
    remaining: Math.max(Number(maxAttempts) - Number(attempts), 0),
  };
}

export async function completePasswordToken(tokenId, client = prisma) {
  const token = await client.passwordToken.findUnique({ where: { id: tokenId }, select: { userId: true } });
  const completed = await client.passwordToken.updateMany({
    where: { id: tokenId, consumedAt: null, lockedAt: null },
    data: { consumedAt: new Date() },
  });
  if (completed.count === 0) {
    throw new ValidationError('This link has already been used. Request a new one.', 409);
  }
  if (token?.userId) {
    await client.crmSession.updateMany({
      where: { userId: token.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export async function revokePasswordTokensForUser(userId, client = prisma) {
  await client.passwordToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}
