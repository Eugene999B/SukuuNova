#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const TARGET = String(process.env.EUGENE_ACADEMY_ACCESS_TARGET || "trial").trim().toLowerCase();
const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const PRODUCTION_ACK = "EUGENE_ACADEMY_ONLY";

if (!new Set(["trial", "production"]).has(TARGET)) {
  throw new Error("EUGENE_ACADEMY_ACCESS_TARGET must be 'trial' or 'production'.");
}

const targetUrl = TARGET === "production"
  ? String(process.env.DATABASE_URL || "").trim()
  : String(process.env.TEST_DATABASE_URL || "").trim();

if (!targetUrl) throw new Error(`${TARGET === "production" ? "DATABASE_URL" : "TEST_DATABASE_URL"} is required.`);
if (TARGET === "trial") {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim() !== "YES") {
    throw new Error("Refusing trial access refresh: set ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES.");
  }
  const productionUrl = String(process.env.DATABASE_URL || "").trim();
  if (productionUrl && productionUrl === targetUrl) throw new Error("Refusing trial access refresh against DATABASE_URL.");
} else {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED || "").trim() !== PRODUCTION_ACK) {
    throw new Error(`Refusing production access refresh: set ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED=${PRODUCTION_ACK}.`);
  }
  const railwayEnvironment = String(process.env.RAILWAY_ENVIRONMENT_NAME || "").trim().toLowerCase();
  if (railwayEnvironment && railwayEnvironment !== "production") {
    throw new Error(`Refusing production access refresh in Railway environment '${railwayEnvironment}'. Expected 'production'.`);
  }
}

function canonicalPermissions() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "default-rbac.ts"), "utf8");
  const match = source.match(/export const DEFAULT_PERMISSIONS\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (!match) throw new Error("Could not read the canonical DEFAULT_PERMISSIONS list.");
  const keys = [...match[1].matchAll(/"([a-z0-9:_-]+)"/g)].map((item) => item[1]);
  if (keys.length < 20 || !keys.includes("settings:manage_roles") || !keys.includes("attendance:pickup_approve")) {
    throw new Error("Canonical permission extraction failed safety validation.");
  }
  return [...new Set(keys)];
}

const canonicalRoleKeys = new Map([
  ["Owner", "owner"],
  ["Administrator", "administrator"],
  ["Principal", "principal"],
  ["Vice Principal", "vice_principal"],
  ["Academic Coordinator", "academic_coordinator"],
  ["Department Head", "department_head"],
  ["Accountant", "accountant"],
  ["HR Officer", "hr_officer"],
  ["Admissions Officer", "admissions_officer"],
  ["Class Teacher", "class_teacher"],
  ["Subject Teacher", "subject_teacher"],
  ["Teacher", "teacher"],
  ["Front Desk/Gate Security", "front_desk_security"],
  ["Transport Officer", "transport_officer"],
  ["Parent", "parent"],
  ["Guardian", "guardian"],
  ["Student", "student"],
]);

async function main() {
  process.env.DATABASE_URL = targetUrl;
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 180000 } });
  try {
    const directory = await prisma.schoolLoginDirectory.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
    if (!directory) throw new Error(`Eugene Academy directory '${SCHOOL_CODE}' was not found.`);
    const schoolId = directory.schoolId;
    const allPermissions = canonicalPermissions();
    const principalPermissions = allPermissions.filter((key) => key !== "students:delete");

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
      const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, uniqueCode: true } });
      if (!school || school.name !== SCHOOL_NAME || school.uniqueCode !== SCHOOL_CODE) {
        throw new Error(`Refusing access refresh: expected ${SCHOOL_NAME} (${SCHOOL_CODE}).`);
      }

      const roles = await tx.role.findMany({ where: { schoolId } });
      for (const role of roles) {
        const expectedKey = canonicalRoleKeys.get(role.name);
        if (expectedKey && (role.key !== expectedKey || !role.isSystem)) {
          await tx.role.update({ where: { id: role.id }, data: { key: expectedKey, isSystem: true } });
        }
      }

      const refreshedRoles = await tx.role.findMany({ where: { schoolId } });
      const byName = new Map(refreshedRoles.map((role) => [role.name, role]));
      const owner = byName.get("Owner");
      const principal = byName.get("Principal");
      if (!owner || !principal) throw new Error("Eugene Academy Owner/Principal system roles are missing.");

      const permissionIds = new Map();
      for (const key of allPermissions) {
        const permission = await tx.permission.upsert({ where: { key }, update: {}, create: { key, description: key } });
        permissionIds.set(key, permission.id);
      }

      async function applyBaseline(role, keys) {
        const allowedIds = keys.map((key) => permissionIds.get(key));
        await tx.rolePermission.deleteMany({ where: { schoolId, roleId: role.id, permissionId: { notIn: allowedIds } } });
        for (const key of keys) {
          const permissionId = permissionIds.get(key);
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId } },
            update: { schoolId },
            create: { schoolId, roleId: role.id, permissionId },
          });
        }
      }

      await applyBaseline(owner, allPermissions);
      await applyBaseline(principal, principalPermissions);

      const principalUsers = await tx.userRole.findMany({ where: { schoolId, roleId: principal.id }, select: { userId: true } });
      if (principalUsers.length) {
        await tx.userPermissionOverride.deleteMany({ where: { schoolId, userId: { in: principalUsers.map((item) => item.userId) } } });
      }

      const critical = [
        "settings:manage_school",
        "settings:manage_roles",
        "users:read",
        "users:write",
        "roles:create_custom",
        "visitors:log",
        "attendance:display",
        "attendance:pickup_approve",
        "transport:view",
        "transport:manage",
        "identity_cards:manage",
        "finance:read",
        "exports:finance",
      ];
      const principalRows = await tx.rolePermission.findMany({
        where: { schoolId, roleId: principal.id },
        select: { permission: { select: { key: true } } },
      });
      const principalSet = new Set(principalRows.map((item) => item.permission.key));
      const missing = critical.filter((key) => !principalSet.has(key));
      if (missing.length) throw new Error(`Principal access refresh verification failed: ${missing.join(", ")}`);
      if (principalSet.has("students:delete")) throw new Error("Principal must not receive students:delete.");

      return {
        school: school.name,
        code: school.uniqueCode,
        rolesCanonicalized: roles.filter((role) => canonicalRoleKeys.has(role.name)).length,
        ownerPermissions: allPermissions.length,
        principalPermissions: principalSet.size,
        principalAccounts: principalUsers.length,
      };
    });

    console.log("[eugene-access-refresh] verified", JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[eugene-access-refresh] failed:", error instanceof Error ? (error.stack || error.message) : String(error));
  process.exitCode = 1;
});
