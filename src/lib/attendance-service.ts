import { AppError, ForbiddenError } from "./errors";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { hasPermission, requirePermission } from "./rbac";
import { enqueueSms } from "./sms-outbox";
import {
  assertAutomatedAttendanceWindow,
  attendanceLateCutoffMinutes,
  attendanceLocalMinutes,
  readAttendancePolicy,
} from "./attendance-policy";

type AttendanceTarget =
  | { studentId: string; staffId?: never }
  | { staffId: string; studentId?: never };

export type AttendanceCalendarState = {
  calendarBlocked: boolean;
  schoolDay: boolean;
  source: "manual" | "generated" | "legacy_event" | "working_week";
  dayType: string | null;
};

export type AttendanceRoster = {
  termId: string | null;
  source: "enrollment" | "student";
  rows: Array<{ studentId: string; classId: string | null }>;
};

function localParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { dateKey: get("year") + "-" + get("month") + "-" + get("day"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function attendanceDate(value: Date, timezone: string) {
  return new Date(localParts(value, timezone).dateKey + "T00:00:00.000Z");
}

function validSchoolDays(value?: number[]) {
  const days = (value ?? [1, 2, 3, 4, 5]).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length ? [...new Set(days)] : [1, 2, 3, 4, 5];
}

async function attendanceTermId(tx: TenantDb, schoolId: string, day: Date) {
  const targetDate = day.toISOString().slice(0, 10);
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "Term"
    WHERE "schoolId" = ${schoolId}
      AND "startDate"::date <= ${targetDate}::date
      AND "endDate"::date >= ${targetDate}::date
    ORDER BY "startDate" DESC, "id" ASC
    LIMIT 1
  `);
  return rows[0]?.id ?? null;
}

async function termHasStructuredRoster(tx: TenantDb, schoolId: string, termId: string) {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS(
      SELECT 1
      FROM "Enrollment"
      WHERE "schoolId" = ${schoolId}
        AND "termId" = ${termId}
        AND "status" IN ('ready','confirmed')
    ) AS "exists"
  `);
  return Boolean(rows[0]?.exists);
}

export async function getAttendanceCalendarState(tx: TenantDb, schoolId: string, day: Date, schoolDays?: number[]): Promise<AttendanceCalendarState> {
  const targetDate = day.toISOString().slice(0, 10);
  const configuredSchoolDay = validSchoolDays(schoolDays).includes(day.getUTCDay());
  const [settings, calendarRows] = await Promise.all([
    tx.schoolSettings.findUnique({ where: { schoolId }, select: { timezone: true } }),
    tx.$queryRaw<Array<{ dayType: string; isInstructional: boolean; affectsAttendance: boolean; source: "manual" | "generated" }>>(Prisma.sql`
      SELECT "dayType", "isInstructional", "affectsAttendance", "source"
      FROM "SchoolCalendarDay"
      WHERE "schoolId" = ${schoolId}
        AND "calendarDate" = ${targetDate}::date
      ORDER BY CASE WHEN "source"='manual' THEN 0 ELSE 1 END, "updatedAt" DESC
      LIMIT 1
    `),
  ]);
  const calendarDay = calendarRows[0];

  // Once the day-level calendar exists, it is the canonical interpretation of holidays,
  // vacations, exams, make-up days and manual overrides for that date.
  if (calendarDay) {
    if (calendarDay.affectsAttendance) {
      return {
        calendarBlocked: !calendarDay.isInstructional,
        schoolDay: calendarDay.isInstructional,
        source: calendarDay.source,
        dayType: calendarDay.dayType,
      };
    }
    return {
      calendarBlocked: false,
      schoolDay: configuredSchoolDay,
      source: calendarDay.source,
      dayType: calendarDay.dayType,
    };
  }

  // Legacy schools that have not materialized SchoolCalendarDay yet keep their existing
  // CalendarEvent behavior until the new calendar engine is activated/refreshed.
  const timezone = settings?.timezone || "Africa/Accra";
  const legacyRows = await tx.$queryRaw<Array<{ type: string }>>(Prisma.sql`
    SELECT "type"
    FROM "CalendarEvent"
    WHERE "schoolId" = ${schoolId}
      AND "affectsAttendance" = true
      AND ("startDate" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date <= ${targetDate}::date
      AND ("endDate" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date >= ${targetDate}::date
    ORDER BY "startDate" ASC, "id" ASC
    LIMIT 1
  `);
  if (legacyRows.length) {
    return { calendarBlocked: true, schoolDay: false, source: "legacy_event", dayType: legacyRows[0]?.type ?? null };
  }
  return { calendarBlocked: false, schoolDay: configuredSchoolDay, source: "working_week", dayType: null };
}

export async function isAttendanceBlocked(tx: TenantDb, schoolId: string, day: Date) {
  return (await getAttendanceCalendarState(tx, schoolId, day)).calendarBlocked;
}

export async function resolveAttendanceRoster(tx: TenantDb, schoolId: string, day: Date, classIds?: string[] | null): Promise<AttendanceRoster> {
  if (classIds && classIds.length === 0) return { termId: await attendanceTermId(tx, schoolId, day), source: "student", rows: [] };
  const termId = await attendanceTermId(tx, schoolId, day);
  if (termId && await termHasStructuredRoster(tx, schoolId, termId)) {
    const classClause = classIds ? Prisma.sql`AND e."classId" IN (${Prisma.join(classIds)})` : Prisma.empty;
    const rows = await tx.$queryRaw<Array<{ studentId: string; classId: string }>>(Prisma.sql`
      SELECT DISTINCT e."studentId", e."classId"
      FROM "Enrollment" e
      WHERE e."schoolId" = ${schoolId}
        AND e."termId" = ${termId}
        AND e."status" IN ('ready','confirmed')
        ${classClause}
      ORDER BY e."classId" ASC, e."studentId" ASC
    `);
    return { termId, source: "enrollment", rows };
  }

  const students = await tx.student.findMany({
    where: {
      schoolId,
      status: "active",
      ...(classIds ? { classId: { in: classIds } } : {}),
    },
    select: { id: true, classId: true },
    orderBy: { id: "asc" },
  });
  return {
    termId,
    source: "student",
    rows: students.map((student) => ({ studentId: student.id, classId: student.classId })),
  };
}

export async function resolveAttendanceRosterStudentIds(tx: TenantDb, schoolId: string, day: Date, classIds?: string[] | null) {
  const roster = await resolveAttendanceRoster(tx, schoolId, day, classIds);
  return { ...roster, studentIds: roster.rows.map((row) => row.studentId) };
}

export async function resolveStudentAttendanceClassId(tx: TenantDb, schoolId: string, studentId: string, day: Date) {
  const termId = await attendanceTermId(tx, schoolId, day);
  if (termId) {
    const rows = await tx.$queryRaw<Array<{ classId: string }>>(Prisma.sql`
      SELECT "classId"
      FROM "Enrollment"
      WHERE "schoolId" = ${schoolId}
        AND "termId" = ${termId}
        AND "studentId" = ${studentId}
        AND "status" IN ('ready','confirmed')
      ORDER BY CASE WHEN "status"='confirmed' THEN 0 ELSE 1 END, "createdAt" DESC
      LIMIT 1
    `);
    if (rows[0]?.classId) return { classId: rows[0].classId, termId, source: "enrollment" as const };
    if (await termHasStructuredRoster(tx, schoolId, termId)) return { classId: null, termId, source: "enrollment" as const };
  }
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId }, select: { classId: true } });
  return { classId: student?.classId ?? null, termId, source: "student" as const };
}

