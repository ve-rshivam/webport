import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound, forbidden } from '../../lib/crm/errors.js';
import { accessibleCustomerIds, assertCustomerAccess } from '../../lib/crm/scope.js';
import {
  body,
  enumValue,
  header,
  money as moneyValue,
  number as numberValue,
  optionalText,
  pagination,
  queryText,
  text,
} from '../../lib/crm/validate.js';
import { moneyString, dec, round2 } from '../../lib/crm/money.js';
import { parseImageDataUrl } from '../../lib/crm/imageSanitizer.js';
import { recordCrmAudit, CRM_AUDIT } from '../../lib/crm/audit.js';
import { refreshInvoiceStatus } from './invoices.service.js';
import { paidByInvoice } from './ledger.service.js';

export const PROOF_RETENTION_HOURS = 36;
export const MANUAL_METHODS = ['UPI_QR', 'BANK_TRANSFER', 'CASH', 'OTHER'];
export const GATEWAY_METHODS = ['RAZORPAY', 'PAYPAL'];
export const PAYMENT_STATUSES = [
  'PENDING',
  'AWAITING_VERIFICATION',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];
const ALL_METHODS = [...MANUAL_METHODS, ...GATEWAY_METHODS];

const PAYMENT_SELECT = {
  id: true,
  customerId: true,
  invoiceId: true,
  projectId: true,
  method: true,
  status: true,
  amount: true,
  currency: true,
  baseAmountInr: true,
  fxRate: true,
  gatewayOrderId: true,
  gatewayPaymentId: true,
  reference: true,
  proofStatus: true,
  proofMime: true,
  proofFilename: true,
  proofSha256: true,
  proofRecycledAt: true,
  proofPurgeAfter: true,
  proofPurgedAt: true,
  verifiedAt: true,
  failureCode: true,
  notes: true,
  receivedAt: true,
  createdAt: true,
  customer: { select: { id: true, contactName: true, companyName: true, email: true } },
  invoice: { select: { id: true, number: true, status: true } },
  verifier: { select: { id: true, name: true } },
};

export function mapPayment(payment) {
  return {
    ...payment,
    amount: moneyString(payment.amount),
    baseAmountInr: moneyString(payment.baseAmountInr),
    fxRate: payment.fxRate ? moneyString(payment.fxRate) : null,
  };
}

async function existingIdempotentPayment(actor, key) {
  const existing = await prisma.crmPayment.findUnique({ where: { idempotencyKey: key } });
  if (!existing) return null;
  await assertCustomerAccess(actor, existing.customerId);
  return { payment: mapPayment(existing), idempotent: true };
}

async function scopedPayment(actor, paymentId) {
  const ids = await accessibleCustomerIds(actor);
  const payment = await prisma.crmPayment.findFirst({
    where: { id: paymentId, ...(ids === null ? {} : { customerId: { in: ids } }) },
    select: PAYMENT_SELECT,
  });
  if (!payment) throw notFound('Payment not found.');
  return payment;
}

async function invoiceBalance(invoiceId, client = prisma) {
  const invoice = await client.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw notFound('Invoice not found.');
  const paid = await paidByInvoice([invoiceId], client);
  return {
    invoice,
    balance: Number(invoice.total) - Number(paid.get(invoiceId) ?? 0),
  };
}

async function validatePaymentTargets({ actor, customerId, invoiceId, projectId, amountValue }) {
  const customer = await assertCustomerAccess(actor, customerId);
  if (customer.deletedAt) throw notFound('Customer not found.');

  let invoice = null;
  if (invoiceId) {
    const result = await invoiceBalance(invoiceId);
    invoice = result.invoice;
    if (invoice.customerId !== customerId) throw badRequest('invoiceId must belong to this customer.');
    if (['DRAFT', 'VOID'].includes(invoice.status)) {
      throw conflict('That invoice is not payable.', 'INVOICE_NOT_PAYABLE');
    }
    if (amountValue > result.balance + 0.005) {
      throw badRequest(`The amount is higher than the invoice balance (${moneyString(result.balance)}).`);
    }
  }

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, customerId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw badRequest('projectId must belong to this customer.');
  }

  return { customer, invoice };
}

function recycleProofData() {
  const now = new Date();
  return {
    proofStatus: 'RECYCLED',
    proofRecycledAt: now,
    proofPurgeAfter: new Date(now.getTime() + PROOF_RETENTION_HOURS * 60 * 60 * 1000),
  };
}

