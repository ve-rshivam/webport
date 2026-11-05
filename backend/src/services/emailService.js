
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma.js';

const SURFACE_SENDER_ENV = {
  noreply: ['RESEND_SENDER_EMAIL', 'BREVO_SENDER_EMAIL', 'EMAIL_FROM'],
  support: ['EMAIL_SUPPORT', 'EMAIL_FROM'],
  adminSelf: ['ADMIN_SENDER_EMAIL', 'EMAIL_FROM'],
};

export function getSenderForSurface(surface) {
  const keys = SURFACE_SENDER_ENV[surface] ?? SURFACE_SENDER_ENV.noreply;
  return keys.map((key) => process.env[key]?.trim()).find(Boolean) ?? '';
}

export function getSupportEmail() {
  return process.env.EMAIL_SUPPORT?.trim() ?? '';
}

export function appBaseUrl() {
  return (process.env.APP_BASE_URL ?? process.env.FRONTEND_URL ?? 'https://rshivam.dev').replace(/\/+$/, '');
}

export function portalUrl(pathname = '/portal') {
  return `${appBaseUrl()}${pathname}`;
}

export function getPortalUrl() {
  return portalUrl('/portal');
}

export function isEmailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY ||
    process.env.BREVO_API_KEY ||
    (process.env.FALLBACK_SMTP_USER && process.env.FALLBACK_SMTP_PASS)
  );
}

export function adminNotifyRecipients() {
  const list = [process.env.ADMIN_NOTIFY_EMAIL, process.env.SUPER_ADMIN_EMAIL]
    .filter(Boolean)
    .map((address) => address.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

let resendClient = null;
let resendClientKey = null;

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient || resendClientKey !== key) {
    resendClient = new Resend(key);
    resendClientKey = key;
  }
  return resendClient;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((attachment) => attachment && typeof attachment.filename === 'string' && attachment.content)
    .map((attachment) => {
      const content = Buffer.isBuffer(attachment.content)
        ? attachment.content
        : Buffer.from(String(attachment.content), 'base64');
      return {
        filename: attachment.filename,
        content,
        contentType: attachment.contentType || 'application/octet-stream',
      };
    });
}

const BASE_CSS = `
  body { margin:0; padding:0; background:#f3eee3; font-family:Arial,Helvetica,sans-serif; }
  .shell { background:#fffdf8; border:1px solid #ded5c4; }
  .pad { padding:32px 40px; }
  .label { font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:#8a7f6d; }
  .kbd { font-family:'Courier New',monospace; font-size:19px; letter-spacing:2px; color:#17140f; word-break:break-all; }
  .box { background:#faf6ee; border:1px solid #ded5c4; border-left:3px solid #c93d1b; }
  .footer { border-top:1px solid #ded5c4; font-size:11px; line-height:1.6; color:#8a7f6d; }
  a { color:#c93d1b; }
`;

