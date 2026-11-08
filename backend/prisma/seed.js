import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.CRM_SEED_EMAIL;
  const password = process.env.CRM_SEED_PASSWORD;
  const name = process.env.CRM_SEED_NAME || 'CRM Owner';

  if (!email || !password) {
    console.error('❌ CRM_SEED_EMAIL or CRM_SEED_PASSWORD is missing from environment variables.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'superadmin', name },
    create: {
      email,
      name,
      passwordHash,
      role: 'superadmin',
    },
  });

  console.log(`✅ Successfully seeded superadmin: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });