import express from 'express';
import { asyncRoute } from '../../lib/crm/errors.js';
import { requirePermission } from '../../lib/crm/permissions.js';
import { recordRefund } from '../../services/crm/ledger.service.js';
import {
  listPayments,
  listRecycleBin,
  proofImage,
  purgeProof,
  recordGatewayPayment,
  rejectPayment,
  restoreProof,
  submitManualPayment,
  verifyPayment,
} from '../../services/crm/payments.service.js';

export const paymentsRouter = express.Router();

paymentsRouter.get(
  '/',
  requirePermission('PAYMENTS_READ'),
  asyncRoute(async (req, res) => {
    const result = await listPayments(req.actor, req.query);
    return res.json({ success: true, ...result });
  })
);

paymentsRouter.get(
  '/recycle-bin',
  requirePermission('PAYMENTS_VERIFY'),
  asyncRoute(async (req, res) => {
    const payments = await listRecycleBin(req.actor);
    return res.json({ success: true, data: payments });
  })
);

paymentsRouter.post(
  '/manual',
  requirePermission('PAYMENTS_WRITE'),
  asyncRoute(async (req, res) => {
    const result = await submitManualPayment(req.actor, req.body, req);
    return res.status(result.idempotent ? 200 : 201).json({ success: true, data: result });
  })
);

paymentsRouter.post(
  '/gateway',
  requirePermission('PAYMENTS_VERIFY'),
  asyncRoute(async (req, res) => {
    const payment = await recordGatewayPayment(req.actor, req.body, req);
    return res.status(201).json({ success: true, data: payment });
  })
);

paymentsRouter.post(
  '/:id/verify',
  requirePermission('PAYMENTS_VERIFY'),
  asyncRoute(async (req, res) => {
    const payment = await verifyPayment(req.actor, req.params.id, req.body, req);
    return res.json({ success: true, data: payment });
  })
);

paymentsRouter.post(
  '/:id/reject',
  requirePermission('PAYMENTS_VERIFY'),
  asyncRoute(async (req, res) => {
    const payment = await rejectPayment(req.actor, req.params.id, req.body, req);
    return res.json({ success: true, data: payment });
  })
);

paymentsRouter.post(
  '/:id/refund',
  requirePermission('PAYMENTS_VERIFY'),
  asyncRoute(async (req, res) => {
    const refund = await recordRefund(req.actor, req.params.id, req.body, req);
    return res.status(201).json({ success: true, data: refund });
  })
);

paymentsRouter.get(
  '/:id/proof',
  requirePermission('PAYMENTS_VERIFY'),
  asyncRoute(async (req, res) => {
    const proof = await proofImage(req.actor, req.params.id);
    res.set({
      'Content-Type': proof.mime || 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(proof.buffer);
  })
);

paymentsRouter.post(
  '/:id/proof/restore',
  requirePermission('PAYMENTS_VERIFY'),
  asyncRoute(async (req, res) => {
    const payment = await restoreProof(req.actor, req.params.id, req);
    return res.json({ success: true, data: payment });
  })
);

paymentsRouter.delete(
  '/:id/proof',
  requirePermission('PAYMENTS_VERIFY'),
  asyncRoute(async (req, res) => {
    const payment = await purgeProof(req.actor, req.params.id, req);
    return res.json({ success: true, data: payment });
  })
);
