import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";
import { UnauthorizedError } from "./errors";
import { roleKeyForName } from "./authorization";

const LOGIN_FAILURE = "Invalid credentials or inactive account.";
const MIN_PASSWORD_LENGTH = 12;
const globalForAuthPrisma = globalThis as unknown as { sukuunovaAuthPrisma?: PrismaClient };
const authDb = globalForAuthPrisma.sukuunovaAuthPrisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalForAuthPrisma.sukuunovaAuthPrisma = authDb;
function normalizedIdentifier(value: string): string { const trimmed = value.trim(); return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed; }

export async function authenticateSchoolUser(input: { uniqueCode: string; identifier: string; password: string }) {
  const uniqueCode = input.uniqueCode.trim().toLowerCase();
  const directory = await authDb.schoolLoginDirectory.findUnique({ where: { uniqueCode }, select: { schoolId: true, status: true } });
  if (!directory || directory.status !== "active") throw new UnauthorizedError(LOGIN_FAILURE);
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new UnauthorizedError("This password is too short. Use the password reset flow to secure the account.");
  return authDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", directory.schoolId);
    const schoolRows = await tx.$queryRaw<{ id: string; name: string; status: string }[]>`SELECT "id", "name", "status" FROM "School" WHERE "id" = ${directory.schoolId} LIMIT 1`;
    const school = schoolRows[0];
    if (!school || school.status !== "active") throw new UnauthorizedError(LOGIN_FAILURE);
    const identifier = normalizedIdentifier(input.identifier);
    const userRows = await tx.$queryRaw<{ id: string; schoolId: string; name: string; passwordHash: string; status: string; needsPasswordChange: boolean }[]>`
      SELECT u."id", u."schoolId", u."name", u."passwordHash", u."status", u."needsPasswordChange"
      FROM "User" u
      WHERE u."schoolId" = ${directory.schoolId}
        AND u."status" = 'active'
        AND (u."email" = ${identifier} OR u."phone" = ${identifier})
        AND NOT EXISTS (SELECT 1 FROM "Guardian" g WHERE g."userId" = u."id" AND g."schoolId" = u."schoolId")
      LIMIT 1`;
    const user = userRows[0];
    if (!user || !(await compare(input.password, user.passwordHash))) throw new UnauthorizedError(LOGIN_FAILURE);
    const roles = await tx.userRole.findMany({ where: { userId: user.id }, select: { role: { select: { name: true, key: true } } } });
    const roleEntries = roles.map(({ role }) => ({ name: role.name, key: role.key?.trim() || roleKeyForName(role.name) }));
    const roleKeys = roleEntries.map((role) => role.key);

    const schoolWorkspaceRoles = new Set([
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
      "transport_officer"
    ]);
    const teacherWorkspaceRoles = new Set(["teacher", "class_teacher", "subject_teacher"]);
    const hasSchoolWorkspaceRole = roleKeys.some((key) => schoolWorkspaceRoles.has(key));
    const hasTeacherWorkspaceRole = roleKeys.some((key) => teacherWorkspaceRoles.has(key));
    const portal = hasSchoolWorkspaceRole ? "school" : hasTeacherWorkspaceRole ? "teacher" : "school";
    return { userId: user.id, schoolId: user.schoolId, name: user.name, schoolName: school.name, portal, roles: roleEntries.map((role) => role.name), roleKeys, needsPasswordChange: Boolean(user.needsPasswordChange) };
  });
}

export async function authenticateGuardianUser(input: { schoolCode: string; identifier: string; password: string }) {
  const uniqueCode = input.schoolCode.trim().toLowerCase();
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new UnauthorizedError("This password is no longer accepted. Use the password reset flow to secure the account.");
  const directory = await authDb.schoolLoginDirectory.findUnique({ where: { uniqueCode }, select: { schoolId: true, status: true } });
  if (!directory || directory.status !== "active") throw new UnauthorizedError(LOGIN_FAILURE);
  return authDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", directory.schoolId);
    const schoolRows = await tx.$queryRaw<{ id: string; name: string; status: string }[]>`SELECT "id", "name", "status" FROM "School" WHERE "id" = ${directory.schoolId} LIMIT 1`;
    const school = schoolRows[0];
    if (!school || school.status !== "active") throw new UnauthorizedError(LOGIN_FAILURE);
    const identifier = normalizedIdentifier(input.identifier);
    const guardianRows = await tx.$queryRaw<{ guardianId: string; guardianName: string; userId: string; passwordHash: string; needsPasswordChange: boolean }[]>`
      SELECT g."id" AS "guardianId", g."name" AS "guardianName", u."id" AS "userId", u."passwordHash", u."needsPasswordChange"
      FROM "Guardian" g
      INNER JOIN "User" u ON u."id" = g."userId" AND u."schoolId" = g."schoolId"
      WHERE g."schoolId" = ${directory.schoolId}
        AND u."status" = 'active'
        AND (u."email" = ${identifier} OR u."phone" = ${identifier})
      LIMIT 1`;
    const guardian = guardianRows[0];
    if (!guardian || !(await compare(input.password, guardian.passwordHash))) throw new UnauthorizedError(LOGIN_FAILURE);
    return { userId: guardian.userId, guardianId: guardian.guardianId, schoolId: directory.schoolId, name: guardian.guardianName, schoolName: school.name, needsPasswordChange: Boolean(guardian.needsPasswordChange) };
  });
}

export async function authenticatePlatformAdmin(input: { email: string; password: string }) {
  const admin = await authDb.platformAdmin.findUnique({ where: { email: input.email.trim().toLowerCase() }, select: { id: true, name: true, passwordHash: true, status: true, role: true } });
  if (!admin || admin.status !== "active" || !(await compare(input.password, admin.passwordHash))) throw new UnauthorizedError(LOGIN_FAILURE);
  return { adminId: admin.id, name: admin.name, role: admin.role };
}
