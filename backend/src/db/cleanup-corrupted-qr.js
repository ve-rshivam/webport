import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not configured.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ['error'],
});

function isCorrupted(details) {
  if (!details || typeof details !== 'object') return false;
  const d = details;
  const status = d.status === 'pending';
  if (!status) return false;
  const amount = Number(d.amount ?? 0);
  if (Number.isFinite(amount) && amount > 0) return false;
  const ref = typeof d.transactionRef === 'string' ? d.transactionRef.trim() : '';
  if (ref.length > 0 && ref.toLowerCase() !== 'n/a') return false;
  return true;
}

async function main() {
  console.log('Scanning for corrupted PENDING QR-payment-proof records…');

  const corrupted = await prisma.adminAlert.findMany({
    where: {
      type: 'qr_submission',
    },
    select: {
      id: true,
      details: true,
    },
  });

  const toDelete = corrupted.filter((alert) => isCorrupted(alert.details));

  console.log(`Found ${toDelete.length} corrupted record(s) to delete.`);

  for (const alert of toDelete) {
    await prisma.adminAlert.delete({ where: { id: alert.id } });
    const d = alert.details ?? {};
    console.log(
      `Deleted alert ${alert.id}: ${d.email ?? 'no-email'} · INR ${d.amount ?? 0} · Ref: ${d.transactionRef ?? 'n/a'}`
    );
  }

  console.log('Done.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