export async function listPayments(actor, query = {}) {
  const ids = await accessibleCustomerIds(actor);
  const { limit, page, skip } = pagination(query);
  const q = queryText(query.q, 'q');

  const where = {
    ...(ids === null ? {} : { customerId: { in: ids } }),
    ...(query.status ? { status: enumValue(query.status, 'status', PAYMENT_STATUSES) } : {}),
    ...(query.method ? { method: enumValue(query.method, 'method', ALL_METHODS) } : {}),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(query.invoiceId ? { invoiceId: String(query.invoiceId) } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { gatewayPaymentId: { contains: q, mode: 'insensitive' } },
            { customer: { contactName: { contains: q, mode: 'insensitive' } } },
            { customer: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.crmPayment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: limit,
      select: PAYMENT_SELECT,
    }),
    prisma.crmPayment.count({ where }),
  ]);

  return {
    data: rows.map(mapPayment),
    meta: { page, limit, total, hasMore: page * limit < total },
  };
}

export async function submitManualPayment(actor, input, req = null) {
  const payload = body({ body: input });
  if (actor.role === 'CLIENT') throw forbidden('Client accounts cannot submit proofs here.');

  const customerId = text(payload.customerId, 'customerId', { max: 64 });
  const invoiceId = payload.invoiceId ? text(payload.invoiceId, 'invoiceId', { max: 64 }) : null;
  const projectId = payload.projectId ? text(payload.projectId, 'projectId', { max: 64 }) : null;
  const method = enumValue(payload.method, 'method', MANUAL_METHODS);
  const amountValue = Number(moneyValue(payload.amount, 'amount'));
  const currency = String(payload.currency ?? 'INR').trim().toUpperCase();

  if (currency !== 'INR') {
    throw badRequest('Manual payments are recorded in INR. Use the gateway flow for other currencies.');
  }

  const idempotency = header(req, 'idempotency-key') || payload.idempotencyKey;
  if (!idempotency) throw badRequest('Idempotency-Key is required for manual payments.');
  const key = text(idempotency, 'Idempotency-Key', { min: 8, max: 128 });

  const existing = await existingIdempotentPayment(actor, key);
  if (existing) return existing;

  const { customer } = await validatePaymentTargets({
    actor,
    customerId,
    invoiceId,
    projectId,
    amountValue,
  });

  let proof = null;
  if (payload.proofDataUrl) {
    proof = await parseImageDataUrl(payload.proofDataUrl);
  } else if (method === 'UPI_QR') {
    throw badRequest('A payment screenshot is required for UPI payments.');
  }

  const reference = optionalText(payload.reference, 'reference', { max: 160 });
  const notes = optionalText(payload.notes, 'notes', { max: 2000 });

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.crmPayment.create({
        data: {
          customerId,
          invoiceId,
          projectId,
          method,
          status: 'AWAITING_VERIFICATION',
          amount: amountValue,
          currency,
          baseAmountInr: amountValue,
          idempotencyKey: key,
          reference: reference ?? null,
          notes: notes ?? null,
          receivedAt: new Date(),
          proof: proof?.buffer ?? null,
          proofMime: proof?.mime ?? null,
          proofFilename: proof ? `proof-${Date.now()}.${proof.mime.split('/')[1]}` : null,
          proofSha256: proof?.sha256 ?? null,
          proofStatus: proof ? 'ACTIVE' : 'NONE',
        },
      });

      await tx.activity.create({
        data: {
          customerId,
          projectId,
          actorId: actor.id,
          actorType: 'USER',
          type: 'PAYMENT_RECEIVED',
          direction: 'INBOUND',
          visibility: 'INTERNAL',
          subject: `Payment proof submitted · ${moneyString(amountValue)} ${currency}`,
          body: `${method}${reference ? ` · ${reference}` : ''} · awaiting verification`,
          sourceTrust: 'UNTRUSTED',
          injectionRisk: 'NONE',
        },
      });

      await recordCrmAudit({
        actor,
        action: CRM_AUDIT.PAYMENT_SUBMITTED,
        entityType: 'CrmPayment',
        entityId: created.id,
        targetEmail: customer.email,
        req,
        after: { amount: moneyString(created.amount), method, invoiceId },
        metadata: { idempotencyKey: key, proofSha256: proof?.sha256 ?? null },
        client: tx,
      });

      return created;
    });

    return { payment: mapPayment(payment), idempotent: false };
  } catch (err) {
    if (err?.code === 'P2002') {
      const duplicate = await existingIdempotentPayment(actor, key);
      if (duplicate) return duplicate;
      throw conflict('This payment reference already exists.', 'DUPLICATE_PAYMENT');
    }
    throw err;
  }
}

