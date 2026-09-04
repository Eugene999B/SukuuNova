import { withTenant } from "./db";
import { appendPlatformAudit } from "./audit";
import { getPlatformSchoolScope, requirePlatformPermission } from "./platform-permissions";
import type { PlatformSession } from "./auth";
import { AppError } from "./errors";

export async function performSchoolLifecycle(session: PlatformSession, schoolId: string, action: "lock" | "suspend" | "reactivate" | "archive" | "delete") {
  await requirePlatformPermission(session, "schools.suspend");
  if (action === "delete" && session.role !== "super_admin") throw new AppError("Only Super Admin can decommission a school.", 403, "FORBIDDEN");
  const scope = await getPlatformSchoolScope(session);
  if (scope !== null && !scope.includes(schoolId)) throw new AppError("School is outside your assigned platform scope.", 403, "FORBIDDEN");
  return withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, status: true } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const beforeStatus = school.status;
    const targetStatus = action === "lock" ? "locked" : action === "suspend" ? "suspended" : action === "reactivate" ? "active" : action === "archive" ? "archived" : "deleted";
    const changed = beforeStatus !== targetStatus;
    if (changed) {
      await tx.school.update({ where: { id: schoolId }, data: { status: targetStatus } });
      await tx.schoolLoginDirectory.update({ where: { schoolId }, data: { status: targetStatus } });
    }
    const result = { ...school, beforeStatus, status: targetStatus, changed };
    await appendPlatformAudit({ actorId: session.adminId, action: `school.lifecycle.${action}`, targetSchoolId: schoolId, targetEntity: "School", meta: { beforeStatus, afterStatus: targetStatus, changed } }, tx);
    return result;
  });
}
