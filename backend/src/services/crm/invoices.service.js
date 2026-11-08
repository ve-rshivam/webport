import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/crm/errors.js';
import { accessibleCustomerIds, assertCustomerAccess } from '../../lib/crm/scope.js';
import {
  body,
  currency as currencyValue,
  date,
  enumValue,
  integer,
  nonNegativeMoney,
  number as numberValue,
  optionalText,
  pagination,
  queryText,
  text,
} from '../../lib/crm/validate.js';
import { invoiceTotals, lineAmount, moneyString } from '../../lib/crm/money.js';
import { nextDocumentNumber } from '../../lib/crm/counters.js';
import { recordCrmAudit, CRM_AUDIT } from '../../lib/crm/audit.js';
import { paidByInvoice, syncInvoiceStatus, PAID_PAYMENT_STATUSES } from './ledger.service.js';
import { generateInvoicePDF } from '../invoiceService.js';

const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'];

const CUSTOMER_SELECT = {
  select: { id: true, contactName: true, companyName: true, email: true, currency: true },
};

function displayStatus(invoice) {
  if (['SENT', 'PARTIALLY_PAID'].includes(invoice.status) && invoice.dueDate.getTime() < Date.now()) {
    return 'OVERDUE';
  }
  return invoice.status;
}

export function mapInvoice(invoice, paidValue = '0.00') {
  const paid = Number(paidValue);
  return {
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customerId,
    customer: invoice.customer ?? undefined,
    projectId: invoice.projectId,
    status: displayStatus(invoice),
    storedStatus: invoice.status,
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subtotal: moneyString(invoice.subtotal),
    discount: moneyString(invoice.discount),
    taxRate: moneyString(invoice.taxRate),
    taxAmount: moneyString(invoice.taxAmount),
    total: moneyString(invoice.total),
    paid: moneyString(paid),
    balanceDue: moneyString(Math.max(Number(invoice.total) - paid, 0)),
    notes: invoice.notes,
    terms: invoice.terms,
    version: invoice.version,
    issuedAt: invoice.issuedAt,
    voidedAt: invoice.voidedAt,
    voidReason: invoice.voidReason,
    lines: invoice.lines?.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: moneyString(line.quantity),
      unitPrice: moneyString(line.unitPrice),
      amount: moneyString(line.amount),
      sortOrder: line.sortOrder,
    })),
    createdAt: invoice.createdAt,
  };
}

function parseLines(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw badRequest('An invoice needs at least one line item.');
  }
  if (input.length > 50) throw badRequest('An invoice can have at most 50 line items.');

  return input.map((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      throw badRequest(`lines[${index}] must be an object.`);
    }
    const description = text(line.description, `lines[${index}].description`, { max: 240 });
    const quantity = numberValue(line.quantity ?? 1, `lines[${index}].quantity`, { min: 0.01, max: 100000 });
    const unitPrice = Number(nonNegativeMoney(line.unitPrice, `lines[${index}].unitPrice`));
    return {
      description,
      quantity,
      unitPrice,
      amount: lineAmount(quantity, unitPrice),
      sortOrder: index,
    };
  });
}

async function assertInvoiceAccess(actor, invoiceId) {
  const ids = await accessibleCustomerIds(actor);
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      ...(ids === null ? {} : { customerId: { in: ids } }),
    },
    include: {
      customer: CUSTOMER_SELECT,
      lines: { orderBy: { sortOrder: 'asc' } },
      project: { select: { id: true, title: true, code: true, serviceType: true } },
    },
  });
  if (!invoice) throw notFound('Invoice not found.');
  return invoice;
}

