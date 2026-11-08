import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/crm/errors.js';
import {
  body,
  currency,
  email,
  enumValue,
  integer,
  optionalText,
  pagination,
  queryText,
  stringArray,
  text,
  url,
} from '../../lib/crm/validate.js';
import { moneyString } from '../../lib/crm/money.js';
import { sanitizeUntrusted } from '../../lib/crm/promptSafety.js';
import { accessibleCustomerIds, assertCustomerAccess, scopedCustomerWhere } from '../../lib/crm/scope.js';
import { recordCrmAudit, CRM_AUDIT } from '../../lib/crm/audit.js';
import { paidByCustomer, paidByInvoice } from './ledger.service.js';

const STAGES = ['NEW', 'CONTACTED', 'PROPOSAL_SENT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];
const SOURCES = ['REFERRAL', 'WEBSITE', 'ORGANIC', 'SOCIAL', 'OUTBOUND', 'RETURNING', 'OTHER'];
const TERMINAL = new Set(['COMPLETED', 'ARCHIVED']);

const STAGE_FLOW = Object.freeze({
  NEW: ['CONTACTED', 'ARCHIVED'],
  CONTACTED: ['NEW', 'PROPOSAL_SENT', 'ARCHIVED'],
  PROPOSAL_SENT: ['CONTACTED', 'ACTIVE', 'ARCHIVED'],
  ACTIVE: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['NEW'],
});

const OWNER_SELECT = { select: { id: true, name: true, email: true } };

export function mapCustomer(customer, { includeInternal = true } = {}) {
  if (!customer) return null;
  return {
    id: customer.id,
    contactName: customer.contactName,
    companyName: customer.companyName,
    email: customer.email,
    phone: customer.phone,
    website: customer.website,
    stage: customer.stage,
    source: customer.source,
    owner: customer.owner ?? null,
    ownerId: customer.ownerId,
    currency: customer.currency,
    taxId: customer.taxId,
    billingAddress: customer.billingAddress,
    tags: customer.tags,
    ...(includeInternal
      ? {
          notes: customer.notes,
          notesRisk: customer.notesRisk,
          version: customer.version,
          firstContactAt: customer.firstContactAt,
          convertedAt: customer.convertedAt,
          archivedAt: customer.archivedAt,
        }
      : {}),
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

async function assertOwner(ownerId) {
  if (!ownerId) return ownerId;
  const owner = await prisma.user.findFirst({
    where: { id: ownerId, crmActive: true, crmRole: { in: ['SUPERADMIN', 'ADMIN', 'TEAM'] } },
    select: { id: true },
  });
  if (!owner) throw badRequest('ownerId must belong to an active CRM team member.');
  return owner.id;
}

async function metricsFor(customerIds) {
  if (!customerIds.length) return new Map();

  const [paymentTotals, invoices, activeProjects, lastActivity] = await Promise.all([
    paidByCustomer(customerIds),
    prisma.invoice.findMany({
      where: {
        customerId: { in: customerIds },
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: { id: true, customerId: true, total: true, dueDate: true },
    }),
    prisma.project.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: customerIds },
        deletedAt: null,
        status: { in: ['DISCOVERY', 'IN_PROGRESS', 'REVIEW'] },
      },
      _count: { _all: true },
    }),
    prisma.activity.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds } },
      _max: { occurredAt: true },
    }),
  ]);

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const paidMap = invoiceIds.length ? await paidByInvoice(invoiceIds) : new Map();
  const outstandingMap = new Map();
  for (const invoice of invoices) {
    const paid = paidMap.get(invoice.id) ?? 0;
    const balance = Math.max(Number(invoice.total) - paid, 0);
    outstandingMap.set(invoice.customerId, (outstandingMap.get(invoice.customerId) ?? 0) + balance);
  }

  const metrics = new Map(
    customerIds.map((id) => [
      id,
      {
        lifetimeValue: '0.00',
        outstanding: '0.00',
        activeProjects: 0,
        lastActivityAt: null,
      },
    ])
  );

  for (const [customerId, total] of paymentTotals) {
    metrics.get(customerId).lifetimeValue = moneyString(total);
  }
  for (const [customerId, balance] of outstandingMap) {
    metrics.get(customerId).outstanding = moneyString(balance);
  }
  for (const row of activeProjects) {
    metrics.get(row.customerId).activeProjects = row._count._all;
  }
  for (const row of lastActivity) {
    metrics.get(row.customerId).lastActivityAt = row._max.occurredAt ?? null;
  }

  return metrics;
}

