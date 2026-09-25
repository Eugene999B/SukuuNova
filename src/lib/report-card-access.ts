import type { TenantDb } from "./db";
import { getSchoolAuthorization } from "./authorization";
import { requirePermission } from "./rbac";
import { AppError, ForbiddenError } from "./errors";
import { reportSnapshotClassId, resolveStudentTermClass } from "./student-term-context";

export async function reportClassAccess(tx: TenantDb, actorId: string, permission = "report_cards:view") {
  await requirePermission(tx, actorId, permission);
  const access = await getSchoolAuthorization(tx, actorId);
  if (access.isElevated || access.can("scores:write:all")) return { schoolId: access.user.schoolId, classIds: null as string[] | null };
  if (!access.isTeacher) throw new ForbiddenError("Only academic staff may access school report cards.");
  const classes = await tx.class.findMany({
    where: { schoolId: access.user.schoolId, OR: [{ classTeacherId: actorId }, { subjectAssignments: { some: { teacherId: actorId } } }] },
    select: { id: true },
  });
  return { schoolId: access.user.schoolId, classIds: classes.map(row => row.id) };
}

export async function requireReportAccess(tx: TenantDb, actorId: string, reportId: string) {
  const access = await reportClassAccess(tx, actorId);
  const report = await tx.reportCard.findFirst({
    where: { id: reportId, schoolId: access.schoolId },
    select: { id: true, studentId: true, termId: true, calculationSnapshot: true },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (access.classIds !== null) {
    const classId = reportSnapshotClassId(report.calculationSnapshot) ??
      (await resolveStudentTermClass(tx, { schoolId: access.schoolId, studentId: report.studentId, termId: report.termId })).classId;
    if (!access.classIds.includes(classId)) throw new ForbiddenError("You may access reports only for classes assigned to you.");
  }
  return report;
}