export async function authorizeStudentAttendance(tx: TenantDb, actorId: string, studentId: string, context?: { schoolId: string; day: Date }) {
  if (await hasPermission(tx, actorId, "attendance:record_all")) return;
  if (!(await hasPermission(tx, actorId, "attendance:record_assigned"))) throw new ForbiddenError("You are not permitted to record this student's attendance.");

  let classId: string | null = null;
  if (context) {
    classId = (await resolveStudentAttendanceClassId(tx, context.schoolId, studentId, context.day)).classId;
  } else {
    classId = (await tx.student.findFirst({ where: { id: studentId }, select: { classId: true } }))?.classId ?? null;
  }
  if (!classId) throw new ForbiddenError("This learner is not on an attendance roster for the selected date.");
  const assigned = await tx.class.findFirst({ where: { id: classId, ...(context ? { schoolId: context.schoolId } : {}), classTeacherId: actorId }, select: { id: true } });
  if (!assigned) throw new ForbiddenError("Teachers may record attendance only for their assigned class.");
}

export async function authorizeStaffAttendance(tx: TenantDb, actorId: string) {
  await requirePermission(tx, actorId, "attendance:record_staff");
}

async function validateStaffState(tx: TenantDb, schoolId: string, staffId: string, day: Date, type: "in" | "out") {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff-attendance:${schoolId}:${staffId}:${day.toISOString()}`}))`;
  const latest = await tx.attendanceEvent.findFirst({ where: { schoolId, staffId, attendanceDate: day, type: { in: ["in", "out"] } }, orderBy: [{ timestamp: "desc" }, { id: "desc" }], select: { id: true, type: true } });
  if (type === "in" && latest?.type === "in") throw new AppError("You are already checked in for today.", 409, "ALREADY_CHECKED_IN");
  if (type === "in" && latest?.type === "out") throw new AppError("Your attendance is already closed for today. A supervisor correction is required for another entry.", 409, "ATTENDANCE_CLOSED");
  if (type === "out" && latest?.type !== "in") throw new AppError("You must check in before checking out.", 409, "INVALID_CHECKOUT_STATE");
}

