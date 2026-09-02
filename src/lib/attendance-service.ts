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

export async function authorizeStudentAttendance(tx: TenantDb, actorId: string, studentId: string) {
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

export async function authorizeStaffAttendance(tx: TenantDb, actorId: string) {
  await requirePermission(tx, actorId, "attendance:record_staff");
}

export async function recordStaffSelfAttendance(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    type: "in" | "out";
    verification: string;
    verificationMeta?: Record<string, unknown>;
  }
) {
  await requirePermission(tx, input.actorId, "attendance:staff_scan");
  const staff = await tx.user.findFirst({
    where: { id: input.actorId, schoolId: input.schoolId, status: "active" },
    select: { id: true, schoolId: true, name: true }
  });
  if (!staff) {
    throw new ForbiddenError("Only an active staff account in this school can use staff check-in.");
  }

  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } });
  if (!settings?.expectedResumptionTime) {
    throw new AppError("Configure the expected resumption time before recording attendance.", 409, "ATTENDANCE_NOT_CONFIGURED");
  }

  const timestamp = new Date();
  const day = attendanceDate(timestamp, settings.timezone);
  if (await isAttendanceBlocked(tx, day)) {
    throw new AppError("Attendance is disabled for this calendar date.", 409, "CALENDAR_BLOCKS_ATTENDANCE");
  }

  const periodSetting = await tx.$queryRaw<Array<{ value: string | null }>>`SELECT current_setting('sukuunova.attendance_period', true) AS value`;
  const periodId = periodSetting[0]?.value?.trim() || "DAILY";
  await tx.$executeRaw`SELECT set_config('sukuunova.attendance_period', ${periodId}, true)`;

  const [hour, minute] = settings.expectedResumptionTime.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new AppError("Expected resumption time must use HH:MM.", 409, "INVALID_ATTENDANCE_CONFIGURATION");
  }
  const isLate = input.type === "in"
    ? localParts(timestamp, settings.timezone).minutes > hour * 60 + minute + settings.attendanceGraceMinutes
    : null;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff-attendance:${input.schoolId}:${input.actorId}:${day.toISOString()}:${input.type}`}))`;

  const latest = await tx.attendanceEvent.findFirst({
    where: {
      schoolId: input.schoolId,
      staffId: input.actorId,
      attendanceDate: day,
      type: { in: ["in", "out"] }
    },
    orderBy: { timestamp: "desc" },
    select: { id: true, type: true }
  });

  if (input.type === "in" && latest?.type === "in") {
    throw new AppError("You are already checked in for today.", 409, "ALREADY_CHECKED_IN");
  }
  if (input.type === "out" && latest?.type !== "in") {
    throw new AppError("You must check in before checking out.", 409, "INVALID_CHECKOUT_STATE");
  }

  const event = await tx.attendanceEvent.create({
    data: {
      schoolId: input.schoolId,
      staffId: input.actorId,
      type: input.type,
      method: "qr",
      timestamp,
      attendanceDate: day,
      isLate,
      recordedBy: input.actorId
    }
  });

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: input.type === "in" ? "attendance.staff.checked_in" : "attendance.staff.checked_out",
    entityType: "AttendanceEvent",
    entityId: event.id,
    after: { event, verification: input.verification, ...(input.verificationMeta ? { verificationMeta: input.verificationMeta } : {}) }
  });

  return event;
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

function validatePeriodId(value: string | undefined) {
  const periodId = value?.trim() || "DAILY";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(periodId)) {
    throw new AppError("Invalid attendance period.", 400, "INVALID_ATTENDANCE_PERIOD");
  }
  return periodId;
}

export async function recordAttendance(
  tx: TenantDb,
  input: {
    schoolId: string; actorId?: string; target: AttendanceTarget; type: "in" | "out";
    method: "manual" | "qr" | "face" | "fingerprint" | "card"; confidenceScore?: number; deviceId?: string; deviceAuthenticated?: boolean; periodId?: string;
  }
) {
  if (input.deviceAuthenticated) {
    if (!input.deviceId) throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");
  } else {
    if (!input.actorId) throw new ForbiddenError("A staff actor is required for attendance.");
    await requirePermission(tx, input.actorId, "attendance:record");
    if (input.target.studentId) {
      await authorizeStudentAttendance(tx, input.actorId, input.target.studentId);
    } else {
      await authorizeStaffAttendance(tx, input.actorId);
      const staff = await tx.user.findFirst({
        where: { id: input.target.staffId, schoolId: input.schoolId, status: "active" },
        select: { id: true }
      });
      if (!staff) throw new ForbiddenError("The selected staff account is not active in this school.");
    }
  }

  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } });
  if (!settings?.expectedResumptionTime) {
    throw new AppError("Configure the expected resumption time before recording attendance.", 409, "ATTENDANCE_NOT_CONFIGURED");
  }

  const timestamp = new Date();
  const day = attendanceDate(timestamp, settings.timezone);
  if (await isAttendanceBlocked(tx, day)) {
    throw new AppError("Attendance is disabled for this calendar date.", 409, "CALENDAR_BLOCKS_ATTENDANCE");
  }

  let periodId = input.periodId?.trim();
  if (!periodId) {
    const setting = await tx.$queryRaw<Array<{ value: string | null }>>`SELECT current_setting('sukuunova.attendance_period', true) AS value`;
    periodId = setting[0]?.value?.trim() || "DAILY";
  }
  periodId = validatePeriodId(periodId);
  await tx.$executeRaw`SELECT set_config('sukuunova.attendance_period', ${periodId}, true)`;

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
      recordedBy: input.actorId ?? null
    }
  });

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId, actorId: input.actorId ?? ("device:" + input.deviceId), action: "attendance.recorded",
    entityType: "AttendanceEvent", entityId: event.id, after: event
  });

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
      if (!link.guardian.phone) continue;
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
