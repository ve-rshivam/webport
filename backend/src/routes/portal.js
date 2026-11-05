
import crypto from 'node:crypto';
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { escapeHtml } from '../lib/security.js';
import { sendError } from '../lib/http.js';
import {
  validateEmail,
  validatePassword,
  validateRequiredString,
  requireJsonBody,
  ValidationError,
} from '../services/validators.js';
import {
  createPortalAuth,
  generateOtp,
  generateTemporaryPassword,
  hashSecret,
  issueSession,
  verifySecret,
  OTP_TTL_MINUTES,
} from '../services/auth.service.js';
import { createAlert } from '../services/notifications.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';
import { generateInvoicePDF } from '../services/invoiceService.js';
import { emitMessageNew } from '../lib/realtime.js';
import {
  sendOtpEmail,
  sendCredentialsEmail,
  sendEmail,
  getSupportEmail,
  sendPortalMessageEmail,
  adminNotifyRecipients,
  portalUrl,
} from '../services/email.service.js';

// [H2] Password reset link: 15 minute validity, single use, sirf hash DB me jaata hai.
const RESET_TOKEN_TTL_MINUTES = 15;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function projectSummary(project) {
  return {
    id: project.id,
    projectTitle: project.projectTitle,
    serviceName: project.serviceName,
    status: project.status,
    progress: project.progress,
    paymentStatus: project.paymentStatus,
    currency: project.currency,
    totalCost: project.totalCost,
    amountPaid: project.amountPaid,
    balanceDue: project.balanceDue,
    deliveryDate: project.deliveryDate,
    previewUrl: project.previewUrl || '',
    projectType: project.projectType,
    estimatedDays: project.estimatedDays,
    features: project.features,
    invoiceNumber: project.invoiceNumber,
    transactionRef: project.transactionRef,
    notes: project.notes,
    lastUpdated: project.lastUpdated,
  };
}

