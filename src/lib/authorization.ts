import type { TenantDb } from "./db";
import { ForbiddenError } from "./errors";
import { hasPermission } from "./rbac";

export const SYSTEM_ROLE_KEYS = {
  Owner: "owner",
  Administrator: "administrator",
  Principal: "principal",
  "Vice Principal": "vice_principal",
  "Academic Coordinator": "academic_coordinator",
  "Department Head": "department_head",
  Accountant: "accountant",
  "HR Officer": "hr_officer",
  "Admissions Officer": "admissions_officer",
  "Class Teacher": "class_teacher",
  "Subject Teacher": "subject_teacher",
  Teacher: "teacher",
  "Front Desk/Gate Security": "front_desk_security",
  "Transport Officer": "transport_officer",
  "Parent": "parent",
  Guardian: "guardian",
  Student: "student",
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS];

export const SCHOOL_WORKSPACE_ROLE_KEYS = new Set<string>([
  "owner",
  "administrator",
  "principal",
  "vice_principal",
  "academic_coordinator",
  "department_head",
  "accountant",
  "hr_officer",
  "admissions_officer",
  "front_desk_security",
  "transport_officer",
]);

export const TEACHER_WORKSPACE_ROLE_KEYS = new Set<string>([
  "teacher",
  "class_teacher",
  "subject_teacher",
]);

export const TEACHING_ROLE_KEYS = new Set<string>([
  ...TEACHER_WORKSPACE_ROLE_KEYS,
  "academic_coordinator",
  "department_head",
]);

export type SchoolWorkspace = "school" | "teacher";

function normalizeRoleKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function roleKeyForName(name: string): string {
  return SYSTEM_ROLE_KEYS[name as keyof typeof SYSTEM_ROLE_KEYS] ?? normalizeRoleKey(name);
}

export function resolveSchoolWorkspace(roleKeys: string[]): SchoolWorkspace {
  const normalized = roleKeys.map((key) => key.trim()).filter(Boolean);
  if (normalized.some((key) => SCHOOL_WORKSPACE_ROLE_KEYS.has(key))) return "school";
  if (normalized.some((key) => TEACHER_WORKSPACE_ROLE_KEYS.has(key))) return "teacher";
  return "school";
}

export function isTeachingRoleKey(roleKey: string): boolean {
  return TEACHING_ROLE_KEYS.has(roleKey.trim());
}

export async function getSchoolAuthorization(tx: TenantDb, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      schoolId: true,
      name: true,
      status: true,
      userRoles: {
        select: {
          role: {
            select: { id: true, name: true, key: true, isSystem: true }
          }
        }
      }
    }
  });

  if (!user || user.status !== "active") {
    throw new ForbiddenError("This school account is not active.");
  }

  const roles = user.userRoles.map(({ role }) => ({
    ...role,
    key: role.key?.trim() || roleKeyForName(role.name)
  }));
  const roleKeys = roles.map((role) => role.key);

  return {
    user,
    roles,
    roleKeys,
    workspace: resolveSchoolWorkspace(roleKeys),
    hasRole: (key: string) => roles.some((role) => role.key === key),
    hasAnyRole: (...keys: string[]) => roles.some((role) => keys.includes(role.key)),
    isOwner: roles.some((role) => role.key === "owner"),
    isElevated: roles.some((role) => ["owner", "administrator", "principal", "vice_principal"].includes(role.key)),
    isTeacher: roles.some((role) => isTeachingRoleKey(role.key)),
    isPureTeacher: !roles.some((role) => SCHOOL_WORKSPACE_ROLE_KEYS.has(role.key)) && roles.some((role) => TEACHER_WORKSPACE_ROLE_KEYS.has(role.key)),
    can: (permissionKey: string) => hasPermission(tx, userId, permissionKey)
  };
}

export async function requireSchoolPermission(tx: TenantDb, userId: string, permissionKey: string) {
  const access = await getSchoolAuthorization(tx, userId);
  if (!(await access.can(permissionKey))) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
  return access;
}

export async function requireSchoolRole(tx: TenantDb, userId: string, ...roleKeys: string[]) {
  const access = await getSchoolAuthorization(tx, userId);
  if (!access.hasAnyRole(...roleKeys)) {
    throw new ForbiddenError("Your school role does not allow access to this workspace.");
  }
  return access;
}

export async function requireCanGrantPermissions(tx: TenantDb, actorId: string, permissionKeys: string[]) {
  const access = await getSchoolAuthorization(tx, actorId);
  if (access.isOwner) return access;
  const uniqueKeys = [...new Set(permissionKeys.map((key) => key.trim()).filter(Boolean))];
  for (const permissionKey of uniqueKeys) {
    if (!(await access.can(permissionKey))) {
      throw new ForbiddenError("You cannot grant a permission your account does not have: " + permissionKey);
    }
  }
  return access;
}

export async function requireCanAssignRoles(
  tx: TenantDb,
  actorId: string,
  targetUserId: string,
  roleIds: string[]
) {
  const access = await getSchoolAuthorization(tx, actorId);
  const target = await tx.user.findUnique({
    where: { id: targetUserId },
    select: { userRoles: { select: { role: { select: { key: true, name: true } } } } }
  });
  if (!target) throw new ForbiddenError("The target account could not be found.");

  const selectedRoles = await tx.role.findMany({
    where: { id: { in: [...new Set(roleIds)] } },
    select: { id: true, name: true, key: true, rolePermissions: { select: { permission: { select: { key: true } } } } }
  });
  if (selectedRoles.length !== new Set(roleIds).size) throw new ForbiddenError("One or more selected roles are not available.");

  if (!access.isOwner) {
    const managesOwner = target.userRoles.some(({ role }) => (role.key?.trim() || roleKeyForName(role.name)) === "owner") || selectedRoles.some((role) => (role.key?.trim() || roleKeyForName(role.name)) === "owner");
    if (managesOwner) throw new ForbiddenError("Only the school Owner can assign or modify the Owner role.");

    const permissionKeys = [...new Set(selectedRoles.flatMap((role) => role.rolePermissions.map(({ permission }) => permission.key)))];
    await requireCanGrantPermissions(tx, actorId, permissionKeys);
  }

  return access;
}