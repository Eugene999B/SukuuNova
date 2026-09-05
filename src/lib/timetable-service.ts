import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { roleKeyForName, isTeachingRoleKey } from "./authorization";
import { getAcademicEngineConfig } from "./academic-engine";

function localMinutes(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

type SlotEndpoint = { classId: string; teacherId: string; venue: string | null; dayOfWeek: number; period: number };

async function endpointConflicts(tx: TenantDb, schoolId: string, endpoint: SlotEndpoint, ignoreSlotIds: string[] = []): Promise<string | null> {
  const teacherBusy = await tx.timetableSlot.findFirst({ where: { schoolId, teacherId: endpoint.teacherId, dayOfWeek: endpoint.dayOfWeek, period: endpoint.period, NOT: ignoreSlotIds.length ? { id: { in: ignoreSlotIds } } : undefined }, select: { id: true, classId: true } });
  if (teacherBusy) return "This teacher is already teaching another class at this time.";
  const classBusy = await tx.timetableSlot.findFirst({ where: { schoolId, classId: endpoint.classId, dayOfWeek: endpoint.dayOfWeek, period: endpoint.period, NOT: ignoreSlotIds.length ? { id: { in: ignoreSlotIds } } : undefined }, select: { id: true } });
  if (classBusy) return "This class already has a lesson at this time.";
  if (endpoint.venue) {
    const roomBusy = await tx.timetableSlot.findFirst({ where: { schoolId, venue: endpoint.venue, dayOfWeek: endpoint.dayOfWeek, period: endpoint.period, NOT: ignoreSlotIds.length ? { id: { in: ignoreSlotIds } } : undefined }, select: { id: true } });
    if (roomBusy) return "This room is already booked at this time.";
  }
  const config = await getAcademicEngineConfig(tx, schoolId);
  const timetable = config.timetable as { teacherUnavailability?: Record<string, string[]> };
  const blocked = timetable.teacherUnavailability?.[endpoint.teacherId] ?? [];
  if (blocked.includes(`${endpoint.dayOfWeek}:${endpoint.period}`)) return "This teacher is marked unavailable at this time.";
  return null;
}

function cleanVenue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 60);
  return trimmed ? trimmed : null;
}

async function isUnavailable(tx: TenantDb, schoolId: string, teacherId: string, dayOfWeek: number, period: number): Promise<boolean> {
  const config = await getAcademicEngineConfig(tx, schoolId);
  const timetable = config.timetable as { teacherUnavailability?: Record<string, string[]> };
  return (timetable.teacherUnavailability?.[teacherId] ?? []).includes(`${dayOfWeek}:${period}`);
}

export async function createTimetableSlot(tx: TenantDb, input: { schoolId: string; actorId: string; classId: string; subjectId: string; teacherId: string; dayOfWeek: number; period: number; venue?: string | null; }) {
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
  const venue = cleanVenue(input.venue);
  if (venue) {
    const roomBusy = await tx.timetableSlot.findFirst({ where: { schoolId: input.schoolId, venue, dayOfWeek: input.dayOfWeek, period: input.period }, select: { id: true } });
    if (roomBusy) throw new AppError("This room is already booked at this time.", 409, "ROOM_BUSY");
  }
  if (await isUnavailable(tx, input.schoolId, input.teacherId, input.dayOfWeek, input.period)) throw new AppError("This teacher is marked unavailable at this time.", 409, "TEACHER_UNAVAILABLE");
  const slot = await tx.timetableSlot.create({ data: { schoolId: input.schoolId, classId: input.classId, subjectId: input.subjectId, teacherId: input.teacherId, dayOfWeek: input.dayOfWeek, period: input.period, venue } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "timetable.slot_saved", entityType: "TimetableSlot", entityId: slot.id, after: slot });
  return slot;
}

export async function updateTimetableSlot(tx: TenantDb, input: { schoolId: string; actorId: string; slotId: string; classId: string; subjectId: string; teacherId: string; dayOfWeek: number; period: number; venue?: string | null; }) {
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
  const venue = cleanVenue(input.venue ?? (slot as { venue?: string | null }).venue);
  if (venue) {
    const roomBusy = await tx.timetableSlot.findFirst({ where: { schoolId: input.schoolId, venue, dayOfWeek: input.dayOfWeek, period: input.period, NOT: { id: slot.id } }, select: { id: true } });
    if (roomBusy) throw new AppError("This room is already booked at this time.", 409, "ROOM_BUSY");
  }
  if (await isUnavailable(tx, input.schoolId, input.teacherId, input.dayOfWeek, input.period)) throw new AppError("This teacher is marked unavailable at this time.", 409, "TEACHER_UNAVAILABLE");
  const updated = await tx.timetableSlot.update({ where: { id: slot.id }, data: { classId: input.classId, subjectId: input.subjectId, teacherId: input.teacherId, dayOfWeek: input.dayOfWeek, period: input.period, venue } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "timetable.slot_updated", entityType: "TimetableSlot", entityId: updated.id, before: slot, after: updated });
  return updated;
}

