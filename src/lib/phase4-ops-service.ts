import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { db, withTenant } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendPlatformAudit, appendSchoolAudit } from "./audit";
import { hasPermission, requirePermission } from "./rbac";

function text(value: unknown, field: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new AppError(`${field} is required.`, 400, "INVALID_INPUT");
  }
  return value.trim();
}

function requirePlatformPermission(role: string, key: "schools:impersonate") {
  const allowed = role === "super_admin" || role === "support_admin";
  if (!allowed) throw new ForbiddenError(`Missing platform permission: ${key}`);
}

export async function impersonateUser(input: {
  adminId: string;
  adminRole: string;
  schoolId: string;
  userId: string;
  reason: string;
}) {
  requirePlatformPermission(input.adminRole, "schools:impersonate");
  return withTenant(input.schoolId, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, status: true },
    });
    if (!user || user.status !== "active") {
      throw new AppError("Target user is not active.", 404, "USER_NOT_FOUND");
    }
    const reason = text(input.reason, "reason", 500);
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
      targetEntity: "User",
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

export async function endImpersonation(
  schoolId: string,
  impersonationId: string,
  adminId: string,
) {
  return withTenant(schoolId, async (tx) => {
    const changed = await tx.$executeRawUnsafe(
      `UPDATE "ImpersonationLog" SET "endedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "schoolId"=$2 AND "platformAdminId"=$3 AND "endedAt" IS NULL`,
      impersonationId,
      schoolId,
      adminId,
    );
    if (changed !== 1) {
      throw new AppError("Impersonation session not found or already ended.", 409, "IMPERSONATION_CLOSED");
    }
    await appendPlatformAudit({
      actorId: adminId,
      action: "impersonation.ended",
      targetSchoolId: schoolId,
      targetEntity: "User",
      meta: { impersonationId },
    });
    return { ok: true };
  });
}

export async function schoolImpersonationNotice(schoolId: string, actorId: string) {
  return withTenant(schoolId, (tx) =>
    tx.$queryRawUnsafe<unknown[]>(
      `SELECT "id","reason","startedAt","endedAt" FROM "ImpersonationLog" WHERE "schoolId"=$1 AND "impersonatedUserId"=$2 ORDER BY "startedAt" DESC LIMIT 20`,
      schoolId,
      actorId,
    ),
  );
}

export async function riskFlags(schoolId: string, actorId: string) {
  return withTenant(schoolId, async (tx) => {
    await requirePermission(tx, actorId, "risk_flags:view");
    const teacherClasses = await tx.class.findMany({
      where: { classTeacherId: actorId },
      select: { id: true },
    });
    const isTeacher =
      teacherClasses.length > 0 && !(await hasPermission(tx, actorId, "students:write"));
    if (isTeacher) {
      return tx.$queryRawUnsafe<unknown[]>(
        `SELECT r.*,s."name" AS "studentName",s."admissionNo" FROM "StudentRiskFlag" r JOIN "Student" s ON s."id"=r."studentId" AND s."schoolId"=r."schoolId" WHERE r."schoolId"=$1 AND r."resolvedAt" IS NULL AND s."classId" = ANY($2::text[]) ORDER BY r."flaggedAt" DESC LIMIT 300`,
        schoolId,
        teacherClasses.map((c) => c.id),
      );
    }
    return tx.$queryRawUnsafe<unknown[]>(
      `SELECT r.*,s."name" AS "studentName",s."admissionNo" FROM "StudentRiskFlag" r JOIN "Student" s ON s."id"=r."studentId" AND s."schoolId"=r."schoolId" WHERE r."schoolId"=$1 AND r."resolvedAt" IS NULL ORDER BY r."flaggedAt" DESC LIMIT 300`,
      schoolId,
    );
  });
}

export async function runRiskScanForSchool(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const students = await tx.student.findMany({
      where: { status: "active" },
      select: { id: true },
    });
    let created = 0;
    for (const student of students) {
      const now = Date.now();
      const d14 = new Date(now - 14 * 86400000);
      const d28 = new Date(now - 28 * 86400000);
      const [recent, prior, sr, sp, arrears] = await Promise.all([
        tx.attendanceEvent.count({
          where: { studentId: student.id, type: "in", timestamp: { gte: d14 } },
        }),
        tx.attendanceEvent.count({
          where: { studentId: student.id, type: "in", timestamp: { gte: d28, lt: d14 } },
        }),
        tx.score.findMany({
          where: { studentId: student.id, enteredAt: { gte: d14 } },
          select: { value: true },
        }),
        tx.score.findMany({
          where: { studentId: student.id, enteredAt: { gte: d28, lt: d14 } },
          select: { value: true },
        }),
        tx.$queryRawUnsafe<Array<{ total: string }>>(
          `SELECT COALESCE(SUM("totalAmount"),0)::text total FROM "Invoice" WHERE "schoolId"=$1 AND "studentId"=$2 AND "status"<>'paid'`,
          schoolId,
          student.id,
        ),
      ]);
      const checks: Array<[string, Record<string, unknown>]> = [];
      if (prior >= 3 && recent / prior < 0.75) {
        checks.push(["attendance_decline", { recent, prior }]);
      }
      const recentAverage = sr.length
        ? sr.reduce((sum, row) => sum + Number(row.value), 0) / sr.length
        : null;
      const priorAverage = sp.length
        ? sp.reduce((sum, row) => sum + Number(row.value), 0) / sp.length
        : null;
      if (recentAverage !== null && priorAverage !== null && recentAverage < priorAverage - 10) {
        checks.push(["score_decline", { recentAverage, priorAverage }]);
      }
      const balance = Number(arrears[0]?.total ?? 0);
      if (balance > 0) checks.push(["fee_arrears", { balance }]);

      for (const [reason, detail] of checks) {
        const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "StudentRiskFlag" WHERE "schoolId"=$1 AND "studentId"=$2 AND "reason"=$3 AND "resolvedAt" IS NULL LIMIT 1`,
          schoolId,
          student.id,
          reason,
        );
        if (!existing[0]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "StudentRiskFlag" ("id","schoolId","studentId","reason","detail") VALUES ($1,$2,$3,$4,$5::jsonb)`,
            createId(),
            schoolId,
            student.id,
            reason,
            JSON.stringify(detail),
          );
          created += 1;
        }
      }
    }
    return { schoolId, created };
  });
}

export async function runRiskScanForAllSchools() {
  const dirs = await db.schoolLoginDirectory.findMany({ where: { status: "active" } });
  const results = [];
  for (const directory of dirs) {
    results.push(await runRiskScanForSchool(directory.schoolId));
  }
  return results;
}
