import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden } from '../../lib/crm/errors.js';
import { accessibleCustomerIds, assertCustomerAccess } from '../../lib/crm/scope.js';
import { body, enumValue, optionalText, pagination, queryText, text } from '../../lib/crm/validate.js';
import { sanitizeUntrusted } from '../../lib/crm/promptSafety.js';
import { recordCrmAudit, CRM_AUDIT } from '../../lib/crm/audit.js';

const TEAM_ACTIVITY_TYPES = ['NOTE', 'CALL', 'EMAIL_OUT', 'EMAIL_IN'];
const VISIBILITIES = ['INTERNAL', 'CLIENT'];

const DIRECTION = {
  NOTE: 'INTERNAL',
  CALL: 'INTERNAL',
  EMAIL_OUT: 'OUTBOUND',
  EMAIL_IN: 'INBOUND',
};

export function mapActivity(activity) {
  return {
    id: activity.id,
    customerId: activity.customerId,
    projectId: activity.projectId,
    type: activity.type,
    direction: activity.direction,
    visibility: activity.visibility,
    subject: activity.subject,
    body: activity.body,
    actor: activity.actor ?? null,
    actorType: activity.actorType,
    fromStage: activity.fromStage,
    toStage: activity.toStage,
    injectionRisk: activity.injectionRisk,
    riskFlags: activity.riskFlags,
    occurredAt: activity.occurredAt,
    createdAt: activity.createdAt,
  };
}

export async function createActivity(actor, customerId, input, req = null) {
  if (actor.role === 'CLIENT') throw forbidden('Use the client portal to post messages.');
  const customer = await assertCustomerAccess(actor, customerId);
  if (customer.deletedAt) throw badRequest('That customer is archived.');

  const payload = body({ body: input });
  const type = enumValue(payload.type, 'type', TEAM_ACTIVITY_TYPES);
  const rawBody = text(payload.body, 'body', { min: 1, max: 10000 });
  const inspected = sanitizeUntrusted(rawBody, 'body', 10000);
  const subject = optionalText(payload.subject, 'subject', { max: 200 }) ?? null;
  const visibility = enumValue(payload.visibility ?? 'INTERNAL', 'visibility', VISIBILITIES);

  let projectId = null;
  if (payload.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: String(payload.projectId), customerId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw badRequest('projectId must belong to this customer.');
    projectId = project.id;
  }

  const activity = await prisma.activity.create({
    data: {
      customerId,
      projectId,
      actorId: actor.id,
      actorType: 'USER',
      type,
      direction: DIRECTION[type],
      visibility,
      subject,
      body: inspected.text,
      sourceTrust: inspected.trust,
      injectionRisk: inspected.risk,
      riskFlags: inspected.flags,
    },
    include: { actor: { select: { id: true, name: true } } },
  });

  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.ACTIVITY_CREATED,
    entityType: 'Activity',
    entityId: activity.id,
    req,
    after: { type, visibility, projectId },
    metadata: { injectionRisk: inspected.risk, riskFlags: inspected.flags, subject },
  });

  return mapActivity(activity);
}

export async function listActivity(actor, query = {}) {
  const ids = await accessibleCustomerIds(actor);
  const { limit, page, skip } = pagination(query);
  const q = queryText(query.q, 'q');

  const where = {
    ...(ids === null ? {} : { customerId: { in: ids } }),
    ...(actor.role === 'CLIENT' ? { visibility: 'CLIENT' } : {}),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(query.projectId ? { projectId: String(query.projectId) } : {}),
    ...(query.type
      ? { type: enumValue(query.type, 'type', [...TEAM_ACTIVITY_TYPES, 'STAGE_CHANGED', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'INVOICE_ISSUED', 'INVOICE_VOIDED', 'PROJECT_UPDATED', 'PORTAL_MESSAGE', 'SYSTEM', 'FILE_UPLOADED']) }
      : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' } },
            { body: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }],
      skip,
      take: limit,
      include: {
        actor: { select: { id: true, name: true } },
        customer: { select: { id: true, contactName: true, companyName: true } },
      },
    }),
    prisma.activity.count({ where }),
  ]);

  return {
    data: rows.map((row) => ({
      ...mapActivity(row),
      customer: row.customer,
    })),
    meta: { page, limit, total, hasMore: page * limit < total },
  };
}
