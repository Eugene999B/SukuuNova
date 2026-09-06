import { AppError } from "./errors";

/** Platform billing uses integer minor units (pesewas/cents) end-to-end — no binary float. */

export function minorUnits(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new AppError("Billing amount must be a finite number.", 400, "INVALID_AMOUNT");
  return Math.round(n * 100);
}

export function majorUnits(minor: number): number {
  return Math.round(minor) / 100;
}

export function assertRate(value: number, name: string, min = 0, max = 1_000_000_000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new AppError(`${name} must be a finite number between ${min} and ${max}.`, 400, "INVALID_RATE");
  }
  return value;
}

export function assertPercent(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new AppError(`${name} must be between 0 and 100.`, 400, "INVALID_PERCENTAGE");
  }
  return value;
}

export type PlatformTotals = {
  base: number;
  discountedBase: number;
  subtotal: number;
  tax: number;
  total: number;
};

/**
 * Exact total for: base (major) → discount% → minimum/maximum clamp → tax%.
 * All intermediate math in minor units; inputs validated finite.
 */
export function calculatePlatformTotal(input: {
  base: number | string;
  discountPercent?: number | string;
  minimumCharge?: number | string | null;
  maximumCharge?: number | string | null;
  taxPercent?: number | string;
}): PlatformTotals {
  const baseMinor = minorUnits(input.base);
  const discountPercent = input.discountPercent == null || input.discountPercent === "" ? 0 : assertPercent(Number(input.discountPercent), "Discount percent");
  const taxPercent = input.taxPercent == null || input.taxPercent === "" ? 0 : assertPercent(Number(input.taxPercent), "Tax percent");
  const discountedMinor = Math.round((baseMinor * (100 - discountPercent)) / 100);
  const floorMinor = input.minimumCharge == null || input.minimumCharge === "" ? 0 : minorUnits(input.minimumCharge);
  const subtotalMinor = Math.max(floorMinor, discountedMinor);
  const cappedMinor = input.maximumCharge == null || input.maximumCharge === "" ? subtotalMinor : Math.min(minorUnits(input.maximumCharge), subtotalMinor);
  const taxMinor = Math.round((cappedMinor * taxPercent) / 100);
  const totalMinor = cappedMinor + taxMinor;
  return {
    base: majorUnits(baseMinor),
    discountedBase: majorUnits(discountedMinor),
    subtotal: majorUnits(cappedMinor),
    tax: majorUnits(taxMinor),
    total: majorUnits(totalMinor),
  };
}