export async function listCustomers(actor, query = {}) {
  const ids = await accessibleCustomerIds(actor);
  const { limit, page, skip } = pagination(query);
  const q = queryText(query.q, 'q');

  const where = scopedCustomerWhere(ids, {
    deletedAt: null,
    ...(query.stage ? { stage: enumValue(query.stage, 'stage', STAGES) } : {}),
    ...(query.ownerId ? { ownerId: String(query.ownerId) } : {}),
    ...(query.tag ? { tags: { has: String(query.tag) } } : {}),
    ...(q
      ? {
          OR: [
            { contactName: { contains: q, mode: 'insensitive' } },
            { companyName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  });

  const sortMap = {
    updated: { updatedAt: 'desc' },
    created: { createdAt: 'desc' },
    name: { contactName: 'asc' },
    stage: { stage: 'asc' },
  };
  const orderBy = sortMap[query.sort] ?? sortMap.updated;

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { owner: OWNER_SELECT, _count: { select: { projects: true } } },
    }),
    prisma.customer.count({ where }),
  ]);

  const metrics = await metricsFor(rows.map((row) => row.id));

  return {
    data: rows.map((row) => ({
      ...mapCustomer(row, { includeInternal: actor.role !== 'CLIENT' }),
      metrics: metrics.get(row.id),
      projectCount: row._count.projects,
    })),
    meta: { page, limit, total, hasMore: page * limit < total },
  };
}

export async function createCustomer(actor, input, req = null) {
  const payload = body({ body: input });
  const contactName = text(payload.contactName, 'contactName', { max: 120 });
  const emailValue = email(payload.email);
  const stage = enumValue(payload.stage ?? 'NEW', 'stage', STAGES);
  const source = enumValue(payload.source ?? 'OTHER', 'source', SOURCES);
  const notes = optionalText(payload.notes, 'notes', { max: 10000 });
  const notesInspection = notes ? sanitizeUntrusted(notes, 'notes', 10000) : null;

  const existing = await prisma.customer.findUnique({ where: { email: emailValue }, select: { id: true } });
  if (existing) throw conflict('A customer with that email already exists.', 'CUSTOMER_EXISTS');

  const customer = await prisma.customer.create({
    data: {
      contactName,
      companyName: optionalText(payload.companyName, 'companyName', { max: 160 }) ?? null,
      email: emailValue,
      phone: optionalText(payload.phone, 'phone', { max: 40 }) ?? null,
      website: url(payload.website, 'website') ?? null,
      stage,
      source,
      ownerId: await assertOwner(payload.ownerId ? String(payload.ownerId) : null),
      currency: currency(payload.currency),
      taxId: optionalText(payload.taxId, 'taxId', { max: 60 }) ?? null,
      billingAddress: optionalText(payload.billingAddress, 'billingAddress', { max: 500 }) ?? null,
      tags: stringArray(payload.tags, 'tags') ?? [],
      notes: notesInspection?.text ?? null,
      notesRisk: notesInspection?.risk ?? 'NONE',
    },
    include: { owner: OWNER_SELECT },
  });

  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.CUSTOMER_CREATED,
    entityType: 'Customer',
    entityId: customer.id,
    targetEmail: customer.email,
    req,
    after: mapCustomer(customer),
  });

  return { ...mapCustomer(customer), metrics: { lifetimeValue: '0.00', outstanding: '0.00', activeProjects: 0 } };
}

