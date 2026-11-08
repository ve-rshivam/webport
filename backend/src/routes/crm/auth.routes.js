import express from 'express';
import { asyncRoute, badRequest } from '../../lib/crm/errors.js';
import { deviceId as parseDeviceId } from '../../lib/crm/validate.js';
import {
  authenticate,
  login,
  logout,
  parseLoginBody,
  parseRefreshBody,
  refreshSession,
  forgotPassword, 
  resetPassword
} from '../../services/crm/auth.service.js';

export function createAuthRouter({ limiter } = {}) {
  const router = express.Router();
  const limit = typeof limiter === 'function' ? limiter : (_req, _res, next) => next();

  router.post(
    '/login',
    limit,
    asyncRoute(async (req, res) => {
      const { email, password } = parseLoginBody(req.body);
      const headerDevice = req.headers['x-crm-device'];
      const deviceId = parseDeviceId(headerDevice || req.body?.deviceId || '');
      const session = await login({ email, password, deviceId, req });
      return res.json({
        success: true,
        data: {
          token: session.token,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
          refreshExpiresAt: session.refreshExpiresAt,
          actor: session.actor,
          deviceId,
        },
      });
    })
  );

  router.get(
    '/me',
    authenticate,
    asyncRoute(async (req, res) => {
      if (!req.actor) throw badRequest('Authentication required.');
      return res.json({
        success: true,
        data: {
          actor: req.actor,
          session: {
            expiresAt: req.crmSession.expiresAt,
            accessExpiresAt: req.crmSession.accessExpiresAt,
          },
        },
      });
    })
  );

  router.post(
    '/refresh',
    limit,
    asyncRoute(async (req, res) => {
      const { refreshToken } = parseRefreshBody(req.body);
      const headerDevice = req.headers['x-crm-device'];
      const deviceId = parseDeviceId(headerDevice || req.body?.deviceId || '');
      const session = await refreshSession({ refreshToken, deviceId, req });
      return res.json({
        success: true,
        data: {
          token: session.token,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
          refreshExpiresAt: session.refreshExpiresAt,
          actor: session.actor,
        },
      });
    })
  );

  router.post(
    '/logout',
    authenticate,
    asyncRoute(async (req, res) => {
      await logout(req);
      return res.json({ success: true });
    })
  );

  router.post(
    '/forgot-password',
    limit,
    asyncRoute(async (req, res) => {
      const email = req.body?.email;
      if (!email) throw badRequest('Email is required.');
      await forgotPassword(email);
      return res.json({
        success: true,
        message: 'If that email is on file, a reset code has been sent to your inbox.',
      });
    })
  );

  
  router.post(
    '/reset-password',
    limit,
    asyncRoute(async (req, res) => {
      const { email, otp, newPassword } = req.body;
      if (!email || !otp || !newPassword) {
        throw badRequest('Email, OTP, and new password are required.');
      }
      await resetPassword(email, otp, newPassword);
      return res.json({
        success: true,
        message: 'Password updated successfully. You can now log in.',
      });
    })
  );

  return router;
}