async function validateStudentState(tx: TenantDb, schoolId: string, studentId: string, day: Date, periodId: string, type: "in" | "out") {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-attendance:${schoolId}:${studentId}:${day.toISOString()}:${periodId}`}))`;
  const latest = await tx.$queryRaw<Array<{ id: string; type: string }>>`
    SELECT "id", "type"
    FROM "AttendanceEvent"
    WHERE "schoolId" = ${schoolId}
      AND "studentId" = ${studentId}
      AND "attendanceDate" = ${day}
      AND "periodId" = ${periodId}
      AND "type" IN ('in', 'out')
    ORDER BY "timestamp" DESC, "id" DESC
    LIMIT 1
  `;
  const current = latest[0];
  if (type === "in" && current?.type === "in") throw new AppError("This student is already checked in for this attendance period.", 409, "ALREADY_CHECKED_IN");
  if (type === "in" && current?.type === "out") throw new AppError("This student's attendance period is already closed. A supervisor correction is required for another entry.", 409, "ATTENDANCE_CLOSED");
  if (type === "out" && current?.type !== "in") throw new AppError("The student must check in before checking out.", 409, "INVALID_CHECKOUT_STATE");
}

export async function recordStaffSelfAttendance(tx: TenantDb, input: { schoolId: string; actorId: string; type: "in" | "out"; method: "manual" | "qr" | "face" | "fingerprint" | "card"; verification: string; verificationMeta?: Record<string, unknown> }) {
  await requirePermission(tx, input.actorId, "attendance:staff_scan", input.schoolId);
  const staff = await tx.user.findFirst({ where: { id: input.actorId, schoolId: input.schoolId, status: "active" }, select: { id: true, schoolId: true, name: true } });
  if (!staff) throw new ForbiddenError("Only an active staff account in this school can use staff check-in.");
  const [settings, policy] = await Promise.all([
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } }),
    readAttendancePolicy(tx, input.schoolId),
  ]);
  if (!settings?.expectedResumptionTime) throw new AppError("Configure the expected resumption time before recording attendance.", 409, "ATTENDANCE_NOT_CONFIGURED");
  const timestamp = new Date();
  if (input.method !== "manual") assertAutomatedAttendanceWindow(policy, "staff", timestamp, input.type);
  const day = attendanceDate(timestamp, policy.timezone);
  if (await isAttendanceBlocked(tx, input.schoolId, day)) throw new AppError("Attendance is disabled for this calendar date.", 409, "CALENDAR_BLOCKS_ATTENDANCE");
  const periodSetting = await tx.$queryRaw<Array<{ value: string | null }>>`SELECT current_setting('sukuunova.attendance_period', true) AS value`;
  const periodId: string = periodSetting[0]?.value?.trim() || "DAILY";
  await tx.$executeRaw`SELECT set_config('sukuunova.attendance_period', ${periodId}, true)`;
  const isLate = input.type === "in" ? attendanceLocalMinutes(timestamp, policy.timezone) > attendanceLateCutoffMinutes(policy) : null;
  await validateStaffState(tx, input.schoolId, input.actorId, day, input.type);
  const event = await tx.attendanceEvent.create({ data: { schoolId: input.schoolId, staffId: input.actorId, type: input.type, method: input.method, timestamp, attendanceDate: day, isLate, recordedBy: input.actorId } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: input.type === "in" ? "attendance.staff.checked_in" : "attendance.staff.checked_out", entityType: "AttendanceEvent", entityId: event.id, after: { event, verification: input.verification, ...(input.verificationMeta ? { verificationMeta: input.verificationMeta } : {}) } });
  return event;
}

