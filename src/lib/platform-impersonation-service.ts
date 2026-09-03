import { createId } from "@paralleldrive/cuid2";
import { AppError, ForbiddenError } from "./errors";
import { appendPlatformAudit, appendSchoolAudit } from "./audit";
import { db, withTenant } from "./db";

async function requireImpersonationPermission(adminId: string, role: string) {
  if (role === "super_admin") return;
  const rows = await db.$queryRawUnsafe<Array<{ permission: string }>>(
    `SELECT "permission" FROM "PlatformAdminPermission" WHERE "adminId"=$1 AND "permission"='schools.impersonate' LIMIT 1`,
    adminId,
  );
  if (!rows.length) throw new ForbiddenError("Missing platform permission: schools.impersonate");
}

function validateReason(value: string) {
  const reason = value.trim();
  if (reason.length < 5 || reason.length > 500) throw new AppError("A support reason of 5–500 characters is required.", 400, "INVALID_INPUT");
  return reason;
}

export async function impersonatePlatformUser(input: {
  adminId: string;
  adminRole: string;
  schoolId: string;
  userId: string;
  reason: string;
}) {
  await requireImpersonationPermission(input.adminId, input.adminRole);
  const reason = validateReason(input.reason);

  return withTenant(input.schoolId, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, status: true } });
    if (!user || user.status !== "active") throw new AppError("Target user is not active.", 404, "USER_NOT_FOUND");

    const id = createId();
    await tx.$executeRawUnsafe(
      `INSERT INTO "ImpersonationLog" ("id","platformAdminId","schoolId","impersonatedUserId","reason") VALUES ($1,$2,$3,$4,$5)`,
      id,
      input.adminId,
      input.schoolId,
      input.userId,
      reason,
    );

    await appendPlatformAudit({
      actorId: input.adminId,
      action: "impersonation.started",
      targetSchoolId: input.schoolId,
      targetEntity: `User:${input.userId}`,
      meta: { impersonationId: id, impersonatedUserId: input.userId, reason },
    });

    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.userId,
      action: "platform.impersonation_started",
      entityType: "ImpersonationLog",
      entityId: id,
      after: { platformAdminId: input.adminId, reason, visibleToSchool: true },
    });

    return { id, userId: user.id, userName: user.name, reason };
  });
}
