import type { TenantDb } from "./db";
import { ForbiddenError } from "./errors";

export async function hasPermission(
  tx: TenantDb,
  userId: string,
  permissionKey: string
): Promise<boolean> {
  const permission = await tx.permission.findUnique({
    where: { key: permissionKey },
    select: { id: true }
  });
  if (!permission) return false;

  const override = await tx.userPermissionOverride.findUnique({
    where: {
      userId_permissionId: {
        userId,
        permissionId: permission.id
      }
    },
    select: { granted: true }
  });

  if (override) {
    return override.granted;
  }

  const inherited = await tx.userRole.findFirst({
    where: {
      userId,
      role: {
        rolePermissions: {
          some: { permissionId: permission.id }
        }
      }
    },
    select: { userId: true }
  });

  return Boolean(inherited);
}

export async function requirePermission(
  tx: TenantDb,
  userId: string,
  permissionKey: string
): Promise<void> {
  if (!(await hasPermission(tx, userId, permissionKey))) {
    throw new ForbiddenError(
      "Missing required permission: " + permissionKey
    );
  }
}
