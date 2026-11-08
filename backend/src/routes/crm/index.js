import crypto from 'node:crypto';
import express from 'express';
import { authenticate } from '../../services/crm/auth.service.js';
import { CrmError, crmErrorHandler, notFound } from '../../lib/crm/errors.js';
import { isTrustedOrigin } from '../../lib/security.js';
import { createAuthRouter } from './auth.routes.js';
import { customersRouter } from './customers.routes.js';
import { projectsRouter } from './projects.routes.js';
import { invoicesRouter } from './invoices.routes.js';
import { paymentsRouter } from './payments.routes.js';
import {
  activityRouter,
  auditRouter,
  dashboardRouter,
  ledgerRouter,
  portalRouter,
  teamRouter,
} from './misc.routes.js';

export function createCrmRouter({ authLimiter } = {}) {
  const router = express.Router();
  
  // Safely parse ADMIN_ALLOWED_ORIGIN
  const envAdminOrigins = (process.env.ADMIN_ALLOWED_ORIGIN || '')
    .split(',')
    .map(url => url.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const mutationOrigins = [
    ...envAdminOrigins, 
    process.env.APP_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://rshivam.dev',
    'https://www.rshivam.dev',
  ].filter(Boolean);

  router.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.use((req, _res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (!isTrustedOrigin(req.headers.origin, mutationOrigins)) {
      return next(new CrmError(403, 'ORIGIN_DENIED', 'This request did not come from an approved CRM origin.'));
    }
    return next();
  });

  router.use('/auth', createAuthRouter({ limiter: authLimiter }));

  router.use(authenticate);

  router.use('/customers', customersRouter);
  router.use('/projects', projectsRouter);
  router.use('/invoices', invoicesRouter);
  router.use('/payments', paymentsRouter);
  router.use('/activity', activityRouter);
  router.use('/dashboard', dashboardRouter);
  router.use('/ledger', ledgerRouter);
  router.use('/audit', auditRouter);
  router.use('/team', teamRouter);
  router.use('/portal', portalRouter);

  router.use((req, _res, next) => next(notFound('CRM route not found.')));
  router.use(crmErrorHandler);

  return router;
}