const FALLBACK_API_BASE = 'https://webport-5ru9.onrender.com';

export const API_BASE = (import.meta.env.VITE_API_URL || FALLBACK_API_BASE).replace(/\/+$/, '');

export const apiUrl = (path = '') => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

export async function apiGet(path, options = {}) {
  const response = await fetch(apiUrl(path), options);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${path}`);
  }

  return response.json();
}
