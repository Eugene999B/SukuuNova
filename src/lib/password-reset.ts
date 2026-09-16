import { createHash, randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { getSchoolAuthorization } from "./authorization";
import { db, withTenant, type TenantDb } from "./db";
import { AppError, UnauthorizedError } from "./errors";
import { passwordLengthError, passwordMinimumForAccount } from "./password-policy";

const RESET_TTL_MS = 10 * 60 * 1000;

export type ResetDeliveryEnvelope = {
  universe: "school" | "guardian" | "platform";
  recipient: string;
  token: string;
  expiresAt: Date;
  schoolCode?: string;
};

export type SchoolPasswordResetResult = {
  schoolCode: string;
  userId: string;
  email: string | null;
  phone: string | null;
  universe: "school" | "guardian";
};

function tokenHash(accountId: string, token: string): string {
  return createHash("sha256").update(accountId + ":" + token).digest("hex");
}
function newToken(): string { return randomInt(0, 1_000_000).toString().padStart(6, "0"); }
function normalizeIdentifier(value: string): string { const trimmed = value.trim(); return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed; }
function validateNewPassword(password: string, minimum: number) {
  const error = passwordLengthError(password, minimum);
  if (error) throw new AppError(error, 400, "WEAK_PASSWORD");
}

async function findSchoolResetUser(
  tx: TenantDb,
  schoolId: string,
  identifierInput: string,
  universe: "school" | "guardian",
) {
  const identifier = normalizeIdentifier(identifierInput);
  const users = await tx.$queryRaw<Array<{ id: string; email: string | null; phone: string | null }>>`
    SELECT u."id", u."email", u."phone"
    FROM "User" u
    WHERE u."schoolId"=${schoolId}
      AND u."status"='active'
      AND (LOWER(COALESCE(u."email", ''))=${identifier.toLowerCase()} OR u."phone"=${identifier})
      AND (
        (${universe} = 'guardian' AND EXISTS (
          SELECT 1 FROM "Guardian" g WHERE g."userId"=u."id" AND g."schoolId"=u."schoolId"
        ))
        OR
        (${universe} = 'school' AND NOT EXISTS (
          SELECT 1 FROM "Guardian" g WHERE g."userId"=u."id" AND g."schoolId"=u."schoolId"
        ))
      )
    LIMIT 1
  `;
  return users[0] ?? null;
}

export async function issueSchoolPasswordReset(input: { uniqueCode: string; identifier: string; universe?: "school" | "guardian" }): Promise<ResetDeliveryEnvelope | null> {
  const uniqueCode = input.uniqueCode.trim().toLowerCase();
  const universe = input.universe ?? "school";
  const directory = await db.schoolLoginDirectory.findUnique({ where: { uniqueCode } });
  if (!directory || directory.status !== "active") return null;
  return withTenant(directory.schoolId, async (tx) => {
    const user = await findSchoolResetUser(tx, directory.schoolId, input.identifier, universe);
    if (!user) return null;
    const token = newToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    const now = new Date();
    await tx.schoolPasswordResetToken.updateMany({ where: { schoolId: directory.schoolId, userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.schoolPasswordResetToken.create({ data: { schoolId: directory.schoolId, userId: user.id, tokenHash: tokenHash(user.id, token), expiresAt } });
    await tx.auditLogSchool.create({ data: { schoolId: directory.schoolId, actorId: user.id, action: "password_reset.requested", entityType: "User", entityId: user.id, after: { expiresAt: expiresAt.toISOString(), universe, delivery: user.phone ? "sms" : "email" } } });
    return { universe, recipient: user.phone || user.email || normalizeIdentifier(input.identifier), token, expiresAt, schoolCode: uniqueCode };
  });
}

export async function confirmSchoolPasswordReset(input: { uniqueCode: string; identifier: string; token: string; newPassword: string; universe?: "school" | "guardian" }): Promise<SchoolPasswordResetResult> {
  const universe = input.universe ?? "school";
  const schoolCode = input.uniqueCode.trim().toLowerCase();
  const directory = await db.schoolLoginDirectory.findUnique({ where: { uniqueCode: schoolCode } });
  if (!directory || directory.status !== "active") throw new UnauthorizedError("Invalid or expired verification code.");
  return withTenant(directory.schoolId, async (tx) => {
    const userForReset = await findSchoolResetUser(tx, directory.schoolId, input.identifier, universe);
    if (!userForReset) throw new UnauthorizedError("Invalid or expired verification code.");
    const isElevatedSchoolAccount = universe === "school"
      ? (await getSchoolAuthorization(tx, userForReset.id)).isElevated
      : false;
    validateNewPassword(input.newPassword, passwordMinimumForAccount(universe, isElevatedSchoolAccount));

    const now = new Date();
    const claimed = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
      UPDATE "SchoolPasswordResetToken"
      SET "usedAt" = ${now}
      WHERE "schoolId" = ${directory.schoolId}
        AND "userId" = ${userForReset.id}
        AND "tokenHash" = ${tokenHash(userForReset.id, input.token)}
        AND "usedAt" IS NULL
        AND "expiresAt" > ${now}
      RETURNING "id", "userId"
    `;
    const reset = claimed[0];
    if (!reset) throw new UnauthorizedError("Invalid or expired verification code.");
    const passwordHash = await hash(input.newPassword, 12);
    const user = await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash, needsPasswordChange: false },
      select: { id: true, email: true, phone: true },
    });
    await tx.$executeRawUnsafe(
      `INSERT INTO "SchoolUserSessionEpoch" ("schoolId","userId","version","updatedAt")
       VALUES ($1,$2,1,CURRENT_TIMESTAMP)
       ON CONFLICT ("schoolId","userId") DO UPDATE
       SET "version"="SchoolUserSessionEpoch"."version"+1,"updatedAt"=CURRENT_TIMESTAMP`,
      directory.schoolId,
      reset.userId,
    );
    await tx.schoolPasswordResetToken.updateMany({ where: { schoolId: directory.schoolId, userId: reset.userId, usedAt: null }, data: { usedAt: now } });
    await tx.auditLogSchool.create({ data: { schoolId: directory.schoolId, actorId: reset.userId, action: "password_reset.completed", entityType: "User", entityId: reset.userId, after: { completedAt: now.toISOString(), universe, sessionsRevoked: true } } });
    return { schoolCode, userId: user.id, email: user.email, phone: user.phone, universe };
  });
}

export async function issuePlatformPasswordReset(emailInput: string): Promise<ResetDeliveryEnvelope | null> {
  const email = emailInput.trim().toLowerCase();
  const admin = await db.platformAdmin.findUnique({ where: { email } });
  if (!admin || admin.status !== "active") return null;
  const token = newToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.platformPasswordResetToken.updateMany({ where: { adminId: admin.id, usedAt: null }, data: { usedAt: now } });
    await tx.platformPasswordResetToken.create({ data: { adminId: admin.id, tokenHash: tokenHash(admin.id, token), expiresAt } });
    await tx.auditLogPlatform.create({ data: { actorId: admin.id, action: "password_reset.requested", targetEntity: "PlatformAdmin:" + admin.id, meta: { expiresAt: expiresAt.toISOString(), delivery: "email" } } });
  });
  return { universe: "platform", recipient: admin.email, token, expiresAt };
}

export async function confirmPlatformPasswordReset(input: { email: string; token: string; newPassword: string }): Promise<void> {
  validateNewPassword(input.newPassword, passwordMinimumForAccount("platform"));
  const email = input.email.trim().toLowerCase();
  const admin = await db.platformAdmin.findUnique({ where: { email } });
  if (!admin || admin.status !== "active") throw new UnauthorizedError("Invalid or expired verification code.");
  await db.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.$queryRaw<Array<{ id: string; adminId: string }>>`
      UPDATE "PlatformPasswordResetToken"
      SET "usedAt" = ${now}
      WHERE "adminId" = ${admin.id}
        AND "tokenHash" = ${tokenHash(admin.id, input.token)}
        AND "usedAt" IS NULL
        AND "expiresAt" > ${now}
      RETURNING "id", "adminId"
    `;
    const reset = claimed[0];
    if (!reset) throw new UnauthorizedError("Invalid or expired verification code.");
    await tx.platformAdmin.update({ where: { id: reset.adminId }, data: { passwordHash: await hash(input.newPassword, 12) } });
    await tx.platformPasswordResetToken.updateMany({ where: { adminId: reset.adminId, usedAt: null }, data: { usedAt: now } });
    await tx.auditLogPlatform.create({ data: { actorId: reset.adminId, action: "password_reset.completed", targetEntity: "PlatformAdmin:" + reset.adminId, meta: { completedAt: now.toISOString() } } });
  });
}
