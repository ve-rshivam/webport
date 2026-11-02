# webport — Portfolio & Client Portal

Personal portfolio, admin CMS, client portal and payment flow for **Shivam Kumar**
(`rshivam.dev`). The site doubles as a small client-services business: visitors
can read the work, send an inquiry, pay for a build, and then follow that build
through a password-protected portal.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, React Router 7, Tailwind CSS 4, Framer Motion, Three.js |
| Backend | Node.js (ESM), Express 4, MongoDB via Mongoose, JWT + bcrypt, Helmet, rate limiting |
| Email | Resend API (transactional), Cloudflare Email Routing + Mailflare (human inboxes) |
| Payments | Razorpay (primary), PayPal SDK |
| Hosting | Frontend: Vercel static SPA · Backend: Render |

## Repository layout

```
backend/
  server.js                     Express app, routes, Mongoose models
  src/services/emailService.js  Resend transactional email service
frontend/
  src/pages/                    Route-level pages (Home, Admin, ClientPortal, …)
  src/components/               Shared UI
  src/lib/api.js                API client (VITE_API_URL with deployment fallback)
EMAIL_SYSTEM.md                 Inbound/outbound mail architecture and DNS spec
PROJECT_PLAN.md                 Working audit and roadmap (not part of the product)
```

## Run locally

```bash
# Backend — needs backend/.env (see backend/.env.example)
cd backend
npm install
npm start                     # http://localhost:5000 (or PORT)

# Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
npm run build                 # production bundle in frontend/dist
npm run lint
```

Set `VITE_API_URL` in `frontend/.env` to point the SPA at a local API. When it is
unset the client falls back to the deployed Render API so a fresh clone works
without configuration.

## Environment

Copy `backend/.env.example` to `backend/.env` and fill in the values. Secrets are
never committed. The transactional email variables are:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
APP_BASE_URL=https://rshivam.dev
EMAIL_FROM=noreply@rshivam.dev
EMAIL_SUPPORT=contact@rshivam.dev
```

`RESEND_API_KEY` must belong to a Resend account with `rshivam.dev` verified
(SPF, DKIM, DMARC). Without a verified domain, Resend only delivers to the
account owner's own address. See [EMAIL_SYSTEM.md](EMAIL_SYSTEM.md) for the full
DNS, mailbox and deliverability specification.

## API surface (selected)

| Area | Endpoints |
| --- | --- |
| Health | `GET /`, `GET /ping` |
| Content & resume | `GET /api/content`, `GET /api/resume-data`, `/api/skill`, `/api/education`, `/api/experience` |
| Projects & services | `/api/pinned-projects`, `/api/services` |
| Reviews & messages | `/api/reviews`, `/api/messages` |
| Admin auth | `/api/admin/login`, `/api/admin/verify-2fa`, `/api/admin/forgot-password`, `/api/admin/reset-password` |
| Admin operations | `/api/admin/team`, `/api/admin/update-security`, `/api/client-projects` |
| Client portal | `/api/client/login`, `/api/client/get-projects`, `/api/client/forgot-password`, `/api/client/reset-password-with-otp`, `/api/client/change-password`, `/api/client/send-message` |
| Email | `POST /api/auth/send-credentials` (admin only) |
| Payments | `/api/payment/razorpay-order`, `/api/payment/gateway-success` |

Admin and client write endpoints require a JWT; portal credentials are stored as
bcrypt hashes, never as plain text.

## Email

Automated mail (portal credentials, OTPs, payment confirmations, admin alerts) is
sent from the Express backend through the Resend API. Human replies are routed to
`contact@rshivam.dev` via `Reply-To`, while inbound mail to the domain is handled
by Cloudflare Email Routing and read through Mailflare.

Full details — architecture, DNS records, mailbox delegation, endpoint contract
and security protocols — are in [EMAIL_SYSTEM.md](EMAIL_SYSTEM.md).

## Deployment notes

- **Frontend (Vercel):** `vercel.json` rewrites every unknown path to
  `index.html`, and `vite.config.js` emits `dist/_redirects`, so deep links such
  as `/portal` and `/admin` survive a refresh.
- **Backend (Render):** add every variable from `backend/.env.example` to the
  service environment. Free instances cold-start, so the first request after
  idle time can take a few seconds.
- **Email:** verify `rshivam.dev` in Resend → Domains before sending to real
  clients. A key without a verified domain returns
  `403 validation_error: You can only send testing emails to your own email address`.

## Documentation

- [EMAIL_SYSTEM.md](EMAIL_SYSTEM.md) — mail architecture, DNS, mailboxes, security
- [PROJECT_PLAN.md](PROJECT_PLAN.md) — internal audit and roadmap
