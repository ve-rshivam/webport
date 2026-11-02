# Email System — `rshivam.dev`

Operational reference for every mail path attached to the portfolio: inbound
client replies, human outbound mail, and automated transactional email sent by
the backend.

The application code in this repository owns **only the automated outbound
path** (`backend/src/services/emailService.js` and the
`POST /api/auth/send-credentials` route). Cloudflare Email Routing, the Mailflare
Worker, Backblaze B2 and D1 are external infrastructure configured in those
providers' dashboards; they are documented here because the DNS records and
mailbox layout are shared with this app.

---

## 1. System architecture

Three independent flows share one domain. Keeping them separate is what makes
deliverability predictable: transactional mail never depends on a human mailbox,
and human mail never blocks a password reset.

```
                          rshivam.dev
                               │
        ┌──────────────────────┼──────────────────────────┐
        │                      │                          │
   INBOUND                OUTBOUND (human)          OUTBOUND (automated)
        │                      │                          │
Cloudflare Email Routing   Mailflare Webmail        Node.js / Express backend
        │                  (authenticated via              │
        ▼                   Resend)                       ▼
Mailflare Cloudflare            │                   Resend API
Worker                          │                   (from: noreply@rshivam.dev)
   │            │               │                          │
   ▼            ▼               ▼                          ▼
Backblaze B2   D1 Database   Recipient                Client inbox
(raw MIME +    (indexed      (Reply-To routes        (credentials, OTPs,
 attachments)   metadata)     to contact@)             receipts)
```

### 1.1 Inbound (receiving)

1. Cloudflare Email Routing owns the domain's MX records and accepts mail for
   every delegated mailbox.
2. Each message is handed to the **Mailflare Cloudflare Worker**, which parses
   the MIME body and attachments.
3. Raw messages and attachments are written to **Backblaze B2**; searchable
   metadata (sender, subject, thread, timestamps) is written to **D1**.
4. Mail is read and answered from the Mailflare webmail interface.

No inbound mail is stored in MongoDB, and the Express API never receives raw
inbound messages.

### 1.2 Outbound — human mail

Replies and new conversations are composed in Mailflare Webmail, which
authenticates its outbound sending through Resend. These messages leave from the
delegated human mailbox (`contact@`, `hello@`, `team@`) and are DKIM-signed with
the same `resend._domainkey` selector as transactional mail.

### 1.3 Outbound — automated / backend mail

The Express backend calls the Resend REST API directly through the official
Node SDK. Nothing is queued through Mailflare, so a mail outage in the webmail
layer cannot block a credential or OTP email.

| Property | Value |
| --- | --- |
| Sender | `noreply@rshivam.dev` (`EMAIL_FROM`) |
| Reply-To | `contact@rshivam.dev` (`EMAIL_SUPPORT`) |
| Subject (credentials) | `Your Access Credentials - Portfolio Portal` |
| SDK | `resend` (already a dependency of `backend/package.json`) |
| Service module | `backend/src/services/emailService.js` |
| Route | `POST /api/auth/send-credentials` |

---

## 2. Backend implementation

### 2.1 Service module

`backend/src/services/emailService.js` exposes:

```js
sendClientCredentialsEmail({ toEmail, recipientName, temporaryPassword, loginUrl })
// → { messageId, from, replyTo }
```

Behaviour:

- Lazily creates the Resend client from `RESEND_API_KEY`; if the variable is
  missing it throws an `EmailServiceError` with `code: 'not_configured'` rather
  than crashing the server at boot.
- Normalises `loginUrl`, defaulting to `${APP_BASE_URL}/portal`.
- Sends a responsive, table-based HTML email with a plain-text alternative:
  greeting, credentials box (email + temporary password), primary action button,
  security notice, and a support link to `EMAIL_SUPPORT`.
- Sets `replyTo` to `EMAIL_SUPPORT` so client replies land in the Mailflare
  inbox instead of the no-reply mailbox.
