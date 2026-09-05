import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { roleKeyForName, isTeachingRoleKey } from "./authorization";

function localMinutes(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export async function createTimetableSlot(tx: TenantDb, input: { schoolId: string; actorId: string; classId: string; subjectId: string; teacherId: string; dayOfWeek: number; period: number; }) {
  await requirePermission(tx, input.actorId, "classes:manage");
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 6 || !Number.isInteger(input.period) || input.period < 1 || input.period > 16) throw new AppError("Invalid timetable day or period. Use Monday(1)–Saturday(6), period 1–16.", 400, "INVALID_TIMETABLE_SLOT");
  const [classRow, subject, teacher] = await Promise.all([
    tx.class.findFirst({ where: { id: input.classId, schoolId: input.schoolId }, select: { id: true } }),
    tx.subject.findFirst({ where: { id: input.subjectId, schoolId: input.schoolId }, select: { id: true } }),
    tx.user.findFirst({ where: { id: input.teacherId, schoolId: input.schoolId, status: "active" }, select: { id: true, userRoles: { select: { role: { select: { name: true, key: true } } } } } })
  ]);
  if (!classRow) throw new AppError("Class not found in this school.", 404, "CLASS_NOT_FOUND");
  if (!subject) throw new AppError("Subject not found in this school.", 404, "SUBJECT_NOT_FOUND");
  if (!teacher) throw new AppError("Teacher not found in this school.", 404, "TEACHER_NOT_FOUND");
  if (!teacher.userRoles.some(({ role }) => isTeachingRoleKey(role.key?.trim() || roleKeyForName(role.name)))) throw new AppError("Selected user is not an eligible teaching staff member.", 409, "TEACHER_NOT_ELIGIBLE");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable-slot:${input.schoolId}:${input.dayOfWeek}:${input.period}`}))`;
  const teacherBusy = await tx.timetableSlot.findFirst({ where: { schoolId: input.schoolId, teacherId: input.teacherId, dayOfWeek: input.dayOfWeek, period: input.period, NOT: { classId: input.classId } }, select: { id: true, classId: true } });
  if (teacherBusy) throw new AppError("This teacher is already teaching another class at this time.", 409, "TEACHER_BUSY");
  const existing = await tx.timetableSlot.findFirst({ where: { schoolId: input.schoolId, classId: input.classId, dayOfWeek: input.dayOfWeek, period: input.period }, select: { id: true } });
  if (existing) throw new AppError("This class already has a lesson at this time. Edit or remove it first.", 409, "CLASS_SLOT_CONFLICT");
  const slot = await tx.timetableSlot.create({ data: { schoolId: input.schoolId, classId: input.classId, subjectId: input.subjectId, teacherId: input.teacherId, dayOfWeek: input.dayOfWeek, period: input.period } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "timetable.slot_saved", entityType: "TimetableSlot", entityId: slot.id, after: slot });
  return slot;
}

