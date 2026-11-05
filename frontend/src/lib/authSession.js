
const ADMIN_KEY = 'auth.admin.session';
const CLIENT_KEY = 'auth.client.session';
export const LAST_ACTIVE_KEY = 'lastActiveTimestamp';
export const SESSION_IDLE_MS = 25 * 60 * 1000;

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(key) {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    store.removeItem(key);
    return null;
  }
}

function writeRaw(key, value) {
  storage()?.setItem(key, JSON.stringify(value));
}

function migrateTabSession(key) {
  const store = storage();
  if (!store || typeof window === 'undefined') return null;
  try {
    const oldRaw = window.sessionStorage.getItem(key);
    if (!oldRaw) return null;
    const parsed = JSON.parse(oldRaw);
    store.setItem(key, JSON.stringify(parsed));
    window.sessionStorage.removeItem(key);
    return parsed;
  } catch {
    return null;
  }
}

function clearSession(key) {
  const store = storage();
  if (!store) return;
  store.removeItem(key);
  if (!readRaw(ADMIN_KEY) && !readRaw(CLIENT_KEY)) store.removeItem(LAST_ACTIVE_KEY);
}

function persistSession(key, value) {
  const beforeSave = getSessionActivityState();
  if (beforeSave.active && beforeSave.expired) clearAllSessions();
  const now = Date.now();
  writeRaw(key, { ...value, issuedAt: value.issuedAt || now, lastActiveAt: now });
  storage()?.setItem(LAST_ACTIVE_KEY, String(now));
  touch();
}

function getStoredSession(key) {
  return readRaw(key) || migrateTabSession(key);
}

function sessionLastActive() {
  const stored = Number(storage()?.getItem(LAST_ACTIVE_KEY) || 0);
  if (stored > 0) return stored;
  const sessions = [getStoredSession(ADMIN_KEY), getStoredSession(CLIENT_KEY)].filter(Boolean);
  return sessions.reduce((latest, session) => Math.max(latest, Number(session.lastActiveAt || session.issuedAt || 0)), 0);
}

function loadSession(key) {
  const session = getStoredSession(key);
  if (!session) return null;
  const lastActive = sessionLastActive();
  if (!lastActive || Date.now() - lastActive > SESSION_IDLE_MS) {
    return null;
  }
  return session;
}

export function touch() {
  const store = storage();
  if (!store) return;
  const now = Date.now();
  store.setItem(LAST_ACTIVE_KEY, String(now));
  [ADMIN_KEY, CLIENT_KEY].forEach((key) => {
    const session = getStoredSession(key);
    if (session) writeRaw(key, { ...session, lastActiveAt: now });
  });
}

export function getSessionActivityState() {
  const admin = getStoredSession(ADMIN_KEY);
  const client = getStoredSession(CLIENT_KEY);
  const lastActiveAt = sessionLastActive();
  const active = Boolean(admin || client);
  return {
    active,
    adminActive: Boolean(admin),
    clientActive: Boolean(client),
    lastActiveAt,
    expired: active && (!lastActiveAt || Date.now() - lastActiveAt > SESSION_IDLE_MS),
  };
}

export const adminSession = {
  get() {
    return loadSession(ADMIN_KEY);
  },
  token() {
    return loadSession(ADMIN_KEY)?.token || null;
  },
  save({ token, role, permissions, name }) {
    persistSession(ADMIN_KEY, {
      token,
      role: role || 'team',
      permissions: Array.isArray(permissions) ? permissions : [],
      name: name || '',
    });
  },
  clear() {
    clearSession(ADMIN_KEY);
  },
};

export const clientSession = {
  get() {
    return loadSession(CLIENT_KEY);
  },
  token() {
    return loadSession(CLIENT_KEY)?.token || null;
  },
  email() {
    return loadSession(CLIENT_KEY)?.email || null;
  },
  save(token, email) {
    const current = loadSession(CLIENT_KEY) || {};
    persistSession(CLIENT_KEY, {
      ...current,
      token: token ?? current.token ?? null,
      email: email ?? current.email ?? null,
    });
  },
  clear() {
    clearSession(CLIENT_KEY);
  },
};

export function hasAnySession() {
  return Boolean(adminSession.get() || clientSession.get());
}

export function clearAllSessions() {
  const store = storage();
  if (!store) return;
  store.removeItem(ADMIN_KEY);
  store.removeItem(CLIENT_KEY);
  store.removeItem(LAST_ACTIVE_KEY);
}
