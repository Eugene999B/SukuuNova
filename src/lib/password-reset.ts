import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { db, withTenant } from "./db";
import { AppError, UnauthorizedError } from "./errors";

const RESET_TTL_MS = 30 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;

export type ResetDeliveryEnvelope = {
  universe: "school" | "guardian" | "platform";
  recipient: string;
  token: string;
  expiresAt: Date;
  schoolCode?: string;
};

function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function newToken(): string { return randomBytes(32).toString("base64url"); }
function normalizeIdentifier(value: string): string { const trimmed = value.trim(); return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed; }
function validateNewPassword(password: string) { if (password.length < MIN_PASSWORD_LENGTH) throw new AppError(`New password must contain at least ${MIN_PASSWORD_LENGTH} characters.`, 400, "WEAK_PASSWORD"); }

export async function issueSchoolPasswordReset(input: { uniqueCode: string; identifier: string; universe?: "school" | "guardian" }): Promise<ResetDeliveryEnvelope | null> {
  const uniqueCode = input.uniqueCode.trim().toLowerCase();
  const directory = await db.schoolLoginDirectory.findUnique({ where: { uniqueCode } });
  if (!directory || directory.status !== "active") return null;
  return withTenant(directory.schoolId, async (tx) => {
    const identifier = normalizeIdentifier(input.identifier);
    const user = await tx.user.findFirst({ where: { status: "active", OR: [{ email: identifier }, { phone: identifier }] } });
    if (!user) return null;
    const token = newToken(); const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await tx.schoolPasswordResetToken.create({ data: { schoolId: directory.schoolId, userId: user.id, tokenHash: tokenHash(token), expiresAt } });
    await tx.auditLogSchool.create({ data: { schoolId: directory.schoolId, actorId: user.id, action: "password_reset.requested", entityType: "User", entityId: user.id, after: { expiresAt: expiresAt.toISOString() } } });
    return { universe: input.universe ?? "school", recipient: user.email || user.phone || identifier, token, expiresAt, schoolCode: uniqueCode };
  });
}

export async function confirmSchoolPasswordReset(input: { uniqueCode: string; token: string; newPassword: string }): Promise<void> {
  validateNewPassword(input.newPassword);
  const directory = await db.schoolLoginDirectory.findUnique({ where: { uniqueCode: input.uniqueCode.trim().toLowerCase() } });
  if (!directory || directory.status !== "active") throw new UnauthorizedError("Invalid or expired reset token.");
  await withTenant(directory.schoolId, async (tx) => {
    const now = new Date();
    const claimed = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
      UPDATE "SchoolPasswordResetToken"
      SET "usedAt" = ${now}
      WHERE "schoolId" = ${directory.schoolId}
        AND "tokenHash" = ${tokenHash(input.token)}
        AND "usedAt" IS NULL
        AND "expiresAt" > ${now}
        AND EXISTS (
          SELECT 1 FROM "User" u
          WHERE u."id" = "SchoolPasswordResetToken"."userId"
            AND u."schoolId" = ${directory.schoolId}
            AND u."status" = 'active'
        )
      RETURNING "id", "userId"
    `;
    const reset = claimed[0];
    if (!reset) throw new UnauthorizedError("Invalid or expired reset token.");
    const passwordHash = await hash(input.newPassword, 12);
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.schoolPasswordResetToken.updateMany({ where: { schoolId: directory.schoolId, userId: reset.userId, usedAt: null }, data: { usedAt: now } });
    await tx.auditLogSchool.create({ data: { schoolId: directory.schoolId, actorId: reset.userId, action: "password_reset.completed", entityType: "User", entityId: reset.userId, after: { completedAt: now.toISOString() } } });
  });
}

export async function issuePlatformPasswordReset(emailInput: string): Promise<ResetDeliveryEnvelope | null> {
  const email = emailInput.trim().toLowerCase();
  const admin = await db.platformAdmin.findUnique({ where: { email } });
  if (!admin || admin.status !== "active") return null;
  const token = newToken(); const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.$transaction(async (tx) => {
    await tx.platformPasswordResetToken.create({ data: { adminId: admin.id, tokenHash: tokenHash(token), expiresAt } });
    await tx.auditLogPlatform.create({ data: { actorId: admin.id, action: "password_reset.requested", targetEntity: "PlatformAdmin:" + admin.id, meta: { expiresAt: expiresAt.toISOString() } } });
  });
  return { universe: "platform", recipient: admin.email, token, expiresAt };
}

export async function confirmPlatformPasswordReset(input: { token: string; newPassword: string }): Promise<void> {
  validateNewPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.$queryRaw<Array<{ id: string; adminId: string }>>`
      UPDATE "PlatformPasswordResetToken"
      SET "usedAt" = ${now}
      WHERE "tokenHash" = ${tokenHash(input.token)}
        AND "usedAt" IS NULL
        AND "expiresAt" > ${now}
        AND EXISTS (
          SELECT 1 FROM "PlatformAdmin" a
          WHERE a."id" = "PlatformPasswordResetToken"."adminId"
            AND a."status" = 'active'
        )
      RETURNING "id", "adminId"
    `;
    const reset = claimed[0];
    if (!reset) throw new UnauthorizedError("Invalid or expired reset token.");
    await tx.platformAdmin.update({ where: { id: reset.adminId }, data: { passwordHash: await hash(input.newPassword, 12) } });
    await tx.platformPasswordResetToken.updateMany({ where: { adminId: reset.adminId, usedAt: null }, data: { usedAt: now } });
    await tx.auditLogPlatform.create({ data: { actorId: reset.adminId, action: "password_reset.completed", targetEntity: "PlatformAdmin:" + reset.adminId, meta: { completedAt: now.toISOString() } } });
  });
}