export async function updateTimetableSlot(tx: TenantDb, input: { schoolId: string; actorId: string; slotId: string; classId: string; subjectId: string; teacherId: string; dayOfWeek: number; period: number; }) {
  await requirePermission(tx, input.actorId, "classes:manage");
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 6 || !Number.isInteger(input.period) || input.period < 1 || input.period > 16) throw new AppError("Invalid timetable day or period. Use Monday(1)–Saturday(6), period 1–16.", 400, "INVALID_TIMETABLE_SLOT");
  const slot = await tx.timetableSlot.findFirst({ where: { id: input.slotId, schoolId: input.schoolId } });
  if (!slot) throw new AppError("Timetable slot not found in this school.", 404, "NOT_FOUND");
  const [classRow, subject, teacher] = await Promise.all([
    tx.class.findFirst({ where: { id: input.classId, schoolId: input.schoolId }, select: { id: true } }),
    tx.subject.findFirst({ where: { id: input.subjectId, schoolId: input.schoolId }, select: { id: true } }),
    tx.user.findFirst({ where: { id: input.teacherId, schoolId: input.schoolId, status: "active" }, select: { id: true, userRoles: { select: { role: { select: { name: true, key: true } } } } } })
  ]);
  if (!classRow) throw new AppError("Class not found in this school.", 404, "CLASS_NOT_FOUND");
  if (!subject) throw new AppError("Subject not found in this school.", 404, "SUBJECT_NOT_FOUND");
  if (!teacher) throw new AppError("Teacher not found in this school.", 404, "TEACHER_NOT_FOUND");
  if (!teacher.userRoles.some(({ role }) => isTeachingRoleKey(role.key?.trim() || roleKeyForName(role.name)))) throw new AppError("Selected user is not an eligible teaching staff member.", 409, "TEACHER_NOT_ELIGIBLE");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable-slot:${input.schoolId}:${input.dayOfWeek}:${input.period}`}))`;
  const teacherBusy = await tx.timetableSlot.findFirst({ where: { schoolId: input.schoolId, teacherId: input.teacherId, dayOfWeek: input.dayOfWeek, period: input.period, NOT: { id: slot.id } }, select: { id: true } });
  if (teacherBusy) throw new AppError("This teacher is already teaching another class at this time.", 409, "TEACHER_BUSY");
  const classBusy = await tx.timetableSlot.findFirst({ where: { schoolId: input.schoolId, classId: input.classId, dayOfWeek: input.dayOfWeek, period: input.period, NOT: { id: slot.id } }, select: { id: true } });
  if (classBusy) throw new AppError("This class already has a lesson at this time.", 409, "CLASS_SLOT_CONFLICT");
  const updated = await tx.timetableSlot.update({ where: { id: slot.id }, data: { classId: input.classId, subjectId: input.subjectId, teacherId: input.teacherId, dayOfWeek: input.dayOfWeek, period: input.period } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "timetable.slot_updated", entityType: "TimetableSlot", entityId: updated.id, before: slot, after: updated });
  return updated;
}

export async function deleteTimetableSlot(tx: TenantDb, input: { schoolId: string; actorId: string; slotId: string }) {
  await requirePermission(tx, input.actorId, "classes:manage");
  const slot = await tx.timetableSlot.findFirst({ where: { id: input.slotId, schoolId: input.schoolId } });
  if (!slot) throw new AppError("Timetable slot not found in this school.", 404, "NOT_FOUND");
  const deleted = await tx.timetableSlot.delete({ where: { id: slot.id } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "timetable.slot_deleted", entityType: "TimetableSlot", entityId: slot.id, before: slot });
  return deleted;
}

export async function suggestSubstitutes(tx: TenantDb, input: { schoolId: string; actorId: string; absentTeacherId: string; day: Date; period: number; asOf?: Date; }) {
  await requirePermission(tx, input.actorId, "classes:manage");
  const [settings, absentTeacher] = await Promise.all([
    tx.schoolSettings.findFirst({ where: { schoolId: input.schoolId } }),
    tx.user.findFirst({ where: { id: input.absentTeacherId, schoolId: input.schoolId, status: "active" }, select: { id: true } })
  ]);
  if (!absentTeacher) throw new AppError("Absent teacher was not found in this school.", 404, "TEACHER_NOT_FOUND");
  if (!settings?.expectedResumptionTime) throw new AppError("Attendance timing must be configured.", 409, "ATTENDANCE_NOT_CONFIGURED");
  const dayOfWeek = input.day.getUTCDay();
  const slots = await tx.timetableSlot.findMany({ where: { schoolId: input.schoolId, teacherId: input.absentTeacherId, dayOfWeek, period: input.period }, include: { class: true, subject: true } });
  if (slots.length === 0) return { reason: "no_assignment" as const, slots: [], suggestions: [] };
  const checkIn = await tx.attendanceEvent.findFirst({ where: { schoolId: input.schoolId, staffId: input.absentTeacherId, attendanceDate: input.day, type: "in" }, orderBy: { timestamp: "asc" } });
  const [hour, minute] = settings.expectedResumptionTime.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new AppError("Attendance timing configuration is invalid.", 409, "INVALID_ATTENDANCE_TIME");
  const threshold = hour * 60 + minute + settings.substituteLateMinutes;
  const asOf = input.asOf ?? new Date();
  const reason = !checkIn ? localMinutes(asOf, settings.timezone) > threshold ? "absent" : "not_due" : localMinutes(checkIn.timestamp, settings.timezone) > threshold ? "late" : "present";
  if (reason === "present" || reason === "not_due") return { reason, slots, suggestions: [] };
  const [teacherRows, busyRows] = await Promise.all([
    tx.timetableSlot.findMany({ where: { schoolId: input.schoolId }, distinct: ["teacherId"], select: { teacherId: true } }),
    tx.timetableSlot.findMany({ where: { schoolId: input.schoolId, dayOfWeek, period: input.period }, distinct: ["teacherId"], select: { teacherId: true } })
  ]);
  const busy = new Set(busyRows.map((row) => row.teacherId));
  const candidateIds = teacherRows.map((row) => row.teacherId).filter((id) => id !== input.absentTeacherId && !busy.has(id));
  const suggestions = await tx.user.findMany({ where: { schoolId: input.schoolId, id: { in: candidateIds }, status: "active" }, select: { id: true, name: true, userRoles: { select: { role: { select: { name: true, key: true } } } } } });
  return { reason, slots, suggestions: suggestions.filter((teacher) => teacher.userRoles.some(({ role }) => isTeachingRoleKey(role.key?.trim() || roleKeyForName(role.name)))).map(({ id, name }) => ({ id, name })) };
}

