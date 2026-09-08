import { createId } from "@paralleldrive/cuid2";
import type { Prisma } from "@prisma/client";
import { appendPlatformAudit, appendSchoolAudit } from "@/lib/audit";
import { withTenant } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type PlatformNoticeAudience = "leadership" | "staff" | "all_users";
export type PlatformNoticeSeverity = "info" | "warning" | "critical";

type ControlActor = { adminId: string; adminName: string };

const LEADERSHIP_ROLES = ["owner", "administrator", "principal", "vice_principal"];

function platformActorId(adminId: string) {
  return `platform:${adminId}`;
}

export async function getPlatformSchoolControlSnapshot(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const [school, users, activeImpersonations, schoolEpochRows] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true } }),
      tx.user.findMany({
        where: { schoolId },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        take: 1000,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          needsPasswordChange: true,
          userRoles: { select: { role: { select: { name: true, key: true } } } },
          guardianProfiles: { select: { id: true } },
        },
      }),
      tx.$queryRawUnsafe<Array<{ id: string; platformAdminId: string; impersonatedUserId: string; reason: string; startedAt: Date }>>(
        `SELECT "id","platformAdminId","impersonatedUserId","reason","startedAt"
         FROM "ImpersonationLog"
         WHERE "schoolId"=$1 AND "endedAt" IS NULL
         ORDER BY "startedAt" DESC`,
        schoolId,
      ),
      tx.$queryRawUnsafe<Array<{ version: number; updatedAt: Date }>>(
        `SELECT "version","updatedAt" FROM "SchoolSessionEpoch" WHERE "schoolId"=$1 LIMIT 1`,
        schoolId,
      ),
    ]);
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");

    const roleless = users.filter((user) => user.status === "active" && user.userRoles.length === 0);
    const missingContact = users.filter((user) => user.status === "active" && !user.email && !user.phone);
    const pendingPassword = users.filter((user) => user.status === "active" && user.needsPasswordChange);
    const leadership = users.filter((user) => user.status === "active" && user.userRoles.some(({ role }) => LEADERSHIP_ROLES.includes(role.key ?? "")));
    const guardianAccounts = users.filter((user) => user.guardianProfiles.length > 0);

    return {
      school,
      sessionEpoch: Number(schoolEpochRows[0]?.version ?? 0),
      sessionEpochUpdatedAt: schoolEpochRows[0]?.updatedAt ?? null,
      activeImpersonations,
      accounts: {
        total: users.length,
        active: users.filter((user) => user.status === "active").length,
        inactive: users.filter((user) => user.status !== "active").length,
        roleless: roleless.length,
        pendingPasswordChange: pendingPassword.length,
        missingContact: missingContact.length,
        leadership: leadership.length,
        guardians: guardianAccounts.length,
      },
      rolelessUsers: roleless.slice(0, 20).map((user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone })),
      pendingPasswordUsers: pendingPassword.slice(0, 20).map((user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone })),
      leadershipUsers: leadership.slice(0, 20).map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles: user.userRoles.map(({ role }) => role.key ?? role.name),
      })),
    };
  });
}

export async function forceSignOutSchool(schoolId: string, actor: ControlActor, reason: string) {
  const trimmedReason = reason.trim();
  const result = await withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, status: true } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const epochRows = await tx.$queryRawUnsafe<Array<{ version: number }>>(
      `INSERT INTO "SchoolSessionEpoch" ("schoolId","version","updatedAt")
       VALUES ($1,1,CURRENT_TIMESTAMP)
       ON CONFLICT ("schoolId") DO UPDATE
       SET "version"="SchoolSessionEpoch"."version"+1,"updatedAt"=CURRENT_TIMESTAMP
       RETURNING "version"`,
      schoolId,
    );
    const endedImpersonations = await tx.$executeRawUnsafe(
      `UPDATE "ImpersonationLog" SET "endedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "endedAt" IS NULL`,
      schoolId,
    );
    const activeUsers = await tx.user.count({ where: { schoolId, status: "active" } });
    await appendSchoolAudit(tx, {
      schoolId,
      actorId: platformActorId(actor.adminId),
      action: "platform.school_sessions.revoked",
      entityType: "School",
      entityId: schoolId,
      after: { reason: trimmedReason, sessionEpoch: Number(epochRows[0]?.version ?? 1), activeUsers, endedImpersonations },
    });
    return { schoolName: school.name, sessionEpoch: Number(epochRows[0]?.version ?? 1), activeUsers, endedImpersonations: Number(endedImpersonations) };
  });
  await appendPlatformAudit({
    actorId: actor.adminId,
    action: "platform.school_sessions.revoked",
    targetSchoolId: schoolId,
    targetEntity: "School",
    meta: { reason: trimmedReason, ...result },
  });
  return result;
}