async function authorizedSummaryClassIds(tx: TenantDb, schoolId: string, actorId: string, requestedClassId?: string): Promise<string[] | null> {
  if (await hasPermission(tx, actorId, "attendance:review") || await hasPermission(tx, actorId, "attendance:record_all")) return requestedClassId ? [requestedClassId] : null;
  if (!(await hasPermission(tx, actorId, "attendance:record_assigned"))) throw new ForbiddenError("You are not permitted to view attendance summaries.");
  const assignedClasses = await tx.class.findMany({ where: { schoolId, classTeacherId: actorId }, select: { id: true } });
  const assignedIds = assignedClasses.map((row) => row.id);
  if (requestedClassId && !assignedIds.includes(requestedClassId)) throw new ForbiddenError("You may view attendance only for your assigned class.");
  if (!assignedIds.length) throw new ForbiddenError("No class is assigned to this teacher.");
  return requestedClassId ? [requestedClassId] : assignedIds;
}

function validatePeriodId(value: string | undefined): string {
  const periodId = value?.trim() || "DAILY";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(periodId)) throw new AppError("Invalid attendance period.", 400, "INVALID_ATTENDANCE_PERIOD");
  return periodId;
}

export async function recordAttendance(tx: TenantDb, input: { schoolId: string; actorId?: string; target: AttendanceTarget; type: "in" | "out"; method: "manual" | "qr" | "face" | "fingerprint" | "card"; confidenceScore?: number; deviceId?: string; timestamp?: Date; deviceAuthenticated?: boolean; periodId?: string }) {
  if (input.deviceAuthenticated) {
    if (!input.deviceId) throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");
  } else {
    if (!input.actorId) throw new ForbiddenError("A staff actor is required for attendance.");
    await requirePermission(tx, input.actorId, "attendance:record", input.schoolId);
    if (input.target.staffId) {
      await authorizeStaffAttendance(tx, input.actorId);
      const staff = await tx.user.findFirst({ where: { id: input.target.staffId, schoolId: input.schoolId, status: "active" }, select: { id: true } });
      if (!staff) throw new ForbiddenError("The selected staff account is not active in this school.");
    }
  }
  const [settings, policy] = await Promise.all([
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } }),
    readAttendancePolicy(tx, input.schoolId),
  ]);
  const timestamp = input.timestamp ?? new Date();
  if (Number.isNaN(timestamp.getTime())) throw new AppError("Invalid attendance timestamp.", 400, "INVALID_ATTENDANCE_TIMESTAMP");
  if (timestamp.getTime() > Date.now() + 5 * 60 * 1000) throw new AppError("Attendance timestamp cannot be more than 5 minutes in the future.", 400, "ATTENDANCE_TIMESTAMP_IN_FUTURE");
  const day = attendanceDate(timestamp, policy.timezone);
  if (!input.deviceAuthenticated && input.actorId && input.target.studentId) {
    await authorizeStudentAttendance(tx, input.actorId, input.target.studentId, { schoolId: input.schoolId, day });
  }
  if (!settings?.expectedResumptionTime) throw new AppError("Configure the expected resumption time before recording attendance.", 409, "ATTENDANCE_NOT_CONFIGURED");
  if (input.deviceAuthenticated && !policy.devices.enabled) throw new AppError("Attendance devices are disabled in school attendance settings.", 409, "ATTENDANCE_DEVICES_DISABLED");
  if (input.method !== "manual") {
    assertAutomatedAttendanceWindow(policy, input.target.staffId ? "staff" : "student", timestamp, input.type);
  }
  if (await isAttendanceBlocked(tx, input.schoolId, day)) throw new AppError("Attendance is disabled for this calendar date.", 409, "CALENDAR_BLOCKS_ATTENDANCE");
  const periodSetting = input.periodId?.trim() ? null : await tx.$queryRaw<Array<{ value: string | null }>>`SELECT current_setting('sukuunova.attendance_period', true) AS value`;
  const validatedPeriodId = validatePeriodId(input.periodId?.trim() || periodSetting?.[0]?.value?.trim() || "DAILY");
  await tx.$executeRaw`SELECT set_config('sukuunova.attendance_period', ${validatedPeriodId}, true)`;
  const isLate = input.type === "in" ? attendanceLocalMinutes(timestamp, policy.timezone) > attendanceLateCutoffMinutes(policy) : null;
  if (input.target.staffId) {
    await validateStaffState(tx, input.schoolId, input.target.staffId, day, input.type);
  } else {
    const studentId = input.target.studentId;
    if (!studentId) throw new AppError("A student attendance target is required.", 400, "INVALID_ATTENDANCE_TARGET");
    await validateStudentState(tx, input.schoolId, studentId, day, validatedPeriodId, input.type);
  }
  const event = await tx.attendanceEvent.create({ data: { schoolId: input.schoolId, studentId: input.target.studentId, staffId: input.target.staffId, type: input.type, method: input.method, timestamp, attendanceDate: day, isLate, confidenceScore: input.confidenceScore, deviceId: input.deviceId, recordedBy: input.actorId ?? null } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId ?? ("device:" + input.deviceId), action: "attendance.recorded", entityType: "AttendanceEvent", entityId: event.id, after: event });
  if (input.target.studentId) {
    const student = await tx.student.findUnique({ where: { id: input.target.studentId }, select: { name: true } });
    const guardians = await tx.studentGuardian.findMany({ where: { studentId: input.target.studentId, isPrimary: true }, include: { guardian: { select: { id: true, phone: true } } } });
    const attendanceLabel = input.type === "out" ? "checked out" : (isLate ? "checked in late" : "checked in on time");
    for (const link of guardians) {
      if (!link.guardian.phone) continue;
      await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "guardian", recipientId: link.guardian.id, recipientPhone: link.guardian.phone, body: "SukuuNova attendance alert: " + (student?.name ?? "Your child") + " " + attendanceLabel + ".", templateKey: "student_attendance", templateVariables: { "1": student?.name ?? "Student", "2": attendanceLabel } });
    }
  }
  if (input.target.staffId && isLate) {
    const [staff, hrUsers] = await Promise.all([
      tx.user.findFirst({ where: { id: input.target.staffId, schoolId: input.schoolId }, select: { name: true } }),
      tx.user.findMany({ where: { schoolId: input.schoolId, phone: { not: null }, userRoles: { some: { role: { key: "hr_officer" } } }, }, select: { id: true, phone: true } })
    ]);
    for (const user of hrUsers) await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "user", recipientId: user.id, recipientPhone: user.phone!, body: "SukuuNova alert: " + (staff?.name ?? "a staff member") + " checked in late.", templateKey: "staff_late", templateVariables: { "1": staff?.name ?? "Staff member", "2": timestamp.toISOString() } });
  }
  return event;
}