export async function confirmSubstitute(tx: TenantDb, input: { schoolId: string; actorId: string; timetableSlotId: string; substituteTeacherId: string; assignmentDate: Date; }) {
  await requirePermission(tx, input.actorId, "classes:manage");
  if (Number.isNaN(input.assignmentDate.getTime())) throw new AppError("Invalid assignment date.", 400, "INVALID_DATE");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`substitute-assignment:${input.schoolId}:${input.substituteTeacherId}:${input.assignmentDate.toISOString().slice(0, 10)}:${input.timetableSlotId}`}))`;
  const slot = await tx.timetableSlot.findFirst({ where: { id: input.timetableSlotId, schoolId: input.schoolId } });
  if (!slot) throw new AppError("Timetable slot not found in this school.", 404, "NOT_FOUND");
  const substitute = await tx.user.findFirst({ where: { id: input.substituteTeacherId, schoolId: input.schoolId, status: "active" }, select: { id: true, userRoles: { select: { role: { select: { name: true, key: true } } } } } });
  if (!substitute) throw new AppError("Substitute teacher not found in this school.", 404, "TEACHER_NOT_FOUND");
  if (!substitute.userRoles.some(({ role }) => isTeachingRoleKey(role.key?.trim() || roleKeyForName(role.name)))) throw new AppError("Selected substitute is not an eligible teaching staff member.", 409, "TEACHER_NOT_ELIGIBLE");
  const busy = await tx.timetableSlot.findFirst({ where: { schoolId: input.schoolId, teacherId: input.substituteTeacherId, dayOfWeek: slot.dayOfWeek, period: slot.period }, select: { id: true } });
  if (busy) throw new AppError("Selected substitute is already teaching in this period.", 409, "SUBSTITUTE_BUSY");
  const existing = await tx.substituteAssignment.findFirst({ where: { schoolId: input.schoolId, timetableSlotId: slot.id, assignmentDate: input.assignmentDate }, select: { id: true } });
  if (existing) throw new AppError("A substitute is already assigned for this lesson.", 409, "SUBSTITUTE_ALREADY_ASSIGNED");
  let assignment;
  try { assignment = await tx.substituteAssignment.create({ data: { schoolId: input.schoolId, timetableSlotId: slot.id, substituteTeacherId: input.substituteTeacherId, assignedBy: input.actorId, assignmentDate: input.assignmentDate } }); }
  catch (error) { if ((error as { code?: string }).code === "P2002") throw new AppError("A substitute is already assigned for this lesson.", 409, "SUBSTITUTE_ALREADY_ASSIGNED"); throw error; }
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "substitute.confirmed", entityType: "SubstituteAssignment", entityId: assignment.id, after: assignment });
  return assignment;
}
