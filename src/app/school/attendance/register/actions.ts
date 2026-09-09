"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { AppError, ForbiddenError } from "@/lib/errors";

type AttendanceEntry = { studentId: string; type: "present" | "late" | "absent" | "excused" };

const MAX_REGISTER_ENTRIES = 500;

function canonicalEntry(entry: AttendanceEntry) {
  if (entry.type === "present") return { type: "in", isLate: false };
  if (entry.type === "late") return { type: "in", isLate: true };
  return { type: entry.type, isLate: false };
}

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
    const canRecordAll = await hasPermission(tx, session.userId, "attendance:record_all") || await hasPermission(tx, session.userId, "attendance:review");
    if (!canRecordAll) {
      await requirePermission(tx, session.userId, "attendance:record_assigned");
      const assigned = await tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId, classTeacherId: session.userId }, select: { id: true } });
      if (!assigned) throw new ForbiddenError("You may save attendance only for your assigned class. School leadership can use all-class attendance permissions when needed.");
    }

    const uniqueIds = [...new Set(entries.map((entry) => entry.studentId))];
    if (uniqueIds.length !== entries.length) throw new AppError("A learner appears more than once in this register.", 400, "DUPLICATE_REGISTER_ENTRY");
    const students = await tx.student.findMany({ where: { classId, status: "active", id: { in: uniqueIds } }, select: { id: true } });
    if (students.length !== uniqueIds.length) throw new AppError("One or more learners no longer belong to this class or school.", 400, "INVALID_REGISTER");
    const existing = await tx.attendanceEvent.findMany({ where: { attendanceDate: dateValue, studentId: { in: uniqueIds } }, select: { studentId: true } });
    if (existing.length) throw new AppError("Attendance arrived for one or more learners while this register was open. Refresh before saving so device and manual records are not duplicated.", 409, "REGISTER_STALE");

    const now = new Date();
    await tx.attendanceEvent.createMany({
      data: entries.map((entry) => {
        const canonical = canonicalEntry(entry);
        return {
          schoolId: session.schoolId,
          studentId: entry.studentId,
          type: canonical.type,
          method: "school_register",
          timestamp: now,
          attendanceDate: dateValue,
          isLate: canonical.isLate,
          recordedBy: session.userId,
        };
      })
    });
    await tx.auditLogSchool.createMany({
      data: entries.map((entry) => {
        const canonical = canonicalEntry(entry);
        return {
          schoolId: session.schoolId,
          actorId: session.userId,
          action: "attendance.recorded",
          entityType: "AttendanceEvent",
          entityId: `${classId}:${attendanceDate}:${entry.studentId}`,
          after: { classId, studentId: entry.studentId, attendanceDate, registerDecision: entry.type, type: canonical.type, isLate: canonical.isLate, method: "school_register" },
        };
      })
    });
  });
  revalidatePath("/school/attendance");
  revalidatePath("/school/attendance/register");
  return { ok: true as const, message: `Attendance saved for ${entries.length} learner${entries.length === 1 ? "" : "s"}.` };
}
