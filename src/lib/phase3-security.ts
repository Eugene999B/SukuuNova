import type { TenantDb } from "./db";
import { ForbiddenError } from "./errors";

export async function enforceParentStudentScope(tx: TenantDb, actorId: string, studentId: string) {
  const guardian = await tx.guardian.findFirst({ where: { userId: actorId }, select: { id: true } });
  if (!guardian) {
    const parentRole = await tx.userRole.findFirst({ where: { userId: actorId, role: { name: "Parent" } }, select: { userId: true } });
    if (parentRole) throw new ForbiddenError("A linked guardian profile is required for parent access to this student.");
    return;
  }
  const linked = await tx.studentGuardian.findFirst({ where: { guardianId: guardian.id, studentId }, select: { studentId: true } });
  if (!linked) throw new ForbiddenError("Parents may access this student only when the student is linked to the guardian account.");
}
