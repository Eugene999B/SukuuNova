import type { TenantDb } from "./db";
import { AppError } from "./errors";

export const MAX_ACTIVE_GUARDIAN_PORTALS_PER_STUDENT = 2;

export type GuardianSlotInfo = {
  studentId: string;
  totalLinks: number;
  activePortalLinks: number;
  slotsRemaining: number;
  eligible: boolean;
};

async function activePortalCountForStudent(tx: TenantDb, schoolId: string, studentId: string): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text AS "count"
     FROM "StudentGuardian" sg
     JOIN "Guardian" g ON g."id" = sg."guardianId" AND g."schoolId" = sg."schoolId"
     LEFT JOIN "User" u ON u."id" = g."userId" AND u."schoolId" = g."schoolId"
     WHERE sg."schoolId" = $1 AND sg."studentId" = $2
       AND g."userId" IS NOT NULL AND (u."status" = 'active' OR u."status" = 'pending')`,
    schoolId,
    studentId
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getGuardianSlotInfo(tx: TenantDb, schoolId: string, studentId: string): Promise<GuardianSlotInfo> {
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } });
  if (!student) throw new AppError("Student not found in this school.", 404, "STUDENT_NOT_FOUND");
  const [totalRows, active] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS "count" FROM "StudentGuardian" WHERE "schoolId" = $1 AND "studentId" = $2`,
      schoolId,
      studentId
    ),
    activePortalCountForStudent(tx, schoolId, studentId),
  ]);
  const totalLinks = Number(totalRows[0]?.count ?? 0);
  const slotsRemaining = Math.max(0, MAX_ACTIVE_GUARDIAN_PORTALS_PER_STUDENT - active);
  return { studentId, totalLinks, activePortalLinks: active, slotsRemaining, eligible: slotsRemaining > 0 };
}

export async function assertGuardianSlotAvailable(tx: TenantDb, schoolId: string, studentId: string, guardianId?: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guardian-link:${schoolId}:${studentId}`}))`;
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, status: true } });
  if (!student) throw new AppError("Student not found in this school.", 404, "STUDENT_NOT_FOUND");
  if (student.status !== "active") throw new AppError("Only active learners can receive new guardian links.", 409, "STUDENT_NOT_ACTIVE");
  if (guardianId) {
    const existing = await tx.studentGuardian.findFirst({ where: { schoolId, studentId, guardianId }, select: { guardianId: true } });
    if (existing) return;
    const guardian = await tx.guardian.findFirst({ where: { id: guardianId, schoolId }, select: { id: true, userId: true } });
    if (!guardian) throw new AppError("Guardian not found in this school.", 404, "GUARDIAN_NOT_FOUND");
    if (!guardian.userId) return;
  }
  const active = await activePortalCountForStudent(tx, schoolId, studentId);
  if (active >= MAX_ACTIVE_GUARDIAN_PORTALS_PER_STUDENT) {
    throw new AppError(
      "This learner already has two active guardian portal accounts. Remove or deactivate one before adding another.",
      409,
      "GUARDIAN_SLOTS_FULL"
    );
  }
}

export async function linkGuardianToStudent(
  tx: TenantDb,
  input: { schoolId: string; studentId: string; guardianId: string; relationship: string }
): Promise<{ isPrimary: boolean }> {
  const relationship = input.relationship.trim() || "Parent";
  if (relationship.length > 60) throw new AppError("Relationship is too long.", 400, "INVALID_RELATIONSHIP");
  await assertGuardianSlotAvailable(tx, input.schoolId, input.studentId, input.guardianId);
  const existingPrimary = await tx.studentGuardian.findFirst({ where: { schoolId: input.schoolId, studentId: input.studentId, isPrimary: true }, select: { guardianId: true } });
  const isPrimary = existingPrimary ? existingPrimary.guardianId === input.guardianId : true;
  try {
    await tx.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: input.studentId, guardianId: input.guardianId } },
      update: { relationship, isPrimary },
      create: { schoolId: input.schoolId, studentId: input.studentId, guardianId: input.guardianId, relationship, isPrimary },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const after = await tx.studentGuardian.findFirst({ where: { schoolId: input.schoolId, studentId: input.studentId, isPrimary: true }, select: { guardianId: true } });
      return { isPrimary: after?.guardianId === input.guardianId };
    }
    throw error;
  }
  const primaries = await tx.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text AS "count" FROM "StudentGuardian" WHERE "schoolId" = $1 AND "studentId" = $2 AND "isPrimary" = true`,
    input.schoolId,
    input.studentId
  );
  if (Number(primaries[0]?.count ?? 0) > 1) {
    await tx.$executeRawUnsafe(
      `UPDATE "StudentGuardian" SET "isPrimary" = ("guardianId" = $3) WHERE "schoolId" = $1 AND "studentId" = $2`,
      input.schoolId,
      input.studentId,
      existingPrimary?.guardianId ?? input.guardianId
    );
  }
  return { isPrimary };
}
