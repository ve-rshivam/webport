import { prisma } from '../prisma.js';
import { clientIp, userAgent } from '../security.js';

const SENSITIVE_KEY = /password|token|otp|secret|proof|authorization|signature|hash/i;

function scrub(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 3) return '[depth-limit]';
  if (Array.isArray(value)) return value.slice(0, 25).map((entry) => scrub(entry, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : scrub(entry, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.slice(0, 500);
  return value;
}

export const CRM_AUDIT = Object.freeze({
  LOGIN_SUCCESS: 'CRM_LOGIN_SUCCESS',
  LOGIN_FAILED: 'CRM_LOGIN_FAILED',
  LOGOUT: 'CRM_LOGOUT',
  SESSION_REFRESHED: 'CRM_SESSION_REFRESHED',
  SESSION_DEVICE_MISMATCH: 'CRM_SESSION_DEVICE_MISMATCH',
  ACCESS_DENIED: 'CRM_ACCESS_DENIED',
  CUSTOMER_CREATED: 'CRM_CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CRM_CUSTOMER_UPDATED',
  CUSTOMER_ARCHIVED: 'CRM_CUSTOMER_ARCHIVED',
  STAGE_CHANGED: 'CRM_STAGE_CHANGED',
  PROJECT_CREATED: 'CRM_PROJECT_CREATED',
  PROJECT_UPDATED: 'CRM_PROJECT_UPDATED',
  PROJECT_STATUS_CHANGED: 'CRM_PROJECT_STATUS_CHANGED',
  INVOICE_CREATED: 'CRM_INVOICE_CREATED',
  INVOICE_ISSUED: 'CRM_INVOICE_ISSUED',
  INVOICE_VOIDED: 'CRM_INVOICE_VOIDED',
  PAYMENT_SUBMITTED: 'CRM_PAYMENT_SUBMITTED',
  PAYMENT_VERIFIED: 'CRM_PAYMENT_VERIFIED',
  PAYMENT_REJECTED: 'CRM_PAYMENT_REJECTED',
  PAYMENT_RECORDED: 'CRM_PAYMENT_RECORDED',
  PAYMENT_REFUNDED: 'CRM_PAYMENT_REFUNDED',
  PROOF_RESTORED: 'CRM_PROOF_RESTORED',
  PROOF_PURGED: 'CRM_PROOF_PURGED',
  ACTIVITY_CREATED: 'CRM_ACTIVITY_CREATED',
});

export async function recordCrmAudit({
  actor = null,
  actorRole = null,
  action,
  entityType = null,
  entityId = null,
  targetEmail = null,
  req = null,
  before = null,
  after = null,
  outcome = 'SUCCESS',
  metadata = null,
  client = prisma,
} = {}) {
  if (!action) return null;
  try {
    return await client.auditLog.create({
      data: {
        action,
        actorId: actor?.id ? String(actor.id) : null,
        actorRole: actorRole ?? actor?.role ?? null,
        targetEmail: targetEmail ?? actor?.email ?? null,
        ipAddress: clientIp(req),
        userAgent: userAgent(req),
        entityType,
        entityId: entityId ? String(entityId) : null,
        requestId: req?.id ?? null,
        outcome,
        before: before ? scrub(before) : null,
        after: after ? scrub(after) : null,
        ...(metadata ? { metadata: scrub(metadata) } : {}),
      },
    });
  } catch (err) {
    if (!['P2021', 'P2022'].includes(err?.code)) {
      console.error('[crm-audit]', err?.message ?? err);
    }
    return null;
  }
}
