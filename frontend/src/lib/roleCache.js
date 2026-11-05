const ROLES_CACHE_KEY = 'portfolio.homeRoles.v1';

export const sanitizeRoles = (roles) =>
  Array.isArray(roles)
    ? roles.map((role) => String(role).trim()).filter(Boolean)
    : [];

export const readCachedRoles = () => {
  try {
    return sanitizeRoles(JSON.parse(localStorage.getItem(ROLES_CACHE_KEY)));
  } catch {
    return [];
  }
};

export const writeCachedRoles = (roles) => {
  try {
    const clean = sanitizeRoles(roles);
    if (clean.length === 0) {
      localStorage.removeItem(ROLES_CACHE_KEY);
      return;
    }
    localStorage.setItem(ROLES_CACHE_KEY, JSON.stringify(clean));
  } catch {
      }
};
