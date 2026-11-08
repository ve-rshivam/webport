import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound, forbidden } from '../../lib/crm/errors.js';
import { accessibleCustomerIds, assertCustomerAccess } from '../../lib/crm/scope.js';
import { money as moneyValue, number as numberValue, optionalText, text } from '../../lib/crm/validate.js';
import { dec, moneyString, netAmount, round2 } from '../../lib/crm/money.js';
import { recordCrmAudit, CRM_AUDIT } from '../../lib/crm/audit.js';

export const PAID_PAYMENT_STATUSES = ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'];
export const SUCCESSFUL_REFUND_STATUSES = ['SUCCEEDED'];
export const MAX_LEDGER_EXPORT_ROWS = 20000;

const LEDGER_STATUSES = ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];

function numeric(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function paidStatusWhere() {
  return { status: { in: PAID_PAYMENT_STATUSES } };
}

export async function refundTotalsByPayment(paymentIds, client = prisma) {
  if (!paymentIds.length) return new Map();
  const refunds = await client.refund.findMany({
    where: { paymentId: { in: paymentIds }, status: { in: SUCCESSFUL_REFUND_STATUSES } },
    select: { paymentId: true, amount: true, currency: true, baseAmountInr: true },
  });
  const totals = new Map();
  for (const refund of refunds) {
    const amount =
      refund.baseAmountInr != null
        ? numeric(refund.baseAmountInr)
        : refund.currency === 'INR'
          ? numeric(refund.amount)
          : 0;
    totals.set(refund.paymentId, (totals.get(refund.paymentId) ?? 0) + amount);
  }
  return totals;
}

export async function paidByInvoice(invoiceIds, client = prisma) {
  if (!invoiceIds.length) return new Map();
  const payments = await client.crmPayment.findMany({
    where: { invoiceId: { in: invoiceIds }, ...paidStatusWhere() },
    select: { id: true, invoiceId: true, baseAmountInr: true },
  });
  const refunds = await refundTotalsByPayment(payments.map((payment) => payment.id), client);
  const totals = new Map();
  for (const payment of payments) {
    const gross = numeric(payment.baseAmountInr);
    const refunded = refunds.get(payment.id) ?? 0;
    totals.set(payment.invoiceId, (totals.get(payment.invoiceId) ?? 0) + Number(netAmount(gross, refunded)));
  }
  return totals;
}

export async function paidByCustomer(customerIds, client = prisma) {
  if (!customerIds.length) return new Map();
  const payments = await client.crmPayment.findMany({
    where: { customerId: { in: customerIds }, ...paidStatusWhere() },
    select: { id: true, customerId: true, baseAmountInr: true },
  });
  const refunds = await refundTotalsByPayment(payments.map((payment) => payment.id), client);
  const totals = new Map();
  for (const payment of payments) {
    const gross = numeric(payment.baseAmountInr);
    const refunded = refunds.get(payment.id) ?? 0;
    totals.set(payment.customerId, (totals.get(payment.customerId) ?? 0) + Number(netAmount(gross, refunded)));
  }
  return totals;
}

export async function paidByProject(projectIds, client = prisma) {
  if (!projectIds.length) return new Map();
  const payments = await client.crmPayment.findMany({
    where: { projectId: { in: projectIds }, ...paidStatusWhere() },
    select: { id: true, projectId: true, baseAmountInr: true },
  });
  const refunds = await refundTotalsByPayment(payments.map((payment) => payment.id), client);
  const totals = new Map();
  for (const payment of payments) {
    const gross = numeric(payment.baseAmountInr);
    const refunded = refunds.get(payment.id) ?? 0;
    totals.set(payment.projectId, (totals.get(payment.projectId) ?? 0) + Number(netAmount(gross, refunded)));
  }
  return totals;
}

export async function netCollectedSince(customerIds, since, client = prisma) {
  const payments = await client.crmPayment.findMany({
    where: {
      ...(customerIds === null ? {} : { customerId: { in: customerIds } }),
      ...paidStatusWhere(),
      OR: [{ receivedAt: { gte: since } }, { receivedAt: null, createdAt: { gte: since } }],
    },
    select: { id: true, baseAmountInr: true },
  });
  const refunds = await refundTotalsByPayment(payments.map((payment) => payment.id), client);
  return payments.reduce(
    (sum, payment) => sum + Number(netAmount(payment.baseAmountInr, refunds.get(payment.id) ?? 0)),
    0
  );
}

export async function invoiceNetPaid(invoiceId, client = prisma) {
  return (await paidByInvoice([invoiceId], client)).get(invoiceId) ?? 0;
}

export function derivedInvoiceStatus(invoice, netPaid) {
  if (['DRAFT', 'VOID'].includes(invoice.status)) return invoice.status;
  const total = numeric(invoice.total);
  if (netPaid >= total && total > 0) return 'PAID';
  if (netPaid > 0) return 'PARTIALLY_PAID';
  if (invoice.dueDate && invoice.dueDate.getTime() < Date.now()) return 'OVERDUE';
  return 'SENT';
}

async function syncInvoiceStatus(client, invoiceId) {
  const invoice = await client.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return null;
  const paid = await invoiceNetPaid(invoiceId, client);
  const next = derivedInvoiceStatus(invoice, paid);
  if (next === invoice.status) return invoice;
  return client.invoice.update({
    where: { id: invoiceId },
    data: { status: next, version: { increment: 1 } },
  });
}

export async function recordRefund(actor, paymentId, input, req = null) {
  if (actor.role === 'CLIENT') throw forbidden('Client accounts cannot record refunds.');
  const payload = input && typeof input === 'object' ? input : {};
  const amountValue = Number(moneyValue(payload.amount, 'amount'));
  const reason = text(payload.reason, 'reason', { min: 3, max: 500 });
  const gatewayRefundId = optionalText(payload.gatewayRefundId, 'gatewayRefundId', { max: 190 });

  const payment = await prisma.crmPayment.findUnique({
    where: { id: paymentId },
    include: { customer: { select: { email: true } } },
  });
  if (!payment) throw notFound('Payment not found.');
  await assertCustomerAccess(actor, payment.customerId);
  if (!PAID_PAYMENT_STATUSES.includes(payment.status)) {
    throw conflict('Only successful payments can be refunded.', 'PAYMENT_NOT_REFUNDABLE');
  }

  const currency = payment.currency || 'INR';
  const rate = payment.fxRate ? numeric(payment.fxRate) : currency === 'INR' ? 1 : null;
  if (!rate) throw badRequest('The original payment has no exchange rate; cannot calculate the INR refund value.');
  const baseAmount = round2(dec(amountValue).times(dec(rate)));

  const result = await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw`SELECT id FROM "CrmPayment" WHERE id = ${paymentId} FOR UPDATE`;
    if (!Array.isArray(lockedRows) || lockedRows.length === 0) throw notFound('Payment not found.');
    const lockedPayment = await tx.crmPayment.findUnique({ where: { id: paymentId } });
    if (!lockedPayment || !PAID_PAYMENT_STATUSES.includes(lockedPayment.status)) {
      throw conflict('Only successful payments can be refunded.', 'PAYMENT_NOT_REFUNDABLE');
    }
    const refunded = await tx.refund.aggregate({
      where: { paymentId, status: { in: SUCCESSFUL_REFUND_STATUSES } },
      _sum: { amount: true },
    });
    const alreadyRefunded = numeric(refunded._sum.amount);
    const remaining = numeric(lockedPayment.amount) - alreadyRefunded;
    if (amountValue > remaining + 0.005) {
      throw badRequest(`The refund exceeds the refundable amount (${moneyString(remaining)}).`);
    }

    const refund = await tx.refund.create({
      data: {
        paymentId,
        amount: amountValue,
        currency,
        baseAmountInr: baseAmount,
        reason,
        gatewayRefundId: gatewayRefundId ?? null,
        status: 'SUCCEEDED',
        createdById: actor.id,
      },
    });

    const nextRefunded = alreadyRefunded + amountValue;
    const nextStatus = nextRefunded >= numeric(lockedPayment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx.crmPayment.update({ where: { id: paymentId }, data: { status: nextStatus } });

    if (lockedPayment.invoiceId) await syncInvoiceStatus(tx, lockedPayment.invoiceId);

    await tx.activity.create({
      data: {
        customerId: lockedPayment.customerId,
        projectId: lockedPayment.projectId,
        actorId: actor.id,
        actorType: 'USER',
        type: 'PAYMENT_RECEIVED',
        direction: 'INTERNAL',
        visibility: 'CLIENT',
        subject: `Refund recorded · ${moneyString(amountValue)} ${currency}`,
        body: reason,
        sourceTrust: 'TRUSTED',
        injectionRisk: 'NONE',
      },
    });

    await recordCrmAudit({
      actor,
      action: CRM_AUDIT.PAYMENT_REFUNDED,
      entityType: 'Refund',
      entityId: refund.id,
      targetEmail: payment.customer?.email ?? null,
      req,
      after: {
        paymentId,
        amount: moneyString(amountValue),
        currency,
        baseAmountInr: moneyString(baseAmount),
        status: 'SUCCEEDED',
      },
      client: tx,
    });

    return refund;
  });

  return {
    ...result,
    amount: moneyString(result.amount),
    baseAmountInr: moneyString(result.baseAmountInr),
  };
}

