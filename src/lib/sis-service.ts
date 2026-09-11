import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { hasPermission } from "./rbac";

export async function visibleStudents(tx: TenantDb, userId: string) {
  if (await hasPermission(tx, userId, "students:write") || await hasPermission(tx, userId, "scores:write:all")) {
    return tx.student.findMany({ include: { class: true, guardians: { include: { guardian: true } } } });
  }
  if (await hasPermission(tx, userId, "scores:write:assigned")) {
    return tx.student.findMany({ where: {
      OR: [
        { class: { classTeacherId: userId } },
        { class: { subjectAssignments: { some: { teacherId: userId } } } }
      ]
    }, include: { class: true } });
  }
  if (await hasPermission(tx, userId, "parents:read_linked")) {
    return tx.student.findMany({ where: {
      guardians: { some: { guardian: { userId } } }
    }, include: { class: true } });
  }
  throw new ForbiddenError("No student records are visible to this account.");
}

export async function visibleStudentById(tx: TenantDb, userId: string, studentId: string) {
  const students = await visibleStudents(tx, userId);
  const student = students.find((row) => row.id === studentId);
  if (!student) throw new AppError("Student not found.", 404, "STUDENT_NOT_FOUND");
  return student;
}
