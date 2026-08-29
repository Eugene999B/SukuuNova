import { AppError, ForbiddenError } from "./errors";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { hasPermission, requirePermission } from "./rbac";
import { enqueueSms } from "./sms-outbox";

type AttendanceTarget =
  | { studentId: string; staffId?: never }
  | { staffId: string; studentId?: never };

function localParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    dateKey: get("year") + "-" + get("month") + "-" + get("day"),
    minutes: Number(get("hour")) * 60 + Number(get("minute"))
  };
}

function attendanceDate(value: Date, timezone: string) {
  return new Date(localParts(value, timezone).dateKey + "T00:00:00.000Z");
}

function dayBounds(day: Date) {
  const start = new Date(day);
  const end = new Date(day);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export async function isAttendanceBlocked(tx: TenantDb, day: Date) {
  const { start, end } = dayBounds(day);
  return Boolean(await tx.calendarEvent.findFirst({
    where: { affectsAttendance: true, startDate: { lte: end }, endDate: { gte: start } },
    select: { id: true, name: true, type: true }
  }));
}

async function authorizeStudentAttendance(tx: TenantDb, actorId: string, studentId: string) {
  if (await hasPermission(tx, actorId, "attendance:record_all")) return;
  if (!(await hasPermission(tx, actorId, "attendance:record_assigned"))) {
    throw new ForbiddenError("You are not permitted to record this student's attendance.");
  }
  const assigned = await tx.student.findFirst({
    where: { id: studentId, class: { classTeacherId: actorId } },
    select: { id: true }
  });
  if (!assigned) throw new ForbiddenError("Teachers may record attendance only for their assigned class.");
}

async function authorizeStaffAttendance(tx: TenantDb, actorId: string) {
  await requirePermission(tx, actorId, "attendance:record_staff");
}

async function authorizedSummaryClassFilter(tx: TenantDb, actorId: string, requestedClassId?: string) {
  if (await hasPermission(tx, actorId, "attendance:review") || await hasPermission(tx, actorId, "attendance:record_all")) {
    return requestedClassId ? { classId: requestedClassId } : {};
  }
  if (!(await hasPermission(tx, actorId, "attendance:record_assigned"))) {
    throw new ForbiddenError("You are not permitted to view attendance summaries.");
  }
  const assignedClasses = await tx.class.findMany({ where: { classTeacherId: actorId }, select: { id: true } });
  const assignedIds = assignedClasses.map((row) => row.id);
  if (requestedClassId && !assignedIds.includes(requestedClassId)) {
    throw new ForbiddenError("You may view attendance only for your assigned class.");
  }
  if (!assignedIds.length) throw new ForbiddenError("No class is assigned to this teacher.");
  return requestedClassId ? { classId: requestedClassId } : { classId: { in: assignedIds } };
}

export async function recordAttendance(
  tx: TenantDb,
  input: {
    schoolId: string; actorId: string; target: AttendanceTarget; type: "in" | "out";
    method: "manual" | "qr" | "face"; confidenceScore?: number; deviceId?: string; timestamp?: Date;
  }
) {
  await requirePermission(tx, input.actorId, "attendance:record");
  if (input.target.studentId) await authorizeStudentAttendance(tx, input.actorId, input.target.studentId);
  else await authorizeStaffAttendance(tx, input.actorId);

  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } });
  if (!settings?.expectedResumptionTime) {
    throw new AppError("Configure the expected resumption time before recording attendance.", 409, "ATTENDANCE_NOT_CONFIGURED");
  }

  const timestamp = input.timestamp ?? new Date();
  const day = attendanceDate(timestamp, settings.timezone);
  if (await isAttendanceBlocked(tx, day)) {
    throw new AppError("Attendance is disabled for this calendar date.", 409, "CALENDAR_BLOCKS_ATTENDANCE");
  }

  const [hour, minute] = settings.expectedResumptionTime.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new AppError("Expected resumption time must use HH:MM.", 409, "INVALID_ATTENDANCE_CONFIGURATION");
  }
  const isLate = input.type === "in"
    ? localParts(timestamp, settings.timezone).minutes > hour * 60 + minute + settings.attendanceGraceMinutes
    : null;

  const event = await tx.attendanceEvent.create({
    data: {
      schoolId: input.schoolId,
      studentId: input.target.studentId,
      staffId: input.target.staffId,
      type: input.type,
      method: input.method,
      timestamp,
      attendanceDate: day,
      isLate,
      confidenceScore: input.confidenceScore,
      deviceId: input.deviceId,
      recordedBy: input.actorId
    }
  });

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId, actorId: input.actorId, action: "attendance.recorded",
    entityType: "AttendanceEvent", entityId: event.id, after: event
  });

  if (input.target.staffId && isLate) {
    const [staff, hrUsers] = await Promise.all([
      tx.user.findUnique({ where: { id: input.target.staffId }, select: { name: true } }),
      tx.user.findMany({
        where: { phone: { not: null }, userRoles: { some: { role: { key: "hr_officer" } } } },
        select: { id: true, phone: true }
      })
    ]);
    for (const user of hrUsers) {
      await enqueueSms(tx, {
        schoolId: input.schoolId,
        recipientType: "user",
        recipientId: user.id,
        recipientPhone: user.phone!,
        body: "SukuuNova alert: " + (staff?.name ?? "a staff member") + " checked in late.",
        templateKey: "staff_late",
        templateVariables: { "1": staff?.name ?? "Staff member", "2": timestamp.toISOString() }
      });
    }
  }

  return event;
}

