
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
import {
  generateOtp,
  generateTemporaryPassword,
  hashSecret,
  OTP_TTL_MINUTES,
  TEMP_PASSWORD_TTL_MINUTES,
} from '../services/auth.service.js';
import { issueTemporaryCredentials, provisionFromPayment } from '../services/provisioning.js';
import { createAlert } from '../services/notifications.js';
import { sendEmail, sendOtpEmail, sendPortalMessageEmail, portalUrl } from '../services/email.service.js';
import { generateInvoicePDF } from '../services/invoiceService.js';
import { emitMessageNew, emitProjectMutation } from '../lib/realtime.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';

const TEAM_ROLES = new Set(['team', 'support']);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeInvoiceNumber() {
  return `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function paymentStatusFor(totalCost, amountPaid) {
  if (amountPaid >= totalCost) return 'Fully Paid';
  const percent = Math.round((amountPaid / totalCost) * 100);
  return percent > 0 ? `Advance Paid (${percent}%)` : 'Pending';
}

function requirePermission(req, permission) {
  if (req.admin.role === 'superadmin' || req.admin.permissions?.includes(permission)) return;
  throw new ValidationError(`This operation requires the ${permission} permission.`, 403);
}

export function createInvoiceAdminRouter({
  verifyAdminToken,
  checkPerm,
  disconnectClientSockets = () => {},
  syncClientProjectCredentials = async () => {},
}) {
  const router = express.Router();
  const requireProjectAndPaymentPermissions = (req, res, next) => {
    if (req.admin.role === 'superadmin') return next();
    const permissions = new Set(req.admin.permissions ?? []);
    if (permissions.has('projects') && permissions.has('payments')) return next();
    return res.status(403).json({
      success: false,
      message: 'Access Denied. Invoice approval requires both projects and payments permissions.',
    });
  };

  router.post('/:id/approve-and-invoice', verifyAdminToken, requireProjectAndPaymentPermissions, async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const safeDisconnect = typeof disconnectClientSockets === 'function' ? disconnectClientSockets : () => {};
      const safeSync = typeof syncClientProjectCredentials === 'function' ? syncClientProjectCredentials : async () => {};

      let qrAlert = await prisma.adminAlert.findFirst({
        where: { id: req.params.id, type: 'qr_submission' },
      });
      let qrDetails = qrAlert?.details && typeof qrAlert.details === 'object' ? qrAlert.details : {};

      const isRemainingQr = Boolean(
        qrAlert && (
          qrDetails.isRemainingPayment ||
          qrDetails.projectId ||
          body.isRemainingPayment ||
          /remaining balance/i.test(String(qrDetails.notes ?? ''))
        )
      );

      let project = null;
      let provisioningResult = null;
      let transactionRef = typeof body.transactionRef === 'string' ? body.transactionRef.trim().slice(0, 160) : '';

      if (qrAlert) {
        requirePermission(req, 'client_access');
        if (qrDetails.status === 'approved') throw new ValidationError('This payment proof was already approved.', 409);
        if (qrDetails.status === 'rejected') throw new ValidationError('This payment proof was rejected.', 409);

        const proofAmount = Number(qrDetails.amount ?? 0);
        const amountPaid = validateNonNegativeNumber(body.amountPaid ?? proofAmount, 'amountPaid');
        const totalCost = isRemainingQr
          ? 0 // remaining ke case me existing valuation retain hoti hai
          : validateNonNegativeNumber(body.totalCost, 'totalCost');

        if (!isRemainingQr && totalCost <= 0) {
          throw new ValidationError('totalCost must be greater than zero for new projects.');
        }

        const fallbackTx = String(qrDetails.transactionRef || qrDetails.transactionId || qrAlert.id || Date.now());
        transactionRef ||= fallbackTx.slice(0, 160);
        const email = validateEmail(qrDetails.email ?? qrAlert.userEmail, 'client email');

        provisioningResult = await provisionFromPayment({
          gateway: 'qr',
          transactionId: transactionRef,
          amount: proofAmount,
          projectAmount: proofAmount,
          totalAmount: isRemainingQr ? 0 : totalCost,
          currency: qrDetails.currency ?? 'INR',
          email,
          name: qrDetails.clientName ?? qrDetails.name ?? qrAlert.userName,
          serviceName: qrDetails.serviceName ?? body.projectType ?? 'Project Service',
          projectId: qrDetails.projectId ?? body.projectId ?? null,
          isRemainingPayment: isRemainingQr,
          details: { gateway: 'qr', submissionId: qrAlert.id, isRemainingPayment: isRemainingQr },
        }, {
          disconnectClientSockets: safeDisconnect,
          syncClientProjectCredentials: safeSync,
        });

        project = provisioningResult.project;
        if (!project && provisioningResult.payment?.projectId) {
          project = await prisma.clientProject.findUnique({ where: { id: provisioningResult.payment.projectId } });
        }
        if (!project) {
          project = await prisma.clientProject.findFirst({
            where: { clientEmail: { equals: email, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' },
          });
        }
        if (!project) throw new ValidationError('The payment proof could not be linked to a project.', 409);
      } else {
        project = await prisma.clientProject.findUnique({ where: { id: req.params.id } });
        if (!project) throw new ValidationError('Project or pending payment proof not found.', 404);
        transactionRef ||= project.transactionRef ?? '';
      }

      // Remaining Payment handling (Sirf progress/notes/invoice update karega, parameters overwrite nahi karega)
      let updatedProject;
      let invoiceNumber = project.invoiceNumber || makeInvoiceNumber();
      const invoiceIssuedAt = new Date();

      if (isRemainingQr) {
        updatedProject = await prisma.clientProject.update({
          where: { id: project.id },
          data: {
            transactionRef: transactionRef || project.transactionRef,
            invoiceNumber,
            invoiceIssuedAt,
            lastUpdated: new Date(),
          },
        });
      } else {
        const projectType = validateRequiredString(body.projectType, 'projectType', 1, 120);
        const estimatedDays = Number(body.estimatedDays);
        if (!Number.isInteger(estimatedDays) || estimatedDays < 1 || estimatedDays > 730) {
          throw new ValidationError('estimatedDays must be a whole number between 1 and 730.');
        }
        const features = Array.isArray(body.features)
          ? [...new Set(body.features.map((f) => validateRequiredString(f, 'feature', 1, 160)))]
          : [];
        const totalCost = validateNonNegativeNumber(body.totalCost, 'totalCost');
        const amountPaid = validateNonNegativeNumber(body.amountPaid, 'amountPaid');

        const deliveryDate = new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);
        const deliveryDateText = `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth() + 1).padStart(2, '0')}-${String(deliveryDate.getDate()).padStart(2, '0')}`;

        updatedProject = await prisma.clientProject.update({
          where: { id: project.id },
          data: {
            projectType,
            estimatedDays,
            features,
            deliveryDate: deliveryDateText,
            status: 'Approved & In Progress',
            totalCost,
            amountPaid,
            balanceDue: Math.max(totalCost - amountPaid, 0),
            paymentStatus: paymentStatusFor(totalCost, amountPaid),
            transactionRef: transactionRef || null,
            invoiceNumber,
            invoiceIssuedAt,
            lastUpdated: new Date(),
          },
        });
      }

      emitProjectMutation(req, 'updated', updatedProject, { source: 'portal' });

      // Invoice PDF Generation
      const invoiceData = {
        invoiceNumber,
        invoiceDate: invoiceIssuedAt,
        status: updatedProject.status,
        clientName: updatedProject.clientName ?? qrDetails.clientName ?? qrDetails.name,
        clientEmail: updatedProject.clientEmail,
        transactionRef,
        projectTitle: updatedProject.projectTitle,
        projectType: updatedProject.projectType || 'Custom Project',
        estimatedDays: updatedProject.estimatedDays || 14,
        deliveryDate: updatedProject.deliveryDate || new Date(),
        features: updatedProject.features || [],
        totalCost: updatedProject.totalCost,
        amountPaid: updatedProject.amountPaid,
        currency: updatedProject.currency || 'INR',
      };

      let pdfBuffer = null;
      try {
        pdfBuffer = await generateInvoicePDF(invoiceData);
      } catch (pdfErr) {
        console.warn('Invoice PDF generation skipped/failed:', pdfErr?.message);
      }

      const portalLink = portalUrl('/portal');
      const emailSubject = isRemainingQr
        ? `Payment Verified & Balance Cleared: ${updatedProject.projectTitle}`
        : `Project Approved & Invoice / SOW: ${updatedProject.projectTitle}`;

      const deliveryResult = await sendEmail({
        to: updatedProject.clientEmail,
        subject: emailSubject,
        html: `<p>Hello ${escapeHtml(updatedProject.clientName || 'there')},</p>
               <p>Your payment for <strong>${escapeHtml(updatedProject.projectTitle)}</strong> has been verified.</p>
               <p>Total Valuation: ₹${updatedProject.totalCost}<br>Paid to date: ₹${updatedProject.amountPaid}<br>Remaining Due: ₹${updatedProject.balanceDue}</p>
               <p>Access your portal: <a href="${escapeHtml(portalLink)}">${escapeHtml(portalLink)}</a></p>`,
        text: `Hello ${updatedProject.clientName || 'there'},\n\nPayment verified for ${updatedProject.projectTitle}.\nTotal: ₹${updatedProject.totalCost}\nPaid: ₹${updatedProject.amountPaid}\nRemaining: ₹${updatedProject.balanceDue}\nPortal: ${portalLink}`,
        attachments: pdfBuffer ? [{ filename: `Invoice-${invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] : [],
        plainPasscode: provisioningResult?.manualRequired ? provisioningResult.manualPasscode : null,
      });

      const invoiceEmailSent = Boolean(deliveryResult?.success && !deliveryResult?.manualRequired);
      const credentialsManualRequired = Boolean(provisioningResult?.manualRequired);

      if (qrAlert) {
        await prisma.adminAlert.update({
          where: { id: qrAlert.id },
          data: {
            details: {
              ...qrDetails,
              status: 'approved',
              approvedAt: new Date().toISOString(),
              approvedBy: req.admin?.id ?? null,
              emailSent: invoiceEmailSent,
              manualRequired: credentialsManualRequired || Boolean(deliveryResult?.manualRequired),
              invoiceNumber,
              projectId: updatedProject.id,
            },
          },
        });
      }

      return res.json({
        success: true,
        message: invoiceEmailSent ? 'Approval completed and emailed.' : 'Approval completed; manual email dispatch required.',
        emailSent: invoiceEmailSent,
        credentialsManualRequired,
        manualRequired: credentialsManualRequired || Boolean(deliveryResult?.manualRequired),
        invoiceNumber,
      });
    } catch (err) {
      return sendError(res, err, 'Could not approve the project and issue its invoice.');
    }
  });

  return router;
}

