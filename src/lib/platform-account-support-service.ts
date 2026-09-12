import { appendPlatformAudit, appendSchoolAudit } from "@/lib/audit";
import { accountLoginRateIdentityForUserId } from "@/lib/account-login-identity";
import { withTenant } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { issueSchoolPasswordReset } from "@/lib/password-reset";
import { accountLoginLockState, clearAccountLoginAttempts } from "@/lib/rate-limit";
import { deliverResetToken } from "@/lib/reset-delivery";

type SupportActor = { adminId: string; adminName: string };

function actorId(adminId: string) {
  return `platform:${adminId}`;
}

async function accountContext(schoolId: string, userId: string) {
  return withTenant(schoolId, async (tx) => {
    const [school, user] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true } }),
      tx.user.findFirst({
        where: { id: userId, schoolId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          needsPasswordChange: true,
          guardianProfiles: { select: { id: true } },
          userRoles: { select: { role: { select: { name: true, key: true } } } },
        },
      }),
    ]);
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    if (!user) throw new AppError("School account not found.", 404, "NOT_FOUND");
    return {
      school,
      user: {
        ...user,
        isGuardian: user.guardianProfiles.length > 0,
        roles: user.userRoles.map(({ role }) => role.key ?? role.name),
      },
    };
  });
}

export async function getSchoolUserSupportState(schoolId: string, userId: string) {
  const context = await accountContext(schoolId, userId);
  const rateIdentity = accountLoginRateIdentityForUserId(context.user.id);
  const [schoolLock, guardianLock] = await Promise.all([
    accountLoginLockState(`school-login:${context.school.uniqueCode.toLowerCase()}`, [rateIdentity]),
    accountLoginLockState(`guardian-login:${context.school.uniqueCode.toLowerCase()}`, [rateIdentity]),
  ]);
  const blockedUntil = [schoolLock.blockedUntil, guardianLock.blockedUntil]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    userId: context.user.id,
    status: context.user.status,
    needsPasswordChange: context.user.needsPasswordChange,
    roles: context.user.roles,
    isGuardian: context.user.isGuardian,
    hasRecoveryContact: Boolean(context.user.email || context.user.phone),
    loginLock: {
      locked: schoolLock.locked || guardianLock.locked,
      blockedUntil,
      failedAttempts: Math.max(schoolLock.attemptCount, guardianLock.attemptCount),
    },
  };
}

export async function clearSchoolUserLoginLock(schoolId: string, userId: string, actor: SupportActor, reason: string) {
  const context = await accountContext(schoolId, userId);
  const rateIdentity = accountLoginRateIdentityForUserId(context.user.id);
  const schoolCode = context.school.uniqueCode.toLowerCase();
  await Promise.all([
    clearAccountLoginAttempts(`school-login:${schoolCode}`, [rateIdentity]),
    clearAccountLoginAttempts(`guardian-login:${schoolCode}`, [rateIdentity]),
  ]);
  await withTenant(schoolId, async (tx) => {
    await appendSchoolAudit(tx, {
      schoolId,
      actorId: actorId(actor.adminId),
      action: "platform.user.login_lock_cleared",
      entityType: "User",
      entityId: userId,
      after: { reason: reason.trim() },
    });
  });
  await appendPlatformAudit({
    actorId: actor.adminId,
    action: "platform.user.login_lock_cleared",
    targetSchoolId: schoolId,
    targetEntity: `User:${userId}`,
    meta: { reason: reason.trim(), userName: context.user.name },
  });
  return { userId, userName: context.user.name, unlocked: true };
}

export async function sendSchoolUserPasswordReset(schoolId: string, userId: string, actor: SupportActor, reason: string) {
  const context = await accountContext(schoolId, userId);
  if (context.user.status !== "active") {
    throw new AppError("Reactivate this account before sending password recovery instructions.", 409, "ACCOUNT_INACTIVE");
  }
  const identifier = context.user.email ?? context.user.phone;
  if (!identifier) throw new AppError("This account has no email address or phone number for password recovery.", 409, "NO_RECOVERY_CONTACT");
  const universe = context.user.isGuardian ? "guardian" as const : "school" as const;
  const envelope = await issueSchoolPasswordReset({
    uniqueCode: context.school.uniqueCode,
    identifier,
    universe,
  });
  if (!envelope) throw new AppError("Password recovery could not be prepared for this account.", 409, "RESET_UNAVAILABLE");
  await deliverResetToken(envelope);
  await withTenant(schoolId, async (tx) => {
    await appendSchoolAudit(tx, {
      schoolId,
      actorId: actorId(actor.adminId),
      action: "platform.user.password_reset_requested",
      entityType: "User",
      entityId: userId,
      after: { reason: reason.trim(), universe, delivery: context.user.email ? "email" : "phone" },
    });
  });
  await appendPlatformAudit({
    actorId: actor.adminId,
    action: "platform.user.password_reset_requested",
    targetSchoolId: schoolId,
    targetEntity: `User:${userId}`,
    meta: { reason: reason.trim(), userName: context.user.name, universe, delivery: context.user.email ? "email" : "phone" },
  });
  return { userId, userName: context.user.name, delivery: context.user.email ? "email" : "phone" };
}