export async function swapTimetableSlots(tx: TenantDb, input: { schoolId: string; actorId: string; slotIdA: string; slotIdB: string }) {
  await requirePermission(tx, input.actorId, "classes:manage");
  if (input.slotIdA === input.slotIdB) throw new AppError("Choose two different lessons to swap.", 400, "INVALID_SWAP");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable-swap:${input.schoolId}:${[input.slotIdA, input.slotIdB].sort().join(":")}`}))`;
  const [a, b] = await Promise.all([
    tx.timetableSlot.findFirst({ where: { id: input.slotIdA, schoolId: input.schoolId } }),
    tx.timetableSlot.findFirst({ where: { id: input.slotIdB, schoolId: input.schoolId } }),
  ]);
  if (!a || !b) throw new AppError("One of the lessons was not found in this school.", 404, "NOT_FOUND");
  const aEnd: SlotEndpoint = { classId: a.classId, teacherId: a.teacherId, venue: (a as { venue?: string | null }).venue ?? null, dayOfWeek: b.dayOfWeek, period: b.period };
  const bEnd: SlotEndpoint = { classId: b.classId, teacherId: b.teacherId, venue: (b as { venue?: string | null }).venue ?? null, dayOfWeek: a.dayOfWeek, period: a.period };
  const conflictA = await endpointConflicts(tx, input.schoolId, aEnd, [a.id, b.id]);
  if (conflictA) throw new AppError(`Swapping would break a rule for ${a.classId}: ${conflictA}`, 409, "SWAP_CONFLICT");
  const conflictB = await endpointConflicts(tx, input.schoolId, bEnd, [a.id, b.id]);
  if (conflictB) throw new AppError(`Swapping would break a rule for ${b.classId}: ${conflictB}`, 409, "SWAP_CONFLICT");
  if (await isUnavailable(tx, input.schoolId, aEnd.teacherId, aEnd.dayOfWeek, aEnd.period)) throw new AppError("Swapping would place a teacher into a marked-unavailable slot.", 409, "TEACHER_UNAVAILABLE");
  if (await isUnavailable(tx, input.schoolId, bEnd.teacherId, bEnd.dayOfWeek, bEnd.period)) throw new AppError("Swapping would place a teacher into a marked-unavailable slot.", 409, "TEACHER_UNAVAILABLE");
  await tx.timetableSlot.update({ where: { id: a.id }, data: { dayOfWeek: b.dayOfWeek, period: b.period } });
  const swapped = await tx.timetableSlot.update({ where: { id: b.id }, data: { dayOfWeek: a.dayOfWeek, period: a.period } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "timetable.slots_swapped", entityType: "TimetableSlot", entityId: `${a.id}:${b.id}`, before: { a: { dayOfWeek: a.dayOfWeek, period: a.period }, b: { dayOfWeek: b.dayOfWeek, period: b.period } }, after: { a: { dayOfWeek: b.dayOfWeek, period: b.period }, b: { dayOfWeek: a.dayOfWeek, period: a.period } } });
  return swapped;
}

export async function moveTimetableSlot(tx: TenantDb, input: { schoolId: string; actorId: string; slotId: string; dayOfWeek: number; period: number }) {
  await requirePermission(tx, input.actorId, "classes:manage");
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 6 || !Number.isInteger(input.period) || input.period < 1 || input.period > 16) throw new AppError("Invalid timetable day or period. Use Monday(1)–Saturday(6), period 1–16.", 400, "INVALID_TIMETABLE_SLOT");
  const slot = await tx.timetableSlot.findFirst({ where: { id: input.slotId, schoolId: input.schoolId } });
  if (!slot) throw new AppError("Timetable slot not found in this school.", 404, "NOT_FOUND");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable-slot:${input.schoolId}:${input.dayOfWeek}:${input.period}`}))`;
  const endpoint: SlotEndpoint = { classId: slot.classId, teacherId: slot.teacherId, venue: (slot as { venue?: string | null }).venue ?? null, dayOfWeek: input.dayOfWeek, period: input.period };
  const conflict = await endpointConflicts(tx, input.schoolId, endpoint, [slot.id]);
  if (conflict) throw new AppError(`This move is not allowed: ${conflict}`, 409, "MOVE_CONFLICT");
  if (await isUnavailable(tx, input.schoolId, slot.teacherId, input.dayOfWeek, input.period)) throw new AppError("This teacher is marked unavailable at this time.", 409, "TEACHER_UNAVAILABLE");
  const moved = await tx.timetableSlot.update({ where: { id: slot.id }, data: { dayOfWeek: input.dayOfWeek, period: input.period } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "timetable.slot_moved", entityType: "TimetableSlot", entityId: slot.id, before: { dayOfWeek: slot.dayOfWeek, period: slot.period }, after: { dayOfWeek: moved.dayOfWeek, period: moved.period } });
  return moved;
}

export async function getTeacherWeeklyGrid(tx: TenantDb, input: { schoolId: string; teacherId: string }) {
  const teacher = await tx.user.findFirst({ where: { id: input.teacherId, schoolId: input.schoolId }, select: { id: true, name: true } });
  if (!teacher) throw new AppError("Teacher not found in this school.", 404, "TEACHER_NOT_FOUND");
  const slots = await tx.timetableSlot.findMany({
    where: { schoolId: input.schoolId, teacherId: input.teacherId },
    include: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });
  const byDay = new Map<number, typeof slots>();
  for (const s of slots) byDay.set(s.dayOfWeek, [...(byDay.get(s.dayOfWeek) ?? []), s]);
  return { teacher, totalLessons: slots.length, days: [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([dayOfWeek, daySlots]) => ({ dayOfWeek, lessons: daySlots })) };
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
