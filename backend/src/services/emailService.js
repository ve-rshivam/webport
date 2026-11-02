import { Resend } from 'resend';

/**
 * Transactional email service.
 *
 * Outbound automated mail is sent directly through the Resend API using a
 * verified sender on rshivam.dev. Replies are routed to the human inbox via
 * Reply-To so client responses land in Mailflare instead of a no-reply mailbox.
 *
 * This module never logs recipient passwords or API keys.
 */

const DEFAULT_FROM = 'noreply@rshivam.dev';
const DEFAULT_SUPPORT = 'contact@rshivam.dev';
const DEFAULT_APP_BASE_URL = 'https://rshivam.dev';

let resendClient = null;
let resendClientKey = null;

export class EmailServiceError extends Error {
  constructor(message, code = 'send_failed', cause) {
    super(message);
    this.name = 'EmailServiceError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getEmailFrom() {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

export function getEmailSupport() {
  return process.env.EMAIL_SUPPORT || DEFAULT_SUPPORT;
}

export function getPortalUrl() {
  const base = (process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL).replace(/\/+$/, '');
  return `${base}/portal`;
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  // Rebuild the client if the key changes (useful in tests and local reloads).
  if (!resendClient || resendClientKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClientKey = apiKey;
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

function renderCredentialsEmail({
  recipientName,
  toEmail,
  temporaryPassword,
  loginUrl,
  supportEmail,
}) {
  const name = escapeHtml(recipientName);
  const email = escapeHtml(toEmail);
  const password = escapeHtml(temporaryPassword);
  const url = escapeHtml(loginUrl);
  const support = escapeHtml(supportEmail);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Your Access Credentials - Portfolio Portal</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-shell { width: 100% !important; }
        .email-pad { padding: 24px 20px !important; }
        .credential-value { font-size: 15px !important; }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background-color:#f3eee3;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      Your portfolio portal access is ready. Sign in with the temporary password below.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3eee3; padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#fffdf8; border:1px solid #ded5c4;">
            <tr>
              <td class="email-pad" style="padding:32px 40px 20px 40px; border-bottom:1px solid #ded5c4;">
                <p style="margin:0; font-family:'IBM Plex Mono', 'Courier New', monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#8a7f6d;">
                  Shivam Web Studio
                </p>
                <h1 style="margin:10px 0 0 0; font-family:Georgia, 'Times New Roman', serif; font-size:26px; line-height:1.25; font-weight:400; color:#17140f;">
                  Your portal access is ready
                </h1>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:28px 40px 8px 40px;">
                <p style="margin:0 0 14px 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:1.6; color:#17140f;">
                  Hi ${name},
                </p>
                <p style="margin:0 0 20px 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.65; color:#4a4439;">
                  An account has been created for you on the client portal, where you can follow
                  project progress, review payments, and message the developer directly.
                </p>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf6ee; border:1px solid #ded5c4; border-left:3px solid #c93d1b;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <p style="margin:0 0 12px 0; font-family:'IBM Plex Mono', 'Courier New', monospace; font-size:10px; letter-spacing:0.16em; text-transform:uppercase; color:#8a7f6d;">
                        Temporary login credentials
                      </p>
                      <p style="margin:0 0 4px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#8a7f6d;">
                        Email
                      </p>
                      <p class="credential-value" style="margin:0 0 14px 0; font-family:'Courier New', monospace; font-size:15px; color:#17140f; word-break:break-all;">
                        ${email}
                      </p>
                      <p style="margin:0 0 4px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#8a7f6d;">
                        Temporary password
                      </p>
                      <p class="credential-value" style="margin:0; font-family:'Courier New', monospace; font-size:19px; letter-spacing:2px; color:#17140f; word-break:break-all;">
                        ${password}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:26px 40px 0 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background-color:#17140f; border-radius:6px;">
                      <a href="${url}" style="display:inline-block; padding:14px 26px; font-family:Arial, Helvetica, sans-serif; font-size:15px; font-weight:bold; color:#faf6ee; text-decoration:none;">
                        Open the client portal
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#8a7f6d; word-break:break-all;">
                  Or paste this link into your browser:<br />
                  <a href="${url}" style="color:#c93d1b; text-decoration:underline;">${url}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:24px 40px 0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #ded5c4;">
                  <tr>
                    <td style="padding-top:18px;">
                      <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:1.65; color:#4a4439;">
                        <strong style="color:#17140f;">Security notice:</strong>
                        You will be prompted to change this temporary password upon first login.
                        Do not forward this email or share the credentials with anyone.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:22px 40px 32px 40px;">
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:1.65; color:#4a4439;">
                  Need help signing in? Reply to this email or write to
                  <a href="mailto:${support}" style="color:#c93d1b; text-decoration:underline;">${support}</a>.
                </p>
                <p style="margin:16px 0 0 0; font-family:'IBM Plex Mono', 'Courier New', monospace; font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:#8a7f6d;">
                  Shivam Web Studio &middot; rshivam.dev
                </p>
                <p style="margin:10px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:1.6; color:#8a7f6d;">
                  You received this email because an administrator created a portal account for
                  ${email}. If this was not expected, contact ${support}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderCredentialsText({
  recipientName,
  toEmail,
  temporaryPassword,
  loginUrl,
  supportEmail,
}) {
  return `Hi ${recipientName},

Your portfolio portal access is ready.

Portal: ${loginUrl}
Email: ${toEmail}
Temporary password: ${temporaryPassword}

Security notice: you will be prompted to change this temporary password upon first login. Do not share these credentials with anyone.

Need help? Reply to this email or write to ${supportEmail}.

Shivam Web Studio - rshivam.dev`;
}

/**
 * Send the portal credentials email to a client.
 *
 * @param {object} params
 * @param {string} params.toEmail            Recipient address.
 * @param {string} params.recipientName      Display name used in the greeting.
 * @param {string} params.temporaryPassword  One-time password shown in the email.
 * @param {string} [params.loginUrl]         Portal URL; defaults to APP_BASE_URL + /portal.
 * @returns {Promise<{ messageId: string|null, from: string, replyTo: string }>}
 */
export async function sendClientCredentialsEmail({
  toEmail,
  recipientName,
  temporaryPassword,
  loginUrl,
}) {
  const resend = getResendClient();
  if (!resend) {
    throw new EmailServiceError(
      'Email service is not configured: RESEND_API_KEY is missing.',
      'not_configured'
    );
  }

  const from = getEmailFrom();
  const replyTo = getEmailSupport();
  const portalUrl = loginUrl || getPortalUrl();

  const payload = {
    from: `Shivam Web Studio <${from}>`,
    to: [toEmail],
    replyTo: [replyTo],
    subject: 'Your Access Credentials - Portfolio Portal',
    html: renderCredentialsEmail({
      recipientName,
      toEmail,
      temporaryPassword,
      loginUrl: portalUrl,
      supportEmail: replyTo,
    }),
    text: renderCredentialsText({
      recipientName,
      toEmail,
      temporaryPassword,
      loginUrl: portalUrl,
      supportEmail: replyTo,
    }),
  };

  let result;
  try {
    result = await resend.emails.send(payload);
  } catch (err) {
    throw new EmailServiceError(
      `Resend rejected the request: ${err?.message || 'unknown error'}`,
      'send_failed',
      err
    );
  }

  // Resend SDK v4+ resolves with { data, error } instead of throwing.
  if (result?.error) {
    const detail = result.error.message || result.error.name || 'unknown error';
    throw new EmailServiceError(`Resend rejected the request: ${detail}`, 'send_failed');
  }

  const messageId = result?.data?.id || result?.id || null;
  return { messageId, from, replyTo };
}

export default { sendClientCredentialsEmail, isEmailConfigured };