export async function forceSignOutSchoolUser(schoolId: string, userId: string, actor: ControlActor, reason: string) {
  const trimmedReason = reason.trim();
  const result = await withTenant(schoolId, async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, schoolId }, select: { id: true, name: true, status: true } });
    if (!user) throw new AppError("School user not found.", 404, "NOT_FOUND");
    const epochRows = await tx.$queryRawUnsafe<Array<{ version: number }>>(
      `INSERT INTO "SchoolUserSessionEpoch" ("schoolId","userId","version","updatedAt")
       VALUES ($1,$2,1,CURRENT_TIMESTAMP)
       ON CONFLICT ("schoolId","userId") DO UPDATE
       SET "version"="SchoolUserSessionEpoch"."version"+1,"updatedAt"=CURRENT_TIMESTAMP
       RETURNING "version"`,
      schoolId,
      userId,
    );
    const endedImpersonations = await tx.$executeRawUnsafe(
      `UPDATE "ImpersonationLog" SET "endedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "impersonatedUserId"=$2 AND "endedAt" IS NULL`,
      schoolId,
      userId,
    );
    await appendSchoolAudit(tx, {
      schoolId,
      actorId: platformActorId(actor.adminId),
      action: "platform.user_sessions.revoked",
      entityType: "User",
      entityId: userId,
      after: { reason: trimmedReason, sessionEpoch: Number(epochRows[0]?.version ?? 1), endedImpersonations },
    });
    return { userId, userName: user.name, sessionEpoch: Number(epochRows[0]?.version ?? 1), endedImpersonations: Number(endedImpersonations) };
  });
  await appendPlatformAudit({
    actorId: actor.adminId,
    action: "platform.user_sessions.revoked",
    targetSchoolId: schoolId,
    targetEntity: `User:${userId}`,
    meta: { reason: trimmedReason, ...result },
  });
  return result;
}

export async function endSchoolImpersonations(schoolId: string, actor: ControlActor, reason: string) {
  const trimmedReason = reason.trim();
  const result = await withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const ended = await tx.$executeRawUnsafe(
      `UPDATE "ImpersonationLog" SET "endedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "endedAt" IS NULL`,
      schoolId,
    );
    await appendSchoolAudit(tx, {
      schoolId,
      actorId: platformActorId(actor.adminId),
      action: "platform.impersonations.ended",
      entityType: "School",
      entityId: schoolId,
      after: { reason: trimmedReason, ended: Number(ended) },
    });
    return { schoolName: school.name, ended: Number(ended) };
  });
  await appendPlatformAudit({
    actorId: actor.adminId,
    action: "platform.impersonations.ended",
    targetSchoolId: schoolId,
    targetEntity: "ImpersonationLog",
    meta: { reason: trimmedReason, ...result },
  });
  return result;
}

function noticeMetadata(input: { title: string; severity: PlatformNoticeSeverity; actor: ControlActor; audience: PlatformNoticeAudience }) {
  return JSON.parse(JSON.stringify({
    title: input.title,
    senderType: "platform",
    senderId: input.actor.adminId,
    senderName: "SukuuNova Platform",
    severity: input.severity,
    audience: input.audience,
    attachments: [],
  })) as Prisma.InputJsonValue;
}

export async function sendPlatformSchoolNotice(
  schoolId: string,
  actor: ControlActor,
  input: { title: string; body: string; audience: PlatformNoticeAudience; severity: PlatformNoticeSeverity },
) {
  const title = input.title.trim();
  const body = input.body.trim();
  const now = new Date();
  const result = await withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");

    const baseWhere = { schoolId, status: "active" } as const;
    const recipients = input.audience === "leadership"
      ? await tx.user.findMany({
          where: { ...baseWhere, userRoles: { some: { role: { key: { in: LEADERSHIP_ROLES } } } } },
          select: { id: true, name: true, phone: true },
          take: 100,
        })
      : input.audience === "staff"
        ? await tx.user.findMany({
            where: { ...baseWhere, guardianProfiles: { none: { schoolId } } },
            select: { id: true, name: true, phone: true },
            take: 1000,
          })
        : await tx.user.findMany({ where: baseWhere, select: { id: true, name: true, phone: true }, take: 1000 });

    if (!recipients.length) throw new AppError("No active recipients match this notice audience.", 409, "NO_NOTICE_RECIPIENTS");
    const metadata = noticeMetadata({ title, severity: input.severity, actor, audience: input.audience });
    const messageBody = `${title}\n\n${body}`;
    for (const recipient of recipients) {
      await tx.message.create({
        data: {
          schoolId,
          channel: "in_app",
          recipientType: "user",
          recipientId: recipient.id,
          recipientPhone: recipient.phone ?? "",
          body: messageBody,
          templateKey: "platform_notice",
          templateVariables: metadata,
          status: "delivered",
          attempts: 1,
          sentAt: now,
          nextAttemptAt: now,
          idempotencyKey: `platform-notice:${schoolId}:${actor.adminId}:${recipient.id}:${createId()}`,
        },
      });
    }
    await appendSchoolAudit(tx, {
      schoolId,
      actorId: platformActorId(actor.adminId),
      action: "platform.notice.sent",
      entityType: "MessageBatch",
      entityId: `platform-notice-${createId()}`,
      after: { title, severity: input.severity, audience: input.audience, recipients: recipients.length },
    });
    return { schoolName: school.name, recipients: recipients.length };
  });
  await appendPlatformAudit({
    actorId: actor.adminId,
    action: "platform.notice.sent",
    targetSchoolId: schoolId,
    targetEntity: "MessageBatch",
    meta: { title, severity: input.severity, audience: input.audience, recipients: result.recipients },
  });
  return result;
}
