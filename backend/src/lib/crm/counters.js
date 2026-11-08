export async function nextSequence(tx, key) {
  const row = await tx.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
    select: { value: true },
  });
  return row.value;
}

export function formatDocumentNumber(prefix, sequence, year = new Date().getUTCFullYear()) {
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}

export async function nextDocumentNumber(tx, prefix, year = new Date().getUTCFullYear()) {
  const sequence = await nextSequence(tx, `${prefix.toLowerCase()}:${year}`);
  return formatDocumentNumber(prefix, sequence, year);
}
