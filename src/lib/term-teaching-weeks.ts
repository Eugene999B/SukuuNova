import type { TenantDb } from "./db";
import { AppError } from "./errors";

export const DEFAULT_TEACHING_WEEKS = 13;
export const MAX_TEACHING_WEEKS = 30;

export function normalizeTeachingWeeks(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > MAX_TEACHING_WEEKS) return DEFAULT_TEACHING_WEEKS;
  return numeric;
}

export function assertTeachingWeekNumber(weekNumber: number, teachingWeeks: number) {
  const maximum = normalizeTeachingWeeks(teachingWeeks);
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > maximum) {
    throw new AppError(`Choose a teaching week between 1 and ${maximum}.`, 400, "INVALID_TEACHING_WEEK");
  }
}

export async function getTeachingWeekMap(tx: TenantDb, schoolId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; teachingWeeks: number }>>(
    `SELECT "id","teachingWeeks" FROM "Term" WHERE "schoolId"=$1`,
    schoolId,
  );
  return new Map(rows.map((row) => [row.id, normalizeTeachingWeeks(row.teachingWeeks)]));
}
