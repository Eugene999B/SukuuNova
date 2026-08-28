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
