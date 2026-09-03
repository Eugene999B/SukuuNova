import type { PlatformSession } from "./auth";
import { db } from "./db";
import { ForbiddenError } from "./errors";

export async function hasPlatformPermission(session: PlatformSession, permission: string): Promise<boolean> {
  if (session.role === "super_admin") return true;
  const rows = await db.$queryRawUnsafe<Array<{ permission: string }>>(
    `SELECT "permission" FROM "PlatformAdminPermission" WHERE "adminId"=$1 AND "permission"=$2 LIMIT 1`,
    session.adminId,
    permission,
  );
  return rows.length > 0;
}

export async function requirePlatformPermission(session: PlatformSession, permission: string): Promise<void> {
  if (!(await hasPlatformPermission(session, permission))) {
    throw new ForbiddenError(`Missing platform permission: ${permission}`);
  }
}

export async function getPlatformSchoolScope(session: PlatformSession): Promise<string[] | null> {
  if (session.role === "super_admin") return null;
  const rows = await db.$queryRawUnsafe<Array<{ schoolId: string }>>(
    `SELECT "schoolId" FROM "PlatformAdminSchoolAccess" WHERE "adminId"=$1 ORDER BY "schoolId" ASC`,
    session.adminId,
  );
  return rows.map((row) => row.schoolId);
}

export async function requirePlatformSchoolScope(session: PlatformSession, schoolIds: string[]): Promise<void> {
  if (session.role === "super_admin") return;
  const allowed = await getPlatformSchoolScope(session);
  const allowedSet = new Set(allowed ?? []);
  const unauthorized = schoolIds.find((schoolId) => !allowedSet.has(schoolId));
  if (unauthorized) {
    throw new ForbiddenError("This worker is not assigned to one or more requested schools.");
  }
}