export async function getCustomer360(actor, customerId) {
  await assertCustomerAccess(actor, customerId);
  const includeInternal = actor.role !== 'CLIENT';

  const [customer, projects, invoices, payments, activities] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, include: { owner: OWNER_SELECT } }),
    prisma.project.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.crmPayment.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        method: true,
        status: true,
        amount: true,
        currency: true,
        baseAmountInr: true,
        reference: true,
        invoiceId: true,
        projectId: true,
        proofStatus: true,
        proofPurgeAfter: true,
        verifiedAt: true,
        receivedAt: true,
        createdAt: true,
      },
    }),
    prisma.activity.findMany({
      where: { customerId, ...(includeInternal ? {} : { visibility: 'CLIENT' }) },
      orderBy: { occurredAt: 'desc' },
      take: 50,
      include: { actor: { select: { id: true, name: true } } },
    }),
  ]);

  if (!customer) throw notFound('Customer not found.');

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const paidMap = invoiceIds.length ? await paidByInvoice(invoiceIds) : new Map();

  const metrics = (await metricsFor([customer.id])).get(customer.id);

  return {
    customer: mapCustomer(customer, { includeInternal }),
    metrics,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      title: project.title,
      serviceType: project.serviceType,
      status: project.status,
      contractValue: moneyString(project.contractValue),
      currency: project.currency,
      progress: project.progress,
      dueDate: project.dueDate,
      previewUrl: project.previewUrl,
      version: project.version,
      updatedAt: project.updatedAt,
    })),
    invoices: invoices.map((invoice) => {
      const paid = moneyString(paidMap.get(invoice.id) ?? 0);
      const balance = Math.max(Number(invoice.total) - Number(paid), 0);
      return {
        id: invoice.id,
        number: invoice.number,
        status:
          ['SENT', 'PARTIALLY_PAID'].includes(invoice.status) &&
          invoice.dueDate.getTime() < Date.now()
            ? 'OVERDUE'
            : invoice.status,
        currency: invoice.currency,
        total: moneyString(invoice.total),
        paid,
        balanceDue: moneyString(balance),
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        projectId: invoice.projectId,
      };
    }),
    payments: payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amount: moneyString(payment.amount),
      currency: payment.currency,
      baseAmountInr: moneyString(payment.baseAmountInr),
      reference: payment.reference,
      invoiceId: payment.invoiceId,
      projectId: payment.projectId,
      proofStatus: payment.proofStatus,
      proofPurgeAfter: payment.proofPurgeAfter,
      verifiedAt: payment.verifiedAt,
      receivedAt: payment.receivedAt,
      createdAt: payment.createdAt,
    })),
    recentActivity: activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      direction: activity.direction,
      visibility: activity.visibility,
      subject: activity.subject,
      body: activity.body,
      actor: activity.actor,
      actorType: activity.actorType,
      fromStage: activity.fromStage,
      toStage: activity.toStage,
      injectionRisk: activity.injectionRisk,
      riskFlags: activity.riskFlags,
      occurredAt: activity.occurredAt,
    })),
  };
}

export async function updateCustomer(actor, customerId, input, req = null) {
  const existing = await assertCustomerAccess(actor, customerId);
  if (actor.role === 'CLIENT') throw notFound('Customer not found.');

  const payload = body({ body: input });
  const expectedVersion = integer(payload.version, 'version', { min: 1, max: 1_000_000 });
  if (existing.version !== expectedVersion) {
    throw conflict('This customer was changed by someone else. Reload and try again.', 'STALE_VERSION');
  }

  const data = {};
  if (payload.contactName !== undefined) data.contactName = text(payload.contactName, 'contactName', { max: 120 });
  if (payload.companyName !== undefined) data.companyName = optionalText(payload.companyName, 'companyName', { max: 160 });
  if (payload.email !== undefined) {
    const nextEmail = email(payload.email);
    if (nextEmail !== existing.email) {
      const duplicate = await prisma.customer.findUnique({ where: { email: nextEmail }, select: { id: true } });
      if (duplicate) throw conflict('Another customer already uses that email.', 'CUSTOMER_EXISTS');
      data.email = nextEmail;
    }
  }
  if (payload.phone !== undefined) data.phone = optionalText(payload.phone, 'phone', { max: 40 });
  if (payload.website !== undefined) data.website = url(payload.website, 'website');
  if (payload.source !== undefined) data.source = enumValue(payload.source, 'source', SOURCES);
  if (payload.ownerId !== undefined) {
    data.ownerId = payload.ownerId ? await assertOwner(String(payload.ownerId)) : null;
  }
  if (payload.currency !== undefined) data.currency = currency(payload.currency, existing.currency);
  if (payload.taxId !== undefined) data.taxId = optionalText(payload.taxId, 'taxId', { max: 60 });
  if (payload.billingAddress !== undefined) {
    data.billingAddress = optionalText(payload.billingAddress, 'billingAddress', { max: 500 });
  }
  if (payload.tags !== undefined) data.tags = stringArray(payload.tags, 'tags') ?? [];
  if (payload.notes !== undefined) {
    const notes = optionalText(payload.notes, 'notes', { max: 10000 });
    const inspected = notes ? sanitizeUntrusted(notes, 'notes', 10000) : null;
    data.notes = inspected?.text ?? null;
    data.notesRisk = inspected?.risk ?? 'NONE';
  }

  const result = await prisma.customer.updateMany({
    where: { id: customerId, version: expectedVersion, deletedAt: null },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count === 0) {
    throw conflict('This customer was changed by someone else. Reload and try again.', 'STALE_VERSION');
  }

  const updated = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { owner: OWNER_SELECT },
  });

  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.CUSTOMER_UPDATED,
    entityType: 'Customer',
    entityId: customerId,
    targetEmail: updated.email,
    req,
    before: mapCustomer(existing),
    after: mapCustomer(updated),
  });

  return mapCustomer(updated);
}