export async function attendanceSummary(tx: TenantDb, input: { actorId: string; day: Date; classId?: string; periodId?: string; schoolId: string }) {
  await requirePermission(tx, input.actorId, "attendance:record");
  const classIds = await authorizedSummaryClassIds(tx, input.schoolId, input.actorId, input.classId);
  if (await isAttendanceBlocked(tx, input.schoolId, input.day)) return { calendarBlocked: true, present: 0, late: 0, absent: 0 };
  const { studentIds } = await resolveAttendanceRosterStudentIds(tx, input.schoolId, input.day, classIds);
  if (!studentIds.length) return { calendarBlocked: false, present: 0, late: 0, absent: 0 };
  const periodId = input.periodId?.trim();
  const events = await tx.$queryRaw<Array<{ studentId: string; isLate: boolean | null }>>`
    SELECT "studentId", "isLate"
    FROM "AttendanceEvent"
    WHERE "schoolId" = ${input.schoolId}
      AND "attendanceDate" = ${input.day}
      AND "type" = 'in'
      AND "studentId" IN (${Prisma.join(studentIds)})
      ${periodId ? Prisma.sql`AND "periodId" = ${periodId}` : Prisma.empty}
  `;
  const total = studentIds.length;
  const presentIds = new Set(events.map((event) => event.studentId));
  const lateIds = new Set(events.filter((event) => event.studentId && event.isLate).map((event) => event.studentId));
  return { calendarBlocked: false, present: presentIds.size, late: lateIds.size, absent: Math.max(0, total - presentIds.size) };
}

