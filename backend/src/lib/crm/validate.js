import { badRequest } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID_RE = /^[A-Za-z0-9_-]{5,64}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const URL_PROTOCOLS = new Set(['http:', 'https:']);

export function body(req) {
  const value = req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value)) {
    throw badRequest('Request body must be a JSON object.');
  }
  return value;
}

export function header(req, name) {
  const raw = req.headers?.[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

export function text(value, field, { min = 1, max = 500, required = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (!required) return undefined;
    throw badRequest(`${field} is required.`);
  }
  const clean = String(value).trim();
  if (clean.length < min) throw badRequest(`${field} must be at least ${min} character(s).`);
  if (clean.length > max) throw badRequest(`${field} must be at most ${max} characters.`);
  return clean;
}

export function optionalText(value, field, { max = 500 } = {}) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  return text(value, field, { max });
}

export function email(value, field = 'email') {
  const clean = text(value, field, { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(clean)) throw badRequest(`${field} must be a valid email address.`);
  return clean;
}

export function identifier(value, field = 'id') {
  const clean = text(value, field, { max: 64 });
  if (!ID_RE.test(clean)) throw badRequest(`${field} is invalid.`);
  return clean;
}

export function deviceId(value) {
  const clean = text(value, 'device id', { max: 128 });
  if (!DEVICE_RE.test(clean)) {
    throw badRequest('A valid device identifier is required.', 'INVALID_DEVICE');
  }
  return clean;
}

export function idempotencyKey(value) {
  const clean = text(value, 'Idempotency-Key', { min: 8, max: 128 });
  if (!/^[A-Za-z0-9:_.-]+$/.test(clean)) {
    throw badRequest('Idempotency-Key contains unsupported characters.');
  }
  return clean;
}

export function enumValue(value, field, allowed, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return undefined;
    throw badRequest(`${field} is required.`);
  }
  const clean = String(value).trim().toUpperCase();
  if (!allowed.includes(clean)) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return clean;
}

export function integer(value, field, { min = 0, max = 100, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return undefined;
    throw badRequest(`${field} is required.`);
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw badRequest(`${field} must be a whole number between ${min} and ${max}.`);
  }
  return num;
}

export function number(value, field, { min = 0, max = 100, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return undefined;
    throw badRequest(`${field} is required.`);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw badRequest(`${field} must be a number between ${min} and ${max}.`);
  }
  return num;
}

export function money(value, field = 'amount') {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw badRequest(`${field} is required.`);
  }
  const clean = String(value).trim().replace(/,/g, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(clean)) {
    throw badRequest(`${field} must be a positive amount with at most two decimals.`);
  }
  const num = Number(clean);
  if (!Number.isFinite(num) || num <= 0) throw badRequest(`${field} must be greater than zero.`);
  return `${Math.round(num * 100) / 100}`;
}

export function nonNegativeMoney(value, field = 'amount') {
  if (value === undefined || value === null || String(value).trim() === '') return '0';
  const clean = String(value).trim().replace(/,/g, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(clean)) {
    throw badRequest(`${field} must be zero or a positive amount with at most two decimals.`);
  }
  return `${Math.round(Number(clean) * 100) / 100}`;
}

export function date(value, field, { required = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (!required) return undefined;
    throw badRequest(`${field} is required.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`${field} must be a valid date.`);
  return parsed;
}

export function url(value, field, { required = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (!required) return null;
    throw badRequest(`${field} is required.`);
  }
  try {
    const parsed = new URL(String(value).trim());
    if (!URL_PROTOCOLS.has(parsed.protocol)) throw new Error('protocol');
    return parsed.toString();
  } catch {
    throw badRequest(`${field} must be a valid http(s) URL.`);
  }
}

export function stringArray(value, field, { max = 10, maxLength = 40 } = {}) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest(`${field} must be a list.`);
  if (value.length > max) throw badRequest(`${field} can contain at most ${max} items.`);
  const items = value.map((entry) => text(entry, field, { max: maxLength }));
  return [...new Set(items)];
}

export function currency(value, fallback = 'INR') {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const clean = String(value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(clean)) throw badRequest('currency must be a three-letter ISO code.');
  return clean;
}

export function queryText(value, field, max = 200) {
  if (value === undefined || value === null) return undefined;
  const clean = String(value).trim();
  if (!clean) return undefined;
  if (clean.length > max) throw badRequest(`${field} is too long.`);
  return clean;
}

export function pagination(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  return { limit, page, skip: (page - 1) * limit };
}
