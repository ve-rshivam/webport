
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { sendError } from '../lib/http.js';
import {
  validateEmail,
  validateRequiredString,
  requireJsonBody,
  validateNonNegativeNumber,
} from '../services/validators.js';
import { createAlert } from '../services/notifications.js';
import { sendSupportAlertEmail } from '../services/email.service.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createAlertsRouter({ limiter } = {}) {
  const router = express.Router();
  const limit = limiter ?? ((_req, _res, next) => next());

    router.post('/contact', limit, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const name = validateRequiredString(body.name, 'name', 2, 120);
      const email = validateEmail(body.email);
      const message = validateRequiredString(body.message, 'message', 5, 5000);
      const subject = body.subject ? validateRequiredString(body.subject, 'subject', 1, 200) : 'Website contact form';

      await prisma.adminAlert.create({
        data: {
          type: 'contact_message',
          severity: 'info',
          userName: name,
          userEmail: email,
          message: `${subject}: ${message.slice(0, 500)}`,
          details: { name, email, subject, message },
          source: 'contact',
        },
      });

      try {
        await sendSupportAlertEmail({
          subject: `Contact form — ${name}`,
          replyTo: email,
          bodyHtml: `<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;</p>
            <p style="white-space:pre-wrap;margin-top:12px;">${escapeHtml(message)}</p>
            <p style="margin-top:12px;color:#8a7f6d;font-size:12px;">Reply directly to this email to answer the sender.</p>`,
          bodyText: `${name} <${email}>\n\n${message}`,
        });
      } catch (mailErr) {
        console.error('[alerts] contact email failed:', mailErr?.message ?? mailErr);
      }

      return res.status(201).json({ success: true, message: 'Message received.' });
    } catch (err) {
      return sendError(res, err, 'Could not send your message.');
    }
  });

    router.post('/abandoned-checkout', limit, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const email = body.email ? validateEmail(body.email) : null;
      const name = body.name ? String(body.name).trim().slice(0, 120) : null;
      const serviceName = body.serviceName ? String(body.serviceName).trim().slice(0, 200) : null;
      const amount = body.amount === undefined ? 0 : validateNonNegativeNumber(body.amount, 'amount');

      await createAlert({
        type: 'payment_failed',
        severity: 'warning',
        userName: name,
        userEmail: email,
        message: `Abandoned checkout${email ? ` — ${email}` : ''}${serviceName ? ` (${serviceName})` : ''}.`,
        details: { email, name, serviceName, amount, currency: body.currency ?? 'INR', reason: 'abandoned_checkout' },
        source: 'checkout',
        emailSubject: `Abandoned checkout${email ? ` — ${email}` : ''}`,
      });

      return res.status(201).json({ success: true });
    } catch (err) {
      return sendError(res, err, 'Could not record the checkout.');
    }
  });

    router.post('/payment-failure', limit, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const email = body.email ? validateEmail(body.email) : null;
      const gateway = body.gateway ? String(body.gateway).trim().slice(0, 40) : 'unknown';
      const reason = body.reason ? String(body.reason).trim().slice(0, 300) : 'Payment failed';
      const amount = body.amount === undefined ? 0 : validateNonNegativeNumber(body.amount, 'amount');

      await createAlert({
        type: 'payment_failed',
        severity: 'warning',
        userEmail: email,
        message: `${gateway} payment failure${email ? ` for ${email}` : ''}: ${reason}`,
        details: { gateway, email, amount, currency: body.currency ?? 'INR', transactionId: body.transactionId ?? null, reason },
        source: gateway,
        emailSubject: `Payment failure — ${email ?? gateway}`,
      });

      return res.status(201).json({ success: true });
    } catch (err) {
      return sendError(res, err, 'Could not record the failure.');
    }
  });

  return router;
}
