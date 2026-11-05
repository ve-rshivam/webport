
export function sendError(res, err, fallback = 'Request failed.') {
  const status = err?.status ?? (err?.code === 'P2002' ? 409 : 500);
  if (status >= 500) {
    console.error('[api]', err?.name ?? 'Error', err?.message ?? err);
  }
  const message = status >= 500 ? fallback : err?.message ?? fallback;
  if (!res.headersSent) res.status(status).json({ success: false, message });
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
