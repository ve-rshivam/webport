import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { badRequest, unauthorized, forbidden, CrmError } from '../../lib/crm/errors.js';
import { effectivePermissions } from '../../lib/crm/permissions.js';
import { recordCrmAudit, CRM_AUDIT } from '../../lib/crm/audit.js';
import { clientIp, ipSubnet, userAgent } from '../../lib/security.js';
import { sendEmail, getSupportEmail } from '../email.service.js';

export const DEVICE_HEADER = 'x-crm-device';
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 7;

let dummyHash = null;
function timingDummyHash() {
  if (!dummyHash) dummyHash = bcrypt.hashSync('crm-timing-placeholder', 12);
  return dummyHash;
}

function sessionSecret() {
  const secret = process.env.CRM_SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new CrmError(503, 'NOT_CONFIGURED', 'Session secret is not configured.');
  return secret;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function hashSubnet(req) {
  const subnet = ipSubnet(clientIp(req));
  return crypto.createHmac('sha256', sessionSecret()).update(`subnet|${subnet}`).digest('hex');
}

function hashDevice(deviceId, req) {
  const material = `${deviceId}|${String(userAgent(req) ?? '').toLowerCase()}|${ipSubnet(clientIp(req))}`;
  return crypto.createHmac('sha256', sessionSecret()).update(material).digest('hex');
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a ?? ''), 'hex');
  const right = Buffer.from(String(b ?? ''), 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function newRefreshToken() {
  return `crmr_${crypto.randomBytes(32).toString('base64url')}`;
}

function accessExpiryDate() {
  return new Date(Date.now() + ACCESS_TTL_SECONDS * 1000);
}

function issueAccessToken(user, session) {
  return jwt.sign(
    {
      sub: user.id,
      sid: session.id,
      role: user.crmRole,
      typ: 'crm_access',
      fp: session.deviceHash,
    },
    sessionSecret(),
    { algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS }
  );
}

export function actorFromUser(user) {
  const role = user.crmRole;
  if (!role) throw unauthorized('This account is not enabled for the CRM.');
  const overrides = (user.crmPermissions ?? []).map((row) => row.permission);
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role,
    permissions: effectivePermissions(role, overrides),
  };
}

async function loadFullUser(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { crmPermissions: { select: { permission: true } } },
  });
}

async function createSession({ user, deviceId, req }) {
  const refreshToken = newRefreshToken();
  const refreshExpiresAt = new Date(
    Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  const deviceHash = hashDevice(deviceId, req);

  const session = await prisma.crmSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      deviceHash,
      userAgent: userAgent(req),
      ipAddress: clientIp(req),
      ipSubnetHash: hashSubnet(req),
      expiresAt: refreshExpiresAt,
      lastSeenAt: new Date(),
    },
  });

  const accessToken = issueAccessToken(user, session);
  return {
    token: accessToken,
    refreshToken,
    expiresAt: accessExpiryDate(),
    refreshExpiresAt,
    sessionId: session.id,
  };
}

export async function login({ email, password, deviceId, req }) {
  const identifier = String(email ?? '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: identifier } });

  const hash = user?.passwordHash || timingDummyHash();
  const matches = await bcrypt.compare(String(password ?? ''), hash).catch(() => false);
  const enabled = Boolean(user && user.crmActive && user.crmRole);

  if (!user || !matches || !enabled) {
    await recordCrmAudit({
      action: CRM_AUDIT.LOGIN_FAILED,
      actorRole: 'anonymous',
      targetEmail: identifier.slice(0, 254),
      outcome: 'FAILED',
      req,
      metadata: { reason: !user ? 'unknown_account' : !enabled ? 'crm_disabled' : 'bad_password' },
    });
    throw unauthorized('Invalid email or password.');
  }

  const session = await createSession({ user, deviceId, req });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const fullUser = await loadFullUser(user.id);
  const actor = actorFromUser(fullUser);

  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.LOGIN_SUCCESS,
    entityType: 'CrmSession',
    entityId: session.sessionId,
    req,
    metadata: { deviceBound: true, ipSubnetBound: true, jwt: true },
  });

  return { ...session, actor };
}

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw unauthorized();

    const token = header.slice(7).trim();
    let payload;
    try {
      payload = jwt.verify(token, sessionSecret(), { algorithms: ['HS256'] });
    } catch {
      throw new CrmError(401, 'SESSION_INVALID', 'Your session is invalid or expired. Sign in again.');
    }

    if (!payload || payload.typ !== 'crm_access' || !payload.sid || !payload.sub) {
      throw new CrmError(401, 'SESSION_INVALID', 'Your session is invalid. Sign in again.');
    }

    const session = await prisma.crmSession.findUnique({
      where: { id: String(payload.sid) },
      include: {
        user: { include: { crmPermissions: { select: { permission: true } } } },
      },
    });

    if (!session || session.revokedAt) {
      throw new CrmError(401, 'SESSION_REVOKED', 'Your session is no longer valid. Sign in again.');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new CrmError(401, 'SESSION_EXPIRED', 'Your session expired. Sign in again.');
    }
    if (!session.user.crmActive || !session.user.crmRole) {
      throw forbidden('This account is not enabled for the CRM.');
    }

    const deviceId = req.headers[DEVICE_HEADER];
    if (!deviceId) {
      throw new CrmError(401, 'DEVICE_REQUIRED', 'This session is bound to a device. Sign in again.');
    }

    const recomputedDevice = hashDevice(deviceId, req);
    if (
      !safeEqualHex(recomputedDevice, session.deviceHash) ||
      !safeEqualHex(String(payload.fp ?? ''), session.deviceHash)
    ) {
      await recordCrmAudit({
        action: CRM_AUDIT.SESSION_DEVICE_MISMATCH,
        actorRole: session.user.crmRole,
        targetEmail: session.user.email,
        outcome: 'DENIED',
        req,
        metadata: { sessionId: session.id },
      });
      await prisma.crmSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new CrmError(401, 'DEVICE_MISMATCH', 'This session was used from a different device or network. Sign in again.');
    }

    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      prisma.crmSession
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }

    req.actor = actorFromUser(session.user);
    req.crmSession = {
      id: session.id,
      expiresAt: session.expiresAt,
      accessExpiresAt: payload.exp ? new Date(payload.exp * 1000) : accessExpiryDate(),
    };
    next();
  } catch (err) {
    console.error("AUTH_DEBUG_ERROR:", err.message, err.code); 
    next(err);
  }
}

