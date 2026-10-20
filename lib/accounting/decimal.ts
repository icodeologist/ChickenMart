import { Prisma } from "@prisma/client";

export const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
export const ZERO = D(0);

export function money(value: Prisma.Decimal.Value) {
  return D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function rate(value: Prisma.Decimal.Value) {
  return D(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export function weight(value: Prisma.Decimal.Value) {
  return D(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: Iterable<Prisma.Decimal.Value>) {
  let total = ZERO;
  for (const value of values) total = total.plus(value);
  return total;
}

export function exactLineAmount(quantityKg: Prisma.Decimal.Value, unitRate: Prisma.Decimal.Value) {
  return money(D(quantityKg).mul(unitRate));
}

export function decimalJson(value: Prisma.Decimal.Value) {
  return D(value).toFixed(2);
}
