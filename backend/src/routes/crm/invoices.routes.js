import express from 'express';
import { asyncRoute } from '../../lib/crm/errors.js';
import { requirePermission } from '../../lib/crm/permissions.js';
import {
  createInvoice,
  getInvoice,
  invoicePdf,
  issueInvoice,
  listInvoices,
  voidInvoice,
} from '../../services/crm/invoices.service.js';

export const invoicesRouter = express.Router();

invoicesRouter.get(
  '/',
  requirePermission('INVOICES_READ'),
  asyncRoute(async (req, res) => {
    const result = await listInvoices(req.actor, req.query);
    return res.json({ success: true, ...result });
  })
);

invoicesRouter.post(
  '/',
  requirePermission('INVOICES_WRITE'),
  asyncRoute(async (req, res) => {
    const invoice = await createInvoice(req.actor, req.body, req);
    return res.status(201).json({ success: true, data: invoice });
  })
);

invoicesRouter.get(
  '/:id',
  requirePermission('INVOICES_READ'),
  asyncRoute(async (req, res) => {
    const invoice = await getInvoice(req.actor, req.params.id);
    return res.json({ success: true, data: invoice });
  })
);

invoicesRouter.post(
  '/:id/issue',
  requirePermission('INVOICES_WRITE'),
  asyncRoute(async (req, res) => {
    const invoice = await issueInvoice(req.actor, req.params.id, req);
    return res.json({ success: true, data: invoice });
  })
);

invoicesRouter.post(
  '/:id/void',
  requirePermission('INVOICES_WRITE'),
  asyncRoute(async (req, res) => {
    const invoice = await voidInvoice(req.actor, req.params.id, req.body, req);
    return res.json({ success: true, data: invoice });
  })
);

invoicesRouter.get(
  '/:id/pdf',
  requirePermission('INVOICES_READ'),
  asyncRoute(async (req, res) => {
    const pdf = await invoicePdf(req.actor, req.params.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${req.params.id}.pdf"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store',
    });
    return res.status(200).send(pdf);
  })
);
