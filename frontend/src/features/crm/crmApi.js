import { API_BASE } from '../../lib/api';

const TOKEN_KEY = 'crm.session.token';
const REFRESH_KEY = 'crm.session.refresh';
const ACTOR_KEY = 'crm.session.actor';
const DEVICE_KEY = 'crm.device.id';

export const CRM_BASE = `${API_BASE}/api/v1`;

let memoryDeviceId = null;

function fallbackId() {
  return `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function ensureDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
    const created =
      typeof window.crypto?.randomUUID === 'function'
        ? `dev_${window.crypto.randomUUID().replace(/-/g, '')}`
        : fallbackId();
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    if (!memoryDeviceId) memoryDeviceId = fallbackId();
    return memoryDeviceId;
  }
}

export const crmSession = {
  token() {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  refreshToken() {
    try {
      return window.sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  actor() {
    try {
      const raw = window.sessionStorage.getItem(ACTOR_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(token, actor, refreshToken) {
    try {
      window.sessionStorage.setItem(TOKEN_KEY, token);
      window.sessionStorage.setItem(ACTOR_KEY, JSON.stringify(actor));
      if (refreshToken) window.sessionStorage.setItem(REFRESH_KEY, refreshToken);
    } catch {
      /* storage unavailable */
    }
  },
  saveActor(actor) {
    try {
      window.sessionStorage.setItem(ACTOR_KEY, JSON.stringify(actor));
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(REFRESH_KEY);
      window.sessionStorage.removeItem(ACTOR_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

export class CrmApiError extends Error {
  constructor(message, status = 0, code = 'ERROR') {
    super(message);
    this.name = 'CrmApiError';
    this.status = status;
    this.code = code;
  }
}

function authHeaders(extra = {}) {
  const token = crmSession.token();
  return {
    Accept: 'application/json',
    'X-CRM-Device': ensureDeviceId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

let refreshInFlight = null;

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = crmSession.refreshToken();
  if (!refreshToken) throw new CrmApiError('Session expired. Sign in again.', 401, 'SESSION_EXPIRED');
  refreshInFlight = (async () => {
    let response;
    try {
      response = await fetch(`${CRM_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CRM-Device': ensureDeviceId(),
        },
        body: JSON.stringify({ refreshToken, deviceId: ensureDeviceId() }),
      });
    } catch {
      throw new CrmApiError('Network error while refreshing the session.', 0, 'NETWORK');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data?.token) {
      crmSession.clear();
      window.dispatchEvent(new Event('crm:unauthorized'));
      throw new CrmApiError('Session expired. Sign in again.', 401, 'SESSION_EXPIRED');
    }
    crmSession.save(payload.data.token, payload.data.actor, payload.data.refreshToken);
    return payload.data.token;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function request(path, { method = 'GET', body, signal, retried = false } = {}) {
  let response;
  try {
    response = await fetch(`${CRM_BASE}${path}`, {
      method,
      headers: authHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new CrmApiError('Network error. Check your connection and try again.', 0, 'NETWORK');
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      !retried &&
      !['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'].includes(path) &&
      crmSession.refreshToken()
    ) {
      await refreshAccessToken();
      return request(path, { method, body, signal, retried: true });
    }
    if (response.status === 401) {
      crmSession.clear();
      window.dispatchEvent(new Event('crm:unauthorized'));
    }
    throw new CrmApiError(
      payload?.error?.message || `Request failed (${response.status}).`,
      response.status,
      payload?.error?.code || 'ERROR'
    );
  }

  return payload ?? {};
}

async function blobRequest(path, { retried = false } = {}) {
  let response;
  try {
    response = await fetch(`${CRM_BASE}${path}`, { headers: authHeaders() });
  } catch {
    throw new CrmApiError('Network error while downloading the file.', 0, 'NETWORK');
  }
  if (!response.ok) {
    if (response.status === 401 && !retried && crmSession.refreshToken()) {
      await refreshAccessToken();
      return blobRequest(path, { retried: true });
    }
    if (response.status === 401) {
      crmSession.clear();
      window.dispatchEvent(new Event('crm:unauthorized'));
    }
    let message = `Download failed (${response.status}).`;
    try {
      const payload = await response.json();
      message = payload?.error?.message || message;
    } catch {
      /* non-JSON error */
    }
    throw new CrmApiError(message, response.status, 'DOWNLOAD_FAILED');
  }
  return response.blob();
}

function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const crmApi = {
  login(email, password) {
    return request('/auth/login', {
      method: 'POST',
      body: { email, password, deviceId: ensureDeviceId() },
    });
  },
  forgotPassword(email) {
    return request('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },
  resetPassword(email, otp, newPassword) {
    return request('/auth/reset-password', {
      method: 'POST',
      body: { email, otp, newPassword },
    });
  },
  me() {
    return request('/auth/me');
  },
  logout() {
    return request('/auth/logout', { method: 'POST' });
  },
  dashboard() {
    return request('/dashboard/summary');
  },

  customers(params) {
    return request(`/customers${qs(params)}`);
  },
  customer(id) {
    return request(`/customers/${id}`);
  },
  createCustomer(input) {
    return request('/customers', { method: 'POST', body: input });
  },
  updateCustomer(id, input) {
    return request(`/customers/${id}`, { method: 'PATCH', body: input });
  },
  changeStage(id, input) {
    return request(`/customers/${id}/stage`, { method: 'POST', body: input });
  },
  activity(customerId, params) {
    return request(`/customers/${customerId}/activity${qs(params)}`);
  },
  addActivity(customerId, input) {
    return request(`/customers/${customerId}/activity`, { method: 'POST', body: input });
  },
  globalActivity(params) {
    return request(`/activity${qs(params)}`);
  },

  projects(params) {
    return request(`/projects${qs(params)}`);
  },
  createProject(input) {
    return request('/projects', { method: 'POST', body: input });
  },
  changeProjectStatus(id, input) {
    return request(`/projects/${id}/status`, { method: 'POST', body: input });
  },

  invoices(params) {
    return request(`/invoices${qs(params)}`);
  },
  createInvoice(input) {
    return request('/invoices', { method: 'POST', body: input });
  },
  issueInvoice(id) {
    return request(`/invoices/${id}/issue`, { method: 'POST', body: {} });
  },
  voidInvoice(id, reason) {
    return request(`/invoices/${id}/void`, { method: 'POST', body: { reason } });
  },
  invoiceBlob(id) {
    return blobRequest(`/invoices/${id}/pdf`);
  },

  payments(params) {
    return request(`/payments${qs(params)}`);
  },
  ledger(params) {
    return request(`/ledger${qs(params)}`);
  },
  exportLedger(params) {
    return blobRequest(`/ledger/export${qs(params)}`);
  },
  manualPayment(input) {
    return request('/payments/manual', {
      method: 'POST',
      body: input,
    });
  },
  verifyPayment(id, input = {}) {
    return request(`/payments/${id}/verify`, { method: 'POST', body: input });
  },
  refundPayment(id, input) {
    return request(`/payments/${id}/refund`, { method: 'POST', body: input });
  },
  rejectPayment(id, reason) {
    return request(`/payments/${id}/reject`, { method: 'POST', body: { reason } });
  },
  recycleBin() {
    return request('/payments/recycle-bin');
  },
  restoreProof(id) {
    return request(`/payments/${id}/proof/restore`, { method: 'POST', body: {} });
  },
  purgeProof(id) {
    return request(`/payments/${id}/proof`, { method: 'DELETE' });
  },
  proofBlob(id) {
    return blobRequest(`/payments/${id}/proof`);
  },

  audit(params) {
    return request(`/audit${qs(params)}`);
  },
};