export async function recordGatewayPayment(actor, input, req = null) {
  if (actor.role === 'CLIENT') throw forbidden('Client accounts cannot record gateway settlements.');
  const payload = body({ body: input });

  const customerId = text(payload.customerId, 'customerId', { max: 64 });
  const invoiceId = payload.invoiceId ? text(payload.invoiceId, 'invoiceId', { max: 64 }) : null;
  const projectId = payload.projectId ? text(payload.projectId, 'projectId', { max: 64 }) : null;
  const method = enumValue(payload.method, 'method', GATEWAY_METHODS);
  const amountValue = Number(moneyValue(payload.amount, 'amount'));
  const currency = String(payload.currency ?? 'INR').trim().toUpperCase();
  const gatewayPaymentId = text(payload.gatewayPaymentId, 'gatewayPaymentId', { max: 190 });
  const reference = optionalText(payload.reference, 'reference', { max: 160 });

  const { customer } = await validatePaymentTargets({
    actor,
    customerId,
    invoiceId,
    projectId,
    amountValue,
  });

  const receivedAt = payload.receivedAt ? new Date(payload.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) throw badRequest('receivedAt must be a valid date.');

  let fxRate = null;
  let baseAmount = amountValue;
  if (currency !== 'INR') {
    const configured = Number(payload.fxRate ?? process.env.PAYPAL_INR_PER_USD);
    if (!Number.isFinite(configured) || configured <= 0) {
      throw badRequest('fxRate is required for non-INR payments.');
    }
    fxRate = round2(configured);
    baseAmount = round2(dec(amountValue).times(dec(configured))).toNumber();
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.crmPayment.create({
        data: {
          customerId,
          invoiceId,
          projectId,
          method,
          status: 'SUCCEEDED',
          amount: amountValue,
          currency,
          baseAmountInr: baseAmount,
          fxRate,
          gatewayPaymentId,
          reference: reference ?? null,
          verifiedById: actor.id,
          verifiedAt: new Date(),
          receivedAt,
        },
      });

      if (invoiceId) await refreshInvoiceStatus(tx, invoiceId);

      await tx.activity.create({
        data: {
          customerId,
          projectId,
          actorId: actor.id,
          actorType: 'USER',
          type: 'PAYMENT_RECEIVED',
          direction: 'INBOUND',
          visibility: 'CLIENT',
          subject: `Payment recorded · ${moneyString(amountValue)} ${currency}`,
          body: `${method}${reference ? ` · ${reference}` : ''}`,
          sourceTrust: 'TRUSTED',
          injectionRisk: 'NONE',
        },
      });

      await recordCrmAudit({
        actor,
        action: CRM_AUDIT.PAYMENT_RECORDED,
        entityType: 'CrmPayment',
        entityId: created.id,
        targetEmail: customer.email,
        req,
        after: { amount: moneyString(created.amount), baseAmountInr: moneyString(created.baseAmountInr), method },
        client: tx,
      });

      return created;
    });

    return mapPayment(payment);
  } catch (err) {
    if (err?.code === 'P2002') {
      throw conflict('That gateway payment was already recorded.', 'DUPLICATE_PAYMENT');
    }
    throw err;
  }
}

