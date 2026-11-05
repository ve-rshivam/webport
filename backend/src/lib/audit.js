
import { prisma } from './prisma.js';
import { clientIp, userAgent } from './security.js';

export const AUDIT_ACTIONS = Object.freeze({
  ADMIN_LOGIN_SUCCESS: 'ADMIN_LOGIN_SUCCESS',
  ADMIN_LOGIN_FAILED: 'ADMIN_LOGIN_FAILED',
  ADMIN_2FA_SUCCESS: 'ADMIN_2FA_SUCCESS',
  ADMIN_2FA_FAILED: 'ADMIN_2FA_FAILED',
  ADMIN_LOGOUT_ALL: 'ADMIN_LOGOUT_ALL',
  CLIENT_LOGIN_SUCCESS: 'CLIENT_LOGIN_SUCCESS',
  CLIENT_LOGIN_FAILED: 'CLIENT_LOGIN_FAILED',
  CLIENT_LOGOUT_ALL: 'CLIENT_LOGOUT_ALL',
  PASSWORD_RESET_ISSUED: 'PASSWORD_RESET_ISSUED',
  PROJECT_CREATED_OR_MODIFIED: 'PROJECT_CREATED_OR_MODIFIED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  QR_PAYMENT_APPROVED: 'QR_PAYMENT_APPROVED',
  QR_PAYMENT_REJECTED: 'QR_PAYMENT_REJECTED',
  PAYMENT_WEBHOOK_PROCESSED: 'PAYMENT_WEBHOOK_PROCESSED',
  PAYMENT_WEBHOOK_REPLAYED: 'PAYMENT_WEBHOOK_REPLAYED',
  EMAIL_FAILOVER_TRIGGERED: 'EMAIL_FAILOVER_TRIGGERED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
});

const PRISMA_MISSING_SCHEMA = new Set(['P2021', 'P2022']);
const AUDIT_WRITE_TIMEOUT_MS = 2000;

export async function recordAudit({
  action,
  actorId = null,
  actorRole = null,
  targetEmail = null,
  req = null,
  metadata = null,
} = {}) {
  if (!action) return null;

  const write = prisma.auditLog
    .create({
      data: {
        action,
        actorId: actorId ? String(actorId) : null,
        actorRole,
        targetEmail,
        ipAddress: clientIp(req),
        userAgent: userAgent(req),
        ...(metadata ? { metadata } : {}),
      },
    })
    .catch((err) => {
      if (!PRISMA_MISSING_SCHEMA.has(err?.code)) {
        console.error('[audit] could not persist audit event:', err?.message ?? err);
      }
      return null;
    });

  const timeout = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), AUDIT_WRITE_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();
  });

  return Promise.race([write, timeout]);
}