export async function changeStage(actor, customerId, input, req = null) {
  const existing = await assertCustomerAccess(actor, customerId);
  if (actor.role === 'CLIENT') throw notFound('Customer not found.');

  const payload = body({ body: input });
  const toStage = enumValue(payload.toStage, 'toStage', STAGES);
  const note = optionalText(payload.note, 'note', { max: 2000 });
  const expectedVersion = integer(payload.version, 'version', { min: 1, max: 1_000_000 });

  if (existing.version !== expectedVersion) {
    throw conflict('This customer was changed by someone else. Reload and try again.', 'STALE_VERSION');
  }
  if (existing.stage === toStage) return mapCustomer(existing);
  if (!STAGE_FLOW[existing.stage]?.includes(toStage)) {
    throw conflict(`Cannot move a customer from ${existing.stage} to ${toStage}.`, 'INVALID_TRANSITION');
  }

  const now = new Date();
  const data = {
    stage: toStage,
    version: { increment: 1 },
    ...(toStage === 'ACTIVE' && !existing.convertedAt ? { convertedAt: now } : {}),
    ...(toStage === 'ARCHIVED' ? { archivedAt: now } : {}),
  };

  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.customer.updateMany({
      where: { id: customerId, version: expectedVersion, deletedAt: null },
      data,
    });
    if (changed.count === 0) {
      throw conflict('This customer was changed by someone else. Reload and try again.', 'STALE_VERSION');
    }
    await tx.activity.create({
      data: {
        customerId,
        actorId: actor.id,
        actorType: 'USER',
        type: 'STAGE_CHANGED',
        direction: 'INTERNAL',
        visibility: 'INTERNAL',
        subject: `${existing.stage} → ${toStage}`,
        body: note ?? null,
        fromStage: existing.stage,
        toStage,
        sourceTrust: 'UNTRUSTED',
        injectionRisk: 'NONE',
      },
    });
    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.STAGE_CHANGED,
      entityType: 'Customer',
      entityId: customerId,
      targetEmail: existing.email,
      req,
      before: { stage: existing.stage },
      after: { stage: toStage },
      metadata: { note: note ?? null },
      client: tx,
    });
    return tx.customer.findUnique({ where: { id: customerId }, include: { owner: OWNER_SELECT } });
  });

  return mapCustomer(result);
}

export async function archiveCustomer(actor, customerId, req = null) {
  const existing = await assertCustomerAccess(actor, customerId);
  if (TERMINAL.has(existing.stage) && existing.stage === 'ARCHIVED') {
    return mapCustomer(existing);
  }
  const now = new Date();
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { stage: 'ARCHIVED', archivedAt: now, deletedAt: now, version: { increment: 1 } },
    include: { owner: OWNER_SELECT },
  });
  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.CUSTOMER_ARCHIVED,
    entityType: 'Customer',
    entityId: customerId,
    targetEmail: existing.email,
    req,
    before: { stage: existing.stage },
    after: { stage: updated.stage, deletedAt: updated.deletedAt },
  });
  return mapCustomer(updated);
}
