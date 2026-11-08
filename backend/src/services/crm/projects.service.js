import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/crm/errors.js';
import { assertCustomerAccess, accessibleCustomerIds, scopedCustomerWhere } from '../../lib/crm/scope.js';
import { body, date, enumValue, integer, money, optionalText, pagination, queryText, text, url } from '../../lib/crm/validate.js';
import { moneyString } from '../../lib/crm/money.js';
import { nextDocumentNumber } from '../../lib/crm/counters.js';
import { recordCrmAudit, CRM_AUDIT } from '../../lib/crm/audit.js';
import { paidByProject } from './ledger.service.js';

export const PROJECT_STATUSES = [
  'DISCOVERY',
  'IN_PROGRESS',
  'REVIEW',
  'BLOCKED',
  'DELIVERED',
  'ARCHIVED',
];

const STATUS_FLOW = Object.freeze({
  DISCOVERY: ['IN_PROGRESS', 'ARCHIVED'],
  IN_PROGRESS: ['REVIEW', 'BLOCKED', 'DELIVERED', 'ARCHIVED'],
  REVIEW: ['IN_PROGRESS', 'BLOCKED', 'DELIVERED'],
  BLOCKED: ['IN_PROGRESS', 'REVIEW', 'ARCHIVED'],
  DELIVERED: ['IN_PROGRESS', 'ARCHIVED'],
  ARCHIVED: ['DISCOVERY'],
});

const OWNER_SELECT = { select: { id: true, name: true, email: true } };

export function mapProject(project) {
  return {
    id: project.id,
    code: project.code,
    customerId: project.customerId,
    customer: project.customer
      ? { id: project.customer.id, contactName: project.customer.contactName, companyName: project.customer.companyName }
      : undefined,
    title: project.title,
    description: project.description,
    serviceType: project.serviceType,
    status: project.status,
    contractValue: moneyString(project.contractValue),
    currency: project.currency,
    startDate: project.startDate,
    dueDate: project.dueDate,
    deliveredAt: project.deliveredAt,
    progress: project.progress,
    previewUrl: project.previewUrl,
    repoUrl: project.repoUrl,
    owner: project.owner ?? null,
    ownerId: project.ownerId,
    clientSummary: project.clientSummary,
    version: project.version,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

async function validateProjectCustomer(actor, customerId) {
  const customer = await assertCustomerAccess(actor, customerId);
  if (customer.deletedAt) throw notFound('Customer not found.');
  return customer;
}

async function assertProjectOwner(ownerId) {
  if (!ownerId) return ownerId;
  const owner = await prisma.user.findFirst({
    where: { id: ownerId, crmActive: true, crmRole: { in: ['SUPERADMIN', 'ADMIN', 'TEAM'] } },
    select: { id: true },
  });
  if (!owner) throw badRequest('ownerId must belong to an active CRM team member.');
  return owner.id;
}

export async function createProject(actor, input, req = null) {
  const payload = body({ body: input });
  const customerId = text(payload.customerId, 'customerId', { max: 64 });
  const customer = await validateProjectCustomer(actor, customerId);

  const title = text(payload.title, 'title', { max: 200 });
  const status = enumValue(payload.status ?? 'DISCOVERY', 'status', PROJECT_STATUSES);
  const contractValue = payload.contractValue === undefined ? '0' : money(payload.contractValue, 'contractValue');
  const dueDate = date(payload.dueDate, 'dueDate', { required: false });
  const startDate = date(payload.startDate, 'startDate', { required: false });
  const progress = integer(payload.progress ?? 0, 'progress', { min: 0, max: 100 });
  const ownerId = await assertProjectOwner(payload.ownerId ? String(payload.ownerId) : null);

  const project = await prisma.$transaction(async (tx) => {
    const code = await nextDocumentNumber(tx, 'PRJ');
    const created = await tx.project.create({
      data: {
        code,
        customerId,
        title,
        description: optionalText(payload.description, 'description', { max: 5000 }) ?? null,
        serviceType: optionalText(payload.serviceType, 'serviceType', { max: 120 }) ?? null,
        status,
        contractValue,
        currency: payload.currency ? String(payload.currency).toUpperCase() : customer.currency,
        startDate: startDate ?? new Date(),
        dueDate: dueDate ?? null,
        progress,
        previewUrl: url(payload.previewUrl, 'previewUrl') ?? null,
        repoUrl: url(payload.repoUrl, 'repoUrl') ?? null,
        ownerId,
        clientSummary: optionalText(payload.clientSummary, 'clientSummary', { max: 2000 }) ?? null,
      },
      include: { customer: true, owner: OWNER_SELECT },
    });

    await tx.activity.create({
      data: {
        customerId,
        projectId: created.id,
        actorId: actor.id,
        actorType: 'USER',
        type: 'PROJECT_UPDATED',
        direction: 'INTERNAL',
        visibility: 'INTERNAL',
        subject: `Project created: ${created.title}`,
        body: `${created.code} · ${created.status}`,
        sourceTrust: 'TRUSTED',
        injectionRisk: 'NONE',
      },
    });

    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.PROJECT_CREATED,
      entityType: 'Project',
      entityId: created.id,
      req,
      after: mapProject(created),
      client: tx,
    });

    return created;
  });

  return mapProject(project);
}

