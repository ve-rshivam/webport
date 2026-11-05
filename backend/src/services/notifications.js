
import { prisma } from '../lib/prisma.js';
import { sendAdminAlertEmail } from './email.service.js';

export async function createAlert({
  type,
  severity = 'info',
  userId = null,
  userName = null,
  userEmail = null,
  message,
  details = null,
  source = 'system',
  notify = true,
  emailSubject,
}) {
  const record = await prisma.adminAlert.create({
    data: {
      type,
      severity,
      userId,
      userName,
      userEmail,
      message,
      source,
            ...(details ? { details } : {}),
    },
  });

  if (notify) {
    const subject = emailSubject ?? `[${severity}] ${type.replace(/_/g, ' ')}`;
    try {
      await sendAdminAlertEmail({
        subject,
        bodyHtml: `<p>${escape(message)}</p>${details ? `<pre style="background:#faf6ee;padding:12px;font-size:12px;white-space:pre-wrap;">${escape(JSON.stringify(details, null, 2))}</pre>` : ''}`,
        bodyText: details ? `${message}\n\n${JSON.stringify(details, null, 2)}` : message,
      });
    } catch (err) {
            console.error('[AdminAlert] email dispatch failed:', err?.message ?? err);
    }
  }

  return record;
}

export async function logWebhookError({ gateway, message, transactionId = null, details = {} }) {
  return createAlert({
    type: 'webhook_error',
    severity: 'error',
    message,
    details: { gateway, transactionId, ...details },
    source: gateway,
  });
}

function escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
