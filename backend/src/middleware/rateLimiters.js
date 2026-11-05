import rateLimit, { ipKeyGenerator } from 'express-rate-limit';


export function rateLimitsEnabled() {
  return String(process.env.ENABLE_RATE_LIMITS ?? 'true').trim().toLowerCase() !== 'false';
}

function passThrough(_req, _res, next) {
  return next();
}

export function withRateLimit(limiter) {
  return function rateLimited(req, res, next) {
    if (!rateLimitsEnabled()) return passThrough(req, res, next);
    return limiter(req, res, next);
  };
}

const emailOrIpKey = (req) => {
  const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim().toLowerCase();
  return `${identifier || 'anonymous'}:${ipKeyGenerator(req.ip ?? '')}`;
};

const userOrIpKey = (req) => req.user?.id || req.admin?.id || ipKeyGenerator(req.ip ?? '');

// [RATE LIMITER - GLOBAL]
export const globalLimiter = withRateLimit(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, try again later.' },
  })
);

// [RATE LIMITER - LOGIN]
export const authLimiter = withRateLimit(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: emailOrIpKey,
    message: { success: false, message: 'Too many authentication attempts. Try again in 15 minutes.' },
  })
);

// [RATE LIMITER - OTP/EMAIL]
export const otpEmailLimiter = withRateLimit(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: emailOrIpKey,
    message: { success: false, message: 'Too many reset/OTP requests. Please try again in 15 minutes.' },
  })
);

// [RATE LIMITER - PAYMENT]
export const paymentOrderLimiter = withRateLimit(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many payment orders created. Please wait before retrying.' },
  })
);

// [RATE LIMITER - QR UPLOAD]
export const qrUploadLimiter = withRateLimit(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many payment screenshots uploaded. Please try again later.' },
  })
);

// [RATE LIMITER - AI CHAT]
export const chatLimiter = withRateLimit(
  rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many chat messages. Please wait a minute.' },
  })
);

// [RATE LIMITER - MESSAGES]
export const messageLimiter = withRateLimit(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many messages sent. Please try again in a few minutes.' },
  })
);

// [RATE LIMITER - PDF INVOICE]
export const invoiceDownloadLimiter = withRateLimit(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userOrIpKey,
    message: { success: false, message: 'Too many invoice downloads. Please try again in 15 minutes.' },
  })
);

export default {
  withRateLimit,
  rateLimitsEnabled,
  globalLimiter,
  authLimiter,
  otpEmailLimiter,
  paymentOrderLimiter,
  qrUploadLimiter,
  chatLimiter,
  messageLimiter,
  invoiceDownloadLimiter,
};
