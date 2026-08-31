import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { db, withTenant } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendPlatformAudit, appendSchoolAudit } from "./audit";
import { hasPermission, requirePermission } from "./rbac";

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNAL_TTL_DAYS = 30;

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

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function expectedWeekdays(start: Date, end: Date) {
  const cursor = utcDateOnly(start);
  const finish = utcDateOnly(end);
  let total = 0;
  while (cursor <= finish) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) total += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

function severityForAttendance(rate: number, recentAbsences: number) {
  if (rate < 0.6 || recentAbsences >= 6) return "HIGH";
  if (rate < 0.8 && recentAbsences >= 3) return "MEDIUM";
  return "LOW";
}

async function attendanceEvidence(tx: TenantDb, studentId: string, start: Date, end: Date) {
  const rows = await tx.$queryRaw<Array<{ presentDays: bigint }>>`
    SELECT COUNT(DISTINCT "attendanceDate")::bigint AS "presentDays"
    FROM "AttendanceEvent"
    WHERE "studentId" = ${studentId}
      AND "type" = 'in'
      AND "attendanceDate" BETWEEN ${start.toISOString().slice(0, 10)}::date AND ${end.toISOString().slice(0, 10)}::date
  `;
  const expectedSessions = expectedWeekdays(start, end);
  const presentSessions = Number(rows[0]?.presentDays ?? 0n);
  const recentAbsenceCount = Math.max(expectedSessions - presentSessions, 0);
  const attendanceRate = expectedSessions > 0 ? presentSessions / expectedSessions : null;
  return { expectedSessions, presentSessions, recentAbsenceCount, attendanceRate };
}

async function scoreAverage(tx: TenantDb, studentId: string, termId: string | null) {
  if (!termId) return null;
  const rows = await tx.$queryRaw<Array<{ average: string | null }>>`
    SELECT AVG(("s"."value" / NULLIF("a"."maxScore", 0)) * 100)::numeric::text AS "average"
    FROM "Score" s
    JOIN "Assessment" a ON a."id" = s."assessmentId" AND a."schoolId" = s."schoolId"
    WHERE s."studentId" = ${studentId}
      AND s."schoolId" = a."schoolId"
      AND a."termId" = ${termId}
  `;
  return rows[0]?.average == null ? null : Number(rows[0].average);
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
    await appendPlatformAudit({ actorId: adminId, action: "impersonation.ended", targetSchoolId: schoolId, targetEntity: "User", meta: { impersonationId } });
    return { ok: true };
  });
}

export async function schoolImpersonationNotice(schoolId: string, actorId: string) {
  return withTenant(schoolId, (tx) => tx.$queryRawUnsafe<unknown[]>(
    `SELECT "id","reason","startedAt","endedAt" FROM "ImpersonationLog" WHERE "schoolId"=$1 AND "impersonatedUserId"=$2 ORDER BY "startedAt" DESC LIMIT 20`, schoolId, actorId,
  ));
}

export async function riskFlags(schoolId: string, actorId: string) {
  return withTenant(schoolId, async (tx) => {
    await requirePermission(tx, actorId, "risk_flags:view");
    const teacherClasses = await tx.class.findMany({ where: { classTeacherId: actorId }, select: { id: true } });
    const isTeacher = teacherClasses.length > 0 && !(await hasPermission(tx, actorId, "students:write"));
    if (isTeacher) {
      return tx.$queryRawUnsafe<unknown[]>(
        `SELECT r.*,s."name" AS "studentName",s."admissionNo" FROM "StudentRiskFlag" r JOIN "Student" s ON s."id"=r."studentId" AND s."schoolId"=r."schoolId" WHERE r."schoolId"=$1 AND r."resolvedAt" IS NULL AND (r."expiresAt" IS NULL OR r."expiresAt" > NOW()) AND s."classId" = ANY($2::text[]) ORDER BY r."flaggedAt" DESC LIMIT 300`,
        schoolId,
        teacherClasses.map((c) => c.id),
      );
    }
    return tx.$queryRawUnsafe<unknown[]>(
      `SELECT r.*,s."name" AS "studentName",s."admissionNo" FROM "StudentRiskFlag" r JOIN "Student" s ON s."id"=r."studentId" AND s."schoolId"=r."schoolId" WHERE r."schoolId"=$1 AND r."resolvedAt" IS NULL AND (r."expiresAt" IS NULL OR r."expiresAt" > NOW()) ORDER BY r."flaggedAt" DESC LIMIT 300`,
      schoolId,
    );
  });
}