export async function createInvoice(actor, input, req = null) {
  if (actor.role === 'CLIENT') throw notFound('Invoice not found.');
  const payload = body({ body: input });

  const customerId = text(payload.customerId, 'customerId', { max: 64 });
  const customer = await assertCustomerAccess(actor, customerId);
  if (customer.deletedAt) throw notFound('Customer not found.');

  const projectId = payload.projectId ? text(payload.projectId, 'projectId', { max: 64 }) : null;
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, customerId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw badRequest('projectId must belong to this customer.');
  }

  const lines = parseLines(payload.lines);
  const discount = nonNegativeMoney(payload.discount, 'discount');
  const taxRate = numberValue(payload.taxRate ?? 0, 'taxRate', { min: 0, max: 100 });
  const totals = invoiceTotals(lines, discount, taxRate);
  const currency = currencyValue(payload.currency, customer.currency);
  const issueDate = date(payload.issueDate, 'issueDate', { required: false }) ?? new Date();
  const dueDate = date(payload.dueDate, 'dueDate') ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  if (dueDate.getTime() < issueDate.getTime()) {
    throw badRequest('dueDate cannot be before issueDate.');
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        customerId,
        projectId,
        status: 'DRAFT',
        currency,
        issueDate,
        dueDate,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: optionalText(payload.notes, 'notes', { max: 5000 }) ?? null,
        terms: optionalText(payload.terms, 'terms', { max: 5000 }) ?? null,
        lines: { create: lines },
      },
      include: { customer: CUSTOMER_SELECT, lines: { orderBy: { sortOrder: 'asc' } } },
    });

    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.INVOICE_CREATED,
      entityType: 'Invoice',
      entityId: created.id,
      req,
      after: { total: moneyString(created.total), currency, customerId },
      client: tx,
    });

    return created;
  });

  return mapInvoice(invoice);
}

export async function listInvoices(actor, query = {}) {
  const ids = await accessibleCustomerIds(actor);
  const { limit, page, skip } = pagination(query);
  const q = queryText(query.q, 'q');
  const statusFilter = query.status ? enumValue(query.status, 'status', INVOICE_STATUSES) : null;

  const where = {
    ...(ids === null ? {} : { customerId: { in: ids } }),
    ...(statusFilter === 'OVERDUE'
      ? { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() } }
      : statusFilter
        ? { status: statusFilter }
        : {}),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { customer: { contactName: { contains: q, mode: 'insensitive' } } },
            { customer: { companyName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: limit,
      include: { customer: CUSTOMER_SELECT, lines: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.invoice.count({ where }),
  ]);

  const paid = await paidByInvoice(rows.map((row) => row.id));

  return {
    data: rows.map((invoice) => mapInvoice(invoice, paid.get(invoice.id))),
    meta: { page, limit, total, hasMore: page * limit < total },
  };
}

export async function getInvoice(actor, invoiceId) {
  const invoice = await assertInvoiceAccess(actor, invoiceId);
  const paid = await paidByInvoice([invoice.id]);
  const payments = await prisma.crmPayment.findMany({
    where: { invoiceId, status: { in: PAID_PAYMENT_STATUSES } },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      method: true,
      amount: true,
      currency: true,
      baseAmountInr: true,
      reference: true,
      receivedAt: true,
      createdAt: true,
    },
  });

  return {
    invoice: mapInvoice(invoice, paid.get(invoice.id)),
    payments: payments.map((payment) => ({
      ...payment,
      amount: moneyString(payment.amount),
      baseAmountInr: moneyString(payment.baseAmountInr),
    })),
  };
}