function shell({ title, footer = 'Shivam Web Studio · rshivam.dev', preheader = '' }, inner) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head>
<body>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee3;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
<tr><td class="pad" style="border-bottom:1px solid #ded5c4;">
<p class="label">Shivam Web Studio</p>
<h1 style="margin:10px 0 0;font-family:Georgia,serif;font-size:24px;font-weight:400;color:#17140f;">${escapeHtml(title)}</h1>
</td></tr>
<tr><td class="pad">${inner}</td></tr>
<tr><td class="pad"><p class="footer">${escapeHtml(footer)}</p></td></tr>
</table></td></tr></table></body></html>`;
}


export function renderCredentialsEmail({ to, toEmail, recipientName, temporaryPassword, loginUrl, supportEmail = getSupportEmail() }) {
  const recipient = to || toEmail;
  const url = loginUrl ?? portalUrl('/portal');
  const name = escapeHtml(recipientName || 'there');
  const html = shell(
    { title: 'Your portal access is ready', preheader: 'Temporary credentials for the client portal.' },
    `<p style="color:#17140f;font-size:15px;">Hi ${name},</p>
     <p style="color:#4a4439;font-size:15px;line-height:1.6;">Your payment is verified and your client portal account is ready. Use the temporary password below to sign in, then set a permanent password.</p>
     <table role="presentation" class="box" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
       <tr><td style="padding:20px 22px;">
         <p class="label">Temporary credentials</p>
         <p style="margin:10px 0 4px;font-size:12px;color:#8a7f6d;">Email</p>
         <p style="margin:0 0 14px;font-size:15px;color:#17140f;word-break:break-all;">${escapeHtml(recipient)}</p>
         <p style="margin:0 0 4px;font-size:12px;color:#8a7f6d;">Temporary password</p>
         <p class="kbd" style="margin:0;">${escapeHtml(temporaryPassword)}</p>
       </td></tr>
     </table>
     <p style="margin-top:24px;">
       <a href="${escapeHtml(url)}" style="display:inline-block;background:#17140f;color:#faf6ee;padding:14px 26px;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;">Open the client portal</a>
     </p>
     <p style="margin-top:14px;font-size:12px;color:#8a7f6d;word-break:break-all;">${escapeHtml(url)}</p>
     <p style="margin-top:18px;font-size:13px;color:#4a4439;"><strong>Security:</strong> this password expires in 72 hours and must be changed on first sign-in. Do not forward this email.</p>
     <p style="margin-top:12px;font-size:13px;color:#4a4439;">Need help? Write to <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>.</p>`
  );
  const text = `Hi ${recipientName || 'there'},

Your payment is verified and your client portal account is ready.

Portal: ${url}
Email: ${recipient}
Temporary password: ${temporaryPassword}

This password expires in 72 hours. You will be asked to set a permanent password on first sign-in.
Never share these credentials. Need help? ${supportEmail}`;
  return { html, text };
}

const OTP_PURPOSES = {
  client_reset: 'reset your portal password',
  qr_approval: 'verify your identity and set a password',
  admin_reset: 'reset your admin password',
  team_reset: 'reset your team password',
  superadmin_reset: 'reset your superadmin password',
};

export function renderOtpEmail({ to, email, recipientName, otp, purpose, loginUrl, expiresInMinutes = 10, extraBody }) {
  const recipient = to || email;
  const purposeText = OTP_PURPOSES[purpose] ?? 'verify your identity';
  const url = loginUrl ?? portalUrl('/portal/verify-otp');
  const html = shell(
    { title: 'Your one-time access code', preheader: `Code valid for ${expiresInMinutes} minutes.` },
    `<p style="color:#17140f;font-size:15px;">Hi ${escapeHtml(recipientName || 'there')},</p>
     <p style="color:#4a4439;font-size:15px;line-height:1.6;">Use the one-time code below to ${escapeHtml(purposeText)}.</p>
     <table role="presentation" class="box" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
       <tr><td style="padding:24px 22px;text-align:center;">
         <p class="label">Verification code</p>
         <p class="kbd" style="margin:10px 0 0;">${escapeHtml(otp)}</p>
         <p style="margin-top:12px;font-size:12px;color:#8a7f6d;">Expires in ${Number(expiresInMinutes)} minutes</p>
       </td></tr>
     </table>
     ${extraBody ? `<p style="margin-top:18px;color:#4a4439;font-size:14px;">${escapeHtml(extraBody)}</p>` : ''}
     <p style="margin-top:16px;font-size:14px;color:#4a4439;">Continue here: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
     ${getSupportEmail() ? `<p style="margin-top:12px;font-size:12px;color:#8a7f6d;">If you did not request this, ignore the email and contact <a href="mailto:${escapeHtml(getSupportEmail())}">${escapeHtml(getSupportEmail())}</a>.</p>` : ''}`
  );
  const text = `Hi ${recipientName || 'there'},

Your one-time code to ${purposeText} is: ${otp}

