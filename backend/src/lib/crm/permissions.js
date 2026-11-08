import { forbidden } from './errors.js';

export const PERMISSIONS = Object.freeze({
  CUSTOMERS_READ: 'CUSTOMERS_READ',
  CUSTOMERS_WRITE: 'CUSTOMERS_WRITE',
  PIPELINE_WRITE: 'PIPELINE_WRITE',
  PROJECTS_READ: 'PROJECTS_READ',
  PROJECTS_WRITE: 'PROJECTS_WRITE',
  INVOICES_READ: 'INVOICES_READ',
  INVOICES_WRITE: 'INVOICES_WRITE',
  PAYMENTS_READ: 'PAYMENTS_READ',
  PAYMENTS_WRITE: 'PAYMENTS_WRITE',
  PAYMENTS_VERIFY: 'PAYMENTS_VERIFY',
  ACTIVITY_READ: 'ACTIVITY_READ',
  ACTIVITY_WRITE: 'ACTIVITY_WRITE',
  TEAM_MANAGE: 'TEAM_MANAGE',
  AUDIT_READ: 'AUDIT_READ',
  EXPORT_DATA: 'EXPORT_DATA',
  PORTAL_READ: 'PORTAL_READ',
});

const ALL = Object.freeze(Object.values(PERMISSIONS));

export const ROLE_PERMISSIONS = Object.freeze({
  SUPERADMIN: ALL,
  ADMIN: ALL.filter((permission) => permission !== PERMISSIONS.TEAM_MANAGE),
  TEAM: Object.freeze([
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.CUSTOMERS_WRITE,
    PERMISSIONS.PIPELINE_WRITE,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.PROJECTS_WRITE,
    PERMISSIONS.INVOICES_READ,
    PERMISSIONS.INVOICES_WRITE,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_WRITE,
    PERMISSIONS.ACTIVITY_READ,
    PERMISSIONS.ACTIVITY_WRITE,
    PERMISSIONS.PORTAL_READ,
  ]),
  CLIENT: Object.freeze([PERMISSIONS.PORTAL_READ]),
});

export const CRM_ROLES = Object.freeze(['SUPERADMIN', 'ADMIN', 'TEAM', 'CLIENT']);

export function effectivePermissions(role, overrides = []) {
  if (!CRM_ROLES.includes(role)) return [];
  if (role === 'SUPERADMIN') return ALL.slice();
  const base = new Set(ROLE_PERMISSIONS[role] ?? []);
  for (const permission of overrides) {
    if (ALL.includes(permission)) base.add(permission);
  }
  return [...base];
}

export function hasPermission(actor, permission) {
  if (!actor) return false;
  if (actor.role === 'SUPERADMIN') return true;
  return Array.isArray(actor.permissions) && actor.permissions.includes(permission);
}

export function hasAnyPermission(actor, permissions) {
  return permissions.some((permission) => hasPermission(actor, permission));
}

export function assertPermission(actor, permission) {
  if (!hasPermission(actor, permission)) {
    throw forbidden(`This action requires the ${permission} permission.`);
  }
}

export function requirePermission(...permissions) {
  return function permissionGuard(req, _res, next) {
    if (!req.actor) return next(forbidden('Authentication required.'));
    const missing = permissions.filter((permission) => !hasPermission(req.actor, permission));
    if (missing.length) {
      return next(forbidden(`This action requires the ${missing.join(', ')} permission.`));
    }
    return next();
  };
}

export function requireAny(...permissions) {
  return function anyPermissionGuard(req, _res, next) {
    if (!req.actor) return next(forbidden('Authentication required.'));
    if (!hasAnyPermission(req.actor, permissions)) {
      return next(forbidden(`This action requires one of: ${permissions.join(', ')}.`));
    }
    return next();
  };
}

export function can(actor, permission) {
  return hasPermission(actor, permission);
}
