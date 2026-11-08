import express from 'express';
import { prisma } from '../lib/prisma.js';
import { sendError } from '../lib/http.js';
import {
  ValidationError,
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

// Security Firewall: Blocks XSS, NoSQL operators, and Second-Order Prompt Injections
const MALICIOUS_INPUT_PATTERNS = [
  /<script[\s>]|javascript:|vbscript:|data:text\/html|onerror\s*=|onload\s*=/i,
  /\$where|\$ne|\$gt|\$lt|\$regex|\$nin|\$or|\$and/i,
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+instructions/i,
];

function sanitizeCleanText(value, fieldName, maxLen = 5000) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a valid string.`);
  }
  const cleaned = value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);

  for (const pattern of MALICIOUS_INPUT_PATTERNS) {
    if (pattern.test(cleaned)) {
      throw new ValidationError(`Invalid or unsafe characters detected in ${fieldName}.`, 400);
    }
  }
  return cleaned;
}

function sanitizeHeaderField(value, maxLen = 150) {
  return String(value ?? '')
    .replace(/[\r\n\0<>]/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function createAlertsRouter({ limiter } = {}) {
  const router = express.Router();
  // Rate limiting bypassed for testing unless ENABLE_RATE_LIMITS=true
  const isRateLimitEnabled = process.env.ENABLE_RATE_LIMITS === 'true';
  const limit = isRateLimitEnabled && limiter ? limiter : (_req, _res, next) => next();

  router.post('/contact', limit, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const rawName = validateRequiredString(body.name, 'name', 2, 120);
      const name = sanitizeHeaderField( sanitizeCleanText(rawName, 'name', 120), 120 );
      const email = validateEmail(body.email);
      const rawMessage = validateRequiredString(body.message, 'message', 5, 5000);
      const message = sanitizeCleanText(rawMessage, 'message', 5000);
      const rawSubject = body.subject
        ? validateRequiredString(body.subject, 'subject', 1, 200)
        : 'Website contact form';
      const subject = sanitizeHeaderField(sanitizeCleanText(rawSubject, 'subject', 200), 200);

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
      const name = body.name ? sanitizeHeaderField(sanitizeCleanText(String(body.name), 'name', 120), 120) : null;
      const serviceName = body.serviceName ? sanitizeHeaderField(sanitizeCleanText(String(body.serviceName), 'serviceName', 200), 200) : null;
      const amount = body.amount === undefined ? 0 : validateNonNegativeNumber(body.amount, 'amount');
      const currency = typeof body.currency === 'string' ? body.currency.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'INR' : 'INR';

      await createAlert({
        type: 'payment_failed',
        severity: 'warning',
        userName: name,
        userEmail: email,
        message: `Abandoned checkout${email ? ` — ${email}` : ''}${serviceName ? ` (${serviceName})` : ''}.`,
        details: { email, name, serviceName, amount, currency, reason: 'abandoned_checkout' },
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
      const gateway = body.gateway ? sanitizeHeaderField(String(body.gateway), 40) : 'unknown';
      const reason = body.reason ? sanitizeCleanText(String(body.reason), 'reason', 300) : 'Payment failed';
      const amount = body.amount === undefined ? 0 : validateNonNegativeNumber(body.amount, 'amount');
      const currency = typeof body.currency === 'string' ? body.currency.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'INR' : 'INR';
      const transactionId = typeof body.transactionId === 'string' ? sanitizeHeaderField(body.transactionId, 120) : null;

      await createAlert({
        type: 'payment_failed',
        severity: 'warning',
        userEmail: email,
        message: `${gateway} payment failure${email ? ` for ${email}` : ''}: ${reason}`,
        details: { gateway, email, amount, currency, transactionId, reason },
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