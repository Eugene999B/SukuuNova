import type { PlatformSession } from "./auth";
import { db } from "./db";
import { ForbiddenError } from "./errors";

export async function hasSchoolScope(session: PlatformSession, schoolId: string): Promise<boolean> {
  if (!schoolId || session.role === "super_admin") return Boolean(schoolId);
  const rows = await db.$queryRawUnsafe<Array<{ schoolId: string }>>(
    `SELECT "schoolId" FROM "PlatformAdminSchoolAccess" WHERE "adminId"=$1 AND "schoolId"=$2 LIMIT 1`,
    session.adminId,
    schoolId,
  );
  return rows.length > 0;
}

export async function requireSchoolScope(session: PlatformSession, schoolId: string): Promise<void> {
  if (!(await hasSchoolScope(session, schoolId))) {
    throw new ForbiddenError("This worker is not assigned to manage this school.");
  }
}
