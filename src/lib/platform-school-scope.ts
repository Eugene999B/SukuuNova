import type { PlatformSession } from "./auth";
import { db } from "./db";
import { ForbiddenError } from "./errors";

export async function hasSchoolScope(session: PlatformSession, schoolId: string): Promise<boolean> {
  if (session.role === "super_admin") return true;
  const rows = await db.$queryRawUnsafe<Array<{ schoolId: string }>>(
    `SELECT "schoolId" FROM "PlatformAdminSchoolAccess" WHERE "adminId"=$1 AND "schoolId"=$2 LIMIT 1`,
    session.adminId,
    schoolId,
  );
  // Existing workers created before scoped access was introduced retain compatibility
  // until a Super Admin explicitly assigns a school scope to them.
  if (rows.length) return true;
  const anyScope = await db.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text AS count FROM "PlatformAdminSchoolAccess" WHERE "adminId"=$1`,
    session.adminId,
  );
  return Number(anyScope[0]?.count ?? 0) === 0;
}

export async function requireSchoolScope(session: PlatformSession, schoolId: string): Promise<void> {
  if (!(await hasSchoolScope(session, schoolId))) {
    throw new ForbiddenError("This worker is not assigned to manage this school.");
  }
}