Valid for ${expiresInMinutes} minutes. Continue at ${url}
If you did not request this, ignore this email.${getSupportEmail() ? ` Contact support: ${getSupportEmail()}` : ''}`;
  return { html, text };
}

export function renderAlertEmail({ subject, title, bodyHtml, bodyText }) {
  const html = shell({ title: title || subject }, `<div style="font-size:15px;line-height:1.6;color:#17140f;">${bodyHtml}</div>`);
  return { html, text: bodyText };
}

export function renderMessageEmail({ recipientName, senderLabel, projectTitle, body, subject, ctaUrl }) {
  const title = subject || 'New message in your client portal';
  const html = shell(
    { title, preheader: body.slice(0, 120) },
    `<p style="color:#17140f;font-size:15px;">Hi ${escapeHtml(recipientName || 'there')},</p>
     <p style="color:#4a4439;font-size:14px;">${escapeHtml(senderLabel)} sent you a message${projectTitle ? ` about <strong>${escapeHtml(projectTitle)}</strong>` : ''}.</p>
     <table role="presentation" class="box" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
       <tr><td style="padding:18px 20px;white-space:pre-wrap;color:#17140f;font-size:15px;line-height:1.6;">${escapeHtml(body)}</td></tr>
     </table>
     <p style="margin-top:22px;"><a href="${escapeHtml(ctaUrl ?? portalUrl('/portal'))}" style="display:inline-block;background:#17140f;color:#faf6ee;padding:13px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Open the portal</a></p>`
  );
  const text = `Hi ${recipientName || 'there'},

${senderLabel} sent you a message${projectTitle ? ` about ${projectTitle}` : ''}:

${body}

Reply in the portal: ${ctaUrl ?? portalUrl('/portal')}`;
  return { html, text };
}


let smtpTransporter = null;
let smtpTransporterKey = null;

function getSmtpTransporter(config) {
  const key = `${config.host}|${config.port}|${config.secure}|${config.auth?.user ?? ''}`;
  if (!smtpTransporter || smtpTransporterKey !== key) {
    smtpTransporter = nodemailer.createTransport(config);
    smtpTransporterKey = key;
  }
  return smtpTransporter;
}

async function sendViaSmtp({ senderName, senderEmail, to, subject, html, text, attachments, replyTo }) {
  const user = process.env.FALLBACK_SMTP_USER;
  const pass = process.env.FALLBACK_SMTP_PASS;
  if (!user || !pass) {
    throw new Error('FALLBACK_SMTP_USER or FALLBACK_SMTP_PASS missing in environment');
  }

  const host =
    process.env.FALLBACK_SMTP_HOST ||
    (user.includes('@gmail') ? 'smtp.gmail.com' : 'smtp.resend.com');
  const port = Number(process.env.FALLBACK_SMTP_PORT || 587);
  const secure = process.env.FALLBACK_SMTP_SECURE === 'true' || port === 465;

  const transporter = getSmtpTransporter({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  const recipients = Array.isArray(to) ? to.join(', ') : to;
  const info = await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to: recipients,
    subject,
    html,
    text,
    attachments,
    replyTo: replyTo ? (Array.isArray(replyTo) ? replyTo.join(', ') : replyTo) : undefined,
  });

  return { messageId: info.messageId, provider: 'smtp' };
}


