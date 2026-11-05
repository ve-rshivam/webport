
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'validation_error';
    this.status = status;
  }
}

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
    this.code = 'not_configured';
    this.status = 503;
  }
}

export function validateEmail(value, fieldName = 'email') {
  if (value === undefined || value === null) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  const trimmed = String(value).trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    throw new ValidationError(`${fieldName} must be a valid email address.`);
  }
  return trimmed;
}

export function validateRequiredString(value, fieldName, minLength = 1, maxLength = 5000) {
  if (value === undefined || value === null) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  const trimmed = String(value).trim();
  if (trimmed.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} character(s).`);
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} must be at most ${maxLength} characters.`);
  }
  return trimmed;
}

export function validatePassword(value, fieldName = 'password') {
  const password = validateRequiredString(value, fieldName, 8, 128);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ValidationError(`${fieldName} must contain at least one letter and one number.`);
  }
  return password;
}

export function validateOptionalUrl(value, fieldName = 'url') {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  try {
    const parsed = new URL(String(value).trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
    return parsed.toString();
  } catch {
    throw new ValidationError(`${fieldName} must be a valid http(s) URL.`);
  }
}

export function validateNonNegativeNumber(value, fieldName = 'amount') {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative number.`);
  }
  return num;
}

export function requireJsonBody(req, label = 'Request body') {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) {
    throw new ValidationError(`${label} must be a JSON object.`);
  }
  return body;
}

export function pickStrings(body, ...keys) {
  const out = {};
  for (const key of keys) {
    const value = body?.[key];
    const s = value === undefined || value === null ? '' : String(value).trim();
    out[key] = s === '' ? undefined : s;
  }
  return out;
}

export function parseBoolean(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  return false;
}