export async function attendanceSummary(
  tx: TenantDb,
  input: { actorId: string; day: Date; classId?: string }
) {
  await requirePermission(tx, input.actorId, "attendance:record");
  const classFilter = await authorizedSummaryClassFilter(tx, input.actorId, input.classId);
  if (await isAttendanceBlocked(tx, input.day)) {
    return { calendarBlocked: true, present: 0, late: 0, absent: 0 };
  }
  const events = await tx.attendanceEvent.findMany({
    where: {
      attendanceDate: input.day,
      type: "in",
      student: classFilter
    },
    select: { studentId: true, isLate: true }
  });
  const total = await tx.student.count({
    where: { status: "active", ...classFilter }
  });
  const presentIds = new Set(events.flatMap((event) => event.studentId ? [event.studentId] : []));
  return {
    calendarBlocked: false,
    present: presentIds.size,
    late: events.filter((event) => event.isLate).length,
    absent: Math.max(0, total - presentIds.size)
  };
}

export async function finalizeStudentAttendance(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; day: Date; classId?: string }
) {
  await requirePermission(tx, input.actorId, "attendance:record");
  const classFilter = await authorizedSummaryClassFilter(tx, input.actorId, input.classId);
  if (await isAttendanceBlocked(tx, input.day)) {
    return { queued: 0, calendarBlocked: true };
  }
  const students = await tx.student.findMany({
    where: { status: "active", ...classFilter },
    include: {
      attendanceEvents: { where: { attendanceDate: input.day, type: "in" }, select: { id: true } },
      guardians: { where: { isPrimary: true }, include: { guardian: true } }
    }
  });
  let queued = 0;
  for (const student of students) {
    if (student.attendanceEvents.length > 0) continue;
    for (const link of student.guardians) {
      await enqueueSms(tx, {
        schoolId: input.schoolId,
        recipientType: "guardian",
        recipientId: link.guardianId,
        recipientPhone: link.guardian.phone,
        body: "SukuuNova absence alert: " + student.name + " has no check-in recorded today.",
        templateKey: "student_absence",
        templateVariables: { "1": student.name, "2": input.day.toISOString().slice(0, 10) }
      });
      queued++;
    }
  }
  return { queued, calendarBlocked: false };
}