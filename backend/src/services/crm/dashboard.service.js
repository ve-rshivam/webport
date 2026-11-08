import { prisma } from '../../lib/prisma.js';
import { moneyString } from '../../lib/crm/money.js';
import { accessibleCustomerIds } from '../../lib/crm/scope.js';
import { paidByInvoice, netCollectedSince } from './ledger.service.js';

const LEAD_STAGES = ['NEW', 'CONTACTED', 'PROPOSAL_SENT'];
const OPEN_PROJECT_STATUSES = ['DISCOVERY', 'IN_PROGRESS', 'REVIEW'];
const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'PROPOSAL_SENT', 'ACTIVE'];

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function outstandingTotal(customerIds = null) {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      ...(customerIds ? { customerId: { in: customerIds } } : {}),
    },
    select: { id: true, total: true },
  });
  if (!invoices.length) return 0;

  const paidMap = await paidByInvoice(invoices.map((invoice) => invoice.id));
  return invoices.reduce(
    (sum, invoice) => sum + Math.max(Number(invoice.total) - (paidMap.get(invoice.id) ?? 0), 0),
    0
  );
}

export async function dashboardSummary(actor) {
  const scopeIds = await accessibleCustomerIds(actor);
  const customerFilter = scopeIds === null ? {} : { customerId: { in: scopeIds } };
  const monthStart = startOfMonth();

  const [
    collected,
    leadCustomers,
    openProjects,
    activeProjects,
    unverifiedPayments,
    overdueInvoices,
    recentActivity,
    allProjects,
  ] = await Promise.all([
    netCollectedSince(scopeIds, monthStart),
    prisma.customer.findMany({
      where: { deletedAt: null, stage: { in: LEAD_STAGES }, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
      select: { id: true },
    }),
    prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { in: OPEN_PROJECT_STATUSES },
        ...(scopeIds ? { customerId: { in: scopeIds } } : {}),
      },
      select: { customerId: true, contractValue: true },
    }),
    prisma.project.count({
      where: {
        deletedAt: null,
        status: { in: OPEN_PROJECT_STATUSES },
        ...(scopeIds ? { customerId: { in: scopeIds } } : {}),
      },
    }),
    prisma.crmPayment.count({
      where: { status: 'AWAITING_VERIFICATION', ...customerFilter },
    }),
    prisma.invoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: new Date() },
        ...customerFilter,
      },
      orderBy: { dueDate: 'asc' },
      take: 3,
      include: { customer: { select: { id: true, contactName: true } } },
    }),
    prisma.activity.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 12,
      where: scopeIds === null ? {} : { customerId: { in: scopeIds } },
      include: {
        actor: { select: { id: true, name: true } },
        customer: { select: { id: true, contactName: true, companyName: true } },
      },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, ...(scopeIds ? { customerId: { in: scopeIds } } : {}) },
      select: { customerId: true, status: true, contractValue: true },
    }),
  ]);

  const leadIds = leadCustomers.map((customer) => customer.id);
  const pipelineProjects = openProjects.filter((project) => leadIds.includes(project.customerId));
  const pipelineValue = pipelineProjects.reduce(
    (sum, project) => sum + Number(project.contractValue),
    0
  );

  const stageCounts = await prisma.customer.groupBy({
    by: ['stage'],
    where: { deletedAt: null, stage: { in: PIPELINE_STAGES }, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
    _count: { _all: true },
  });
  const stageCountMap = new Map(stageCounts.map((row) => [row.stage, row._count._all]));

  const valueByCustomer = new Map();
  for (const project of allProjects) {
    if (['ARCHIVED', 'DELIVERED'].includes(project.status)) continue;
    valueByCustomer.set(
      project.customerId,
      (valueByCustomer.get(project.customerId) ?? 0) + Number(project.contractValue)
    );
  }
  const customerStages = await prisma.customer.findMany({
    where: { deletedAt: null, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
    select: { id: true, stage: true },
  });
  const stageValue = new Map(PIPELINE_STAGES.map((stage) => [stage, 0]));
  for (const customer of customerStages) {
    if (!stageValue.has(customer.stage)) continue;
    stageValue.set(customer.stage, stageValue.get(customer.stage) + (valueByCustomer.get(customer.id) ?? 0));
  }

  const pendingProofs = await prisma.crmPayment.findMany({
    where: { status: 'AWAITING_VERIFICATION', ...customerFilter },
    orderBy: { createdAt: 'asc' },
    take: 3,
    include: { customer: { select: { id: true, contactName: true } } },
  });

  const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const staleLeads = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      stage: { in: LEAD_STAGES },
      updatedAt: { lt: staleCutoff },
      ...(scopeIds ? { id: { in: scopeIds } } : {}),
    },
    orderBy: { updatedAt: 'asc' },
    take: 2,
    select: { id: true, contactName: true, companyName: true, stage: true, updatedAt: true },
  });

  const needsAttention = [
    ...overdueInvoices.map((invoice) => ({
      type: 'OVERDUE_INVOICE',
      id: invoice.id,
      customerId: invoice.customerId,
      label: `${invoice.number ?? 'Invoice'} · ${moneyString(invoice.total)} ${invoice.currency} overdue`,
      dueDate: invoice.dueDate,
      customer: invoice.customer,
    })),
    ...pendingProofs.map((payment) => ({
      type: 'UNVERIFIED_PAYMENT',
      id: payment.id,
      customerId: payment.customerId,
      label: `${moneyString(payment.amount)} ${payment.currency} awaiting verification`,
      createdAt: payment.createdAt,
      customer: payment.customer,
    })),
    ...staleLeads.map((customer) => ({
      type: 'STALE_LEAD',
      id: customer.id,
      customerId: customer.id,
      label: `${customer.contactName} · no activity since ${customer.updatedAt.toISOString().slice(0, 10)}`,
      stage: customer.stage,
      customer: { id: customer.id, contactName: customer.contactName },
    })),
  ].slice(0, 8);

  return {
    collectedThisMonth: moneyString(collected),
    outstanding: moneyString(await outstandingTotal(scopeIds)),
    openPipeline: {
      count: leadIds.length,
      value: moneyString(pipelineValue),
    },
    activeProjects,
    unverifiedPayments,
    overdueInvoices: overdueInvoices.length,
    pipeline: PIPELINE_STAGES.map((stage) => ({
      stage,
      customers: stageCountMap.get(stage) ?? 0,
      value: moneyString(stageValue.get(stage) ?? 0),
    })),
    needsAttention,
    recentActivity: recentActivity.map((activity) => ({
      id: activity.id,
      type: activity.type,
      subject: activity.subject,
      body: activity.body,
      customer: activity.customer,
      actor: activity.actor,
      occurredAt: activity.occurredAt,
      injectionRisk: activity.injectionRisk,
    })),
  };
}
