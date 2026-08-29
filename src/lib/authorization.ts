import type { TenantDb } from "./db";
import { ForbiddenError } from "./errors";
import { hasPermission } from "./rbac";

export const SYSTEM_ROLE_KEYS = {
  Owner: "owner",
  Principal: "principal",
  "Vice Principal": "vice_principal",
  "Academic Coordinator": "academic_coordinator",
  "Department Head": "department_head",
  Accountant: "accountant",
  "HR Officer": "hr_officer",
  "Admissions Officer": "admissions_officer",
  "Class Teacher": "class_teacher",
  "Subject Teacher": "subject_teacher",
  "Front Desk/Gate Security": "front_desk_security",
  "Transport Officer": "transport_officer",
  Parent: "parent",
  Student: "student",
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS];

function normalizeRoleKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function roleKeyForName(name: string): string {
  return SYSTEM_ROLE_KEYS[name as keyof typeof SYSTEM_ROLE_KEYS] ?? normalizeRoleKey(name);
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

  return {
    user,
    roles,
    roleKeys: roles.map((role) => role.key),
    hasRole: (key: string) => roles.some((role) => role.key === key),
    hasAnyRole: (...keys: string[]) => roles.some((role) => keys.includes(role.key)),
    isOwner: roles.some((role) => role.key === "owner"),
    isElevated: roles.some((role) => ["owner", "principal", "vice_principal"].includes(role.key)),
    isTeacher: roles.some((role) => ["class_teacher", "subject_teacher", "teacher", "academic_coordinator", "department_head"].includes(role.key)),
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
