import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertRlsTestRoleIsSafe,
  createTenantFixture,
  rawDb,
  setRawTenant,
  type Fixture
} from "./helpers";

describe("PostgreSQL Row-Level Security", () => {
  let schoolA: Fixture;
  let schoolB: Fixture;

  beforeAll(async () => {
    await assertRlsTestRoleIsSafe();
    schoolA = await createTenantFixture();
    schoolB = await createTenantFixture();
  });

  it("independently hides every School B tenant table without the Prisma extension", async () => {
    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, schoolA.schoolId);

      const schoolRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "School" WHERE "id" = $1',
        schoolB.schoolId
      );
      expect(schoolRows).toEqual([]);

      const tables = [
        "SchoolSettings",
        "User",
        "Role",
        "RolePermission",
        "UserRole",
        "UserPermissionOverride",
        "SchoolPasswordResetToken",
        "AuditLogSchool"
      ];

      for (const table of tables) {
        const rows = await tx.$queryRawUnsafe<Array<{ count: number }>>(
          'SELECT COUNT(*)::int AS count FROM "' +
            table +
            '" WHERE "schoolId" = $1',
          schoolB.schoolId
        );
        expect(rows[0]?.count, table).toBe(0);
      }
    });
  });

  it("blocks a raw cross-tenant insert", async () => {
    await expect(
      rawDb.$transaction(async (tx) => {
        await setRawTenant(tx, schoolA.schoolId);
        await tx.$executeRawUnsafe(
          'INSERT INTO "User" ("id", "schoolId", "name", "passwordHash", "status", "createdAt") VALUES ($1, $2, $3, $4, $5, NOW())',
          "forbidden-" + randomBytes(8).toString("hex"),
          schoolB.schoolId,
          "Forbidden",
          randomBytes(32).toString("hex"),
          "active"
        );
      })
    ).rejects.toThrow();
  });

  it("makes raw cross-tenant updates and deletes affect zero rows", async () => {
    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, schoolA.schoolId);
      expect(
        await tx.$executeRawUnsafe(
          'UPDATE "User" SET "name" = $1 WHERE "id" = $2',
          "Compromised",
          schoolB.memberId
        )
      ).toBe(0);

      expect(
        await tx.$executeRawUnsafe(
          'DELETE FROM "Role" WHERE "id" = $1',
          schoolB.testRoleId
        )
      ).toBe(0);
    });
  });
});
