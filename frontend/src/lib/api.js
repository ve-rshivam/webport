const DEFAULT_API_BASE = '';

export const API_BASE = (import.meta.env.VITE_API_URL || DEFAULT_API_BASE).replace(/\/+$/, '');

export const apiUrl = (path = '') => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

import { clientSession } from './authSession';

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const portalSession = {
  getToken() {
    return clientSession.token();
  },
  getEmail() {
    return clientSession.email();
  },
  save(token, email) {
    clientSession.save(token, email);
  },
  clear() {
    clientSession.clear();
        try {
      ['clientLoggedIn', 'clientEmail', 'clientProjectsList'].forEach((key) =>
        localStorage.removeItem(key)
      );
    } catch {
          }
  },
};

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiRequest(path, { method = 'GET', body, auth = false, headers, signal } = {}) {
  const finalHeaders = { Accept: 'application/json', ...(headers || {}) };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (auth) {
    const token = portalSession.getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    if (response.status === 401 && auth) portalSession.clear();
    throw new ApiError(payload?.message || `Request failed (${response.status}).`, response.status);
  }

  return payload ?? {};
}

export async function apiGet(path, options = {}) {
  return apiRequest(path, { ...options, method: options.method || 'GET' });
}

export const portalApi = {
  login: (email, password) =>
    apiRequest('/api/portal/login', { method: 'POST', body: { email, password } }),

  me: () => apiRequest('/api/portal/me', { auth: true }),

  setPassword: (password) =>
    apiRequest('/api/portal/set-password', { method: 'POST', body: { password }, auth: true }),

  forgotPassword: (email) =>
    apiRequest('/api/portal/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (email, otp, newPassword) =>
    apiRequest('/api/portal/reset-password', { method: 'POST', body: { email, otp, newPassword } }),

  resetPasswordWithToken: (token, password) =>
    apiRequest('/api/portal/reset-password-with-token', { method: 'POST', body: { token, password } }),

  logout: () => apiRequest('/api/portal/logout', { method: 'POST', auth: true }),

  logoutAll: () => apiRequest('/api/portal/logout-all', { method: 'POST', auth: true }),

  listMessages: (projectId) =>
    apiRequest(
      `/api/portal/messages${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
      { auth: true }
    ),

  sendMessage: (projectId, body, subject) =>
    apiRequest('/api/portal/messages', {
      method: 'POST',
      body: { projectId, body, ...(subject ? { subject } : {}) },
      auth: true,
    }),
};