export async function issueInvoice(actor, invoiceId, req = null) {
  const invoice = await assertInvoiceAccess(actor, invoiceId);
  if (actor.role === 'CLIENT') throw notFound('Invoice not found.');
  if (invoice.status !== 'DRAFT') {
    throw conflict('Only draft invoices can be issued.', 'INVALID_INVOICE_STATE');
  }
  if (!invoice.lines.length) throw badRequest('The invoice has no line items.');

  const customer = await prisma.customer.findUnique({ where: { id: invoice.customerId } });
  if (!customer) throw notFound('Customer not found.');

  const issued = await prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, 'INV');
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        number,
        status: 'SENT',
        issuedAt: new Date(),
        issuedById: actor.id,
        version: { increment: 1 },
        customerSnapshot: {
          contactName: customer.contactName,
          companyName: customer.companyName,
          email: customer.email,
          phone: customer.phone,
          taxId: customer.taxId,
          billingAddress: customer.billingAddress,
          currency: invoice.currency,
        },
      },
      include: { customer: CUSTOMER_SELECT, lines: { orderBy: { sortOrder: 'asc' } } },
    });

    await tx.activity.create({
      data: {
        customerId: invoice.customerId,
        projectId: invoice.projectId,
        actorId: actor.id,
        actorType: 'USER',
        type: 'INVOICE_ISSUED',
        direction: 'OUTBOUND',
        visibility: 'CLIENT',
        subject: `Invoice ${number} issued`,
        body: `${invoice.currency} ${moneyString(invoice.total)} due ${invoice.dueDate.toISOString().slice(0, 10)}`,
        sourceTrust: 'TRUSTED',
        injectionRisk: 'NONE',
      },
    });

    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.INVOICE_ISSUED,
      entityType: 'Invoice',
      entityId: invoiceId,
      targetEmail: customer.email,
      req,
      before: { status: invoice.status },
      after: { status: 'SENT', number },
      client: tx,
    });

    return updated;
  });

  return mapInvoice(issued);
}

export async function voidInvoice(actor, invoiceId, input, req = null) {
  const invoice = await assertInvoiceAccess(actor, invoiceId);
  const payload = body({ body: input });
  const reason = text(payload.reason, 'reason', { min: 5, max: 500 });

  if (!['DRAFT', 'SENT'].includes(invoice.status)) {
    throw conflict('Only draft or sent invoices can be voided.', 'INVALID_INVOICE_STATE');
  }
  const paid = await paidByInvoice([invoiceId]);
  if (Number(paid.get(invoiceId) ?? 0) > 0) {
    throw conflict('This invoice has payments and cannot be voided.', 'INVOICE_HAS_PAYMENTS');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        voidReason: reason,
        version: { increment: 1 },
      },
      include: { customer: CUSTOMER_SELECT, lines: { orderBy: { sortOrder: 'asc' } } },
    });

    await tx.activity.create({
      data: {
        customerId: invoice.customerId,
        projectId: invoice.projectId,
        actorId: actor.id,
        actorType: 'USER',
        type: 'INVOICE_VOIDED',
        direction: 'INTERNAL',
        visibility: 'INTERNAL',
        subject: `Invoice ${invoice.number ?? invoiceId} voided`,
        body: reason,
        sourceTrust: 'UNTRUSTED',
        injectionRisk: 'NONE',
      },
    });

    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.INVOICE_VOIDED,
      entityType: 'Invoice',
      entityId: invoiceId,
      req,
      before: { status: invoice.status },
      after: { status: 'VOID', reason },
      client: tx,
    });

    return changed;
  });

  return mapInvoice(updated);
}

export async function refreshInvoiceStatus(tx, invoiceId) {
  return syncInvoiceStatus(tx, invoiceId);
}

export async function invoicePdf(actor, invoiceId) {
  const invoice = await assertInvoiceAccess(actor, invoiceId);
  if (!invoice.number) throw conflict('Issue the invoice before downloading its PDF.', 'NOT_ISSUED');

  const paid = await paidByInvoice([invoice.id]);
  const snapshot = invoice.customerSnapshot && typeof invoice.customerSnapshot === 'object'
    ? invoice.customerSnapshot
    : {};

  return generateInvoicePDF({
    invoiceNumber: invoice.number,
    invoiceDate: invoice.issuedAt ?? invoice.issueDate,
    status: invoice.status,
    clientName: snapshot.contactName ?? invoice.customer.contactName,
    clientEmail: snapshot.email ?? invoice.customer.email,
    transactionRef: null,
    projectTitle: invoice.project?.title ?? `${invoice.customer.contactName} — invoice`,
    projectType: invoice.project?.serviceType ?? 'Project services',
    estimatedDays: null,
    deliveryDate: null,
    features: invoice.lines.map((line) => `${line.description} × ${moneyString(line.quantity)}`),
    totalCost: Number(invoice.total),
    amountPaid: Number(paid.get(invoice.id) ?? 0),
    currency: invoice.currency,
  });
}
