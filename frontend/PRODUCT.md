# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 18 (Vite) frontend at `frontend/`, Node/Express backend at `backend/`, Cloud MongoDB Atlas, Resend email, Razorpay payments, deployed on Onrender (backend) and Vercel (frontend). Client portal is a React app route with its own auth flow.

## Users

- **Primary:** prospective clients and collaborators visiting Shivam Kumar's public portfolio, judging fit and reaching out.
- **Secondary:** past/paying clients using the client portal to view project status, payments, delivery date, and message the developer.
- **Tertiary:** admins (email+password then 4-digit PIN) managing resume data, services, messages, reviews, pinned projects, team, and content from `/admin`.

## Product Purpose

A personal portfolio site for a full-stack developer that presents work, skills, experience, and education, and routes real paying client work through a client portal and payment flow. Success means a visitor can quickly understand who Shivam is, what he builds, and how to start a project or hire him, and a paying client can check project status without emailing.

## Positioning

Developer portfolio plus light client-project management: public-facing editorial portfolio pages plus a private client portal tied to payment verification. The differentiating mechanism is that the same site handles marketing (portfolio/resume) and delivery (client portal, payments, messages) for one person's freelance practice.

## Operating Context

- Public site on Vercel; backend API on Onrender at `https://webport-5ru9.onrender.com`.
- SPA routing with `_redirects`/`vercel.json` so deep links do not 404 on refresh.
- Admin auth is 2-step: email/password, then 4-digit PIN (localStorage token `adminToken`).
- Client portal auth is email + access key stored per project; access key can be reset from the portal.
- Email sending is via Resend with graceful no-crash behavior when keys are missing; client email to `support.shivam@gmail.com` is the current verified path.
- Resume data (skills, experience, education, content, pinned projects) is editable in admin and consumed by public pages.

## Capabilities and Constraints

- Public pages: home/editorial masthead, work/projects, about, skills, experience, resume, contact.
- Admin: manage skills, experience, education, services, messages, reviews, pinned projects, team, content, and view client projects/payments.
- Client portal: login with email+access key, view project progress/payments/delivery, message developer, request remaining-balance payment, reset access key.
- Payments: Razorpay order creation + signature verification for new and remaining-balance payments.
- AI chat widget on the site using Google Generative AI.
- Theme toggle (dark/light) with animation.
- First-visit Linux terminal-style intro modal (localStorage-gated).
- Constraints: single developer, small project volume, INR pricing via Razorpay, Resend sandbox/verified-domain email limits.

## Brand Commitments

- Name: Shivam Kumar, "Shivam Web Studio" used in client-facing emails.
- Domain: `rshivam.dev` (public site), backend at `webport-5ru9.onrender.com`.
- Voice: professional, direct, slightly editorial; portfolio copy uses an editorial figure/caption convention ("FIG. 01 — PORTRAIT").
- Identity assets: portrait photo used in hero; Instrument Serif + IBM Plex type system per footer credits.
- Theme: dark/light toggle with animated transition.
- First-visit experience: Linux terminal typing animation intro.

## Evidence on Hand

- Live frontend: `http://localhost:5173` in dev; production on Vercel.
- Backend API: `https://webport-5ru9.onrender.com`.
- Client emails sent to `support.shivam@gmail.com` due to Resend key restriction.
- Admin credentials stored locally in `backend/.env`: `sk8927579@gmail.com` / `TumharaStrongPassword123` / PIN `1941`.
- Client portal access keys per project, generated and emailed on payment verification.
- No testimonials, pricing page, or case studies beyond the portfolio project list.

## Product Principles

1. Show the work first; the portfolio is the front door.
2. Keep client operations (portal, payments, messages) on the same site as the public face.
3. Keep admin editable so the public resume and home stay current without deploys.
4. Fail gracefully: server starts without email keys; portal degrades without live data.
5. Respect the reader's attention: one clear next action per section.

## Accessibility & Inclusion

- Theme toggle should not lose state or break contrast.
- Client portal login and password reset must be usable without admin help.
- Payment flow must handle missing/unverified payments without losing project data.
