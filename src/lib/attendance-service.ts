import { AppError } from "./errors";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { requirePermission } from "./rbac";
import { enqueueSms } from "./sms-outbox";

type AttendanceTarget =
  | { studentId: string; staffId?: never }
  | { staffId: string; studentId?: never };

function localParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
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
  return Boolean(
    await tx.calendarEvent.findFirst({
      where: {
        affectsAttendance: true,
        startDate: { lte: end },
        endDate: { gte: start }
      },
      select: { id: true, name: true, type: true }
    })
  );
}

export async function recordAttendance(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    target: AttendanceTarget;
    type: "in" | "out";
    method: "manual" | "qr";
    timestamp?: Date;
  }
) {
  await requirePermission(tx, input.actorId, "attendance:record");
  const settings = await tx.schoolSettings.findUnique({
    where: { schoolId: input.schoolId }
  });
  if (!settings?.expectedResumptionTime) {
    throw new AppError(
      "Configure the expected resumption time before recording attendance.",
      409,
      "ATTENDANCE_NOT_CONFIGURED"
    );
  }

  const timestamp = input.timestamp ?? new Date();
  const day = attendanceDate(timestamp, settings.timezone);
  if (await isAttendanceBlocked(tx, day)) {
    throw new AppError(
      "Attendance is disabled for this calendar date.",
      409,
      "CALENDAR_BLOCKS_ATTENDANCE"
    );
  }

  const [hour, minute] = settings.expectedResumptionTime.split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new AppError(
      "Expected resumption time must use HH:MM.",
      409,
      "INVALID_ATTENDANCE_CONFIGURATION"
    );
  }
  const isLate =
    input.type === "in"
      ? localParts(timestamp, settings.timezone).minutes >
        hour * 60 + minute + settings.attendanceGraceMinutes
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
      recordedBy: input.actorId
    }
  });

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "attendance.recorded",
    entityType: "AttendanceEvent",
    entityId: event.id,
    after: event
  });

  if (input.target.staffId && isLate) {
    const hrUsers = await tx.user.findMany({
      where: {
        phone: { not: null },
        userRoles: { some: { role: { name: "HR Officer" } } }
      },
      select: { id: true, phone: true }
    });
    for (const user of hrUsers) {
      await enqueueSms(tx, {
        schoolId: input.schoolId,
        recipientType: "user",
        recipientId: user.id,
        recipientPhone: user.phone!,
        body: "SukuuNova alert: a staff member checked in late."
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
  if (await isAttendanceBlocked(tx, input.day)) {
    return { calendarBlocked: true, present: 0, late: 0, absent: 0 };
  }
  const events = await tx.attendanceEvent.findMany({
    where: {
      attendanceDate: input.day,
      type: "in",
      ...(input.classId ? { student: { classId: input.classId } } : {})
    },
    select: { studentId: true, isLate: true }
  });
  const total = await tx.student.count({
    where: { status: "active", ...(input.classId ? { classId: input.classId } : {}) }
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
  if (await isAttendanceBlocked(tx, input.day)) {
    return { queued: 0, calendarBlocked: true };
  }
  const students = await tx.student.findMany({
    where: { status: "active", ...(input.classId ? { classId: input.classId } : {}) },
    include: {
      attendanceEvents: {
        where: { attendanceDate: input.day, type: "in" },
        select: { id: true }
      },
      guardians: {
        where: { isPrimary: true },
        include: { guardian: true }
      }
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
        body: "SukuuNova absence alert: " + student.name + " has no check-in recorded today."
      });
      queued++;
    }
  }
  return { queued, calendarBlocked: false };
}
