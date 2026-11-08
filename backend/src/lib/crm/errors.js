export class CrmError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'CrmError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, code = 'VALIDATION_ERROR', details = null) =>
  new CrmError(400, code, message, details);
export const unauthorized = (message = 'Authentication required.') =>
  new CrmError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do that.') =>
  new CrmError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') =>
  new CrmError(404, 'NOT_FOUND', message);
export const conflict = (message, code = 'CONFLICT') =>
  new CrmError(409, code, message);
export const tooManyRequests = (message = 'Too many requests. Try again later.') =>
  new CrmError(429, 'RATE_LIMITED', message);

const PRISMA_STATUS = {
  P2002: [409, 'CONFLICT'],
  P2003: [409, 'RELATION_CONFLICT'],
  P2025: [404, 'NOT_FOUND'],
};

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function sendCrmError(res, err) {
  let status = err?.status;
  let code = err?.code;

  if (!status && PRISMA_STATUS[err?.code]) {
    [status, code] = PRISMA_STATUS[err.code];
  }

  status = status && Number.isInteger(status) ? status : 500;
  code = typeof code === 'string' && code ? code : 'INTERNAL_ERROR';
  if (status >= 500) {
    console.error('[crm]', err?.name ?? 'Error', err?.message ?? err);
  }

  const message =
    status >= 500 ? 'Something went wrong on our side.' : err?.message ?? 'Request failed.';

  if (res.headersSent) return;
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(err?.details ? { details: err.details } : {}),
      ...(res.req?.id ? { requestId: res.req.id } : {}),
    },
  });
}

export function crmErrorHandler(err, req, res, _next) {
  sendCrmError(res, err);
}
