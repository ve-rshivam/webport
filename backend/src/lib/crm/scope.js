import { prisma } from '../prisma.js';
import { notFound } from './errors.js';

export async function accessibleCustomerIds(actor, client = prisma) {
  if (!actor) return [];
  if (actor.role !== 'CLIENT') return null;
  const rows = await client.customerUser.findMany({
    where: { userId: actor.id, customer: { deletedAt: null } },
    select: { customerId: true },
  });
  return rows.map((row) => row.customerId);
}

export function scopedCustomerWhere(ids, extra = {}) {
  return ids === null ? { ...extra } : { ...extra, id: { in: ids } };
}

export async function assertCustomerAccess(actor, customerId, client = prisma) {
  const ids = await accessibleCustomerIds(actor, client);
  const customer = await client.customer.findFirst({
    where: scopedCustomerWhere(ids, { id: customerId, deletedAt: null }),
  });
  if (!customer) throw notFound('Customer not found.');
  return customer;
}
