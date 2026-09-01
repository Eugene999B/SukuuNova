"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

type AttendanceEntry = { studentId: string; type: "present" | "late" | "absent" | "excused"; isLate?: boolean };

export async function saveClassAttendance(classId: string, attendanceDate: string, entries: AttendanceEntry[]) {
  const session = await requireSchoolSession();
  if (!classId || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) || !entries.length) throw new Error("Choose a class, date and at least one learner before saving.");
  const dateValue = new Date(`${attendanceDate}T00:00:00.000Z`);
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "attendance:record");
    const students = await tx.student.findMany({ where: { classId, status: "active", id: { in: entries.map((x) => x.studentId) } }, select: { id: true, name: true } });
    if (students.length !== entries.length) throw new Error("One or more learners no longer belong to this class or school.");
    const existing = await tx.attendanceEvent.findMany({ where: { attendanceDate: dateValue, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true } });
    const existingIds = new Set(existing.map((x) => x.studentId));
    if (existingIds.size) throw new Error("Some learners already have attendance recorded for this date. Refresh the register before saving again.");
    const now = new Date();
    await tx.$transaction(entries.map((entry) => tx.attendanceEvent.create({ data: { schoolId: session.schoolId, studentId: entry.studentId, type: entry.type, method: "school_register", timestamp: now, attendanceDate: dateValue, isLate: Boolean(entry.isLate) || entry.type === "late", recordedBy: session.userId } })));
    await tx.auditLogSchool.createMany({ data: entries.map((entry) => ({ schoolId: session.schoolId, actorId: session.userId, action: "attendance.recorded", entityType: "AttendanceEvent", entityId: `${classId}:${attendanceDate}:${entry.studentId}`, after: { classId, studentId: entry.studentId, attendanceDate, type: entry.type, isLate: Boolean(entry.isLate) || entry.type === "late" } })) });
  });
  revalidatePath("/school/attendance");
  revalidatePath("/school/attendance/register");
  return { ok: true as const, message: `Attendance saved for ${entries.length} learners.` };
}
