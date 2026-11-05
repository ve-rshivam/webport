
import { prisma } from '../lib/prisma.js';
import { ValidationError, validateEmail } from './validators.js';
import {
  generateTemporaryPassword,
  hashSecret,
  issueSession,
  TEMP_PASSWORD_TTL_MINUTES,
} from './auth.service.js';
import { getSupportEmail, sendCredentialsEmail, sendEmail, portalUrl } from './email.service.js';
import { createAlert } from './notifications.js';
import { escapeHtml } from '../lib/security.js';
import { recordAudit, AUDIT_ACTIONS } from '../lib/audit.js';

function addMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function paymentStatusFor(totalCost, amountPaid) {
  if (totalCost <= 0) return 'Paid';
  const balance = totalCost - amountPaid;
  if (balance <= 0) return 'Fully Paid';
  return `Partial (${Math.round((amountPaid / totalCost) * 100)}%)`;
}

async function findPayment(gateway, transactionId) {
  if (!transactionId) return null;
  return prisma.payment.findUnique({ where: { gateway_transactionId: { gateway, transactionId } } });
}

export async function issueTemporaryCredentials(user, {
  projectTitle,
  loginUrl,
  disconnectClientSockets = () => {},
  syncClientProjectCredentials = async () => {},
  sendEmail = true,
} = {}) {
  const temporaryPassword = generateTemporaryPassword();
  const tempPasswordHash = await hashSecret(temporaryPassword);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: null,
      passwordUpdatedAt: new Date(),
      tempPasswordHash,
      tempPasswordExpiry: addMinutes(TEMP_PASSWORD_TTL_MINUTES),
      tempPasswordAttempts: 0,
      mustChangePassword: true,
      resetOtpHash: null,
      resetOtpExpiry: null,
      resetOtpAttempts: 0,
      sessionToken: null,
      sessionTokenExpiry: null,
      sessionFingerprint: null,
      sessionUserAgent: null,
      sessionIp: null,
      lastActiveAt: null,
    },
  });

  await syncClientProjectCredentials({
    email: updated.email,
    passwordHash: tempPasswordHash,
    isTemporaryKey: true,
  });
  disconnectClientSockets(updated.id);

  let emailSent = false;
  let manualRequired = false;
  try {
    if (!sendEmail) {
      return {
        user: updated,
        temporaryPassword,
        manualPasscode: temporaryPassword,
        emailSent: false,
        manualRequired: false,
      };
    }
    const dispatchResult = await sendCredentialsEmail({
      to: updated.email,
      recipientName: updated.name ?? 'there',
      temporaryPassword,
      loginUrl: loginUrl ?? `${portalUrl('/portal')}?email=${encodeURIComponent(updated.email)}`,
    });
    emailSent = Boolean(dispatchResult?.success && !dispatchResult?.manualRequired);
    manualRequired = Boolean(dispatchResult?.manualRequired);
  } catch (err) {
    console.error('[provisioning] credentials email failed:', err?.message ?? err);
  }

  if (manualRequired) {
    await recordAudit({
      action: AUDIT_ACTIONS.EMAIL_FAILOVER_TRIGGERED,
      actorId: user.id,
      actorRole: user.role,
      targetEmail: updated.email,
      metadata: { flow: 'temporary-credentials' },
    });
  }

  return {
    user: updated,
    temporaryPassword,
    manualPasscode: temporaryPassword,
    emailSent,
    manualRequired,
  };
}