export async function runRiskScanForSchool(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const now = new Date();
    const window7Start = addDays(utcDateOnly(now), -6);
    const window30Start = addDays(utcDateOnly(now), -29);
    const windowEnd = utcDateOnly(now);
    const currentTerm = await tx.term.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    const previousTerm = currentTerm
      ? await tx.term.findFirst({ where: { endDate: { lt: currentTerm.startDate } }, orderBy: { endDate: "desc" }, select: { id: true, name: true } })
      : await tx.term.findFirst({ where: { endDate: { lt: now } }, orderBy: { endDate: "desc" }, select: { id: true, name: true } });

    const students = await tx.student.findMany({ where: { status: "active" }, select: { id: true } });
    let created = 0;
    let updated = 0;

    for (const student of students) {
      const [attendance7, attendance30, currentAverage, previousAverage, arrears] = await Promise.all([
        attendanceEvidence(tx, student.id, window7Start, windowEnd),
        attendanceEvidence(tx, student.id, window30Start, windowEnd),
        scoreAverage(tx, student.id, currentTerm?.id ?? null),
        scoreAverage(tx, student.id, previousTerm?.id ?? null),
        tx.$queryRawUnsafe<Array<{ total: string }>>(
          `SELECT COALESCE(SUM("totalAmount"),0)::text total FROM "Invoice" WHERE "schoolId"=$1 AND "studentId"=$2 AND "status" <> 'paid'${currentTerm ? ` AND "termId"='${currentTerm.id}'` : ""}`,
          schoolId,
          student.id,
        ),
      ]);

      const signals: Array<{ reason: string; severity: string; detail: Record<string, unknown> }> = [];
      if ((attendance7.expectedSessions >= 5 && attendance7.attendanceRate !== null && attendance7.attendanceRate < 0.8 && attendance7.recentAbsenceCount >= 3) ||
          (attendance30.expectedSessions >= 10 && attendance30.attendanceRate !== null && attendance30.attendanceRate < 0.8 && attendance30.recentAbsenceCount >= 3)) {
        const evidence = attendance30.expectedSessions >= 10 ? attendance30 : attendance7;
        signals.push({
          reason: "ATTENDANCE_CONCERN",
          severity: severityForAttendance(evidence.attendanceRate ?? 1, evidence.recentAbsenceCount),
          detail: { window7: attendance7, window30: attendance30, rule: "attendanceRate < 0.80 and recentAbsenceCount >= 3" },
        });
      }
      if (currentAverage !== null && previousAverage !== null && currentAverage < previousAverage - 10) {
        signals.push({ reason: "ACADEMIC_DECLINE", severity: currentAverage < previousAverage - 20 ? "HIGH" : "MEDIUM", detail: { currentTerm: currentTerm?.name ?? null, previousTerm: previousTerm?.name ?? null, currentAverage: Number(currentAverage.toFixed(2)), previousAverage: Number(previousAverage.toFixed(2)), delta: Number((currentAverage - previousAverage).toFixed(2)) } });
      }
      const balance = Number(arrears[0]?.total ?? 0);
      if (balance > 0) signals.push({ reason: "FEE_ARREARS", severity: balance >= 1000 ? "HIGH" : "MEDIUM", detail: { currentTerm: currentTerm?.name ?? null, balance } });

      for (const signal of signals) {
        const expiresAt = addDays(now, SIGNAL_TTL_DAYS);
        const existing = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "StudentRiskFlag"
          WHERE "schoolId"=${schoolId} AND "studentId"=${student.id} AND "reason"=${signal.reason}
            AND "resolvedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
          ORDER BY "flaggedAt" DESC LIMIT 1
        `;
        if (existing[0]) {
          await tx.$executeRaw`
            UPDATE "StudentRiskFlag"
            SET "detail"=${JSON.stringify(signal.detail)}::jsonb,
                "severity"=${signal.severity},
                "expiresAt"=${expiresAt},
                "reviewStatus"=CASE WHEN "reviewStatus"='RESOLVED' THEN 'OPEN' ELSE "reviewStatus" END
            WHERE "id"=${existing[0].id} AND "schoolId"=${schoolId}
          `;
          updated += 1;
        } else {
          await tx.$executeRaw`
            INSERT INTO "StudentRiskFlag" ("id","schoolId","studentId","reason","detail","severity","expiresAt","reviewStatus")
            VALUES (${createId()},${schoolId},${student.id},${signal.reason},${JSON.stringify(signal.detail)}::jsonb,${signal.severity},${expiresAt},'OPEN')
          `;
          created += 1;
        }
      }
    }

    await tx.$executeRaw`
      UPDATE "StudentRiskFlag"
      SET "reviewStatus"='EXPIRED'
      WHERE "schoolId"=${schoolId}
        AND "resolvedAt" IS NULL
        AND "expiresAt" IS NOT NULL
        AND "expiresAt" <= NOW()
        AND "reviewStatus"='OPEN'
    `;

    return { schoolId, currentTermId: currentTerm?.id ?? null, previousTermId: previousTerm?.id ?? null, created, updated };
  });
}

export async function runRiskScanForAllSchools() {
  const dirs = await db.schoolLoginDirectory.findMany({ where: { status: "active" } });
  const results = [];
  for (const directory of dirs) results.push(await runRiskScanForSchool(directory.schoolId));
  return results;
}