export async function finalizeStudentAttendance(tx: TenantDb, input: { schoolId: string; actorId: string; day: Date; classId?: string }) {
  await requirePermission(tx, input.actorId, "attendance:record", input.schoolId);
  const classIds = await authorizedSummaryClassIds(tx, input.schoolId, input.actorId, input.classId);
  if (await isAttendanceBlocked(tx, input.schoolId, input.day)) return { queued: 0, calendarBlocked: true };
  const { studentIds } = await resolveAttendanceRosterStudentIds(tx, input.schoolId, input.day, classIds);
  if (!studentIds.length) return { queued: 0, calendarBlocked: false };
  const students = await tx.student.findMany({ where: { schoolId: input.schoolId, id: { in: studentIds } }, include: { attendanceEvents: { where: { attendanceDate: input.day, type: "in" }, select: { id: true } }, guardians: { where: { isPrimary: true }, include: { guardian: true } } } });
  let queued = 0;
  for (const student of students) {
    if (student.attendanceEvents.length > 0) continue;
    for (const link of student.guardians) {
      if (!link.guardian.phone) continue;
      await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "guardian", recipientId: link.guardianId, recipientPhone: link.guardian.phone, body: "SukuuNova absence alert: " + student.name + " has no check-in recorded today.", templateKey: "student_absence", templateVariables: { "1": student.name, "2": input.day.toISOString().slice(0, 10) } });
      queued++;
    }
  }
  return { queued, calendarBlocked: false };
}