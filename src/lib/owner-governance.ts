import type { TenantDb } from "./db";
import { ForbiddenError } from "./errors";
import { roleKeyForName } from "./authorization";

export async function lockSchoolAccess(tx: TenantDb, schoolId: string) {
  // Serialize account governance before rechecking the actor's current authority.
  await tx.$queryRaw`SELECT "id" FROM "School" WHERE "id" = ${schoolId} FOR UPDATE`;
}

export async function requireOwnerContinuity(
  tx: TenantDb,
  schoolId: string,
  userId: string,
  changes: { roleIds?: string[]; status?: string }
) {
  const target = await tx.user.findUnique({
    where: { id: userId },
    select: { status: true, userRoles: { select: { role: { select: { id: true, key: true, name: true } } } } }
  });
  if (!target) throw new ForbiddenError("The target account could not be found.");
  const isOwner = (role: { key: string | null; name: string }) =>
    (role.key?.trim() || roleKeyForName(role.name)) === "owner";
  if (target.status !== "active" || !target.userRoles.some(({ role }) => isOwner(role))) return;

  const roles = changes.roleIds === undefined
    ? target.userRoles.map(({ role }) => role)
    : await tx.role.findMany({ where: { id: { in: changes.roleIds }, schoolId }, select: { id: true, key: true, name: true } });
  if ((changes.status ?? target.status) === "active" && roles.some(isOwner)) return;
  const otherOwners = await tx.user.findMany({
    where: {
      schoolId, id: { not: userId }, status: "active",
      userRoles: { some: { role: { OR: [{ key: "owner" }, { key: null, name: "Owner" }, { key: "", name: "Owner" }] } } }
    },
    select: { id: true }
  });
  if (!otherOwners.length) {
    throw new ForbiddenError("Keep at least one active school Owner. Assign another active Owner before removing or suspending this account.");
  }
}