export function createPortalRouter({ authLimiter, otpEmailLimiter, messageLimiter, invoiceDownloadLimiter, disconnectClientSockets = () => {}, syncClientProjectCredentials = async () => {} } = {}) {
  const router = express.Router();
  const portalAuth = createPortalAuth(prisma);
  const limit = authLimiter ?? ((_req, _res, next) => next());
  const otpLimit = otpEmailLimiter ?? ((_req, _res, next) => next());
  const messageLimit = messageLimiter ?? ((_req, _res, next) => next());
  const invoiceLimit = invoiceDownloadLimiter ?? ((_req, _res, next) => next());

    // [RATE LIMITER - AUTH LOGIN]
    router.post('/login', limit, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const email = validateEmail(body.email);
      const password = validateRequiredString(body.password, 'password', 1, 128);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

      let mustChangePassword = false;
      let authenticated = false;

      // CASE 1: Temporary password active
      if (user.mustChangePassword && user.tempPasswordHash) {
        if (!user.tempPasswordExpiry || user.tempPasswordExpiry.getTime() <= Date.now()) {
          return res.status(401).json({
            success: false,
            message: 'Temporary password expired. Request new portal access.',
          });
        }
        if (user.tempPasswordAttempts >= 5) {
          return res.status(429).json({
            success: false,
            message: 'Too many temporary-password attempts. Request a reset code.',
          });
        }
        if (await verifySecret(password, user.tempPasswordHash)) {
          authenticated = true;
          mustChangePassword = true;
        } else {
          await prisma.user.update({
            where: { id: user.id },
            data: { tempPasswordAttempts: { increment: 1 } },
          });
          // Strictly reject here so old passwordHash is NEVER checked when temp password is active
          return res.status(401).json({
            success: false,
            message: 'Invalid temporary password. Your previous password is no longer valid.',
          });
        }
      }
      // CASE 2: Normal permanent password login
      else if (user.passwordHash && (await verifySecret(password, user.passwordHash))) {
        authenticated = true;
        mustChangePassword = false;
      }

      if (!authenticated) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      const session = await issueSession(prisma, user, req);
      disconnectClientSockets(user.id);
      await recordAudit({
        action: AUDIT_ACTIONS.CLIENT_LOGIN_SUCCESS,
        actorId: user.id,
        actorRole: user.role,
        targetEmail: user.email,
        req,
      });
      const projects = await prisma.clientProject.findMany({
        where: { OR: [{ clientUserId: user.id }, { clientEmail: user.email }] },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({
        success: true,
        token: session.token,
        expiresAt: session.expiresAt,
        mustChangePassword,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        projects: projects.map(projectSummary),
      });
    } catch (err) {
      return sendError(res, err, 'Sign-in failed.');
    }
  });

    router.post('/set-password', portalAuth, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const password = validatePassword(body.password, 'password');

      const passwordHash = await hashSecret(password);
      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          passwordHash,
          passwordUpdatedAt: new Date(),
          mustChangePassword: false,
          tempPasswordHash: null,
          tempPasswordExpiry: null,
          tempPasswordAttempts: 0,
        },
      });
      await syncClientProjectCredentials({ email: updatedUser.email, passwordHash, isTemporaryKey: false });

      return res.json({ success: true, message: 'Permanent password saved.' });
    } catch (err) {
      return sendError(res, err, 'Could not update the password.');
    }
  });

    // [RATE LIMITER - OTP/EMAIL]: Forgot-password email spam aur Resend/Brevo quota bachane ke liye.
    router.post('/forgot-password', otpLimit, async (req, res) => {
    const standardMessage = 'If this email is registered, a secure reset link has been sent.';
    try {
      const body = requireJsonBody(req);
      const email = validateEmail(body.email);
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.json({ success: true, message: standardMessage });
      }

      // [H2] Password yahan overwrite NAHI hota. Sirf single-use token ka hash + expiry store hoti hai,
      // isliye attacker kisi ka bhi account lock nahi kar sakta.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = `sha256:${sha256Hex(rawToken)}`;
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetOtpHash: tokenHash,
          resetOtpExpiry: expiresAt,
          resetOtpAttempts: 0,
        },
      });

      const resetUrl = `${portalUrl('/portal')}?resetToken=${encodeURIComponent(rawToken)}`;
      let emailSent = false;
      try {
        const dispatchResult = await sendEmail({
          to: user.email,
          subject: 'Reset your client portal password',
          html: `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#17140f;max-width:560px;margin:auto">
            <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c93d1b">Shivam Web Studio · rshivam.dev</p>
            <h1 style="font-family:Georgia,serif;font-weight:400">Password reset</h1>
            <p>Hello ${escapeHtml(user.name || 'there')},</p>
            <p>We received a request to reset your client portal password. This link is valid for ${RESET_TOKEN_TTL_MINUTES} minutes and can be used once.</p>
            <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#17140f;color:#faf6ee;padding:12px 22px;text-decoration:none;border-radius:6px;font-weight:bold;">Set a new password</a></p>
            <p style="font-size:12px;color:#71695d">If you did not request this, ignore this email — your current password stays unchanged.</p>
          </div>`,
          text: `Hello ${user.name || 'there'},\n\nReset your client portal password (valid ${RESET_TOKEN_TTL_MINUTES} minutes, single use):\n${resetUrl}\n\nIf you did not request this, ignore this email — your current password stays unchanged.`,
          replyTo: getSupportEmail(),
        });
        emailSent = Boolean(dispatchResult?.success && !dispatchResult?.manualRequired);
      } catch (mailErr) {
        console.error('[portal] reset email failed:', mailErr?.message ?? mailErr);
      }

      await createAlert({
        type: 'client_reset',
        severity: emailSent ? 'info' : 'warning',
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        message: emailSent
          ? `Password reset link sent to ${user.email}.`
          : `Password reset link prepared for ${user.email}, but email delivery failed.`,
        source: 'portal',
        notify: false,
      }).catch(() => {});

      return res.json({ success: true, message: standardMessage });
    } catch {
      return res.json({ success: true, message: standardMessage });
    }
  });

    // [RATE LIMITER - OTP/EMAIL]: Reset token guessing/spam rokne ke liye.
    router.post('/reset-password-with-token', otpLimit, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const token = validateRequiredString(body.token, 'token', 32, 256);
      const password = validatePassword(body.password, 'password');
      const tokenHash = `sha256:${sha256Hex(token)}`;

      const user = await prisma.user.findFirst({ where: { resetOtpHash: tokenHash } });
      if (!user || !user.resetOtpExpiry || user.resetOtpExpiry.getTime() < Date.now()) {
        throw new ValidationError('This reset link is invalid or has expired. Request a new one.');
      }

      // Single-use: atomic claim, do parallel requests me se sirf ek jeetegi.
      const passwordHash = await hashSecret(password);
      const consumed = await prisma.user.updateMany({
        where: { id: user.id, resetOtpHash: tokenHash, resetOtpExpiry: { gt: new Date() } },
        data: {
          passwordHash,
          passwordUpdatedAt: new Date(),
          mustChangePassword: false,
          resetOtpHash: null,
          resetOtpExpiry: null,
          resetOtpAttempts: 0,
          tempPasswordHash: null,
          tempPasswordExpiry: null,
          tempPasswordAttempts: 0,
          sessionToken: null,
          sessionTokenExpiry: null,
          sessionFingerprint: null,
          sessionUserAgent: null,
          sessionIp: null,
        },
      });
      if (consumed.count === 0) {
        throw new ValidationError('This reset link has already been used. Request a new one.', 409);
      }
      await syncClientProjectCredentials({ email: user.email, passwordHash, isTemporaryKey: false });
      disconnectClientSockets(user.id);

      await recordAudit({
        action: AUDIT_ACTIONS.PASSWORD_RESET_ISSUED,
        actorId: user.id,
        actorRole: user.role,
        targetEmail: user.email,
        req,
        metadata: { channel: 'portal-token' },
      });

      return res.json({ success: true, message: 'Password updated. Sign in with your new password.' });
    } catch (err) {
      return sendError(res, err, 'Could not reset the password.');
    }
  });

    // [RATE LIMITER - OTP & EMAIL QUOTA]: OTP reset brute-force spam rokne ke liye.
    router.post('/reset-password', otpLimit, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const email = validateEmail(body.email);
      const otp = validateRequiredString(body.otp, 'otp', 6, 6);
      const password = validatePassword(body.newPassword, 'newPassword');

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.resetOtpHash || !user.resetOtpExpiry) {
        throw new ValidationError('This reset code is invalid or has expired.');
      }
      if (user.resetOtpExpiry.getTime() < Date.now()) {
        throw new ValidationError('This reset code has expired. Request a new one.');
      }
                  const claimed = await prisma.user.updateMany({
        where: {
          id: user.id,
          resetOtpHash: user.resetOtpHash,
          resetOtpExpiry: { gt: new Date() },
          resetOtpAttempts: { lt: 5 },
        },
        data: { resetOtpAttempts: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw new ValidationError('Too many incorrect codes. Request a new one.', 429);
      }
      if (!(await verifySecret(otp, user.resetOtpHash))) {
        throw new ValidationError('This reset code is invalid or has expired.');
      }

      const passwordHash = await hashSecret(password);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordUpdatedAt: new Date(),
          mustChangePassword: false,
          resetOtpHash: null,
          resetOtpExpiry: null,
          resetOtpAttempts: 0,
          tempPasswordHash: null,
          tempPasswordExpiry: null,
          tempPasswordAttempts: 0,
          sessionToken: null,
          sessionTokenExpiry: null,
          sessionFingerprint: null,
          sessionUserAgent: null,
          sessionIp: null,
          lastActiveAt: null,
        },
      });
      await syncClientProjectCredentials({ email: user.email, passwordHash, isTemporaryKey: false });
      disconnectClientSockets(user.id);

      const fresh = await prisma.user.findUnique({ where: { id: user.id } });
      const session = await issueSession(prisma, fresh, req);
      await recordAudit({
        action: AUDIT_ACTIONS.PASSWORD_RESET_ISSUED,
        actorId: user.id,
        actorRole: user.role,
        targetEmail: user.email,
        req,
        metadata: { channel: 'portal-otp' },
      });

      return res.json({ success: true, token: session.token, message: 'Password updated.' });
    } catch (err) {
      return sendError(res, err, 'Could not reset the password.');
    }
  });

    router.get('/me', portalAuth, async (req, res) => {
    try {
      const projects = await prisma.clientProject.findMany({
        where: { OR: [{ clientUserId: req.user.id }, { clientEmail: req.user.email }] },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({
        success: true,
        mustChangePassword: Boolean(req.user.mustChangePassword || !req.user.passwordHash),
        user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role },
        projects: projects.map(projectSummary),
      });
    } catch (err) {
      return sendError(res, err, 'Could not load your portal.');
    }
  });

      // [RATE LIMITER - PDF INVOICE]: Bar-bar PDF generation se CPU high hone se rokne ke liye.
      router.get('/projects/:id/invoice', portalAuth, invoiceLimit, async (req, res) => {
    try {
      const project = await prisma.clientProject.findFirst({
        where: {
          id: req.params.id,
          OR: [{ clientUserId: req.user.id }, { clientEmail: req.user.email }],
        },
      });
      if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
      if (!project.invoiceNumber) {
        return res.status(404).json({ success: false, message: 'No invoice has been issued for this project yet.' });
      }

      const pdf = await generateInvoicePDF({
        invoiceNumber: project.invoiceNumber,
        invoiceDate: project.invoiceIssuedAt ?? project.updatedAt,
        status: project.status,
        clientName: project.clientName ?? req.user.name,
        clientEmail: project.clientEmail,
        transactionRef: project.transactionRef,
        projectTitle: project.projectTitle,
        projectType: project.projectType,
        estimatedDays: project.estimatedDays,
        deliveryDate: project.deliveryDate,
        features: project.features,
        totalCost: project.totalCost,
        amountPaid: project.amountPaid,
        currency: project.currency,
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Invoice-${project.invoiceNumber}.pdf"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
      });
      return res.status(200).send(pdf);
    } catch (err) {
      return sendError(res, err, 'Could not generate the invoice PDF.');
    }
  });

    router.get('/messages', portalAuth, async (req, res) => {
    try {
      const projects = await prisma.clientProject.findMany({
        where: { OR: [{ clientUserId: req.user.id }, { clientEmail: req.user.email }] },
        select: { id: true },
      });
      const projectIds = projects.map((p) => p.id);
      const requested = typeof req.query.projectId === 'string' ? req.query.projectId : null;
      if (requested && !projectIds.includes(requested)) {
        return res.status(403).json({ success: false, message: 'You do not have access to that project.' });
      }

      const messages = await prisma.message.findMany({
        where: {
          projectId: requested ? requested : { in: projectIds },
          isArchived: false,
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: {
          id: true, projectId: true, senderType: true, senderName: true,
          subject: true, body: true, kind: true, isRead: true, createdAt: true,
        },
      });

      return res.json({ success: true, messages });
    } catch (err) {
      return sendError(res, err, 'Could not load messages.');
    }
  });

    // [RATE LIMITER - CONTACT & PORTAL CHAT]: Portal project chat me message flooding rokne ke liye.
    router.post('/messages', portalAuth, messageLimit, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const projectId = validateRequiredString(body.projectId, 'projectId', 1, 64);
      const messageBody = validateRequiredString(body.body, 'body', 1, 5000);
      const subject = body.subject ? validateRequiredString(body.subject, 'subject', 1, 200) : undefined;

      const project = await prisma.clientProject.findFirst({
        where: {
          id: projectId,
          OR: [{ clientUserId: req.user.id }, { clientEmail: req.user.email }],
        },
      });
      if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

      const message = await prisma.message.create({
        data: {
          projectId: project.id,
          senderType: 'client',
          senderName: req.user.name ?? project.clientName ?? null,
          senderEmail: req.user.email,
          senderId: req.user.id,
          subject: subject ?? null,
          body: messageBody,
          kind: 'portal_reply',
        },
      });
      emitMessageNew(req, { source: 'portal', message }, { clientUserId: req.user.id });

      try {
        await sendPortalMessageEmail({
          to: adminNotifyRecipients(),
          recipientName: 'Shivam',
          senderLabel: req.user.name ? `${req.user.name} (${req.user.email})` : req.user.email,
          projectTitle: project.projectTitle,
          subject: `Portal message — ${project.projectTitle ?? 'project'}`,
          body: messageBody,
        });
      } catch (mailErr) {
        console.error('[portal] message notification failed:', mailErr?.message ?? mailErr);
      }

      await createAlert({
        type: 'portal_message',
        severity: 'info',
        userId: req.user.id,
        userEmail: req.user.email,
        userName: req.user.name,
        message: `Portal message from ${req.user.email} on ${project.projectTitle ?? project.id}.`,
        source: 'portal',
        notify: false,
      }).catch(() => {});

      return res.status(201).json({ success: true, message: { id: message.id, createdAt: message.createdAt } });
    } catch (err) {
      return sendError(res, err, 'Could not send the message.');
    }
  });

    router.post('/logout', portalAuth, async (req, res) => {
    try {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { sessionToken: null, sessionTokenExpiry: null },
      });
      disconnectClientSockets(req.user.id);
      return res.json({ success: true });
    } catch (err) {
      return sendError(res, err, 'Could not sign out.');
    }
  });

      router.post('/logout-all', portalAuth, async (req, res) => {
    try {
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          sessionToken: null,
          sessionTokenExpiry: null,
          sessionFingerprint: null,
          sessionUserAgent: null,
          sessionIp: null,
          lastActiveAt: null,
        },
      });
      disconnectClientSockets(req.user.id);
      await recordAudit({
        action: AUDIT_ACTIONS.CLIENT_LOGOUT_ALL,
        actorId: req.user.id,
        actorRole: req.user.role,
        targetEmail: req.user.email,
        req,
      });
      return res.json({ success: true, message: 'Signed out of every device.' });
    } catch (err) {
      return sendError(res, err, 'Could not sign out all sessions.');
    }
  });

  return router;
}