export async function provisionFromPayment(input, {
  disconnectClientSockets = () => {},
  syncClientProjectCredentials = async () => {},
} = {}) {
  const gateway = input.gateway;
  const transactionId = String(input.transactionId ?? '').trim();
  if (!transactionId) throw new ValidationError('Payment is missing a transaction id.');

  const existing = await findPayment(gateway, transactionId);
  if (existing && existing.status === 'captured') {
    return { duplicate: true, payment: existing, project: null, user: null, token: null };
  }

  const email = validateEmail(input.email, 'payment email');
  const amount = Number(input.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('Payment amount must be a positive number.');
  }
  const projectAmount = Number(input.projectAmount ?? amount);
  if (!Number.isFinite(projectAmount) || projectAmount <= 0) {
    throw new ValidationError('Project payment amount must be a positive number.');
  }
  const requestedTotal = Number(input.totalAmount ?? 0);
  if (!input.isRemainingPayment && ['razorpay', 'paypal', 'qr'].includes(gateway)) {
    if (!Number.isFinite(requestedTotal) || requestedTotal <= 0) {
      throw new ValidationError('Payment is missing its verified project valuation.');
    }
    if (projectAmount > requestedTotal + 0.01) {
      throw new ValidationError('Payment amount exceeds the verified project valuation.');
    }
  }


  const user = await prisma.user.upsert({
    where: { email },
    update: { name: input.name ?? undefined },
    create: { email, name: input.name ?? null, role: 'client' },
  });

  let project = null;

  if (input.isRemainingPayment) {
    let target = input.projectId
      ? await prisma.clientProject.findUnique({ where: { id: input.projectId } })
      : null;

    // Fallback: Find latest project with pending balance for this email
    if (!target) {
      target = await prisma.clientProject.findFirst({
        where: {
          OR: [{ clientUserId: user.id }, { clientEmail: { equals: email, mode: 'insensitive' } }],
          balanceDue: { gt: 0 },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (input.isRemainingPayment) {
    let target = input.projectId
      ? await prisma.clientProject.findUnique({ where: { id: input.projectId } })
      : null;

    if (!target) {
      target = await prisma.clientProject.findFirst({
        where: {
          OR: [{ clientUserId: user.id }, { clientEmail: { equals: email, mode: 'insensitive' } }],
          balanceDue: { gt: 0 },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!target) throw new ValidationError('No active project with an outstanding balance was found for this client.', 404);

    const amountPaid = target.amountPaid + projectAmount;
    const balanceDue = Math.max(target.totalCost - amountPaid, 0);
    project = await prisma.clientProject.update({
      where: { id: target.id },
      data: {
        clientUserId: target.clientUserId ?? user.id,
        amountPaid,
        balanceDue,
        paymentStatus: paymentStatusFor(target.totalCost, amountPaid),
        isPaymentVerified: true,
        lastUpdated: new Date(),
      },
    });
  } else {
    const totalCost = requestedTotal > 0 ? requestedTotal : amount;
    const balanceDue = Math.max(totalCost - projectAmount, 0);
    project = await prisma.clientProject.create({
      data: {
        clientUserId: user.id,
        clientEmail: email,
        clientName: input.name ?? user.name ?? null,
        projectTitle: input.serviceName ?? 'Custom project',
        serviceName: input.serviceName ?? null,
        currency: input.currency ?? 'INR',
        totalCost,
        amountPaid: projectAmount,
        balanceDue,
        paymentStatus: paymentStatusFor(totalCost, projectAmount),
        status: 'Development Started',
        progress: 10,
        isPaymentVerified: true,
        lastUpdated: new Date(),
      },
    });
  }

  let payment;
  const paymentData = {
    status: 'captured',
    amount,
    currency: input.currency ?? 'INR',
    email,
    name: input.name ?? null,
    projectId: project.id,
    userId: user.id,
    ...(input.details ? { details: input.details } : {}),
  };

  try {
            payment = existing
      ? await prisma.payment.update({ where: { id: existing.id }, data: paymentData })
      : await prisma.payment.create({
          data: {
            gateway,
            transactionId,
            orderId: input.orderId ?? null,
            ...paymentData,
          },
        });
  } catch (err) {
    if (err?.code === 'P2002') {
      const duplicate = await findPayment(gateway, transactionId);
      return { duplicate: true, payment: duplicate, project, user, token: null };
    }
    throw err;
  }

  let session = null;
  let credentials = { emailSent: false, temporaryPassword: null, manualRequired: false, manualPasscode: null };

  const hasActivePermanentPassword = Boolean(user.passwordHash && !user.mustChangePassword);

  if (!input.isRemainingPayment && !hasActivePermanentPassword) {
    credentials = await issueTemporaryCredentials(user, {
      projectTitle: project.projectTitle,
      disconnectClientSockets,
      syncClientProjectCredentials,
    });
    try {
      session = await issueSession(prisma, user);
    } catch (err) {
      console.error('[provisioning] session issue failed:', err?.message ?? err);
    }
  } else if (input.isRemainingPayment) {
    await sendTopUpReceipt({
      to: user.email,
      name: user.name,
      amount: projectAmount,
      currency: project.currency ?? 'INR',
      projectTitle: project.projectTitle,
    });
    credentials.emailSent = true;
  } else {
    credentials.emailSent = true;
  }

  await createAlert({
    type: 'payment_success',
    severity: 'info',
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    message: `${gateway} payment ${transactionId} verified for ${email} (${input.currency ?? 'INR'} ${amount}).`,
    details: {
      gateway,
      transactionId,
      orderId: input.orderId ?? null,
      amount,
      currency: input.currency ?? 'INR',
      projectId: project.id,
      isRemainingPayment: Boolean(input.isRemainingPayment),
      credentialsEmailed: credentials.emailSent,
      manualRequired: Boolean(credentials.manualRequired),
      sessionIssued: Boolean(session),
    },
    source: gateway,
    emailSubject: `Payment received — ${email}`,
  });

  return {
    duplicate: false,
    payment,
    project,
    user,
    token: session?.token ?? null,
    sessionExpiresAt: session?.expiresAt ?? null,
    emailSent: credentials.emailSent,
    manualRequired: Boolean(credentials.manualRequired),
    temporaryPassword: credentials.temporaryPassword,
    manualPasscode: credentials.manualPasscode || credentials.temporaryPassword,
  };
}

export async function handleFailedPayment(input) {
  const gateway = input.gateway;
  const transactionId = String(input.transactionId ?? '').trim() || `unknown_${Date.now()}`;

  const existing = await findPayment(gateway, transactionId);
  if (!existing) {
    await prisma.payment
      .create({
        data: {
          gateway,
          transactionId,
          orderId: input.orderId ?? null,
          status: 'failed',
          amount: Number(input.amount ?? 0),
          currency: input.currency ?? 'INR',
          email: input.email ?? null,
          name: input.name ?? null,
          ...(input.details ? { details: input.details } : {}),
        },
      })
      .catch((err) => {
        if (err?.code !== 'P2002') throw err;
      });
  }

  await createAlert({
    type: 'payment_failed',
    severity: 'warning',
    userEmail: input.email ?? null,
    message: `${gateway} payment failed for ${input.email ?? 'unknown customer'}${input.reason ? `: ${input.reason}` : ''}`,
    details: {
      gateway,
      transactionId,
      amount: Number(input.amount ?? 0),
      currency: input.currency ?? 'INR',
      reason: input.reason ?? null,
    },
    source: gateway,
    emailSubject: `Payment failed — ${input.email ?? 'unknown customer'}`,
  });

  return { recorded: true };
}

export async function sendTopUpReceipt({ to, name, amount, currency, projectTitle }) {
  try {
    await sendEmail({
      to,
      subject: 'Payment received — balance updated',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; border-radius: 8px;">
          <h2 style="color: #00bcd4;">Payment Successfully Applied</h2>
          <p>Hi <strong>${escapeHtml(name || 'there')}</strong>,</p>
          <p>We received your payment of <strong>${escapeHtml(currency)} ${escapeHtml(amount)}</strong>${projectTitle ? ` for <strong>${escapeHtml(projectTitle)}</strong>` : ''}. Your project balance has been updated.</p>
          <p>You can check your updated progress and project status anytime in the <a href="${escapeHtml(portalUrl('/portal'))}">Client Portal</a>.</p>
        </div>
      `,
      text: `Hi ${name || 'there'},\n\nWe received your payment of ${currency} ${amount}${projectTitle ? ` for ${projectTitle}` : ''}. Your project balance has been updated.\n\nOpen the client portal: ${portalUrl('/portal')}`,
      replyTo: getSupportEmail(),
    });
  } catch (err) {
    console.error('[provisioh ning] receipt email failed:', err?.message ?? err);
  }
}