function normalizeFeatures(value, fallback) {
  if (value === undefined) return fallback;
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|,/)
      : null;
  if (!items || items.length > 60) throw new ValidationError('features must be a list with no more than 60 items.');
  return [...new Set(items.map((feature) => validateRequiredString(feature, 'feature', 1, 160)))];
}

function projectPaymentStatus(totalCost, amountPaid) {
  if (totalCost > 0 && amountPaid >= totalCost) return 'FULLY_PAID';
  if (amountPaid > 0) return 'PARTIALLY_PAID';
  return 'PENDING';
}

function optionalText(value, field, maxLength) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  return validateRequiredString(value, field, 1, maxLength);
}

export function createManualClientProjectRouter({ verifyAdminToken, checkPerm, getLegacyProjectModel }) {
  const router = express.Router();
  router.use(verifyAdminToken);

  router.post('/', checkPerm(['projects']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const clientEmail = validateEmail(body.clientEmail, 'clientEmail');
      const clientName = validateRequiredString(body.clientName, 'clientName', 1, 120);
      const projectTitle = validateRequiredString(body.projectTitle, 'projectTitle', 1, 200);
      const totalCost = body.totalCost === undefined ? 0 : validateNonNegativeNumber(body.totalCost, 'totalCost');
      const amountPaid = body.amountPaid === undefined ? 0 : validateNonNegativeNumber(body.amountPaid, 'amountPaid');
      if (amountPaid > totalCost) throw new ValidationError('Amount paid cannot exceed total valuation.');
      const progress = body.progress === undefined ? 10 : Number(body.progress);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        throw new ValidationError('progress must be a whole number from 0 to 100.');
      }
      const features = normalizeFeatures(body.features, []);
      const projectType = optionalText(body.projectType, 'projectType', 120) ?? null;
      const estimatedDays = body.estimatedDays === undefined || body.estimatedDays === null || body.estimatedDays === ''
        ? null
        : Number(body.estimatedDays);
      if (estimatedDays !== null && (!Number.isInteger(estimatedDays) || estimatedDays < 1 || estimatedDays > 730)) {
        throw new ValidationError('estimatedDays must be a whole number between 1 and 730.');
      }
      const currency = validateRequiredString(body.currency ?? 'INR', 'currency', 3, 8).toUpperCase();
      const temporaryPassword = generateTemporaryPassword(10);
      let createdAccount = false;

      // [INVOICE] Manual project creation par hi INV-YYYY-XXXX reserve karte hain,
      
      let invoiceNumber = makeInvoiceNumber();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const clash = await prisma.clientProject.findUnique({ where: { invoiceNumber } }).catch(() => null);
        if (!clash) break;
        invoiceNumber = makeInvoiceNumber();
      }
      const invoiceIssuedAt = new Date();

      const result = await prisma.$transaction(async (tx) => {
        let user = await tx.user.findUnique({ where: { email: clientEmail } });
        if (user && user.role !== 'client') {
          throw new ValidationError('That email already belongs to a non-client account.', 409);
        }
        if (!user) {
          user = await tx.user.create({
            data: {
              email: clientEmail,
              name: clientName,
              role: 'client',
              mustChangePassword: true,
              tempPasswordHash: await hashSecret(temporaryPassword),
              tempPasswordExpiry: new Date(Date.now() + TEMP_PASSWORD_TTL_MINUTES * 60 * 1000),
              tempPasswordAttempts: 0,
            },
          });
          createdAccount = true;
        } else if (user.name !== clientName) {
          user = await tx.user.update({ where: { id: user.id }, data: { name: clientName } });
        }

        const paymentStatus = projectPaymentStatus(totalCost, amountPaid);
        const project = await tx.clientProject.create({
          data: {
            clientUserId: user.id,
            clientEmail,
            clientName,
            projectTitle,
            serviceName: optionalText(body.serviceName, 'serviceName', 200) ?? projectTitle,
            projectType,
            estimatedDays,
            features,
            currency,
            totalCost,
            amountPaid,
            balanceDue: Math.max(totalCost - amountPaid, 0),
            paymentStatus,
            status: optionalText(body.status, 'status', 120) ?? 'Started',
            progress,
            deliveryDate: optionalText(body.deliveryDate, 'deliveryDate', 40),
            previewUrl: optionalText(body.previewUrl, 'previewUrl', 500),
            notes: optionalText(body.notes, 'notes', 5000),
            invoiceNumber,
            invoiceIssuedAt,
            isPaymentVerified: amountPaid > 0,
            lastUpdated: new Date(),
          },
        });
        return { user, project };
      });

      emitProjectMutation(req, 'created', result.project, {
        source: 'portal',
        user: result.user,
      });
      await recordAudit({
        action: AUDIT_ACTIONS.PROJECT_CREATED_OR_MODIFIED,
        actorId: req.admin?.id,
        actorRole: req.admin?.role,
        targetEmail: clientEmail,
        req,
        metadata: { projectId: result.project.id, action: 'created', source: 'portal' },
      });

      const loginUrl = 'https://rshivam.dev/portal';
      const deliverables = features.length
        ? features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')
        : '<li>Project scope will be confirmed with your developer.</li>';
      const passwordBlock = createdAccount
        ? `<p><strong>Temporary password:</strong> ${escapeHtml(temporaryPassword)}</p><p>Please change this password after your first sign-in.</p>`
        : '<p>Use your existing portal password. If you need access help, use the password reset option on the portal.</p>';
      const textPassword = createdAccount
        ? `Temporary password: ${temporaryPassword}\nPlease change this password after your first sign-in.`
        : 'Use your existing portal password. If you need access help, use the password reset option on the portal.';
      // [INVOICE PDF] Memory buffer
      let invoicePdf = null;
      try {
        const rawDelivery = result.project.deliveryDate ? new Date(result.project.deliveryDate) : null;
        invoicePdf = await generateInvoicePDF({
          invoiceNumber,
          invoiceDate: invoiceIssuedAt,
          status: result.project.status,
          clientName,
          clientEmail,
          transactionRef: result.project.transactionRef ?? null,
          projectTitle,
          projectType,
          estimatedDays,
          deliveryDate: rawDelivery && !Number.isNaN(rawDelivery.getTime()) ? rawDelivery : null,
          features,
          totalCost,
          amountPaid,
          currency,
        });
      } catch (invoiceError) {
        console.error('[admin] invoice PDF generation failed:', invoiceError?.message ?? invoiceError);
      }

      let delivery = { success: false, manualRequired: true };
      try {
        delivery = await sendEmail({
          to: clientEmail,
          subject: `Your project portal is ready: ${projectTitle}`,
          html: `<p>Hello ${escapeHtml(clientName)},</p><p>Your project <strong>${escapeHtml(projectTitle)}</strong> is now available in the client portal.</p><p><strong>Portal:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a><br><strong>Registered email:</strong> ${escapeHtml(clientEmail)}</p>${passwordBlock}<p><strong>Total valuation:</strong> ${escapeHtml(currency)} ${totalCost.toLocaleString('en-IN')}<br><strong>Advance paid:</strong> ${escapeHtml(currency)} ${amountPaid.toLocaleString('en-IN')}</p><p><strong>Deliverables:</strong></p><ul>${deliverables}</ul>`,
          text: `Hello ${clientName},\n\nYour project ${projectTitle} is now available in the client portal.\nPortal: ${loginUrl}\nRegistered email: ${clientEmail}\n${textPassword}\n\nTotal valuation: ${currency} ${totalCost.toLocaleString('en-IN')}\nAdvance paid: ${currency} ${amountPaid.toLocaleString('en-IN')}\nDeliverables: ${features.join(', ') || 'Project scope will be confirmed with your developer.'}`,
          plainPasscode: createdAccount ? temporaryPassword : null,
          attachments: invoicePdf
            ? [{ filename: `Invoice-${invoiceNumber}.pdf`, content: invoicePdf, contentType: 'application/pdf' }]
            : [],
        });
      } catch (mailError) {
        console.error('[admin] onboarding email failed:', mailError?.message ?? mailError);
      }
      const emailSent = Boolean(delivery?.success && !delivery?.manualRequired);
      const manualRequired = Boolean(delivery?.manualRequired || !emailSent);

      await createAlert({
        type: 'user_created',
        severity: manualRequired ? 'warning' : 'info',
        userId: result.user.id,
        userEmail: clientEmail,
        userName: clientName,
        message: `Project "${projectTitle}" manually created for ${clientEmail}${manualRequired ? ' (onboarding email needs manual follow-up)' : ''}.`,
        details: { projectId: result.project.id, emailSent, manualRequired },
        source: 'admin',
        notify: false,
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        source: 'portal',
        project: result.project,
        user: { id: result.user.id, email: result.user.email, name: result.user.name },
        credentialsEmailed: emailSent,
        invoiceNumber,
        invoiceIssuedAt,
        invoiceAttached: Boolean(invoicePdf),
        manualRequired,
        ...(manualRequired && createdAccount ? { manualPasscode: temporaryPassword } : {}),
        mustChangePassword: createdAccount,
      });
    } catch (err) {
      return sendError(res, err, 'Could not create the client project.');
    }
  });

  router.put('/:id', checkPerm(['projects']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const id = validateRequiredString(req.params.id, 'project id', 1, 80);
      const clientEmail = body.clientEmail === undefined ? undefined : validateEmail(body.clientEmail, 'clientEmail');
      const progress = body.progress === undefined ? undefined : Number(body.progress);
      if (progress !== undefined && (!Number.isInteger(progress) || progress < 0 || progress > 100)) {
        throw new ValidationError('progress must be a whole number from 0 to 100.');
      }
      const features = normalizeFeatures(body.features);
      const totalCost = body.totalCost === undefined ? undefined : validateNonNegativeNumber(body.totalCost, 'totalCost');
      const amountPaid = body.amountPaid === undefined ? undefined : validateNonNegativeNumber(body.amountPaid, 'amountPaid');
      const estimatedDays = body.estimatedDays === undefined
        ? undefined
        : body.estimatedDays === '' || body.estimatedDays === null
          ? null
          : Number(body.estimatedDays);
      if (estimatedDays !== undefined && estimatedDays !== null && (!Number.isInteger(estimatedDays) || estimatedDays < 1 || estimatedDays > 730)) {
        throw new ValidationError('estimatedDays must be a whole number between 1 and 730.');
      }

      const LegacyProject = getLegacyProjectModel?.();
      let legacy = null;
      if (LegacyProject) {
        try {
          legacy = await LegacyProject.findById(id);
        } catch {
                  }
      }

      if (legacy) {
        const nextTotal = totalCost ?? legacy.totalCost ?? 0;
        const nextPaid = amountPaid ?? legacy.amountPaid ?? 0;
        if (nextPaid > nextTotal) throw new ValidationError('Amount paid cannot exceed total valuation.');
        if (clientEmail && clientEmail !== legacy.clientEmail) {
          throw new ValidationError('Client email cannot be changed for an existing tracker record.');
        }
        if (body.clientName !== undefined) legacy.clientName = validateRequiredString(body.clientName, 'clientName', 1, 120);
        if (body.projectTitle !== undefined) legacy.projectTitle = validateRequiredString(body.projectTitle, 'projectTitle', 1, 200);
        if (totalCost !== undefined) legacy.totalCost = nextTotal;
        if (amountPaid !== undefined) legacy.amountPaid = nextPaid;
        if (totalCost !== undefined || amountPaid !== undefined) {
          legacy.balanceDue = Math.max(nextTotal - nextPaid, 0);
          legacy.paymentStatus = projectPaymentStatus(nextTotal, nextPaid);
        }
        if (progress !== undefined) legacy.progress = progress;
        if (body.status !== undefined) legacy.status = validateRequiredString(body.status, 'status', 1, 120);
        if (body.paymentStatus !== undefined && totalCost === undefined && amountPaid === undefined) {
          legacy.paymentStatus = validateRequiredString(body.paymentStatus, 'paymentStatus', 1, 120);
        }
        if (body.deliveryDate !== undefined) legacy.deliveryDate = optionalText(body.deliveryDate, 'deliveryDate', 40) ?? '';
        if (body.previewUrl !== undefined) legacy.previewUrl = optionalText(body.previewUrl, 'previewUrl', 500) ?? '';
        if (body.notes !== undefined) legacy.notes = optionalText(body.notes, 'notes', 5000) ?? '';
        if (features !== undefined) legacy.features = features;
        if (body.projectType !== undefined) legacy.projectType = optionalText(body.projectType, 'projectType', 120) ?? '';
        if (estimatedDays !== undefined) legacy.estimatedDays = estimatedDays;
        legacy.lastUpdated = new Date();
        await legacy.save();
        emitProjectMutation(req, 'updated', legacy, { source: 'legacy' });
        await recordAudit({
          action: AUDIT_ACTIONS.PROJECT_CREATED_OR_MODIFIED,
          actorId: req.admin?.id,
          actorRole: req.admin?.role,
          targetEmail: legacy.clientEmail ?? null,
          req,
          metadata: { projectId: String(legacy._id), action: 'updated', source: 'legacy' },
        });
        return res.json({ success: true, source: 'legacy', project: legacy });
      }

      const existing = await prisma.clientProject.findUnique({ where: { id } });
      if (!existing) throw new ValidationError('Project not found.', 404);
      if (clientEmail && clientEmail !== existing.clientEmail) {
        throw new ValidationError('Client email cannot be changed for an existing portal account.');
      }
      const nextTotal = totalCost ?? existing.totalCost;
      const nextPaid = amountPaid ?? existing.amountPaid;
      if (nextPaid > nextTotal) throw new ValidationError('Amount paid cannot exceed total valuation.');
      const nextEstimatedDays = estimatedDays === undefined ? existing.estimatedDays : estimatedDays;

      const project = await prisma.clientProject.update({
        where: { id },
        data: {
          ...(body.clientName !== undefined ? { clientName: validateRequiredString(body.clientName, 'clientName', 1, 120) } : {}),
          ...(body.projectTitle !== undefined ? { projectTitle: validateRequiredString(body.projectTitle, 'projectTitle', 1, 200) } : {}),
          ...(body.projectType !== undefined ? { projectType: optionalText(body.projectType, 'projectType', 120) } : {}),
          ...(body.serviceName !== undefined ? { serviceName: optionalText(body.serviceName, 'serviceName', 200) } : {}),
          ...(body.status !== undefined ? { status: validateRequiredString(body.status, 'status', 1, 120) } : {}),
          ...(body.deliveryDate !== undefined ? { deliveryDate: optionalText(body.deliveryDate, 'deliveryDate', 40) } : {}),
          ...(body.previewUrl !== undefined ? { previewUrl: optionalText(body.previewUrl, 'previewUrl', 500) } : {}),
          ...(body.notes !== undefined ? { notes: optionalText(body.notes, 'notes', 5000) } : {}),
          ...(body.transactionRef !== undefined ? { transactionRef: optionalText(body.transactionRef, 'transactionRef', 160) } : {}),
          ...(features !== undefined ? { features } : {}),
          ...(estimatedDays !== undefined ? { estimatedDays: nextEstimatedDays } : {}),
          ...(progress !== undefined ? { progress } : {}),
          ...(totalCost !== undefined ? { totalCost: nextTotal } : {}),
          ...(amountPaid !== undefined ? { amountPaid: nextPaid } : {}),
          ...(totalCost !== undefined || amountPaid !== undefined
            ? {
                balanceDue: Math.max(nextTotal - nextPaid, 0),
                paymentStatus: projectPaymentStatus(nextTotal, nextPaid),
              }
            : body.paymentStatus !== undefined
              ? { paymentStatus: validateRequiredString(body.paymentStatus, 'paymentStatus', 1, 120) }
              : {}),
          lastUpdated: new Date(),
        },
      });
      if (body.clientName !== undefined && project.clientUserId) {
        await prisma.user.update({ where: { id: project.clientUserId }, data: { name: project.clientName } });
      }
      emitProjectMutation(req, 'updated', project, { source: 'portal' });
      await recordAudit({
        action: AUDIT_ACTIONS.PROJECT_CREATED_OR_MODIFIED,
        actorId: req.admin?.id,
        actorRole: req.admin?.role,
        targetEmail: project.clientEmail ?? null,
        req,
        metadata: { projectId: project.id, action: 'updated', source: 'portal' },
      });
      return res.json({ success: true, source: 'portal', project });
    } catch (err) {
      return sendError(res, err, 'Could not update the client project.');
    }
  });

  return router;
}