function invoiceWhere(actor, scopeIds, filters = {}) {
  const status = filters.status ? String(filters.status).toUpperCase() : null;
  if (status && ![...LEDGER_STATUSES, 'DRAFT', 'VOID'].includes(status)) {
    throw badRequest('status is not a valid ledger status.');
  }
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;
  if (from && Number.isNaN(from.getTime())) throw badRequest('from must be a valid date.');
  if (to && Number.isNaN(to.getTime())) throw badRequest('to must be a valid date.');
  if (from && to && from > to) throw badRequest('from cannot be after to.');

  return {
    ...(scopeIds === null ? {} : { customerId: { in: scopeIds } }),
    ...(status ? { status } : { status: { in: LEDGER_STATUSES } }),
    ...(filters.customerId ? { customerId: String(filters.customerId) } : {}),
    ...(from || to
      ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };
}

async function pageRows(invoices) {
  if (!invoices.length) return [];
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const paidMap = await paidByInvoice(invoiceIds);
  const payments = await prisma.crmPayment.findMany({
    where: { invoiceId: { in: invoiceIds }, ...paidStatusWhere() },
    select: {
      id: true,
      invoiceId: true,
      method: true,
      currency: true,
      baseAmountInr: true,
      receivedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  const refunds = await prisma.refund.findMany({
    where: { paymentId: { in: payments.map((payment) => payment.id) }, status: { in: SUCCESSFUL_REFUND_STATUSES } },
    select: { paymentId: true, amount: true, currency: true, baseAmountInr: true, createdAt: true },
  });
  const grossMap = new Map();
  for (const payment of payments) {
    grossMap.set(payment.invoiceId, (grossMap.get(payment.invoiceId) ?? 0) + numeric(payment.baseAmountInr));
  }
  const refundByPayment = new Map();
  for (const refund of refunds) {
    const value =
      refund.baseAmountInr != null
        ? numeric(refund.baseAmountInr)
        : refund.currency === 'INR'
          ? numeric(refund.amount)
          : 0;
    refundByPayment.set(refund.paymentId, (refundByPayment.get(refund.paymentId) ?? 0) + value);
  }
  const refundMap = new Map();
  for (const payment of payments) {
    if (!payment.invoiceId) continue;
    refundMap.set(payment.invoiceId, (refundMap.get(payment.invoiceId) ?? 0) + (refundByPayment.get(payment.id) ?? 0));
  }

  return invoices.map((invoice) => {
    const netPaid = paidMap.get(invoice.id) ?? 0;
    const total = numeric(invoice.total);
    const refunded = refundMap.get(invoice.id) ?? 0;
    const invoicePayments = payments.filter((payment) => payment.invoiceId === invoice.id);
    return {
      id: invoice.id,
      invoiceNumber: invoice.number,
      customerId: invoice.customerId,
      customerName: invoice.customer?.companyName || invoice.customer?.contactName || '',
      customerEmail: invoice.customer?.email || '',
      taxId: invoice.customer?.taxId || '',
      projectId: invoice.projectId,
      projectTitle: invoice.project?.title || '',
      status: derivedInvoiceStatus(invoice, netPaid),
      currency: invoice.currency,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subtotal: moneyString(invoice.subtotal),
      discount: moneyString(invoice.discount),
      taxRate: moneyString(invoice.taxRate),
      taxAmount: moneyString(invoice.taxAmount),
      total: moneyString(invoice.total),
      grossPaid: moneyString(grossMap.get(invoice.id) ?? 0),
      refunded: moneyString(refunded),
      netPaid: moneyString(netPaid),
      balanceDue: moneyString(Math.max(total - netPaid, 0)),
      paymentCount: invoicePayments.length,
      refundCount: refunds.filter((refund) => invoicePayments.some((payment) => payment.id === refund.paymentId)).length,
      lastPaymentAt: invoicePayments.at(-1)?.receivedAt || invoicePayments.at(-1)?.createdAt || null,
      methods: [...new Set(invoicePayments.map((payment) => payment.method))].join(' '),
    };
  });
}

export async function listLedger(actor, filters = {}) {
  const scopeIds = await accessibleCustomerIds(actor);
  const take = Math.min(Math.max(Number(filters.limit) || 200, 1), 1000);
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(actor, scopeIds, filters),
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    take,
    include: {
      customer: { select: { contactName: true, companyName: true, email: true, taxId: true } },
      project: { select: { title: true } },
    },
  });
  return pageRows(invoices);
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const CSV_HEADERS = [
  'Invoice Number',
  'Issue Date',
  'Due Date',
  'Customer',
  'Email',
  'Tax ID',
  'Project',
  'Status',
  'Currency',
  'Subtotal',
  'Discount',
  'Tax Rate',
  'Tax Amount',
  'Total',
  'Gross Paid',
  'Refunded',
  'Net Paid',
  'Balance Due',
  'Payment Count',
  'Refund Count',
  'Methods',
  'Last Payment',
];

function csvRow(row) {
  return [
    row.invoiceNumber,
    row.issueDate?.toISOString().slice(0, 10),
    row.dueDate?.toISOString().slice(0, 10),
    row.customerName,
    row.customerEmail,
    row.taxId,
    row.projectTitle,
    row.status,
    row.currency,
    row.subtotal,
    row.discount,
    row.taxRate,
    row.taxAmount,
    row.total,
    row.grossPaid,
    row.refunded,
    row.netPaid,
    row.balanceDue,
    row.paymentCount,
    row.refundCount,
    row.methods,
    row.lastPaymentAt?.toISOString() || '',
  ]
    .map(csvCell)
    .join(',');
}

export async function streamLedgerCsv(res, actor, filters = {}) {
  const scopeIds = await accessibleCustomerIds(actor);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="crm-ledger.csv"'
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.write(`\uFEFF${CSV_HEADERS.map(csvCell).join(',')}\r\n`);

  let cursor = null;
  let emitted = 0;
  while (emitted < MAX_LEDGER_EXPORT_ROWS) {
    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere(actor, scopeIds, filters),
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        customer: { select: { contactName: true, companyName: true, email: true, taxId: true } },
        project: { select: { title: true } },
      },
    });
    if (!invoices.length) break;
    const rows = await pageRows(invoices);
    for (const row of rows) {
      if (emitted >= MAX_LEDGER_EXPORT_ROWS) break;
      res.write(`${csvRow(row)}\r\n`);
      emitted += 1;
    }
    cursor = invoices.at(-1).id;
    if (invoices.length < 200) break;
  }

  res.end();
  return emitted;
}