export async function listProjects(actor, query = {}) {
  const ids = await accessibleCustomerIds(actor);
  const { limit, page, skip } = pagination(query);
  const q = queryText(query.q, 'q');

  const where = {
    deletedAt: null,
    ...(ids === null ? {} : { customerId: { in: ids } }),
    ...(query.status ? { status: enumValue(query.status, 'status', PROJECT_STATUSES) } : {}),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take: limit,
      include: { customer: { select: { id: true, contactName: true, companyName: true } }, owner: OWNER_SELECT },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    data: rows.map(mapProject),
    meta: { page, limit, total, hasMore: page * limit < total },
  };
}

export async function getProject(actor, projectId) {
  const ids = await accessibleCustomerIds(actor);
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      ...(ids === null ? {} : { customerId: { in: ids } }),
    },
    include: {
      customer: { select: { id: true, contactName: true, companyName: true, email: true } },
      owner: OWNER_SELECT,
      invoices: { orderBy: { createdAt: 'desc' } },
      payments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          method: true,
          status: true,
          amount: true,
          currency: true,
          baseAmountInr: true,
          receivedAt: true,
          createdAt: true,
        },
      },
      activities: {
        where: actor.role === 'CLIENT' ? { visibility: 'CLIENT' } : {},
        orderBy: { occurredAt: 'desc' },
        take: 50,
        include: { actor: { select: { id: true, name: true } } },
      },
    },
  });

  if (!project) throw notFound('Project not found.');

  const paid = (await paidByProject([projectId])).get(projectId) ?? 0;

  return {
    project: mapProject(project),
    invoices: project.invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      total: moneyString(invoice.total),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
    })),
    payments: project.payments.map((payment) => ({
      ...payment,
      amount: moneyString(payment.amount),
      baseAmountInr: moneyString(payment.baseAmountInr),
    })),
    totals: {
      contractValue: moneyString(project.contractValue),
      collected: moneyString(paid),
      balance: moneyString(Math.max(Number(project.contractValue) - paid, 0)),
    },
    activities: project.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      subject: activity.subject,
      body: activity.body,
      actor: activity.actor,
      actorType: activity.actorType,
      occurredAt: activity.occurredAt,
      injectionRisk: activity.injectionRisk,
    })),
  };
}

