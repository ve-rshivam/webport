import { Prisma } from '@prisma/client';
import { badRequest } from './errors.js';

export const Decimal = Prisma.Decimal;

export function dec(value, field = 'amount') {
  if (value instanceof Decimal) return value;
  try {
    return new Decimal(value ?? 0);
  } catch {
    throw badRequest(`${field} is not a valid monetary value.`);
  }
}

export function round2(value) {
  return dec(value).toDecimalPlaces(2);
}

export function moneyString(value) {
  return round2(value).toFixed(2);
}

export function lineAmount(quantity, unitPrice) {
  return round2(dec(quantity).times(dec(unitPrice)));
}

export function netAmount(gross, refunded = 0) {
  return round2(dec(gross).minus(dec(refunded)));
}

export function invoiceTotals(lines, discountValue = 0, taxRateValue = 0) {
  const subtotal = (Array.isArray(lines) ? lines : []).reduce(
    (sum, line) => sum.plus(lineAmount(line.quantity, line.unitPrice)),
    new Decimal(0)
  );
  const discount = dec(discountValue);
  const taxRate = dec(taxRateValue);

  if (discount.lt(0)) throw badRequest('discount cannot be negative.');
  if (discount.gt(subtotal)) throw badRequest('discount cannot exceed the subtotal.');
  if (taxRate.lt(0) || taxRate.gt(100)) throw badRequest('taxRate must be between 0 and 100.');

  const taxable = subtotal.minus(discount);
  const taxAmount = round2(taxable.times(taxRate).dividedBy(100));
  const total = round2(taxable.plus(taxAmount));

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    taxRate: round2(taxRate),
    taxAmount,
    total,
  };
}

export function sumDecimals(values = []) {
  return (values ?? []).reduce((sum, value) => sum.plus(dec(value)), new Decimal(0));
}

export function percentOf(part, total) {
  const base = dec(total);
  if (base.lte(0)) return 0;
  return Math.round(dec(part).dividedBy(base).times(100).toNumber());
}