export async function verifyPayment(actor, paymentId, input, req = null) {
  const current = await scopedPayment(actor, paymentId);
  const payload = body({ body: input });

  if (!['AWAITING_VERIFICATION', 'PENDING'].includes(current.status)) {
    throw conflict('Only payments awaiting verification can be approved.', 'INVALID_PAYMENT_STATE');
  }

  const receivedAt = payload.receivedAt ? new Date(payload.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) throw badRequest('receivedAt must be a valid date.');
  const reference = optionalText(payload.reference, 'reference', { max: 160 });
  const notes = optionalText(payload.notes, 'notes', { max: 2000 });
  const recycle = current.proofStatus === 'ACTIVE' ? recycleProofData() : {};

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.crmPayment.updateMany({
      where: { id: paymentId, status: { in: ['AWAITING_VERIFICATION', 'PENDING'] } },
      data: {
        status: 'SUCCEEDED',
        verifiedById: actor.id,
        verifiedAt: new Date(),
        receivedAt,
        ...(reference !== undefined ? { reference } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...recycle,
      },
    });
    if (changed.count === 0) {
      throw conflict('This payment was already processed.', 'INVALID_PAYMENT_STATE');
    }

    if (current.invoiceId) await refreshInvoiceStatus(tx, current.invoiceId);

    await tx.activity.create({
      data: {
        customerId: current.customerId,
        projectId: current.projectId,
        actorId: actor.id,
        actorType: 'USER',
        type: 'PAYMENT_RECEIVED',
        direction: 'INBOUND',
        visibility: 'CLIENT',
        subject: `Payment verified · ${current.amount} ${current.currency}`,
        body: `${current.method}${reference ? ` · ${reference}` : ''}`,
        sourceTrust: 'TRUSTED',
        injectionRisk: 'NONE',
      },
    });

    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.PAYMENT_VERIFIED,
      entityType: 'CrmPayment',
      entityId: paymentId,
      targetEmail: current.customer.email,
      req,
      before: { status: current.status },
      after: { status: 'SUCCEEDED', amount: moneyString(current.amount) },
      metadata: { proofRecycled: Boolean(recycle.proofStatus), purgeAfter: recycle.proofPurgeAfter ?? null },
      client: tx,
    });

    return tx.crmPayment.findUnique({ where: { id: paymentId }, select: PAYMENT_SELECT });
  });

  return mapPayment(updated);
}

export async function rejectPayment(actor, paymentId, input, req = null) {
  const current = await scopedPayment(actor, paymentId);
  const payload = body({ body: input });
  const reason = text(payload.reason, 'reason', { min: 3, max: 500 });

  if (!['AWAITING_VERIFICATION', 'PENDING'].includes(current.status)) {
    throw conflict('Only payments awaiting verification can be rejected.', 'INVALID_PAYMENT_STATE');
  }

  const recycle = current.proofStatus === 'ACTIVE' ? recycleProofData() : {};

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.crmPayment.updateMany({
      where: { id: paymentId, status: { in: ['AWAITING_VERIFICATION', 'PENDING'] } },
      data: {
        status: 'FAILED',
        failureCode: reason,
        verifiedById: actor.id,
        verifiedAt: new Date(),
        ...recycle,
      },
    });
    if (changed.count === 0) throw conflict('This payment was already processed.', 'INVALID_PAYMENT_STATE');

    await tx.activity.create({
      data: {
        customerId: current.customerId,
        projectId: current.projectId,
        actorId: actor.id,
        actorType: 'USER',
        type: 'PAYMENT_FAILED',
        direction: 'INTERNAL',
        visibility: 'INTERNAL',
        subject: `Payment proof rejected · ${current.amount} ${current.currency}`,
        body: reason,
        sourceTrust: 'UNTRUSTED',
        injectionRisk: 'NONE',
      },
    });

    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.PAYMENT_REJECTED,
      entityType: 'CrmPayment',
      entityId: paymentId,
      targetEmail: current.customer.email,
      req,
      before: { status: current.status },
      after: { status: 'FAILED', reason },
      client: tx,
    });

    return tx.crmPayment.findUnique({ where: { id: paymentId }, select: PAYMENT_SELECT });
  });

  return mapPayment(updated);
}

export async function proofImage(actor, paymentId) {
  const ids = await accessibleCustomerIds(actor);
  const payment = await prisma.crmPayment.findFirst({
    where: { id: paymentId, ...(ids === null ? {} : { customerId: { in: ids } }) },
    select: { proof: true, proofMime: true, proofStatus: true, proofPurgeAfter: true },
  });
  if (!payment) throw notFound('Payment not found.');
  if (!payment.proof || payment.proofStatus === 'PURGED') {
    throw notFound('This proof has been purged.');
  }
  if (
    payment.proofStatus === 'RECYCLED' &&
    payment.proofPurgeAfter &&
    payment.proofPurgeAfter.getTime() <= Date.now()
  ) {
    throw conflict('The 36-hour proof retention window has expired.', 'PROOF_WINDOW_EXPIRED');
  }
  return { buffer: payment.proof, mime: payment.proofMime, status: payment.proofStatus };
}

