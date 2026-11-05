
import { prisma } from './prisma.js';

const PRISMA_MISSING_SCHEMA = new Set(['P2021', 'P2022']);

export async function claimWebhookEvent({ gateway, eventId }) {
  const id = String(eventId ?? '').trim();
  if (!id) return { duplicate: false, release: async () => {} };

  try {
    const record = await prisma.processedWebhook.create({
      data: { gateway, eventId: id.slice(0, 200) },
    });
    return {
      duplicate: false,
      record,
      release: async () => {
        try {
          await prisma.processedWebhook.delete({ where: { id: record.id } });
        } catch {
                            }
      },
    };
  } catch (err) {
    if (err?.code === 'P2002') return { duplicate: true, release: async () => {} };
    if (PRISMA_MISSING_SCHEMA.has(err?.code)) {
            return { duplicate: false, release: async () => {} };
    }
    throw err;
  }
}