export async function ledgerSummary(actor) {
  const scopeIds = await accessibleCustomerIds(actor);
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(actor, scopeIds, {}),
    select: { id: true, total: true },
  });
  if (!invoices.length) {
    return {
      invoiced: '0.00',
      grossPaid: '0.00',
      refunded: '0.00',
      netPaid: '0.00',
      outstanding: '0.00',
    };
  }
  const ids = invoices.map((invoice) => invoice.id);
  const paid = await paidByInvoice(ids);
  const grossRows = await prisma.crmPayment.findMany({
    where: { invoiceId: { in: ids }, ...paidStatusWhere() },
    select: { baseAmountInr: true },
  });
  const gross = grossRows.reduce((sum, row) => sum + numeric(row.baseAmountInr), 0);
  const net = [...paid.values()].reduce((sum, value) => sum + value, 0);
  const invoiced = invoices.reduce((sum, invoice) => sum + numeric(invoice.total), 0);
  return {
    invoiced: moneyString(invoiced),
    grossPaid: moneyString(gross),
    refunded: moneyString(gross - net),
    netPaid: moneyString(net),
    outstanding: moneyString(invoices.reduce((sum, invoice) => sum + Math.max(numeric(invoice.total) - (paid.get(invoice.id) ?? 0), 0), 0)),
  };
}

export { syncInvoiceStatus };
