import bcrypt from 'bcryptjs';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';

const email = String(process.env.CRM_SEED_EMAIL || '').trim().toLowerCase();
const password = String(process.env.CRM_SEED_PASSWORD || '');
const name = String(process.env.CRM_SEED_NAME || 'CRM Owner').trim();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Set CRM_SEED_EMAIL to a valid email address before seeding.');
  process.exit(1);
}
if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error('Set CRM_SEED_PASSWORD to at least 12 characters containing a letter and a number.');
  process.exit(1);
}

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: 'admin',
      crmRole: 'SUPERADMIN',
      crmActive: true,
      passwordHash,
      mustChangePassword: false,
    },
    create: {
      email,
      name,
      role: 'admin',
      crmRole: 'SUPERADMIN',
      crmActive: true,
      passwordHash,
      mustChangePassword: false,
    },
  });

  console.log(`CRM superadmin ready: ${user.email} (${user.id})`);
} catch (err) {
  console.error('CRM seed failed:', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