- Escapes interpolated values before they reach the HTML.
- Handles both Resend SDK response shapes (`{ data, error }` and thrown errors)
  and never logs the password, the API key, or the full message body.

### 2.2 Endpoint contract

```
POST /api/auth/send-credentials
Authorization: Bearer <admin JWT>
Content-Type: application/json
```

Request:

```json
{
  "toEmail": "client@example.com",
  "recipientName": "Asha Verma",
  "temporaryPassword": "Tmp-9f2c41ab",
  "loginUrl": "https://rshivam.dev/portal"
}
```

| Field | Required | Validation |
| --- | --- | --- |
| `toEmail` | yes | trimmed, matches `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$` |
| `recipientName` | yes | non-empty after trimming |
| `temporaryPassword` | yes | at least 8 characters |
| `loginUrl` | no | valid `http:`/`https:` URL; defaults to `APP_BASE_URL/portal` |

Success — `200`:

```json
{ "success": true, "messageId": "4ef9a1c2-..." }
```

Errors:

| Status | Body `message` | Cause |
| --- | --- | --- |
| `400` | field-specific validation text | missing or malformed payload |
| `401` / `403` | from `verifyAdminToken` / `checkPerm` | missing, expired or unauthorised token |
| `429` | rate-limit message | too many attempts |
| `502` | "The credentials email could not be sent…" | Resend rejected the send (unverified domain, restricted key, bad recipient) |
| `503` | "Email service is not configured on the server." | `RESEND_API_KEY` missing |

Middleware chain: `authLimiter → verifyAdminToken → checkPerm(['team', 'projects'])`.
Only authenticated admins with `team` or `projects` permission (or any
`superadmin`) can trigger a credential email.

The endpoint **sends** credentials; it does not create the account. Portal
accounts and their bcrypt-hashed keys are managed by
`POST /api/client-projects` and the existing client routes.

### 2.3 Testing the endpoint

```bash
curl -X POST https://<api-host>/api/auth/send-credentials \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toEmail": "client@example.com",
    "recipientName": "Asha Verma",
    "temporaryPassword": "Tmp-9f2c41ab"
  }'
```

A `403 validation_error` mentioning *"You can only send testing emails to your
own email address"* means the Resend key is not attached to a verified domain.
Verify `rshivam.dev` in Resend → Domains and re-send.

---

## 3. Domain authentication & deliverability

All records live in Cloudflare DNS for `rshivam.dev`. Resend requires SPF and
DKIM to be green before it will send from `noreply@rshivam.dev` to arbitrary
recipients.

| Purpose | Type | Name | Value |
| --- | --- | --- | --- |
| Combined SPF | TXT | `@` | `v=spf1 include:_spf.mx.cloudflare.net include:resend.com ~all` |
| DKIM signing | TXT | `resend._domainkey` | 2048-bit public key issued by Resend |
| DMARC policy | TXT | `_dmarc` | `v=DMARC1; p=none;` |
| Inbound routing | MX | `@` | Cloudflare Email Routing MX records (`route1/2/3.mx.cloudflare.net`, priorities 21–23) |

Notes:

- **One SPF record only.** Both Cloudflare Email Routing and Resend are included
  in the same record; a second SPF TXT record breaks the check and is ignored by
  receivers.
- **DKIM** is a single 2048-bit TXT record at `resend._domainkey`, published
  exactly as Resend provides it. Rotating it in Resend means updating this record.
- **DMARC** starts at `p=none` for monitoring. Once reports are clean, tighten to
  `p=quarantine` and add `rua=`/`ruf=` reporting addresses.
- Cloudflare proxying does not apply to mail records; leave MX and TXT records
  DNS-only.

---

## 4. Mailbox delegation

| Address | Owned by | Purpose |
| --- | --- | --- |
| `contact@rshivam.dev` | Mailflare inbox | Client proposals, portfolio inquiries, reply-to for automated mail |
| `hello@rshivam.dev` | Mailflare inbox | Public-facing alias for first-contact messages |
| `team@rshivam.dev` | Mailflare inbox | Internal team collaboration and coordination |
| `noreply@rshivam.dev` | Resend (send-only) | Automated system notifications, OTPs, login credential dispatch |