export async function forgotPassword(email) {
  const normalizedEmail = String(email ?? '').toLowerCase().trim();
  if (!normalizedEmail) throw badRequest('Email is required.');

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  
  // Do not reveal if the user exists or not
  if (!user || !user.crmActive) return;

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const salt = await bcrypt.genSalt(12);
  const hashedOtp = await bcrypt.hash(otp, salt);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetOtpHash: hashedOtp,
      resetOtpExpiry: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
      resetOtpAttempts: 0
    }
  });

  try {
    await sendEmail({
      to: user.email,
      subject: "CRM Password Reset Code",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Hi ${user.name || 'Admin'},</h2>
          <p>Your password reset code for the CRM is:</p>
          <h1 style="color: #00e5ff; letter-spacing: 5px;">${otp}</h1>
          <p style="color: red; font-size: 14px;">This code is valid for 10 minutes.</p>
        </div>
      `
    });
  } catch (error) {
    console.error("Failed to send reset OTP email:", error);
  }
}

export async function resetPassword(email, otp, newPassword) {
  const normalizedEmail = String(email ?? '').toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || !user.resetOtpHash || !user.resetOtpExpiry) {
    throw badRequest('No pending reset code. Request a new one.');
  }

  if (new Date(user.resetOtpExpiry).getTime() < Date.now()) {
    throw badRequest('The reset code has expired. Request a new one.');
  }

  if (user.resetOtpAttempts >= 5) {
    throw new CrmError(429, 'LOCKED_OTP', 'Too many incorrect attempts. Request a new reset code.');
  }

  const isMatch = await bcrypt.compare(String(otp), user.resetOtpHash);
  if (!isMatch) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetOtpAttempts: { increment: 1 } }
    });
    throw badRequest('Incorrect reset code.');
  }

  if (String(newPassword).length < 8) {
     throw badRequest('Password must be at least 8 characters long.');
  }

  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(String(newPassword), salt);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashedPassword,
      crmActive: true,         
      crmRole: 'SUPERADMIN',
      resetOtpHash: null,
      resetOtpExpiry: null,
      resetOtpAttempts: 0,
      sessionToken: null,
      sessionTokenExpiry: null
    }
  });

  // Revoke all existing CRM sessions for this user
  await prisma.crmSession.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function refreshSession({ refreshToken, deviceId, req }) {
  const rawToken = String(refreshToken ?? '').trim();
  if (!rawToken) throw badRequest('Refresh token is required.');
  if (!deviceId) throw badRequest('A device identifier is required.', 'INVALID_DEVICE');

  const current = await prisma.crmSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      user: { include: { crmPermissions: { select: { permission: true } } } },
    },
  });
  if (!current || current.revokedAt) {
    throw new CrmError(401, 'SESSION_REVOKED', 'Your session is no longer valid. Sign in again.');
  }
  if (current.expiresAt.getTime() <= Date.now()) {
    throw new CrmError(401, 'SESSION_EXPIRED', 'Your session expired. Sign in again.');
  }
  if (!current.user.crmActive || !current.user.crmRole) {
    throw forbidden('This account is not enabled for the CRM.');
  }
  if (!safeEqualHex(hashDevice(deviceId, req), current.deviceHash)) {
    await prisma.crmSession.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });
    throw new CrmError(401, 'DEVICE_MISMATCH', 'This session was used from a different device. Sign in again.');
  }

  const claimed = await prisma.crmSession.updateMany({
    where: { id: current.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new CrmError(401, 'SESSION_REVOKED', 'This refresh token was already used. Sign in again.');
  }
  const next = await createSession({ user: current.user, deviceId, req });

  const actor = actorFromUser(current.user);
  await recordCrmAudit({
    actor,
    action: CRM_AUDIT.SESSION_REFRESHED,
    entityType: 'CrmSession',
    entityId: next.sessionId,
    req,
    metadata: { previousSessionId: current.id, rotated: true },
  });

  return { ...next, actor };
}

export async function logout(req) {
  await prisma.crmSession.update({
    where: { id: req.crmSession.id },
    data: { revokedAt: new Date() },
  });
  await recordCrmAudit({ actor: req.actor, action: CRM_AUDIT.LOGOUT, req });
}

export function requireActor(req) {
  if (!req.actor) throw unauthorized();
  return req.actor;
}

export function assertNotClient(actor) {
  if (actor.role === 'CLIENT') throw forbidden('Client accounts use the portal.');
}

export function parseLoginBody(input) {
  const email = String(input?.email ?? '').trim().toLowerCase();
  const password = String(input?.password ?? '');
  if (!email || !password) throw badRequest('Email and password are required.');
  if (email.length > 254 || password.length > 128) throw badRequest('Invalid credentials.');
  return { email, password };
}

export function parseRefreshBody(input) {
  const refreshToken = String(input?.refreshToken ?? '').trim();
  if (!refreshToken || refreshToken.length < 20 || refreshToken.length > 256) {
    throw badRequest('A valid refresh token is required.');
  }
  return { refreshToken };
}