function resetMetaForRole(role) {
  if (role === 'superadmin') return { purpose: 'superadmin_reset', alertType: 'superadmin_reset', scope: 'superadmin' };
  if (TEAM_ROLES.has(role)) return { purpose: 'team_reset', alertType: 'team_reset', scope: 'team' };
  return { purpose: 'client_reset', alertType: 'client_reset', scope: 'client' };
}

async function sendRoleReset(userId, expectedScope, admin, req = null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ValidationError('User not found.', 404);

  const actualScope = resetMetaForRole(user.role).scope;
  if (expectedScope !== actualScope) {
    throw new ValidationError(`This account is a ${actualScope} account, not a ${expectedScope} account.`);
  }
  if (actualScope === 'superadmin' && admin?.role !== 'superadmin') {
    throw new ValidationError('Only a superadmin can reset a superadmin account.', 403);
  }

  const { purpose, alertType } = resetMetaForRole(user.role);
  const otp = generateOtp();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetOtpHash: await hashSecret(otp),
      resetOtpExpiry: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      resetOtpAttempts: 0,
    },
  });

  const dispatchResult = await sendOtpEmail({
    to: user.email,
    recipientName: user.name ?? 'there',
    otp,
    purpose,
    expiresInMinutes: OTP_TTL_MINUTES,
    loginUrl: `${portalUrl('/portal')}?email=${encodeURIComponent(user.email)}`,
    extraBody: `Requested by ${admin?.id ?? 'an administrator'}.`,
  });

  const emailSent = Boolean(dispatchResult?.success && !dispatchResult?.manualRequired);
  const manualRequired = Boolean(dispatchResult?.manualRequired);

  await createAlert({
    type: alertType,
    severity: 'warning',
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    message: `${purpose.replace(/_/g, ' ')} OTP ${emailSent ? 'sent to' : 'prepared for'} ${user.email} by ${admin?.id ?? 'an admin'}.${manualRequired ? ' (Email quota reached, manual dispatch required)' : ''}`,
    source: 'admin',
    emailSubject: `${purpose.replace(/_/g, ' ')} — ${user.email}`,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_RESET_ISSUED,
    actorId: admin?.id ?? null,
    actorRole: admin?.role ?? 'admin',
    targetEmail: user.email,
    req,
    metadata: { scope: actualScope, purpose, emailSent, manualRequired },
  });
  if (manualRequired) {
    await recordAudit({
      action: AUDIT_ACTIONS.EMAIL_FAILOVER_TRIGGERED,
      actorId: admin?.id ?? null,
      actorRole: admin?.role ?? 'admin',
      targetEmail: user.email,
      req,
      metadata: { flow: 'password-reset', scope: actualScope },
    });
  }

  return {
    sentTo: user.email,
    scope: actualScope,
    purpose,
    emailSent,
    manualRequired,
    manualPasscode: manualRequired ? otp : undefined,
  };
}

