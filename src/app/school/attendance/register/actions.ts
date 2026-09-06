"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { AppError } from "@/lib/errors";

type AttendanceEntry = { studentId: string; type: "present" | "late" | "absent" | "excused"; isLate?: boolean };

// One request writes the whole register in a single transaction; cap it so a
// malformed client cannot force a multi-thousand-row write.
const MAX_REGISTER_ENTRIES = 500;

export async function saveClassAttendance(classId: string, attendanceDate: string, entries: AttendanceEntry[]) {
  const session = await requireSchoolSession();
  if (!classId || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) || !entries.length) throw new AppError("Choose a class, date and at least one learner before saving.", 400, "INVALID_REGISTER");
  if (entries.length > MAX_REGISTER_ENTRIES) throw new AppError(`A register saves at most ${MAX_REGISTER_ENTRIES} learners at once. Split the class and save again.`, 413, "REGISTER_TOO_LARGE");
  for (const entry of entries) {
    if (typeof entry.studentId !== "string" || !entry.studentId || entry.studentId.length > 100) throw new AppError("Each register entry needs a valid learner.", 400, "INVALID_REGISTER");
  }
  const dateValue = new Date(`${attendanceDate}T00:00:00.000Z`);
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "attendance:record");
    // Frozen terms stay frozen: a register dated inside a locked term is
    // rejected, matching the gradebook term-lock rule.
    const lockedTerm = await tx.term.findFirst({ where: { schoolId: session.schoolId, isLocked: true, startDate: { lte: dateValue }, endDate: { gte: dateValue } }, select: { id: true, name: true } });
    if (lockedTerm) throw new AppError(`Term "${lockedTerm.name}" is locked. Attendance can no longer be recorded for that period.`, 409, "TERM_LOCKED");
    const uniqueIds = [...new Set(entries.map((entry) => entry.studentId))];
    if (uniqueIds.length !== entries.length) throw new AppError("A learner appears more than once in this register.", 400, "DUPLICATE_REGISTER_ENTRY");
    const students = await tx.student.findMany({ where: { classId, status: "active", id: { in: uniqueIds } }, select: { id: true } });
    if (students.length !== uniqueIds.length) throw new AppError("One or more learners no longer belong to this class or school.", 400, "INVALID_REGISTER");
    const existing = await tx.attendanceEvent.findMany({ where: { attendanceDate: dateValue, studentId: { in: uniqueIds } }, select: { studentId: true } });
    if (existing.length) throw new AppError("Some learners already have attendance recorded for this date. Refresh the register before saving again.", 409, "REGISTER_ALREADY_SAVED");
    const now = new Date();
    await tx.attendanceEvent.createMany({ data: entries.map((entry) => ({ schoolId: session.schoolId, studentId: entry.studentId, type: entry.type, method: "school_register", timestamp: now, attendanceDate: dateValue, isLate: Boolean(entry.isLate) || entry.type === "late", recordedBy: session.userId })) });
    await tx.auditLogSchool.createMany({ data: entries.map((entry) => ({ schoolId: session.schoolId, actorId: session.userId, action: "attendance.recorded", entityType: "AttendanceEvent", entityId: `${classId}:${attendanceDate}:${entry.studentId}`, after: { classId, studentId: entry.studentId, attendanceDate, type: entry.type, isLate: Boolean(entry.isLate) || entry.type === "late" } })) });
  });
  revalidatePath("/school/attendance");
  revalidatePath("/school/attendance/register");
  return { ok: true as const, message: `Attendance saved for ${entries.length} learners.` };
}
