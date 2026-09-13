import type { TenantDb } from "./db";
import { AppError } from "./errors";

export const DEFAULT_TEACHING_WEEKS = 13;
export const MAX_TEACHING_WEEKS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TermWeek = {
  schoolId: string;
  termId: string;
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  isTeaching: boolean;
};

export type TeachingWeekRange = Omit<TermWeek, "schoolId" | "termId" | "isTeaching">;

export function normalizeTeachingWeeks(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > MAX_TEACHING_WEEKS) return DEFAULT_TEACHING_WEEKS;
  return numeric;
}

function utcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function dateLabel(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function maxTeachingWeeksForRange(startDate: Date, endDate: Date) {
  const start = utcDay(startDate);
  const end = utcDay(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / (7 * DAY_MS)) + 1;
}

export function assertTeachingWeeksFitTerm(startDate: Date, endDate: Date, teachingWeeks: number) {
  const weeks = normalizeTeachingWeeks(teachingWeeks);
  const maximum = maxTeachingWeeksForRange(startDate, endDate);
  if (maximum < 1) throw new AppError("Term dates are invalid.", 400, "INVALID_TERM_RANGE");
  if (weeks > maximum) {
    throw new AppError(`The term dates can contain at most ${maximum} teaching week${maximum === 1 ? "" : "s"}. Adjust the dates or teaching-week count.`, 400, "TEACHING_WEEKS_OUTSIDE_TERM");
  }
  return weeks;
}

/**
 * Build the authoritative date window for each teaching week.
 * Weeks 1..N-1 are seven-day windows from the term start. The final week owns
 * the remaining term days so every date in a valid term has one authoritative
 * week even when the term does not end exactly on a seven-day boundary.
 */
export function buildTeachingWeekRanges(startDate: Date, endDate: Date, teachingWeeks: number): TeachingWeekRange[] {
  const weeks = assertTeachingWeeksFitTerm(startDate, endDate, teachingWeeks);
  const start = utcDay(startDate);
  const end = utcDay(endDate);
  return Array.from({ length: weeks }, (_, index) => {
    const weekNumber = index + 1;
    const weekStart = start + index * 7 * DAY_MS;
    const normalEnd = weekStart + 6 * DAY_MS;
    const weekEnd = weekNumber === weeks ? end : Math.min(normalEnd, end);
    return { weekNumber, startDate: new Date(weekStart), endDate: new Date(weekEnd) };
  });
}

export function assertTeachingWeekNumber(weekNumber: number, teachingWeeks: number) {
  const maximum = normalizeTeachingWeeks(teachingWeeks);
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > maximum) {
    throw new AppError(`Choose a teaching week between 1 and ${maximum}.`, 400, "INVALID_TEACHING_WEEK");
  }
}

export async function syncTermWeeks(tx: TenantDb, input: { schoolId: string; termId: string; startDate: Date; endDate: Date; teachingWeeks: number }) {
  const ranges = buildTeachingWeekRanges(input.startDate, input.endDate, input.teachingWeeks);
  for (const range of ranges) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "TermWeek" ("schoolId","termId","weekNumber","startDate","endDate","isTeaching") VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT ("termId","weekNumber") DO UPDATE SET "schoolId"=EXCLUDED."schoolId","startDate"=EXCLUDED."startDate","endDate"=EXCLUDED."endDate","isTeaching"=TRUE`,
      input.schoolId,
      input.termId,
      range.weekNumber,
      range.startDate,
      range.endDate,
    );
  }
  await tx.$executeRawUnsafe(
    `DELETE FROM "TermWeek" WHERE "schoolId"=$1 AND "termId"=$2 AND "weekNumber" > $3`,
    input.schoolId,
    input.termId,
    ranges.length,
  );
  return ranges;
}

export async function getTermWeeks(tx: TenantDb, schoolId: string, termId: string): Promise<TermWeek[]> {
  return tx.$queryRawUnsafe<TermWeek[]>(
    `SELECT "schoolId","termId","weekNumber","startDate","endDate","isTeaching" FROM "TermWeek" WHERE "schoolId"=$1 AND "termId"=$2 ORDER BY "weekNumber" ASC`,
    schoolId,
    termId,
  );
}

export async function getTeachingWeekForDate(tx: TenantDb, schoolId: string, termId: string, workDate: string) {
  const rows = await tx.$queryRawUnsafe<TermWeek[]>(
    `SELECT "schoolId","termId","weekNumber","startDate","endDate","isTeaching" FROM "TermWeek" WHERE "schoolId"=$1 AND "termId"=$2 AND "isTeaching" IS TRUE AND $3::date BETWEEN "startDate"::date AND "endDate"::date ORDER BY "weekNumber" ASC LIMIT 1`,
    schoolId,
    termId,
    workDate.slice(0, 10),
  );
  if (!rows[0]) throw new AppError("The selected date is not inside a configured teaching week for this term.", 400, "DATE_OUTSIDE_TEACHING_WEEK");
  return rows[0];
}

export async function assertTeachingWeekDate(tx: TenantDb, schoolId: string, termId: string, weekNumber: number, workDate: string) {
  const weeks = await getTermWeeks(tx, schoolId, termId);
  const week = weeks.find((row) => row.weekNumber === weekNumber && row.isTeaching);
  if (!week) {
    const maximum = weeks.filter((row) => row.isTeaching).reduce((max, row) => Math.max(max, row.weekNumber), 0);
    if (maximum > 0) assertTeachingWeekNumber(weekNumber, maximum);
    throw new AppError("The selected teaching week is not configured for this term.", 400, "TEACHING_WEEK_NOT_CONFIGURED");
  }
  const selected = workDate.slice(0, 10);
  const start = dateLabel(week.startDate);
  const end = dateLabel(week.endDate);
  if (selected < start || selected > end) {
    throw new AppError(`Week ${weekNumber} runs from ${start} to ${end}. Choose a work date inside that week.`, 400, "WORK_DATE_OUTSIDE_TEACHING_WEEK");
  }
  return week;
}

export async function getTeachingWeekMap(tx: TenantDb, schoolId: string) {
  const [terms, rows] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ id: string; teachingWeeks: number }>>(
      `SELECT "id","teachingWeeks" FROM "Term" WHERE "schoolId"=$1`,
      schoolId,
    ),
    tx.$queryRawUnsafe<Array<{ termId: string; teachingWeeks: number }>>(
      `SELECT "termId", COUNT(*) FILTER (WHERE "isTeaching" IS TRUE)::int AS "teachingWeeks" FROM "TermWeek" WHERE "schoolId"=$1 GROUP BY "termId"`,
      schoolId,
    ),
  ]);
  const configured = new Map(rows.map((row) => [row.termId, normalizeTeachingWeeks(row.teachingWeeks)]));
  return new Map(terms.map((term) => [term.id, configured.get(term.id) ?? normalizeTeachingWeeks(term.teachingWeeks)]));
}
