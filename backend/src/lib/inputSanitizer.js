import { ValidationError } from '../services/validators.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_DEPTH = 10;
const MAX_KEYS = 300;
const MAX_ARRAY = 500;
const MAX_STRING = 5_000_000;

function assertSafeKey(key, path) {
  if (typeof key !== 'string') return;
  if (FORBIDDEN_KEYS.has(key)) {
    throw new ValidationError(`Unsafe object key rejected at ${path}.`);
  }
  if (key.startsWith('$') || key.includes('.')) {
    throw new ValidationError(`Unsafe object key rejected at ${path}.`);
  }
}

function inspect(value, path, depth, budget) {
  if (depth > MAX_DEPTH) {
    throw new ValidationError(`Request nesting is too deep at ${path}.`);
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) {
      throw new ValidationError(`Request value is too large at ${path}.`);
    }
    return;
  }
  if (value === null || value === undefined || typeof value !== 'object') return;
  if (Buffer.isBuffer(value)) return;

  budget.keys += 1;
  if (budget.keys > MAX_KEYS) {
    throw new ValidationError('Request contains too many fields.');
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) {
      throw new ValidationError(`Request array is too large at ${path}.`);
    }
    value.forEach((entry, index) => inspect(entry, `${path}[${index}]`, depth + 1, budget));
    return;
  }

  for (const key of Object.keys(value)) {
    assertSafeKey(key, `${path}.${key}`);
    inspect(value[key], `${path}.${key}`, depth + 1, budget);
  }
}

export function sanitizeRequest(req, _res, next) {
  try {
    inspect(req.body, 'body', 0, { keys: 0 });
    inspect(req.query, 'query', 0, { keys: 0 });
    inspect(req.params, 'params', 0, { keys: 0 });
    next();
  } catch (err) {
    next(err);
  }
}