`noreply@rshivam.dev` is intentionally send-only: it has no human inbox, which is
why every automated message sets `Reply-To: contact@rshivam.dev`.

---

## 5. Environment setup

Add these to `backend/.env` (and to the Render service environment). A copy lives
in `backend/.env.example`; never commit real keys.

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
APP_BASE_URL=https://rshivam.dev
EMAIL_FROM=noreply@rshivam.dev
EMAIL_SUPPORT=contact@rshivam.dev
```

| Variable | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | Full-access or sending-only key on the account that owns the verified `rshivam.dev` domain |
| `APP_BASE_URL` | yes | Public origin used to build the portal link (`/portal` is appended) |
| `EMAIL_FROM` | no | Defaults to `noreply@rshivam.dev`; must be on a verified domain |
| `EMAIL_SUPPORT` | no | Defaults to `contact@rshivam.dev`; used for `Reply-To` and the support line |

`RESEND_API_KEY` is the main key and powers every email route by default,
including the admin alerts and client mail that previously used dedicated keys.
`RESEND_API_KEY_ADMIN` and `RESEND_API_KEY_TEAM` are optional overrides — leave
them blank to reuse the main key. `RESEND_SENDER_EMAIL` is an optional sender
override and falls back to `EMAIL_FROM`, then `noreply@rshivam.dev`.

If a key belongs to an account without a verified `rshivam.dev` domain, Resend
only delivers to that account owner's own address; verify the domain before
sending to real clients.

---

## 6. Security protocols

- **Temporary credentials only.** Credentials emails carry a one-time password,
  never a permanent key. The recipient is forced to set their own password on
  first login.
- **Password expiry.** Temporary passwords are short-lived by policy: if a client
  does not sign in within the issuance window, the admin re-issues credentials
  rather than extending the old ones. Expiry is an operational rule today, not an
  automated scheduled job.
- **Force change on first login.** The portal prompts for a new access key before
  the dashboard is usable; the change is written through
  `POST /api/client/change-password` (or `reset-password-with-otp`).
- **Hashed at rest.** Access keys are stored as bcrypt hashes (`hashedAccessKey`),
  alongside bcrypt-hashed reset OTPs (`resetOtp`) with a 10-minute expiry and an
  attempt counter. Plain-text passwords are never persisted.
- **Zero plain-text credential logging.** Neither `emailService.js` nor the route
  logs the password, the OTP, the API key, or the rendered message body. Errors
  log only a short provider message.
- **Authenticated dispatch.** `POST /api/auth/send-credentials` requires a valid
  admin JWT with `team`/`projects` permission and sits behind the auth rate
  limiter. It is not a public endpoint.
- **Reply-To separation.** Automated mail leaves from `noreply@` but routes
  replies to `contact@`, so inbound replies cannot be mistaken for automated
  system addresses and no-reply mailboxes stay send-only.
- **Least privilege keys.** Use a Resend key scoped to sending only. Rotate it
  immediately if it is exposed, and never expose it to the frontend bundle.
- **SPF/DKIM/DMARC enforced.** All outbound mail is DKIM-signed and SPF-aligned;
  DMARC monitoring catches spoofing attempts against the domain.

---

## 7. Operational checklist

Before sending to a real client:

1. Resend → Domains shows `rshivam.dev` as **Verified** (SPF + DKIM green).
2. `EMAIL_FROM` uses that domain; `noreply@rshivam.dev` is not a local alias that
   forwards somewhere.
3. `RESEND_API_KEY` is set on the deployed backend and the service restarted.
4. A test send to a non-owner address succeeds — a `403` here means the key is
   still in testing mode.
5. `contact@rshivam.dev` receives a reply to the test message (proves `Reply-To`
   and inbound routing).
6. The credentials email renders on mobile width and the portal button opens
   `APP_BASE_URL/portal`.