export async function listRecycleBin(actor) {
  if (actor.role === 'CLIENT') throw forbidden();
  const ids = await accessibleCustomerIds(actor);
  const rows = await prisma.crmPayment.findMany({
    where: {
      proofStatus: 'RECYCLED',
      proofPurgeAfter: { gt: new Date() },
      ...(ids === null ? {} : { customerId: { in: ids } }),
    },
    orderBy: { proofPurgeAfter: 'asc' },
    take: 100,
    select: PAYMENT_SELECT,
  });
  return rows.map(mapPayment);
}

export async function restoreProof(actor, paymentId, req = null) {
  const payment = await scopedPayment(actor, paymentId);
  if (!payment) throw notFound('Payment not found.');
  if (payment.proofStatus !== 'RECYCLED' || !payment.proofPurgeAfter) {
    throw conflict('This proof is not in the recycle bin.', 'PROOF_NOT_RECYCLED');
  }
  if (payment.proofPurgeAfter.getTime() <= Date.now()) {
    throw conflict('The 36-hour retention window has expired.', 'PROOF_WINDOW_EXPIRED');
  }

  const restored = await prisma.crmPayment.updateMany({
    where: {
      id: paymentId,
      proofStatus: 'RECYCLED',
      proofPurgeAfter: { gt: new Date() },
    },
    data: { proofStatus: 'ACTIVE', proofRecycledAt: null, proofPurgeAfter: null },
  });
  if (restored.count === 0) {
    throw conflict('The 36-hour retention window has expired or the proof was already purged.', 'PROOF_WINDOW_EXPIRED');
  }
  const updated = await prisma.crmPayment.findUnique({ where: { id: paymentId }, select: PAYMENT_SELECT });

  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.PROOF_RESTORED,
    entityType: 'CrmPayment',
    entityId: paymentId,
    targetEmail: payment.customer.email,
    req,
    before: { proofStatus: payment.proofStatus },
    after: { proofStatus: 'ACTIVE' },
  });

  return mapPayment(updated);
}

export async function purgeProof(actor, paymentId, req = null) {
  const payment = await scopedPayment(actor, paymentId);
  if (!payment) throw notFound('Payment not found.');
  if (!payment.proofSha256) throw notFound('This payment has no stored proof.');

  const updated = await prisma.crmPayment.update({
    where: { id: paymentId },
    data: {
      proof: null,
      proofStatus: 'PURGED',
      proofPurgedAt: new Date(),
      proofPurgeAfter: null,
      proofRecycledAt: null,
    },
    select: PAYMENT_SELECT,
  });

  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.PROOF_PURGED,
    entityType: 'CrmPayment',
    entityId: paymentId,
    targetEmail: payment.customer.email,
    req,
    before: { proofStatus: payment.proofStatus, sha256: payment.proofSha256 },
    after: { proofStatus: 'PURGED' },
    metadata: { manual: true },
  });

  return mapPayment(updated);
}

export async function purgeExpiredProofs() {
  const lockKey = 'portfolio:crm:proof-purge';
  let locked = false;
  try {
    const rows = await prisma.$queryRaw`SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS locked`;
    locked = Boolean(rows?.[0]?.locked);
    if (!locked) return 0;

    let total = 0;
    for (let batch = 0; batch < 10; batch += 1) {
      const due = await prisma.crmPayment.findMany({
        where: { proofStatus: 'RECYCLED', proofPurgeAfter: { lte: new Date() } },
        select: { id: true },
        take: 200,
      });
      if (!due.length) break;

      const result = await prisma.crmPayment.updateMany({
        where: { id: { in: due.map((row) => row.id) }, proofStatus: 'RECYCLED' },
        data: {
          proof: null,
          proofStatus: 'PURGED',
          proofPurgedAt: new Date(),
          proofPurgeAfter: null,
          proofRecycledAt: null,
        },
      });
      total += result.count;
    }

    if (total > 0) {
      await recordCrmAudit({
        action: CRM_AUDIT.PROOF_PURGED,
        actorRole: 'system',
        entityType: 'CrmPayment',
        outcome: 'SUCCESS',
        metadata: { automatic: true, count: total, retentionHours: PROOF_RETENTION_HOURS },
      });
      console.log(`[crm] purged ${total} expired payment proof(s)`);
    }
    return total;
  } finally {
    if (locked) {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${lockKey}))`.catch(() => {});
    }
  }
}

export function startProofPurgeJob() {
  const run = () => purgeExpiredProofs().catch((err) => console.error('[crm] proof purge failed:', err?.message));
  run();
  const timer = setInterval(run, 5 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}