export async function updateProject(actor, projectId, input, req = null) {
  const project = await getProject(actor, projectId);
  if (actor.role === 'CLIENT') throw notFound('Project not found.');

  const payload = body({ body: input });
  const expectedVersion = integer(payload.version, 'version', { min: 1, max: 1_000_000 });
  if (project.project.version !== expectedVersion) {
    throw conflict('This project was changed by someone else. Reload and try again.', 'STALE_VERSION');
  }

  const data = {};
  if (payload.title !== undefined) data.title = text(payload.title, 'title', { max: 200 });
  if (payload.description !== undefined) {
    data.description = optionalText(payload.description, 'description', { max: 5000 });
  }
  if (payload.serviceType !== undefined) {
    data.serviceType = optionalText(payload.serviceType, 'serviceType', { max: 120 });
  }
  if (payload.contractValue !== undefined) data.contractValue = money(payload.contractValue, 'contractValue');
  if (payload.currency !== undefined) data.currency = String(payload.currency).toUpperCase();
  if (payload.startDate !== undefined) data.startDate = date(payload.startDate, 'startDate', { required: false });
  if (payload.dueDate !== undefined) data.dueDate = date(payload.dueDate, 'dueDate', { required: false });
  if (payload.progress !== undefined) data.progress = integer(payload.progress, 'progress', { min: 0, max: 100 });
  if (payload.previewUrl !== undefined) data.previewUrl = url(payload.previewUrl, 'previewUrl');
  if (payload.repoUrl !== undefined) data.repoUrl = url(payload.repoUrl, 'repoUrl');
  if (payload.ownerId !== undefined) {
    data.ownerId = payload.ownerId ? await assertProjectOwner(String(payload.ownerId)) : null;
  }
  if (payload.clientSummary !== undefined) {
    data.clientSummary = optionalText(payload.clientSummary, 'clientSummary', { max: 2000 });
  }

  const result = await prisma.project.updateMany({
    where: { id: projectId, version: expectedVersion, deletedAt: null },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count === 0) throw conflict('This project changed. Reload and try again.', 'STALE_VERSION');

  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: { customer: true, owner: OWNER_SELECT },
  });

  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.PROJECT_UPDATED,
    entityType: 'Project',
    entityId: projectId,
    req,
    before: project.project,
    after: mapProject(updated),
  });

  return mapProject(updated);
}

export async function changeProjectStatus(actor, projectId, input, req = null) {
  const existing = await getProject(actor, projectId);
  if (actor.role === 'CLIENT') throw notFound('Project not found.');

  const payload = body({ body: input });
  const toStatus = enumValue(payload.toStatus, 'toStatus', PROJECT_STATUSES);
  const note = optionalText(payload.note, 'note', { max: 2000 });
  const expectedVersion = integer(payload.version, 'version', { min: 1, max: 1_000_000 });

  if (existing.project.version !== expectedVersion) {
    throw conflict('This project was changed by someone else. Reload and try again.', 'STALE_VERSION');
  }
  if (existing.project.status === toStatus) return existing.project;
  if (!STATUS_FLOW[existing.project.status]?.includes(toStatus)) {
    throw conflict(`Cannot move a project from ${existing.project.status} to ${toStatus}.`, 'INVALID_TRANSITION');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.project.updateMany({
      where: { id: projectId, version: expectedVersion, deletedAt: null },
      data: {
        status: toStatus,
        version: { increment: 1 },
        ...(toStatus === 'DELIVERED' ? { deliveredAt: new Date(), progress: 100 } : {}),
      },
    });
    if (changed.count === 0) throw conflict('This project changed. Reload and try again.', 'STALE_VERSION');

    await tx.activity.create({
      data: {
        customerId: existing.project.customerId,
        projectId,
        actorId: actor.id,
        actorType: 'USER',
        type: 'PROJECT_UPDATED',
        direction: 'INTERNAL',
        visibility: 'INTERNAL',
        subject: `${existing.project.status} → ${toStatus}`,
        body: note ?? null,
        sourceTrust: 'UNTRUSTED',
        injectionRisk: 'NONE',
      },
    });

    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.PROJECT_STATUS_CHANGED,
      entityType: 'Project',
      entityId: projectId,
      req,
      before: { status: existing.project.status },
      after: { status: toStatus },
      metadata: { note: note ?? null },
      client: tx,
    });

    return tx.project.findUnique({
      where: { id: projectId },
      include: { customer: true, owner: OWNER_SELECT },
    });
  });

  return mapProject(updated);
}
