import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '../../.env') });

const globalForPrisma = globalThis;

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured; cannot start the Prisma client.');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });
}

let cached = globalForPrisma.__portfolioPrisma ?? null;

function getClient() {
  if (!cached) {
    cached = createClient();
    if (process.env.NODE_ENV !== 'production') globalForPrisma.__portfolioPrisma = cached;
  }
  return cached;
}

export const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
    has(_target, prop) {
      return prop in getClient();
    },
  }
);

export async function disconnectPrisma() {
  if (cached) {
    await cached.$disconnect();
    cached = null;
    globalForPrisma.__portfolioPrisma = null;
  }
}

export default prisma;
