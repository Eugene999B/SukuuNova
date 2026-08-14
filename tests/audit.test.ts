import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db, withTenant } from "../src/lib/db";
import { TenantScopeError } from "../src/lib/errors";
import {
  createSchoolUser,
  setRolePermissions,
  updateSchoolSettings
} from "../src/lib/school-services";
import {
  createTenantFixture,
  rawDb,
  setRawTenant,
  type Fixture
} from "./helpers";

describe("immutable audit infrastructure", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await createTenantFixture();
  });

  it("audits accountable school writes", async () => {
    const created = await createSchoolUser({
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      name: "Audited User",
      email: randomBytes(12).toString("hex") + "@test.invalid",
      password: randomBytes(24).toString("base64url")
    });
    await updateSchoolSettings({
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      data: { gradingScale: { passMark: 50 } }
    });
    await setRolePermissions({
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      roleId: fixture.testRoleId,
      permissionKeys: ["students:read"]
    });

    await withTenant(fixture.schoolId, async (tx) => {
      const entries = await tx.auditLogSchool.findMany({
        where: {
          action: {
            in: [
              "user.created",
              "school_settings.updated",
              "role.permissions_changed"
            ]
          }
        }
      });
      expect(entries.map((entry) => entry.action).sort()).toEqual([
        "role.permissions_changed",
        "school_settings.updated",
        "user.created"
      ]);
      expect(entries.find((entry) => entry.action === "user.created")?.entityId)
        .toBe(created.id);
    });
  });

  it("rejects audit update/delete through the application and database", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      await expect(
        tx.auditLogSchool.update({
          where: { id: fixture.auditId },
          data: { action: "tampered" }
        })
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        tx.auditLogSchool.delete({ where: { id: fixture.auditId } })
      ).rejects.toBeInstanceOf(TenantScopeError);
    });

    await expect(
      rawDb.$transaction(async (tx) => {
        await setRawTenant(tx, fixture.schoolId);
        await tx.$executeRawUnsafe(
          'UPDATE "AuditLogSchool" SET "action" = $1 WHERE "id" = $2',
          "tampered",
          fixture.auditId
        );
      })
    ).rejects.toThrow();

    const platformAudit = await db.auditLogPlatform.create({
      data: {
        actorId: "test-platform-actor",
        action: "test.created",
        targetSchoolId: fixture.schoolId
      }
    });
    await expect(
      db.auditLogPlatform.delete({ where: { id: platformAudit.id } })
    ).rejects.toBeInstanceOf(TenantScopeError);
    await expect(
      rawDb.$executeRawUnsafe(
        'DELETE FROM "AuditLogPlatform" WHERE "id" = $1',
        platformAudit.id
      )
    ).rejects.toThrow();
  });
});