export async function dispatchTransactionalEmail({
  to,
  subject,
  html,
  text,
  surface = 'noreply',
  senderName = 'Shivam Kumar',
  senderEmail = getSenderForSurface(surface),
  plainPasscode = null,
  passcode = null,
  attachments = [],
  replyTo,
  headers,
}) {
  const recipients = (Array.isArray(to) ? to : [to])
    .flatMap((recipient) => String(recipient ?? '').split(','))
    .map((recipient) => recipient.trim())
    .filter(Boolean);
  const primaryRecipient = recipients[0] || '';
  const manualPasscode = plainPasscode ?? passcode ?? null;
  const validAttachments = normalizeAttachments(attachments);
  if (Array.isArray(attachments) && attachments.length > validAttachments.length) {
    console.warn('[EMAIL] Ignoring incomplete email attachment(s).');
  }
  let failureReason = 'All email providers exhausted';

    try {
    const resend = getResend();
    if (!resend) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const payload = {
      from: `"${senderName}" <${senderEmail}>`,
      to: recipients,
      subject,
      html,
      text,
    };
    if (validAttachments.length) {
      payload.attachments = validAttachments.map(({ filename, content, contentType }) => ({
        filename,
        content: content.toString('base64'),
        contentType,
      }));
    }
    if (replyTo) payload.replyTo = Array.isArray(replyTo) ? replyTo : [replyTo];
    if (headers) payload.headers = headers;

    const { data, error } = await resend.emails.send(payload);
    if (error) throw new Error(error.message || error.name || 'Resend API rejected the request');

    return {
      success: true,
      manualRequired: false,
      provider: 'resend',
      id: data?.id ?? null,
      messageId: data?.id ?? null,
      recipient: primaryRecipient,
    };
  } catch (err) {
    failureReason = err?.message || 'Resend send exception';
    console.warn('⚠️ [EMAIL] Resend failed, cascading to Brevo...', failureReason);
  }

    try {
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) throw new Error('BREVO_API_KEY is not configured');

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: recipients.map((email) => ({ email })),
        subject,
        htmlContent: html,
        ...(text ? { textContent: text } : {}),
        ...(validAttachments.length
          ? { attachment: validAttachments.map(({ filename, content }) => ({ name: filename, content: content.toString('base64') })) }
          : {}),
      }),
    });
    const responseBody = await response.json().catch(() => null);
    if (response.status !== 200 && response.status !== 201) {
      const detail = responseBody?.message || response.statusText || `HTTP ${response.status}`;
      throw new Error(`Brevo API request failed: ${detail}`);
    }

    return {
      success: true,
      manualRequired: false,
      provider: 'brevo',
      id: responseBody?.messageId ?? null,
      messageId: responseBody?.messageId ?? null,
      recipient: primaryRecipient,
    };
  } catch (err) {
    failureReason = err?.message || 'Brevo send exception';
    console.warn('⚠️ [EMAIL] Brevo failed, cascading to Nodemailer SMTP...', failureReason);
  }

    try {
    const smtpResult = await sendViaSmtp({
      senderName,
      senderEmail,
      to: recipients,
      subject,
      html,
      text,
      attachments: validAttachments,
      replyTo,
    });
    return {
      success: true,
      manualRequired: false,
      provider: 'nodemailer',
      id: smtpResult.messageId ?? null,
      messageId: smtpResult.messageId ?? null,
      recipient: primaryRecipient,
    };
  } catch (err) {
    failureReason = err?.message || 'Nodemailer SMTP send exception';
    console.error('❌ [EMAIL] Nodemailer SMTP failed:', failureReason);
  }

    // [H1] Plaintext password/OTP kabhi DB me persist nahi hota. Sirf ek opaque reference id
  // store hoti hai, jisse admin alert ko correlate kar sake (credential khud recover nahi hota).
  const credentialReference = manualPasscode
    ? `cred-${crypto.randomBytes(6).toString('hex')}`
    : null;
  console.warn(`[emailDispatcher] Manual admin fallback for ${primaryRecipient} (ref ${credentialReference ?? 'n/a'})`);

  try {
    await prisma.adminAlert.create({
      data: {
        type: 'EMAIL_DELIVERY_FAILED',
        severity: 'warning',
        userEmail: primaryRecipient,
        message: `Email delivery failed for ${primaryRecipient}: ${failureReason}`,
        details: {
          to: primaryRecipient,
          email: primaryRecipient,
          subject,
          credentialType: manualPasscode ? 'temporary_password' : null,
          credentialReference,
          reason: 'All email providers exhausted',
        },
        source: 'email_dispatcher',
      },
    });
  } catch (dbErr) {
    console.error('[emailDispatcher] Failed to create EMAIL_DELIVERY_FAILED AdminAlert:', dbErr?.message);
  }

  return {
    success: false,
    manualRequired: true,
    recipient: primaryRecipient,
    // Immediate caller (jo email trigger kar raha hai) ko credential milta hai,
    // par yeh response kisi DB column me persist nahi hota.
    passcode: manualPasscode,
    credentialReference,
    reason: 'All email providers exhausted',
  };
}


