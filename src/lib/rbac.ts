import type { TenantDb } from "./db";
import { ForbiddenError } from "./errors";

export async function hasPermission(
  tx: TenantDb,
  userId: string,
  permissionKey: string,
  schoolId?: string
): Promise<boolean> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { status: true, schoolId: true }
  });
  if (!user || user.status !== "active") return false;
  if (schoolId && user.schoolId !== schoolId) return false;

  const permission = await tx.permission.findUnique({
    where: { key: permissionKey },
    select: { id: true }
  });
  if (!permission) return false;

  const override = await tx.userPermissionOverride.findUnique({
    where: { userId_permissionId: { userId, permissionId: permission.id } },
    select: { granted: true }
  });
  if (override) return override.granted;

  const inherited = await tx.userRole.findFirst({
    where: { userId, role: { rolePermissions: { some: { permissionId: permission.id } } } },
    select: { userId: true }
  });
  return Boolean(inherited);
}

export async function requirePermission(
  tx: TenantDb,
  userId: string,
  permissionKey: string,
  schoolId?: string
): Promise<void> {
  if (!(await hasPermission(tx, userId, permissionKey, schoolId))) {
    throw new ForbiddenError("Missing required permission: " + permissionKey);
  }
}
