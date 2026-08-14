import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db, withTenant } from "../src/lib/db";
import { TenantScopeError } from "../src/lib/errors";
import { createTenantFixture, type Fixture } from "./helpers";

describe("Prisma tenant extension", () => {
  let schoolA: Fixture;
  let schoolB: Fixture;

  beforeAll(async () => {
    schoolA = await createTenantFixture();
    schoolB = await createTenantFixture();
  });

  it("fails closed when no verified tenant context exists", async () => {
    await expect(db.user.findMany()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("blocks School B reads for every tenant-scoped model", async () => {
    await withTenant(schoolA.schoolId, async (tx) => {
      await expect(
        tx.school.findUnique({ where: { id: schoolB.schoolId } })
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        tx.schoolSettings.findUnique({ where: { schoolId: schoolB.schoolId } })
      ).rejects.toBeInstanceOf(TenantScopeError);

      expect(await tx.user.findUnique({ where: { id: schoolB.memberId } })).toBeNull();
      expect(await tx.role.findUnique({ where: { id: schoolB.testRoleId } })).toBeNull();
      expect(
        await tx.rolePermission.findUnique({
          where: {
            roleId_permissionId: {
              roleId: schoolB.ownerRoleId,
              permissionId: schoolB.permissionIds.get("students:read")!
            }
          }
        })
      ).toBeNull();
      expect(
        await tx.userRole.findUnique({
          where: {
            userId_roleId: {
              userId: schoolB.ownerId,
              roleId: schoolB.ownerRoleId
            }
          }
        })
      ).toBeNull();
      expect(
        await tx.userPermissionOverride.findUnique({
          where: {
            userId_permissionId: {
              userId: schoolB.memberId,
              permissionId: schoolB.permissionIds.get("reports:generate")!
            }
          }
        })
      ).toBeNull();
      expect(
        await tx.schoolPasswordResetToken.findUnique({
          where: { id: schoolB.resetId }
        })
      ).toBeNull();
      expect(
        await tx.auditLogSchool.findUnique({ where: { id: schoolB.auditId } })
      ).toBeNull();
    });
  });

  it("rejects cross-tenant creates for every tenant-scoped model", async () => {
    const passwordHash = randomBytes(32).toString("hex");
    await withTenant(schoolA.schoolId, async (tx) => {
      const attempts = [
        () =>
          tx.school.create({
            data: {
              id: schoolB.schoolId,
              uniqueCode: "forbidden-" + schoolB.uniqueCode,
              name: "Forbidden"
            }
          }),
        () => tx.schoolSettings.create({ data: { schoolId: schoolB.schoolId } }),
        () =>
          tx.user.create({
            data: {
              schoolId: schoolB.schoolId,
              name: "Forbidden",
              passwordHash
            }
          }),
        () =>
          tx.role.create({
            data: { schoolId: schoolB.schoolId, name: "Forbidden" }
          }),
        () =>
          tx.rolePermission.create({
            data: {
              schoolId: schoolB.schoolId,
              roleId: schoolB.testRoleId,
              permissionId: schoolB.permissionIds.get("students:read")!
            }
          }),
        () =>
          tx.userRole.create({
            data: {
              schoolId: schoolB.schoolId,
              userId: schoolB.memberId,
              roleId: schoolB.testRoleId
            }
          }),
        () =>
          tx.userPermissionOverride.create({
            data: {
              schoolId: schoolB.schoolId,
              userId: schoolB.memberId,
              permissionId: schoolB.permissionIds.get("students:read")!,
              granted: true
            }
          }),
        () =>
          tx.schoolPasswordResetToken.create({
            data: {
              schoolId: schoolB.schoolId,
              userId: schoolB.memberId,
              tokenHash: randomBytes(32).toString("hex"),
              expiresAt: new Date(Date.now() + 60_000)
            }
          }),
        () =>
          tx.auditLogSchool.create({
            data: {
              schoolId: schoolB.schoolId,
              actorId: schoolB.ownerId,
              action: "forbidden",
              entityType: "School",
              entityId: schoolB.schoolId
            }
          })
      ];

      for (const attempt of attempts) {
        await expect(attempt()).rejects.toBeInstanceOf(TenantScopeError);
      }
    });
  });

  it("cannot update or delete School B rows by guessed IDs", async () => {
    await withTenant(schoolA.schoolId, async (tx) => {
      expect(
        await tx.user.updateMany({
          where: { id: schoolB.memberId },
          data: { name: "Compromised" }
        })
      ).toEqual({ count: 0 });
      expect(
        await tx.role.deleteMany({ where: { id: schoolB.testRoleId } })
      ).toEqual({ count: 0 });
      expect(
        await tx.rolePermission.deleteMany({
          where: { roleId: schoolB.ownerRoleId }
        })
      ).toEqual({ count: 0 });
      expect(
        await tx.userRole.deleteMany({ where: { userId: schoolB.ownerId } })
      ).toEqual({ count: 0 });
      expect(
        await tx.userPermissionOverride.deleteMany({
          where: { userId: schoolB.memberId }
        })
      ).toEqual({ count: 0 });
      expect(
        await tx.schoolPasswordResetToken.deleteMany({
          where: { id: schoolB.resetId }
        })
      ).toEqual({ count: 0 });
      await expect(
        tx.school.deleteMany({ where: { id: schoolB.schoolId } })
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        tx.schoolSettings.deleteMany({
          where: { schoolId: schoolB.schoolId }
        })
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        tx.auditLogSchool.deleteMany({ where: { id: schoolB.auditId } })
      ).rejects.toBeInstanceOf(TenantScopeError);
    });
  });
});
