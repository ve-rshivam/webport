
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { sendError } from '../lib/http.js';
import {
  ValidationError,
  validateEmail,
  validateRequiredString,
  requireJsonBody,
  validateNonNegativeNumber,
  validateOptionalUrl,
} from '../services/validators.js';
import { provisionFromPayment } from '../services/provisioning.js';
import { createAlert } from '../services/notifications.js';
import { sendSupportAlertEmail, portalUrl } from '../services/email.service.js';
import { emitPaymentReceived, emitProjectMutation } from '../lib/realtime.js';
import { inspectImageDataUrl } from '../lib/security.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';

const MAX_SCREENSHOT_CHARS = 4_000_000;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validateScreenshot(value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const raw = String(value).trim();

  if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(raw)) {
    if (raw.length > MAX_SCREENSHOT_CHARS) {
      throw new ValidationError('The screenshot is too large. Please use an image under 3 MB.', 413);
    }
            if (!inspectImageDataUrl(raw).ok) {
      throw new ValidationError('The screenshot must be a valid PNG, JPEG or WebP image.', 415);
    }
    return raw;
  }

  return validateOptionalUrl(raw, 'screenshotUrl');
}

function submissionView(alert) {
  const details = alert.details ?? {};
  return {
    id: alert.id,
    clientName: details.clientName ?? details.name ?? alert.userName ?? null,
    email: details.email ?? alert.userEmail ?? null,
    amount: Number(details.amount ?? 0),
    currency: details.currency ?? 'INR',
    transactionRef: details.transactionRef ?? details.transactionId ?? null,
    screenshotUrl: details.screenshotUrl ?? null,
    serviceName: details.serviceName ?? null,
    notes: details.notes ?? null,
    status: details.status ?? 'pending',
    createdAt: alert.createdAt,
  };
}

async function approveSubmission(id, admin, req, totalAmount, disconnectClientSockets = () => {}) {
  const alert = await prisma.adminAlert.findUnique({ where: { id } });
  if (!alert || alert.type !== 'qr_submission') {
    throw new ValidationError('Submission not found.', 404);
  }

  const details = alert.details ?? {};
  if (details.status === 'approved') {
    throw new ValidationError('This submission was already approved.', 409);
  }
  if (details.status === 'rejected') {
    throw new ValidationError('This submission was rejected. Ask the client to resubmit.', 409);
  }

  const amount = Number(details.amount ?? 0);
  const verifiedTotal = validateNonNegativeNumber(totalAmount, 'totalAmount');
  if (verifiedTotal <= 0 || amount > verifiedTotal) {
    throw new ValidationError('A project valuation at least as large as the verified payment is required.');
  }

  const email = details.email ?? alert.userEmail;
  const result = await provisionFromPayment({
    gateway: 'qr',
    transactionId: String(details.transactionRef ?? details.transactionId ?? alert.id),
    amount,
    totalAmount: verifiedTotal,
    currency: details.currency ?? 'INR',
    email,
    name: details.clientName ?? details.name ?? alert.userName,
    serviceName: details.serviceName ?? null,
    details: { gateway: 'qr', submissionId: alert.id, approvedBy: admin?.id ?? null },
  }, disconnectClientSockets);
  if (result.project) {
    emitProjectMutation(req, result.duplicate ? 'updated' : 'created', result.project, {
      source: 'portal',
      user: result.user,
    });
  }

  const emailSent = Boolean(result.emailSent);
  const manualRequired = Boolean(result.manualRequired || !emailSent);
  const plainPasscode = result.manualPasscode || result.temporaryPassword;

  await prisma.adminAlert.update({
    where: { id: alert.id },
    data: {
      details: {
        ...details,
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: admin?.id ?? null,
        emailSent,
        manualRequired,
      },
    },
  });

  await createAlert({
    type: 'qr_approval',
    severity: manualRequired ? 'warning' : 'info',
    userId: result.user?.id ?? null,
    userEmail: email,
    userName: details.clientName ?? alert.userName,
    message: `QR payment approved for ${email} by ${admin?.id ?? 'an admin'}.${manualRequired ? ' (All email providers failed; manual dispatch required)' : ''}`,
    details: {
      submissionId: alert.id,
      projectId: result.project?.id ?? null,
      emailSent,
      manualRequired,
    },
    source: 'qr',
    emailSubject: `QR payment approved — ${email}`,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.QR_PAYMENT_APPROVED,
    actorId: admin?.id ?? null,
    actorRole: admin?.role ?? 'admin',
    targetEmail: email ?? null,
    req,
    metadata: {
      submissionId: alert.id,
      amount: Number(details.amount ?? 0),
      duplicate: Boolean(result.duplicate),
      emailSent,
      manualRequired,
    },
  });

  if (manualRequired) {
    return {
      success: true,
      emailSent: false,
      manualRequired: true,
      manualPasscode: plainPasscode,
      message: "User provisioned, but all email providers failed. Please provide credentials manually.",
      duplicate: result.duplicate,
      projectId: result.project?.id ?? null,
      credentialsEmailed: false,
      sentTo: email,
      loginUrl: portalUrl('/portal'),
    };
  }

  return {
    success: true,
    emailSent: true,
    manualRequired: false,
    duplicate: result.duplicate,
    projectId: result.project?.id ?? null,
    credentialsEmailed: true,
    sentTo: email,
    loginUrl: portalUrl('/portal'),
  };
}