async function sendDeveloperMessage({ projectId, text, subject, admin, req }) {
  const project = await prisma.clientProject.findUnique({
    where: { id: projectId },
    include: { user: true },
  });
  if (!project) throw new ValidationError('Project not found.', 404);

  const message = await prisma.message.create({
    data: {
      projectId: project.id,
      senderType: 'developer',
      senderName: admin?.name ?? 'Shivam',
      senderEmail: admin?.email ?? null,
      subject: subject ?? null,
      body: text,
      kind: 'admin_reply',
    },
  });
  emitMessageNew(req, { source: 'portal', message }, { clientUserId: project.clientUserId });

  let emailSent = false;
  try {
    const dispatchResult = await sendPortalMessageEmail({
      to: project.clientEmail,
      recipientName: project.clientName ?? project.user?.name ?? 'there',
      senderLabel: 'Shivam (developer)',
      projectTitle: project.projectTitle,
      subject: subject ?? `Update on ${project.projectTitle ?? 'your project'}`,
      body: text,
      ctaUrl: `${portalUrl('/portal')}?email=${encodeURIComponent(project.clientEmail)}`,
    });
    emailSent = Boolean(dispatchResult?.success && !dispatchResult?.manualRequired);
  } catch (mailErr) {
    console.error('[admin] client message email failed:', mailErr?.message ?? mailErr);
  }

  await createAlert({
    type: 'portal_message',
    severity: 'info',
    userId: project.clientUserId,
    userEmail: project.clientEmail,
    message: `Admin message sent to ${project.clientEmail} on ${project.projectTitle ?? project.id}.`,
    source: 'admin',
    notify: false,
  }).catch(() => {});

  return { message, emailSent, project };
}

