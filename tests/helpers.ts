import { randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { createId } from "@paralleldrive/cuid2";
import { hash } from "bcryptjs";
import { DEFAULT_PERMISSIONS } from "../src/lib/default-rbac";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for the integration test suite.");
}

export const rawDb = new PrismaClient({
  datasources: { db: { url: testDatabaseUrl } }
});

export type Fixture = Awaited<ReturnType<typeof createTenantFixture>>;

export async function setRawTenant(
  tx: Prisma.TransactionClient,
  schoolId: string
) {
  await tx.$queryRawUnsafe(
    "SELECT set_config('app.current_school_id', $1, true)",
    schoolId
  );
}

export async function assertRlsTestRoleIsSafe() {
  const rows = await rawDb.$queryRawUnsafe<
    Array<{ bypass: boolean; superuser: boolean }>
  >(
    "SELECT rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user"
  );
  if (rows[0]?.bypass || rows[0]?.superuser) {
    throw new Error(
      "RLS tests require a PostgreSQL role without SUPERUSER or BYPASSRLS."
    );
  }
}

export async function createTenantFixture() {
  const schoolId = createId();
  const uniqueCode = "school-" + createId();
  const ownerId = createId();
  const memberId = createId();
  const ownerRoleId = createId();
  const testRoleId = createId();
  const auditId = createId();
  const resetId = createId();
  const passwordHash = await hash(randomBytes(24).toString("base64url"), 4);

  const permissionIds = new Map<string, string>();
  for (const key of DEFAULT_PERMISSIONS) {
    const permission = await rawDb.permission.upsert({
      where: { key },
      update: {},
      create: { key }
    });
    permissionIds.set(key, permission.id);
  }

  await rawDb.$transaction(async (tx) => {
    await setRawTenant(tx, schoolId);
    await tx.school.create({
      data: { id: schoolId, uniqueCode, name: "Fixture School" }
    });
    await tx.schoolLoginDirectory.create({
      data: { schoolId, uniqueCode }
    });
    await tx.schoolSettings.create({ data: { schoolId } });
    await tx.user.createMany({
      data: [
        {
          id: ownerId,
          schoolId,
          name: "Fixture Owner",
          email: ownerId + "@test.invalid",
          passwordHash
        },
        {
          id: memberId,
          schoolId,
          name: "Fixture Member",
          email: memberId + "@test.invalid",
          passwordHash
        }
      ]
    });
    await tx.role.createMany({
      data: [
        {
          id: ownerRoleId,
          schoolId,
          name: "Owner " + ownerRoleId,
          isSystem: true
        },
        {
          id: testRoleId,
          schoolId,
          name: "Test Role " + testRoleId
        }
      ]
    });

    for (const permissionId of permissionIds.values()) {
      await tx.rolePermission.create({
        data: { schoolId, roleId: ownerRoleId, permissionId }
      });
    }

    await tx.userRole.create({
      data: { schoolId, userId: ownerId, roleId: ownerRoleId }
    });
    await tx.userPermissionOverride.create({
      data: {
        schoolId,
        userId: memberId,
        permissionId: permissionIds.get("reports:generate")!,
        granted: true
      }
    });
    await tx.schoolPasswordResetToken.create({
      data: {
        id: resetId,
        schoolId,
        userId: memberId,
        tokenHash: createId() + createId(),
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    await tx.auditLogSchool.create({
      data: {
        id: auditId,
        schoolId,
        actorId: ownerId,
        action: "fixture.created",
        entityType: "School",
        entityId: schoolId
      }
    });
  });

  return {
    schoolId,
    uniqueCode,
    ownerId,
    memberId,
    ownerRoleId,
    testRoleId,
    auditId,
    resetId,
    permissionIds
  };
}
