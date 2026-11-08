import express from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncRoute } from '../../lib/crm/errors.js';
import { requirePermission } from '../../lib/crm/permissions.js';
import { dashboardSummary } from '../../services/crm/dashboard.service.js';
import { listActivity } from '../../services/crm/activity.service.js';
import { accessibleCustomerIds } from '../../lib/crm/scope.js';
import { pagination, queryText } from '../../lib/crm/validate.js';
import { moneyString } from '../../lib/crm/money.js';
import { ledgerSummary, listLedger, streamLedgerCsv } from '../../services/crm/ledger.service.js';

export const dashboardRouter = express.Router();
export const activityRouter = express.Router();
export const auditRouter = express.Router();
export const teamRouter = express.Router();
export const portalRouter = express.Router();
export const ledgerRouter = express.Router();

ledgerRouter.get(
  '/',
  requirePermission('PAYMENTS_READ'),
  asyncRoute(async (req, res) => {
    const [rows, summary] = await Promise.all([
      listLedger(req.actor, req.query),
      ledgerSummary(req.actor),
    ]);
    return res.json({ success: true, data: rows, summary });
  })
);

ledgerRouter.get(
  '/export',
  requirePermission('EXPORT_DATA', 'PAYMENTS_READ'),
  asyncRoute(async (req, res) => {
    await streamLedgerCsv(res, req.actor, req.query);
  })
);

dashboardRouter.get(
  '/summary',
  requirePermission('CUSTOMERS_READ'),
  asyncRoute(async (req, res) => {
    const summary = await dashboardSummary(req.actor);
    return res.json({ success: true, data: summary });
  })
);

activityRouter.get(
  '/',
  requirePermission('ACTIVITY_READ'),
  asyncRoute(async (req, res) => {
    const result = await listActivity(req.actor, req.query);
    return res.json({ success: true, ...result });
  })
);

auditRouter.get(
  '/',
  requirePermission('AUDIT_READ'),
  asyncRoute(async (req, res) => {
    const { limit, page, skip } = pagination(req.query);
    const where = {
      ...(req.query.action ? { action: String(req.query.action) } : {}),
      ...(req.query.entityType ? { entityType: String(req.query.entityType) } : {}),
      ...(req.query.outcome ? { outcome: String(req.query.outcome) } : {}),
      ...(req.query.q
        ? {
            OR: [
              { actorId: { contains: queryText(req.query.q, 'q'), mode: 'insensitive' } },
              { targetEmail: { contains: queryText(req.query.q, 'q'), mode: 'insensitive' } },
              { action: { contains: queryText(req.query.q, 'q'), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({
      success: true,
      data: rows,
      meta: { page, limit, total, hasMore: page * limit < total },
    });
  })
);

teamRouter.get(
  '/',
  requirePermission('TEAM_MANAGE'),
  asyncRoute(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { crmRole: { in: ['SUPERADMIN', 'ADMIN', 'TEAM'] } },
      orderBy: [{ crmRole: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        name: true,
        crmRole: true,
        crmActive: true,
        lastLoginAt: true,
        crmPermissions: { select: { permission: true } },
      },
    });
    return res.json({ success: true, data: users });
  })
);

portalRouter.get(
  '/overview',
  requirePermission('PORTAL_READ'),
  asyncRoute(async (req, res) => {
    const ids = await accessibleCustomerIds(req.actor);
    if (ids && ids.length === 0) {
      return res.json({
        success: true,
        data: { customers: [], projects: [], invoices: [], payments: [] },
      });
    }

    const customers = await prisma.customer.findMany({
      where: { deletedAt: null, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, contactName: true, companyName: true, email: true, stage: true, currency: true },
    });
    const customerIds = customers.map((customer) => customer.id);

    const [projects, invoices, payments] = await Promise.all([
      prisma.project.findMany({
        where: { customerId: { in: customerIds }, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          progress: true,
          dueDate: true,
          contractValue: true,
          currency: true,
          customerId: true,
        },
      }),
      prisma.invoice.findMany({
        where: { customerId: { in: customerIds }, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          currency: true,
          dueDate: true,
          customerId: true,
        },
      }),
      prisma.crmPayment.findMany({
        where: { customerId: { in: customerIds }, status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          method: true,
          status: true,
          amount: true,
          currency: true,
          receivedAt: true,
          customerId: true,
        },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        customers,
        projects: projects.map((project) => ({
          ...project,
          contractValue: moneyString(project.contractValue),
        })),
        invoices: invoices.map((invoice) => ({ ...invoice, total: moneyString(invoice.total) })),
        payments: payments.map((payment) => ({
          ...payment,
          amount: moneyString(payment.amount),
        })),
      },
    });
  })
);
