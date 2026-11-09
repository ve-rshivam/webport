import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';

// 1. Initialize the PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL is missing from environment variables.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString });

// 2. Initialize the Prisma adapter
const adapter = new PrismaPg(pool);

// 3. Pass the adapter to PrismaClient
const prisma = new PrismaClient({ adapter });

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
    update: { passwordHash, 
          crmRole: 'SUPERADMIN', 
          crmActive: true, 
          name },
    create: {
      email: email.toLowerCase().trim(),
          name,
          passwordHash,
          crmRole: 'SUPERADMIN',
          crmActive: true,
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
    await pool.end(); // Close the pool
  });
  main()
  .then(() => {
    // This tells Node to forcefully exit with a "Success" code
    process.exit(0); 
  })
  .catch((e) => {
    console.error(e);
    // This tells Node to exit with a "Failure" code
    process.exit(1); 
  });   