export async function sendCredentialsEmail(params) {
  const recipientEmail = params.to || params.toEmail;
  const temporaryPassword = params.temporaryPassword;
  const loginUrl = params.loginUrl ?? `${portalUrl('/portal')}?email=${encodeURIComponent(recipientEmail)}`;

  const rendered = renderCredentialsEmail({
    to: recipientEmail,
    recipientName: params.recipientName,
    temporaryPassword,
    loginUrl,
    supportEmail: params.supportEmail || getSupportEmail(),
  });

  return sendEmail({
    to: recipientEmail,
    subject: 'Your portal access is ready',
    html: rendered.html,
    text: rendered.text,
    plainPasscode: temporaryPassword,
    senderEmail: getSenderForSurface('noreply'),
    replyTo: getSupportEmail() || undefined,
  });
}

export async function sendPasswordResetOtp(params) {
  const recipientEmail = params.to || params.email;
  const otp = params.otp || params.passcode;
  const rendered = renderOtpEmail({
    to: recipientEmail,
    recipientName: params.recipientName,
    otp,
    purpose: params.purpose,
    loginUrl: params.loginUrl,
    expiresInMinutes: params.expiresInMinutes,
    extraBody: params.extraBody,
  });

  let surface = 'noreply';
  if (params.purpose === 'superadmin_reset') surface = 'adminSelf';
  else if (params.purpose === 'admin_reset' || params.purpose === 'team_reset') surface = 'support';

  return sendEmail({
    to: recipientEmail,
    subject: 'Your one-time access code',
    html: rendered.html,
    text: rendered.text,
    plainPasscode: otp,
    senderEmail: getSenderForSurface(surface),
    replyTo: getSupportEmail() || undefined,
  });
}

export const sendOtpEmail = sendPasswordResetOtp;
export const sendPasswordResetEmail = sendPasswordResetOtp;

export async function sendClientCredentialsEmail(params) {
  return sendCredentialsEmail(params);
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  plainPasscode = null,
  senderName = 'Shivam Kumar',
  surface = 'noreply',
  senderEmail,
  replyTo,
  headers,
  passcode = null,
  attachments = [],
}) {
  return dispatchTransactionalEmail({
    to,
    subject,
    html,
    text,
    plainPasscode,
    senderName,
    senderEmail: senderEmail ?? getSenderForSurface(surface),
    surface,
    passcode,
    attachments,
    replyTo,
    headers,
  });
}

export async function sendAdminAlertEmail({ subject, bodyHtml, bodyText }) {
  const recipients = adminNotifyRecipients();
  const rendered = renderAlertEmail({ subject, bodyHtml, bodyText });
  return sendEmail({
    to: recipients,
    subject,
    html: rendered.html,
    text: rendered.text,
    senderEmail: getSenderForSurface('noreply'),
    replyTo: getSupportEmail() || undefined,
  });
}

export async function sendSupportAlertEmail({ subject, bodyHtml, bodyText, replyTo }) {
  const rendered = renderAlertEmail({ subject, bodyHtml, bodyText });
  return sendEmail({
    to: adminNotifyRecipients(),
    subject,
    html: rendered.html,
    text: rendered.text,
    senderEmail: getSenderForSurface('support'),
    replyTo,
  });
}

export async function sendPortalMessageEmail({ to, recipientName, senderLabel, projectTitle, body, subject, ctaUrl }) {
  const rendered = renderMessageEmail({ recipientName, senderLabel, projectTitle, body, subject, ctaUrl });
  return sendEmail({
    to,
    subject: subject || 'New message in your client portal',
    html: rendered.html,
    text: rendered.text,
    senderEmail: getSenderForSurface('noreply'),
    replyTo: getSupportEmail() || undefined,
  });
}

export const emailService = {
  dispatchTransactionalEmail,
  sendEmail,
  sendCredentialsEmail,
  sendPasswordResetOtp,
  sendPasswordResetEmail,
  sendOtpEmail,
  sendClientCredentialsEmail,
  sendAdminAlertEmail,
  sendSupportAlertEmail,
  sendPortalMessageEmail,
  getSenderForSurface,
  adminNotifyRecipients,
  portalUrl,
  getPortalUrl,
  isEmailConfigured,
};

export default emailService;
