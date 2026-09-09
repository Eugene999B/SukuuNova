"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { AppError, ForbiddenError } from "@/lib/errors";
import { getAttendanceControlConfig, localAttendanceClock } from "@/lib/attendance-control";

type AttendanceEntry = { studentId: string; type: "present" | "late" | "absent" | "excused" };
const MAX_REGISTER_ENTRIES = 500;

export async function saveClassAttendance(classId: string, attendanceDate: string, entries: AttendanceEntry[]) {
  const session = await requireSchoolSession();
  if (!classId || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) || !entries.length) throw new AppError("Choose a class, date and at least one unrecorded learner before saving.", 400, "INVALID_REGISTER");
  if (entries.length > MAX_REGISTER_ENTRIES) throw new AppError(`A register saves at most ${MAX_REGISTER_ENTRIES} learners at once. Split the class and save again.`, 413, "REGISTER_TOO_LARGE");
  for (const entry of entries) {
    if (typeof entry.studentId !== "string" || !entry.studentId || entry.studentId.length > 100) throw new AppError("Each register entry needs a valid learner.", 400, "INVALID_REGISTER");
  }
  const dateValue = new Date(`${attendanceDate}T00:00:00.000Z`);

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "attendance:record");
    const [canAll, canReview, canAssigned, selectedClass, control, settings] = await Promise.all([
      hasPermission(tx, session.userId, "attendance:record_all"),
      hasPermission(tx, session.userId, "attendance:review"),
      hasPermission(tx, session.userId, "attendance:record_assigned"),
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true, classTeacherId: true } }),
      getAttendanceControlConfig(tx, session.schoolId),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } })
    ]);
    if (!selectedClass) throw new AppError("Class was not found in this school.", 404, "NOT_FOUND");
    if (!canAll && !canReview && (!canAssigned || selectedClass.classTeacherId !== session.userId)) {
      throw new ForbiddenError("Class teachers may record the manual register only for their assigned class.");
    }
    if (!control.config.methods.manualStudent) throw new AppError("Manual student attendance is disabled by the school.", 403, "ATTENDANCE_METHOD_DISABLED");

    const timezone = settings?.timezone || "Africa/Accra";
    const nowClock = localAttendanceClock(new Date(), timezone);
    if (attendanceDate === nowClock.dateKey) {
      const [closeHour, closeMinute] = control.config.student.manualRegisterCloseTime.split(":").map(Number);
      const closeMinutes = closeHour * 60 + closeMinute;
      if (nowClock.minutes > closeMinutes && !canReview) {
        throw new AppError("Today's normal class register is closed. An attendance reviewer can still make an authorised correction.", 409, "MANUAL_REGISTER_CLOSED");
      }
    }

    const uniqueIds = [...new Set(entries.map((entry) => entry.studentId))];
    if (uniqueIds.length !== entries.length) throw new AppError("A learner appears more than once in this register.", 400, "DUPLICATE_REGISTER_ENTRY");
    const students = await tx.student.findMany({ where: { schoolId: session.schoolId, classId, status: "active", id: { in: uniqueIds } }, select: { id: true } });
    if (students.length !== uniqueIds.length) throw new AppError("One or more learners no longer belong to this class or school.", 400, "INVALID_REGISTER");

    const existing = await tx.attendanceEvent.findMany({
      where: { schoolId: session.schoolId, attendanceDate: dateValue, studentId: { in: uniqueIds } },
      select: { studentId: true, method: true }
    });
    if (existing.length) {
      throw new AppError("One or more selected learners were recorded while this register was open. Refresh the class so verified rows can be locked before saving the remaining learners.", 409, "REGISTER_STALE");
    }

    const now = new Date();
    const rows = entries.map((entry) => ({
      schoolId: session.schoolId,
      studentId: entry.studentId,
      type: entry.type === "present" || entry.type === "late" ? "in" : entry.type,
      method: "school_register",
      timestamp: now,
      attendanceDate: dateValue,
      isLate: entry.type === "late",
      recordedBy: session.userId
    }));
    await tx.attendanceEvent.createMany({ data: rows });
    await tx.auditLogSchool.createMany({
      data: entries.map((entry) => ({
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "attendance.recorded",
        entityType: "AttendanceEvent",
        entityId: `${classId}:${attendanceDate}:${entry.studentId}`,
        after: { classId, studentId: entry.studentId, attendanceDate, type: entry.type, method: "school_register", isLate: entry.type === "late" }
      }))
    });
  });

  revalidatePath("/school/attendance");
  revalidatePath("/school/attendance/register");
  revalidatePath("/teacher/attendance");
  return { ok: true as const, message: `Attendance saved for ${entries.length} learner${entries.length === 1 ? "" : "s"}. Existing biometric/QR rows were preserved.` };
}