export function createAdminPortalRouter({ verifyAdminToken, checkPerm, otpEmailLimiter, messageLimiter }) {
  const otpLimit = otpEmailLimiter ?? ((_req, _res, next) => next());
  const messageLimit = messageLimiter ?? ((_req, _res, next) => next());
  const router = express.Router();
  router.use(verifyAdminToken);

    router.get('/users', checkPerm(['team', 'projects']), async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const users = await prisma.user.findMany({
        where: q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { projects: { some: { projectTitle: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          passwordHash: true,
          tempPasswordExpiry: true,
          createdAt: true,
          lastLoginAt: true,
          projects: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              clientName: true,
              clientEmail: true,
              projectTitle: true,
              serviceName: true,
              projectType: true,
              estimatedDays: true,
              features: true,
              status: true,
              progress: true,
              paymentStatus: true,
              currency: true,
              totalCost: true,
              amountPaid: true,
              balanceDue: true,
              deliveryDate: true,
              previewUrl: true,
              notes: true,
              invoiceNumber: true,
              transactionRef: true,
              createdAt: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        users: users.map(({ passwordHash, projects, ...user }) => ({
          ...user,
          hasPassword: Boolean(passwordHash),
          projectCount: projects.length,
          projects,
        })),
      });
    } catch (err) {
      return sendError(res, err, 'Could not load users.');
    }
  });

    router.patch('/projects/:projectId', checkPerm(['projects']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      requirePermission(req, 'projects');
      if (['totalCost', 'amountPaid', 'currency', 'transactionRef'].some((field) => body[field] !== undefined)) {
        requirePermission(req, 'payments');
      }
      const existing = await prisma.clientProject.findUnique({ where: { id: req.params.projectId } });
      if (!existing) throw new ValidationError('Project not found.', 404);

      const totalCost = body.totalCost === undefined
        ? existing.totalCost
        : validateNonNegativeNumber(body.totalCost, 'totalCost');
      const amountPaid = body.amountPaid === undefined
        ? existing.amountPaid
        : validateNonNegativeNumber(body.amountPaid, 'amountPaid');
      if (amountPaid > totalCost) throw new ValidationError('Amount paid cannot exceed the total project valuation.');

      let features = existing.features;
      if (body.features !== undefined) {
        if (!Array.isArray(body.features) || body.features.length > 60) {
          throw new ValidationError('features must be a list with no more than 60 items.');
        }
        features = [...new Set(body.features.map((feature) => validateRequiredString(feature, 'feature', 1, 160)))];
      }

      const progress = body.progress === undefined ? existing.progress : Number(body.progress);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        throw new ValidationError('progress must be a whole number from 0 to 100.');
      }

      let estimatedDays = existing.estimatedDays;
      if (body.estimatedDays !== undefined && body.estimatedDays !== null && body.estimatedDays !== '') {
        estimatedDays = Number(body.estimatedDays);
        if (!Number.isInteger(estimatedDays) || estimatedDays < 1 || estimatedDays > 730) {
          throw new ValidationError('estimatedDays must be a whole number between 1 and 730.');
        }
      }

      const project = await prisma.clientProject.update({
        where: { id: existing.id },
        data: {
          ...(body.clientName !== undefined ? { clientName: validateRequiredString(body.clientName, 'clientName', 1, 120) } : {}),
          ...(body.projectTitle !== undefined ? { projectTitle: validateRequiredString(body.projectTitle, 'projectTitle', 1, 200) } : {}),
          ...(body.serviceName !== undefined ? { serviceName: validateRequiredString(body.serviceName, 'serviceName', 1, 200) } : {}),
          ...(body.projectType !== undefined ? { projectType: validateRequiredString(body.projectType, 'projectType', 1, 120) } : {}),
          ...(body.status !== undefined ? { status: validateRequiredString(body.status, 'status', 1, 120) } : {}),
          ...(body.notes !== undefined ? { notes: body.notes === '' || body.notes === null ? null : validateRequiredString(body.notes, 'notes', 1, 5000) } : {}),
          ...(body.deliveryDate !== undefined ? { deliveryDate: body.deliveryDate ? validateRequiredString(body.deliveryDate, 'deliveryDate', 1, 40) : null } : {}),
          ...(body.previewUrl !== undefined ? { previewUrl: optionalText(body.previewUrl, 'previewUrl', 2048) } : {}),
          ...(body.transactionRef !== undefined ? { transactionRef: body.transactionRef ? validateRequiredString(body.transactionRef, 'transactionRef', 1, 160) : null } : {}),
          ...(body.currency !== undefined ? { currency: validateRequiredString(body.currency, 'currency', 3, 3).toUpperCase() } : {}),
          ...(body.features !== undefined ? { features } : {}),
          ...(body.estimatedDays !== undefined ? { estimatedDays } : {}),
          ...(body.progress !== undefined ? { progress } : {}),
          ...(body.totalCost !== undefined ? { totalCost } : {}),
          ...(body.amountPaid !== undefined ? { amountPaid } : {}),
          ...(body.totalCost !== undefined || body.amountPaid !== undefined
            ? {
                balanceDue: Math.max(totalCost - amountPaid, 0),
                paymentStatus: totalCost > 0 && amountPaid >= totalCost
                  ? 'Fully Paid'
                  : amountPaid > 0
                    ? `Partial (${Math.round((amountPaid / totalCost) * 100)}%)`
                    : 'Pending',
              }
            : {}),
        },
      });
      if (body.clientName !== undefined) {
        await prisma.user.updateMany({
          where: { email: project.clientEmail },
          data: { name: project.clientName },
        });
      }

      emitProjectMutation(req, 'updated', project, { source: 'portal' });

      return res.json({ success: true, project });
    } catch (err) {
      return sendError(res, err, 'Could not update the project.');
    }
  });

    // [RATE LIMITER - OTP & EMAIL QUOTA]: Credential reissue emails se email quota bachane ke liye.
  router.post('/reissue-credentials', otpLimit, checkPerm(['team', 'projects']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const userId = validateRequiredString(body.userId, 'userId', 1, 64);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      const result = await issueTemporaryCredentials(user);
      await createAlert({
        type: 'user_created',
        severity: result.manualRequired ? 'warning' : 'info',
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        message: `Temporary credentials re-issued for ${user.email} by ${req.admin?.id ?? 'an admin'}.${result.manualRequired ? ' (Email quota reached, manual dispatch required)' : ''}`,
        source: 'admin',
      });

      return res.json({
        success: true,
        emailSent: result.emailSent,
        manualRequired: Boolean(result.manualRequired),
        manualPasscode: result.manualRequired ? result.temporaryPassword : undefined,
        sentTo: user.email,
      });
    } catch (err) {
      return sendError(res, err, 'Could not issue credentials.');
    }
  });

    // [RATE LIMITER - OTP & EMAIL QUOTA]: Per-user credential
  router.post('/users/:id/credentials', otpLimit, checkPerm(['team', 'projects']), async (req, res) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      const result = await issueTemporaryCredentials(user);
      await createAlert({
        type: 'user_created',
        severity: result.manualRequired ? 'warning' : 'info',
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        message: `Temporary credentials re-issued for ${user.email} by ${req.admin?.id ?? 'an admin'}.${result.manualRequired ? ' (Email quota reached, manual dispatch required)' : ''}`,
        source: 'admin',
      });

      return res.json({
        success: true,
        emailSent: result.emailSent,
        manualRequired: Boolean(result.manualRequired),
        manualPasscode: result.manualRequired ? result.temporaryPassword : undefined,
        sentTo: user.email,
      });

      return res.json({ success: true, emailSent: result.emailSent, sentTo: user.email });
    } catch (err) {
      return sendError(res, err, 'Could not issue credentials.');
    }
  });

    // [RATE LIMITER - OTP & EMAIL QUOTA]: Superadmin OTP reset spam protection.
  router.post('/reset-password/superadmin', otpLimit, checkPerm(['team']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const userId = validateRequiredString(body.userId, 'userId', 1, 64);
      const result = await sendRoleReset(userId, 'superadmin', req.admin, req);
      return res.json({ success: true, ...result });
    } catch (err) {
      return sendError(res, err, 'Could not send the reset code.');
    }
  });

  // [RATE LIMITER - OTP & EMAIL QUOTA]: Team account OTP reset spam rokne ke liye.
  router.post('/reset-password/team', otpLimit, checkPerm(['team']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const userId = validateRequiredString(body.userId, 'userId', 1, 64);
      const result = await sendRoleReset(userId, 'team', req.admin, req);
      return res.json({ success: true, ...result });
    } catch (err) {
      return sendError(res, err, 'Could not send the reset code.');
    }
  });

  // [RATE LIMITER - OTP & EMAIL QUOTA]: Client account OTP reset spam rokne ke liye.
  router.post('/reset-password/client', otpLimit, checkPerm(['team', 'projects']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const userId = validateRequiredString(body.userId, 'userId', 1, 64);
      const result = await sendRoleReset(userId, 'client', req.admin, req);
      return res.json({ success: true, ...result });
    } catch (err) {
      return sendError(res, err, 'Could not send the reset code.');
    }
  });

    // [RATE LIMITER - OTP & EMAIL QUOTA]: Per-user password reset email spam rokne ke liye.
  router.post('/users/:id/reset-password', otpLimit, checkPerm(['team', 'projects']), async (req, res) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
      const scope = resetMetaForRole(user.role).scope;
      const result = await sendRoleReset(user.id, scope, req.admin, req);
      return res.json({ success: true, ...result });
    } catch (err) {
      return sendError(res, err, 'Could not send the reset code.');
    }
  });

    router.get('/messages', checkPerm(['projects']), async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
      if (!projectId) throw new ValidationError('projectId is required.');

      const project = await prisma.clientProject.findUnique({
        where: { id: projectId },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

      const messages = await prisma.message.findMany({
        where: { projectId, isArchived: false },
        orderBy: { createdAt: 'asc' },
        take: 300,
        select: {
          id: true,
          senderType: true,
          senderName: true,
          senderEmail: true,
          subject: true,
          body: true,
          kind: true,
          isRead: true,
          createdAt: true,
        },
      });

      return res.json({
        success: true,
        project: {
          id: project.id,
          projectTitle: project.projectTitle,
          clientName: project.clientName,
          clientEmail: project.clientEmail,
          status: project.status,
          progress: project.progress,
          paymentStatus: project.paymentStatus,
          balanceDue: project.balanceDue,
          currency: project.currency,
        },
        messages,
      });
    } catch (err) {
      return sendError(res, err, 'Could not load the conversation.');
    }
  });

    // [RATE LIMITER - CONTACT & PORTAL CHAT]: Admin outbound message flooding rokne ke liye.
  router.post('/messages', messageLimit, checkPerm(['projects']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const projectId = validateRequiredString(body.projectId, 'projectId', 1, 64);
      const text = validateRequiredString(body.body, 'body', 1, 5000);
      const subject = body.subject
        ? validateRequiredString(body.subject, 'subject', 1, 200)
        : undefined;

      const result = await sendDeveloperMessage({
        projectId,
        text,
        subject,
        admin: req.admin,
        req,
      });

      return res.status(201).json({
        success: true,
        emailSent: result.emailSent,
        messageId: result.message.id,
        sentTo: result.project.clientEmail,
      });
    } catch (err) {
      return sendError(res, err, 'Could not send the message.');
    }
  });

    // [RATE LIMITER - CONTACT & PORTAL CHAT]: Project-wise admin replies flooding rokne ke liye.
  router.post('/projects/:projectId/message', messageLimit, checkPerm(['projects']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      const text = validateRequiredString(body.body, 'body', 1, 5000);
      const subject = body.subject
        ? validateRequiredString(body.subject, 'subject', 1, 200)
        : undefined;

      const result = await sendDeveloperMessage({
        projectId: req.params.projectId,
        text,
        subject,
        admin: req.admin,
        req,
      });

      return res.status(201).json({
        success: true,
        emailSent: result.emailSent,
        messageId: result.message.id,
      });
    } catch (err) {
      return sendError(res, err, 'Could not send the message.');
    }
  });

    router.post('/projects', checkPerm(['projects']), async (req, res) => {
    try {
      const body = requireJsonBody(req);
      requirePermission(req, 'projects');
      if (['totalCost', 'amountPaid', 'currency'].some((field) => body[field] !== undefined)) {
        requirePermission(req, 'payments');
      }
      const email = validateEmail(body.clientEmail, 'clientEmail');
      const projectTitle = validateRequiredString(body.projectTitle, 'projectTitle', 1, 200);
      const totalCost = body.totalCost === undefined ? 0 : validateNonNegativeNumber(body.totalCost, 'totalCost');
      const amountPaid = body.amountPaid === undefined ? 0 : validateNonNegativeNumber(body.amountPaid, 'amountPaid');
      const balanceDue = Math.max(totalCost - amountPaid, 0);
      const paymentStatus =
        balanceDue <= 0
          ? totalCost > 0
            ? 'Fully Paid'
            : 'Pending'
          : `Partial (${Math.round((amountPaid / totalCost) * 100)}%)`;

      const user = await prisma.user.upsert({
        where: { email },
        update: { name: body.clientName ?? undefined },
        create: { email, name: body.clientName ?? null, role: 'client' },
      });

      const project = await prisma.clientProject.create({
        data: {
          clientUserId: user.id,
          clientEmail: email,
          clientName: body.clientName ?? user.name ?? null,
          projectTitle,
          serviceName: body.serviceName ?? projectTitle,
          currency: body.currency ?? 'INR',
          totalCost,
          amountPaid,
          balanceDue,
          paymentStatus,
          status: body.status ?? 'Pending Verification',
          progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : 10,
          deliveryDate: body.deliveryDate ?? null,
          notes: body.notes ?? null,
          isPaymentVerified: amountPaid > 0,
        },
      });
      emitProjectMutation(req, 'created', project, { source: 'portal', user });

      let credentials = { emailSent: false };
      if (body.sendCredentials !== false) {
        credentials = await issueTemporaryCredentials(user, { projectTitle });
      }

      await createAlert({
        type: 'user_created',
        severity: 'info',
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        message: `Project "${projectTitle}" created for ${email}${credentials.emailSent ? ' with credentials emailed' : ''}.`,
        source: 'admin',
        notify: false,
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        projectId: project.id,
        userId: user.id,
        credentialsEmailed: credentials.emailSent,
      });
    } catch (err) {
      return sendError(res, err, 'Could not create the project.');
    }
  });

  return router;
}