async function rejectSubmission(id, reason, admin, req = null) {
  const alert = await prisma.adminAlert.findUnique({ where: { id } });
  if (!alert || alert.type !== 'qr_submission') {
    throw new ValidationError('Submission not found.', 404);
  }

  const details = alert.details ?? {};
  if (details.status === 'approved') {
    throw new ValidationError('This submission was already approved and cannot be rejected.', 409);
  }

  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : null;

  await prisma.adminAlert.update({
    where: { id: alert.id },
    data: {
      details: {
        ...details,
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectedBy: admin?.id ?? null,
        reason: cleanReason,
      },
    },
  });

  await createAlert({
    type: 'qr_submission',
    severity: 'info',
    userEmail: alert.userEmail,
    message: `QR payment rejected for ${alert.userEmail}${cleanReason ? `: ${cleanReason}` : ''}.`,
    details: { submissionId: alert.id, reason: cleanReason },
    source: 'qr',
    notify: false,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.QR_PAYMENT_REJECTED,
    actorId: admin?.id ?? null,
    actorRole: admin?.role ?? 'admin',
    targetEmail: alert.userEmail ?? null,
    req,
    metadata: { submissionId: alert.id, reason: cleanReason },
  });

  return { submissionId: alert.id };
}

export function createQrRouter({ verifyAdminToken, checkPerm, limiter, qrUploadLimiter, resolveAdvanceFloor, disconnectClientSockets = () => {} } = {}) {
  const router = express.Router();
  const limit = limiter ?? ((_req, _res, next) => next());
  const uploadLimit = qrUploadLimiter ?? ((_req, _res, next) => next());
  const adminGuard = [verifyAdminToken, checkPerm(['payments'])];
  const requireProjectAndPaymentPermissions = (req, res, next) => {
    if (req.admin.role === 'superadmin') return next();
    const permissions = new Set(req.admin.permissions ?? []);
    if (permissions.has('projects') && permissions.has('payments')) return next();
    return res.status(403).json({
      success: false,
      message: 'Access Denied. Approving a payment proof requires both projects and payments permissions.',
    });
  };
  const approveGuard = [verifyAdminToken, requireProjectAndPaymentPermissions];

      // [RATE LIMITER - QR SCREENSHOT UPLOAD]: 5MB base64 screenshot flood aur RAM exhaustion rokne ke liye.
      router.post('/submit', uploadLimit, express.json({ limit: '5mb' }), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const clientName = validateRequiredString(
        body.clientName ?? body.name,
        'clientName',
        2,
        120
      );
      if (!String(clientName).trim()) {
        throw new ValidationError('clientName is required.');
      }
      const email = validateEmail(body.email);
      const amount = validateNonNegativeNumber(body.amount, 'amount');
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('amount must be a positive number.');
      }

      const transactionRef = validateRequiredString(
        body.transactionRef ?? body.transactionId,
        'transactionRef',
        3,
        120
      );
      const screenshotUrl = validateScreenshot(body.screenshotUrl);
      const serviceName = body.serviceName ? String(body.serviceName).trim().slice(0, 200) : null;
      const notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;
      const currency = String(body.currency ?? 'INR').trim().slice(0, 8) || 'INR';

      // [40% SERVER FLOOR] Service select ho aur remaining-balance payment na ho to minimum advance enforce karo.
      if (body.isRemainingPayment !== true && typeof resolveAdvanceFloor === 'function') {
        const floor = await resolveAdvanceFloor({ serviceId: body.serviceId, serviceName });
        if (floor && Number(floor.price) > 0) {
          const configuredFloor = Number(floor.minAmount);
          const minimumAdvance = Math.max(
            Math.round(Number(floor.price) * 0.4),
            Number.isFinite(configuredFloor) && configuredFloor > 0 ? configuredFloor : 100
          );
          if (amount < minimumAdvance) {
            throw new ValidationError(
              `The minimum advance for this service is ${currency} ${minimumAdvance}.`
            );
          }
        }
      }

      const alert = await createAlert({
        type: 'qr_submission',
        severity: 'warning',
        userName: clientName,
        userEmail: email,
        message: `QR payment submitted by ${email} (${currency} ${amount}) — awaiting approval.`,
        details: {
          clientName,
          name: clientName,
          email,
          amount,
          currency,
          transactionRef,
          transactionId: transactionRef,
          screenshotUrl,
          serviceName,
          notes,
          status: 'pending',
        },
        source: 'qr',
        notify: false,
      });
      emitPaymentReceived(req, { source: 'qr', submission: submissionView(alert) });

      const linkableScreenshot = screenshotUrl && /^https?:\/\//i.test(screenshotUrl);

      try {
        await sendSupportAlertEmail({
          subject: `QR payment proof — ${email}`,
          replyTo: email,
          bodyHtml: `<p><strong>${escapeHtml(clientName)}</strong> submitted a manual payment proof.</p>
            <ul>
              <li>Email: ${escapeHtml(email)}</li>
              <li>Amount: ${escapeHtml(currency)} ${amount}</li>
              <li>UTR / transaction: ${escapeHtml(transactionRef)}</li>
              ${serviceName ? `<li>Service: ${escapeHtml(serviceName)}</li>` : ''}
              ${linkableScreenshot ? `<li>Screenshot: <a href="${escapeHtml(screenshotUrl)}">view</a></li>` : screenshotUrl ? '<li>Screenshot: attached in the admin dashboard</li>' : ''}
            </ul>
            ${notes ? `<p style="white-space:pre-wrap;">${escapeHtml(notes)}</p>` : ''}
            <p style="margin-top:14px;">Approve in the dashboard Portal QR verifications.</p>`,
          bodyText: `${clientName} <${email}> submitted a QR payment proof of ${currency} ${amount} (${transactionRef}). Review it in the admin dashboard.`,
        });
      } catch (mailErr) {
        console.error('[qr] submission email failed:', mailErr?.message ?? mailErr);
      }

      return res.status(201).json({
        success: true,
        submissionId: alert.id,
        message: 'Payment proof submitted.',
      });
    } catch (err) {
      return sendError(res, err, 'Could not submit the payment proof.');
    }
  });

    router.get('/pending', ...adminGuard, async (_req, res) => {
    try {
      const alerts = await prisma.adminAlert.findMany({
        where: { type: 'qr_submission' },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const pending = alerts
        .map(submissionView)
        .filter(
          (item) =>
            item.status === 'pending' &&
            Number.isFinite(item.amount) &&
            item.amount > 0 &&
            typeof item.transactionRef === 'string' &&
            item.transactionRef.trim().length > 0
        );
      return res.json({ success: true, submissions: pending, count: pending.length });
    } catch (err) {
      return sendError(res, err, 'Could not load submissions.');
    }
  });

    router.get('/failed-emails', ...adminGuard, async (_req, res) => {
    try {
      const alerts = await prisma.adminAlert.findMany({
        where: { type: 'EMAIL_DELIVERY_FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const failedDispatches = alerts.map((a) => {
        const details = typeof a.details === 'object' && a.details !== null ? a.details : {};
        return {
          id: a.id,
          email: details.to || details.email || a.userEmail || 'unknown',
          // [H1] Credential DB me store nahi hota, isliye API se kabhi expose nahi hota.
          credentialReference: details.credentialReference ?? null,
          credentialType: details.credentialType ?? null,
          credentialStored: false,
          reason: details.reason || 'All email providers exhausted',
          createdAt: a.createdAt,
        };
      });

      return res.json({ success: true, alerts: failedDispatches });
    } catch (err) {
      return sendError(res, err, 'Could not load failed email dispatches.');
    }
  });

    router.delete('/failed-emails/:id', ...adminGuard, async (req, res) => {
    try {
      await prisma.adminAlert.delete({ where: { id: req.params.id } });
      return res.json({ success: true, message: 'Alert dismissed.' });
    } catch (err) {
      return sendError(res, err, 'Could not dismiss alert.');
    }
  });

    router.get('/submissions', ...adminGuard, async (_req, res) => {
    try {
      const alerts = await prisma.adminAlert.findMany({
        where: { type: 'qr_submission' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return res.json({ success: true, submissions: alerts.map(submissionView) });
    } catch (err) {
      return sendError(res, err, 'Could not load submissions.');
    }
  });

    router.post('/approve', ...approveGuard, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const qrPaymentId = validateRequiredString(body.qrPaymentId, 'qrPaymentId', 1, 64);
      const result = await approveSubmission(qrPaymentId, req.admin, req, body.totalAmount, disconnectClientSockets);
      return res.json({ success: true, ...result });
    } catch (err) {
      return sendError(res, err, 'Could not approve the submission.');
    }
  });

    router.post('/reject', ...adminGuard, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const qrPaymentId = validateRequiredString(body.qrPaymentId, 'qrPaymentId', 1, 64);
      const result = await rejectSubmission(qrPaymentId, body.reason, req.admin, req);
      return res.json({ success: true, ...result });
    } catch (err) {
      return sendError(res, err, 'Could not reject the submission.');
    }
  });

    router.post('/:id/approve', ...approveGuard, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const result = await approveSubmission(req.params.id, req.admin, req, body.totalAmount, disconnectClientSockets);
      return res.json({ success: true, ...result });
    } catch (err) {
      return sendError(res, err, 'Could not approve the submission.');
    }
  });

  router.post('/:id/reject', ...adminGuard, async (req, res) => {
    try {
      const result = await rejectSubmission(req.params.id, req.body?.reason, req.admin, req);
      return res.json({ success: true, ...result });
    } catch (err) {
      return sendError(res, err, 'Could not reject the submission.');
    }
  });

  return router;
};
