import { hash } from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { appendSchoolAudit } from "./audit";
import { withTenant } from "./db";
import { ForbiddenError } from "./errors";
import { requirePermission } from "./rbac";

export async function createSchoolUser(input: {
  schoolId: string;
  actorId: string;
  name: string;
  email?: string;
  phone?: string;
  password: string;
}) {
  if (!input.email && !input.phone) {
    throw new ForbiddenError("A school user requires an email address or phone number.");
  }

  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "users:write");
    const user = await tx.user.create({
      data: {
        schoolId: input.schoolId,
        name: input.name.trim(),
        email: input.email?.trim().toLowerCase(),
        phone: input.phone?.trim(),
        passwordHash: await hash(input.password, 12)
      },
      select: {
        id: true,
        schoolId: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true
      }
    });

    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "user.created",
      entityType: "User",
      entityId: user.id,
      after: user
    });
    return user;
  });
}

export async function updateSchoolSettings(input: {
  schoolId: string;
  actorId: string;
  data: {
    academicYearConfig?: Prisma.InputJsonValue;
    gradingScale?: Prisma.InputJsonValue;
    reportCardTemplateId?: string | null;
  };
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "settings:manage_school");
    const before = await tx.schoolSettings.findUnique({
      where: { schoolId: input.schoolId }
    });
    const after = await tx.schoolSettings.upsert({
      where: { schoolId: input.schoolId },
      update: input.data,
      create: { schoolId: input.schoolId, ...input.data }
    });

    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "school_settings.updated",
      entityType: "SchoolSettings",
      entityId: input.schoolId,
      before: before ?? undefined,
      after
    });
    return after;
  });
}

export async function setRolePermissions(input: {
  schoolId: string;
  actorId: string;
  roleId: string;
  permissionKeys: string[];
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "settings:manage_roles");
    const role = await tx.role.findUniqueOrThrow({ where: { id: input.roleId } });
    const before = await tx.rolePermission.findMany({
      where: { roleId: role.id },
      include: { permission: true }
    });
    const permissions = await tx.permission.findMany({
      where: { key: { in: [...new Set(input.permissionKeys)] } }
    });
    if (permissions.length !== new Set(input.permissionKeys).size) {
      throw new ForbiddenError("One or more permission keys do not exist.");
    }

    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length) {
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          schoolId: input.schoolId,
          roleId: role.id,
          permissionId: permission.id
        }))
      });
    }

    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "role.permissions_changed",
      entityType: "Role",
      entityId: role.id,
      before: before.map((row) => row.permission.key),
      after: permissions.map((row) => row.key)
    });
  });
}

export async function setUserRoles(input: {
  schoolId: string;
  actorId: string;
  userId: string;
  roleIds: string[];
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "settings:manage_roles");
    const before = await tx.userRole.findMany({
      where: { userId: input.userId },
      select: { roleId: true }
    });
    const roles = await tx.role.findMany({
      where: { id: { in: [...new Set(input.roleIds)] } },
      select: { id: true }
    });
    if (roles.length !== new Set(input.roleIds).size) {
      throw new ForbiddenError("One or more roles are outside this school.");
    }

    await tx.userRole.deleteMany({ where: { userId: input.userId } });
    if (roles.length) {
      await tx.userRole.createMany({
        data: roles.map((role) => ({
          schoolId: input.schoolId,
          userId: input.userId,
          roleId: role.id
        }))
      });
    }

    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "user.roles_changed",
      entityType: "User",
      entityId: input.userId,
      before: before.map((row) => row.roleId),
      after: roles.map((row) => row.id)
    });
  });
}

export async function setUserPermissionOverride(input: {
  schoolId: string;
  actorId: string;
  userId: string;
  permissionKey: string;
  granted: boolean;
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "settings:manage_roles");
    const permission = await tx.permission.findUniqueOrThrow({
      where: { key: input.permissionKey }
    });
    const before = await tx.userPermissionOverride.findUnique({
      where: {
        userId_permissionId: {
          userId: input.userId,
          permissionId: permission.id
        }
      }
    });
    const after = await tx.userPermissionOverride.upsert({
      where: {
        userId_permissionId: {
          userId: input.userId,
          permissionId: permission.id
        }
      },
      update: { granted: input.granted },
      create: {
        schoolId: input.schoolId,
        userId: input.userId,
        permissionId: permission.id,
        granted: input.granted
      }
    });

    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "user.permission_override_changed",
      entityType: "User",
      entityId: input.userId,
      before: before ?? undefined,
      after
    });
    return after;
  });
}
