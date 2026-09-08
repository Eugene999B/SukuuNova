import type { TenantDb } from "@/lib/db";

export type AttendanceBlockingRange = { startDate: Date; endDate: Date };
export type ReportAttendanceSummary = {
  present: number;
  late: number;
  expectedDays: number;
  absent: number;
  attendanceRate: number | null;
  totalRecorded: number;
};

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dayKey(value: Date) {
  return utcDay(value).toISOString().slice(0, 10);
}

function nextDay(value: Date) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function expectedSchoolDays(startDate: Date, endDate: Date, blockedRanges: AttendanceBlockingRange[] = []) {
  const start = utcDay(startDate);
  const end = utcDay(endDate);
  if (end < start) return 0;

  const blocked = new Set<string>();
  for (const range of blockedRanges) {
    let cursor = utcDay(range.startDate < start ? start : range.startDate);
    const rangeEnd = utcDay(range.endDate > end ? end : range.endDate);
    while (cursor <= rangeEnd) {
      blocked.add(dayKey(cursor));
      cursor = nextDay(cursor);
    }
  }

  let count = 0;
  for (let cursor = start; cursor <= end; cursor = nextDay(cursor)) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (blocked.has(dayKey(cursor))) continue;
    count += 1;
  }
  return count;
}

export async function reportAttendanceForTerm(tx: TenantDb, input: {
  schoolId: string;
  studentId: string;
  startDate: Date;
  endDate: Date;
}): Promise<ReportAttendanceSummary> {
  const [attendanceRows, blockedRanges] = await Promise.all([
    tx.attendanceEvent.findMany({
      where: {
        schoolId: input.schoolId,
        studentId: input.studentId,
        type: "in",
        attendanceDate: { gte: input.startDate, lte: input.endDate },
      },
      select: { attendanceDate: true, isLate: true },
    }),
    tx.calendarEvent.findMany({
      where: {
        schoolId: input.schoolId,
        affectsAttendance: true,
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
      },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const presentDates = new Set(attendanceRows.map((row) => dayKey(row.attendanceDate)));
  const lateDates = new Set(attendanceRows.filter((row) => row.isLate).map((row) => dayKey(row.attendanceDate)));
  const expectedDays = expectedSchoolDays(input.startDate, input.endDate, blockedRanges);
  const present = Math.min(presentDates.size, expectedDays || presentDates.size);
  const absent = Math.max(0, expectedDays - present);
  const attendanceRate = expectedDays > 0 ? Math.round((present / expectedDays) * 1000) / 10 : null;

  return {
    present,
    late: lateDates.size,
    expectedDays,
    absent,
    attendanceRate,
    totalRecorded: presentDates.size,
  };
}
