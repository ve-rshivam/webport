
import express from 'express';
import {
  verifyRazorpaySignature,
  parseRazorpayEvent,
  normalizeRazorpayPayment,
  verifyPaypalWebhook,
  parsePaypalEvent,
  normalizePaypalPayment,
} from '../services/payments.js';
import { provisionFromPayment, handleFailedPayment, sendTopUpReceipt } from '../services/provisioning.js';
import { createAlert, logWebhookError } from '../services/notifications.js';
import { sendError } from '../lib/http.js';
import { emitPaymentReceived, emitProjectMutation } from '../lib/realtime.js';
import { claimWebhookEvent } from '../lib/webhookGuard.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';

export function createWebhookRouter({ resolvePaypalPayment, disconnectClientSockets = () => {} } = {}) {
  const router = express.Router();
  const raw = express.raw({ type: '*/*', limit: '1mb' });

    router.post('/razorpay-webhook', raw, async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    let payload;

    try {
      verifyRazorpaySignature(rawBody, req.headers['x-razorpay-signature']);
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      await logWebhookError({
        gateway: 'razorpay',
        message: `Rejected Razorpay webhook: ${err.message}`,
        details: { reason: err.code ?? 'verification_failed' },
      }).catch(() => {});
      return sendError(res, err, 'Webhook rejected.');
    }

    const { status, entity } = parseRazorpayEvent(payload);

        const eventId = String(
      req.headers['x-razorpay-event-id'] ?? `${payload?.event ?? 'razorpay'}:${entity?.id ?? ''}`
    ).slice(0, 200);
    const claim = await claimWebhookEvent({ gateway: 'razorpay', eventId });
    if (claim.duplicate) {
      await recordAudit({
        action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_REPLAYED,
        actorRole: 'gateway',
        req,
        metadata: { gateway: 'razorpay', eventId },
      });
      return res.status(200).json({ success: true, duplicate: true });
    }

    try {
      if (status === 'ignored') {
        return res.status(200).json({ success: true, ignored: true, event: payload?.event ?? null });
      }

      const normalized = normalizeRazorpayPayment(entity, {
        email: payload?.payload?.payment?.entity?.email,
      });

      if (status === 'failed') {
        await handleFailedPayment({
          ...normalized,
          reason: entity?.error_description ?? entity?.error_reason ?? 'payment_failed',
        });
        return res.status(200).json({ success: true, recorded: 'failed' });
      }

      const result = await provisionFromPayment(normalized, disconnectClientSockets);
      if (!result.duplicate && result.project) {
        emitProjectMutation(req, normalized.isRemainingPayment ? 'updated' : 'created', result.project, {
          source: 'portal',
          user: result.user,
        });
        emitPaymentReceived(req, {
          source: 'gateway',
          payment: {
            gateway: normalized.gateway,
            transactionId: normalized.transactionId,
            amount: normalized.amount,
            currency: normalized.currency,
            email: normalized.email,
            name: normalized.name,
            projectId: result.project.id,
          },
        });
      }
      if (provisionInput.isRemainingPayment && result.project && !result.duplicate) {
        await sendTopUpReceipt({
          to: normalized.email,
          name: normalized.name,
          amount: provisionInput.projectAmount ?? normalized.amount,
          currency: result.project.currency ?? normalized.currency,
          projectTitle: result.project.projectTitle,
        });
      }
      await recordAudit({
        action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_PROCESSED,
        actorRole: 'gateway',
        targetEmail: normalized.email ?? null,
        req,
        metadata: {
          gateway: 'razorpay',
          eventId,
          transactionId: normalized.transactionId,
          duplicate: Boolean(result.duplicate),
        },
      });
      return res.status(200).json({ success: true, duplicate: result.duplicate });
    } catch (err) {
      await claim.release();
      await logWebhookError({
        gateway: 'razorpay',
        transactionId: entity?.id ?? null,
        message: `Razorpay webhook processing failed: ${err.message}`,
      }).catch(() => {});
      return sendError(res, err, 'Webhook processing failed.');
    }
  });

    router.post('/paypal-webhook', raw, async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    let payload;
    try {
      payload = await verifyPaypalWebhook(req.headers, rawBody);
    } catch (err) {
      await logWebhookError({
        gateway: 'paypal',
        message: `Rejected PayPal webhook: ${err.message}`,
        details: { reason: err.code ?? 'verification_failed' },
      }).catch(() => {});
      return sendError(res, err, 'Webhook rejected.');
    }

    const { status, resource } = parsePaypalEvent(payload);

    const eventId = String(payload?.id ?? `${payload?.event_type ?? 'paypal'}:${resource?.id ?? ''}`).slice(0, 200);
    const claim = await claimWebhookEvent({ gateway: 'paypal', eventId });
    if (claim.duplicate) {
      await recordAudit({
        action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_REPLAYED,
        actorRole: 'gateway',
        req,
        metadata: { gateway: 'paypal', eventId },
      });
      return res.status(200).json({ success: true, duplicate: true });
    }

    try {
      if (status === 'ignored' || status === 'pending') {
        return res.status(200).json({ success: true, ignored: true, event: payload?.event_type ?? null });
      }

      const normalized = normalizePaypalPayment(resource, { email: resource?.payer?.email_address });

      if (status === 'failed') {
        await handleFailedPayment({
          ...normalized,
          reason: payload?.event_type ?? 'payment_failed',
        });
        return res.status(200).json({ success: true, recorded: 'failed' });
      }

      if (typeof resolvePaypalPayment !== 'function') {
        throw new Error('PayPal payment valuation resolver is not configured.');
      }
      const paymentValuation = await resolvePaypalPayment(normalized);
      const provisionInput = { ...normalized, ...paymentValuation };
      const result = await provisionFromPayment(provisionInput, disconnectClientSockets);
      if (!result.duplicate && result.project) {
        emitProjectMutation(req, provisionInput.isRemainingPayment ? 'updated' : 'created', result.project, {
          source: 'portal',
          user: result.user,
        });
        emitPaymentReceived(req, {
          source: 'gateway',
          payment: {
            gateway: normalized.gateway,
            transactionId: normalized.transactionId,
            amount: normalized.amount,
            currency: normalized.currency,
            email: normalized.email,
            name: normalized.name,
            projectId: result.project.id,
          },
        });
      }
      if (provisionInput.isRemainingPayment && result.project && !result.duplicate) {
        await sendTopUpReceipt({
          to: normalized.email,
          name: normalized.name,
          amount: provisionInput.projectAmount ?? normalized.amount,
          currency: result.project.currency ?? normalized.currency,
          projectTitle: result.project.projectTitle,
        });
      }
      await recordAudit({
        action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_PROCESSED,
        actorRole: 'gateway',
        targetEmail: normalized.email ?? null,
        req,
        metadata: {
          gateway: 'paypal',
          eventId,
          transactionId: normalized.transactionId,
          duplicate: Boolean(result.duplicate),
        },
      });
      return res.status(200).json({ success: true, duplicate: result.duplicate });
    } catch (err) {
      await claim.release();
      await logWebhookError({
        gateway: 'paypal',
        transactionId: resource?.id ?? null,
        message: `PayPal webhook processing failed: ${err.message}`,
      }).catch(() => {});
      return sendError(res, err, 'Webhook processing failed.');
    }
  });

    router.use((_req, _res, next) => next());

  return router;
}
