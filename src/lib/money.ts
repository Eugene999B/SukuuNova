import { Prisma } from "@prisma/client";
import { AppError } from "./errors";

/**
 * Pesewa rule (GHS minor unit = 2dp, ROUND_HALF_UP):
 * - All money enters the ledger through `toMoney()`: finite, > 0, <= MAX,
 *   converted via String() (never binary float) and rounded to 2dp.
 * - Display/aggregation of Decimals uses integer pesewas (`pesewas()`),
 *   never `Number()` float sums.
 * - `formatGHS()` is presentation-only.
 */
export const MAX_MONEY_AMOUNT = 1_000_000_000;
export const MIN_MONEY_AMOUNT = 0.01;

export function toMoney(value: number, code = "INVALID_AMOUNT"): Prisma.Decimal {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AppError("Amount must be a finite number.", 400, code);
  }
  const decimal = new Prisma.Decimal(String(value)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (decimal.lessThan(MIN_MONEY_AMOUNT)) throw new AppError("Amount must be at least GH₵0.01.", 400, code);
  if (decimal.greaterThan(MAX_MONEY_AMOUNT)) throw new AppError("Amount exceeds the permitted maximum.", 400, code);
  return decimal;
}

export function toMoneySigned(value: number, code = "INVALID_AMOUNT"): Prisma.Decimal {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AppError("Amount must be a finite number.", 400, code);
  }
  const decimal = new Prisma.Decimal(String(value)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (decimal.abs().greaterThan(MAX_MONEY_AMOUNT)) throw new AppError("Amount exceeds the permitted maximum.", 400, code);
  return decimal;
}

/** Exact integer pesewas for a Decimal/number/string — no float drift. */
export function pesewas(value: Prisma.Decimal | number | string): number {
  const d = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value));
  return d.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function formatGHS(value: Prisma.Decimal | number | string): string {
  const d = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value));
  return `GH₵${d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)}`;
}

/** Net paid across payments minus reversals, exact. */
export function netPaid(
  payments: Array<{ amount: Prisma.Decimal | number | string; reversals: Array<{ amount: Prisma.Decimal | number | string }> }>
): Prisma.Decimal {
  return payments.reduce(
    (sum, p) =>
      sum.plus(new Prisma.Decimal(String(p.amount))).minus(
        p.reversals.reduce((r, row) => r.plus(new Prisma.Decimal(String(row.amount))), new Prisma.Decimal(0))
      ),
    new Prisma.Decimal(0)
  );
}
