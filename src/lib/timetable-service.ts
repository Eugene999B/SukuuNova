import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";

function localMinutes(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export async function createTimetableSlot(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    classId: string;
    subjectId: string;
    teacherId: string;
    dayOfWeek: number;
    period: number;
  }
) {
  await requirePermission(tx, input.actorId, "classes:manage");
  if (
    input.dayOfWeek < 0 ||
    input.dayOfWeek > 6 ||
    !Number.isInteger(input.period) ||
    input.period < 1
  ) {
    throw new AppError("Invalid timetable day or period.", 400, "INVALID_TIMETABLE_SLOT");
  }
  const slot = await tx.timetableSlot.upsert({
    where: {
      schoolId_classId_dayOfWeek_period: {
        schoolId: input.schoolId,
        classId: input.classId,
        dayOfWeek: input.dayOfWeek,
        period: input.period
      }
    },
    update: {
      subjectId: input.subjectId,
      teacherId: input.teacherId
    },
    create: {
      schoolId: input.schoolId,
      classId: input.classId,
      subjectId: input.subjectId,
      teacherId: input.teacherId,
      dayOfWeek: input.dayOfWeek,
      period: input.period
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "timetable.slot_saved",
    entityType: "TimetableSlot",
    entityId: slot.id,
    after: slot
  });
  return slot;
}

export async function deleteTimetableSlot(
  tx: TenantDb,
  input: { actorId: string; slotId: string }
) {
  await requirePermission(tx, input.actorId, "classes:manage");
  return tx.timetableSlot.delete({ where: { id: input.slotId } });
}

export async function suggestSubstitutes(
  tx: TenantDb,
  input: {
    actorId: string;
    absentTeacherId: string;
    day: Date;
    period: number;
    asOf?: Date;
  }
) {
  await requirePermission(tx, input.actorId, "classes:manage");
  const settings = await tx.schoolSettings.findFirst();
  if (!settings?.expectedResumptionTime) {
    throw new AppError("Attendance timing must be configured.", 409, "ATTENDANCE_NOT_CONFIGURED");
  }
  const dayOfWeek = input.day.getUTCDay();
  const slots = await tx.timetableSlot.findMany({
    where: {
      teacherId: input.absentTeacherId,
      dayOfWeek,
      period: input.period
    },
    include: { class: true, subject: true }
  });
  if (slots.length === 0) return { reason: "no_assignment" as const, slots: [], suggestions: [] };

  const checkIn = await tx.attendanceEvent.findFirst({
    where: {
      staffId: input.absentTeacherId,
      attendanceDate: input.day,
      type: "in"
    },
    orderBy: { timestamp: "asc" }
  });
  const [hour, minute] = settings.expectedResumptionTime.split(":").map(Number);
  const threshold = hour * 60 + minute + settings.substituteLateMinutes;
  const asOf = input.asOf ?? new Date();
  const reason = !checkIn
    ? localMinutes(asOf, settings.timezone) > threshold
      ? "absent"
      : "not_due"
    : localMinutes(checkIn.timestamp, settings.timezone) > threshold
      ? "late"
      : "present";
  if (reason === "present" || reason === "not_due") {
    return { reason, slots, suggestions: [] };
  }

  const [teacherRows, busyRows] = await Promise.all([
    tx.timetableSlot.findMany({
      distinct: ["teacherId"],
      select: { teacherId: true }
    }),
    tx.timetableSlot.findMany({
      where: { dayOfWeek, period: input.period },
      distinct: ["teacherId"],
      select: { teacherId: true }
    })
  ]);
  const busy = new Set(busyRows.map((row) => row.teacherId));
  const candidateIds = teacherRows
    .map((row) => row.teacherId)
    .filter((id) => id !== input.absentTeacherId && !busy.has(id));
  const suggestions = await tx.user.findMany({
    where: { id: { in: candidateIds }, status: "active" },
    select: { id: true, name: true }
  });
  return { reason, slots, suggestions };
}

export async function confirmSubstitute(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    timetableSlotId: string;
    substituteTeacherId: string;
    assignmentDate: Date;
  }
) {
  await requirePermission(tx, input.actorId, "classes:manage");
  const slot = await tx.timetableSlot.findUnique({
    where: { id: input.timetableSlotId }
  });
  if (!slot) throw new AppError("Timetable slot not found.", 404, "NOT_FOUND");
  const busy = await tx.timetableSlot.findFirst({
    where: {
      teacherId: input.substituteTeacherId,
      dayOfWeek: slot.dayOfWeek,
      period: slot.period
    },
    select: { id: true }
  });
  if (busy) {
    throw new AppError("Selected substitute is already teaching in this period.", 409, "SUBSTITUTE_BUSY");
  }
  const assignment = await tx.substituteAssignment.create({
    data: {
      schoolId: input.schoolId,
      timetableSlotId: slot.id,
      substituteTeacherId: input.substituteTeacherId,
      assignedBy: input.actorId,
      assignmentDate: input.assignmentDate
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "substitute.confirmed",
    entityType: "SubstituteAssignment",
    entityId: assignment.id,
    after: assignment
  });
  return assignment;
}
