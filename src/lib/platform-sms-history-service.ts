import type { PlatformSession } from "./auth";
import { db, withTenant } from "./db";
import { AppError } from "./errors";
import { requirePlatformPermission } from "./platform-permissions";

type SchoolSmsRow = {
  id: string;
  recipientPhone: string;
  body: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
  idempotencyKey: string;
  providerKey: string | null;
  providerMessageId: string | null;
  providerCreditsUsed: number | null;
  providerStatus: string | null;
};

export type PlatformSmsHistoryRow = {
  id: string;
  batchId: string | null;
  source: "direct" | "school" | "system";
  schoolId: string | null;
  schoolName: string | null;
  recipientPhone: string;
  message: string;
  status: string;
  attempts: number;
  providerKey: string | null;
  providerMessageId: string | null;
  creditsUsed: number | null;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

async function requireSmsAdmin(session: PlatformSession) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can view platform SMS history.", 403, "FORBIDDEN");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getPlatformSmsHistory(session: PlatformSession) {
  await requireSmsAdmin(session);
  const directories = await db.schoolLoginDirectory.findMany({ orderBy: { createdAt: "desc" } });
  const schoolRows: PlatformSmsHistoryRow[] = [];

  for (const directory of directories) {
    try {
      const rows = await withTenant(directory.schoolId, async (tx) => {
        const [school, messages] = await Promise.all([
          tx.school.findUnique({ where: { id: directory.schoolId }, select: { name: true } }),
          tx.$queryRawUnsafe<SchoolSmsRow[]>(
            `SELECT m."id",m."recipientPhone",m."body",m."status",m."attempts",m."lastError",m."sentAt",m."createdAt",m."idempotencyKey",
                    d."providerKey",d."providerMessageId",d."providerCreditsUsed",d."status" AS "providerStatus"
               FROM "Message" m
               LEFT JOIN "SmsProviderDelivery" d ON d."schoolId"=m."schoolId" AND d."messageId"=m."id"
              WHERE m."schoolId"=$1 AND m."channel"='sms'
              ORDER BY m."createdAt" DESC
              LIMIT 200`,
            directory.schoolId,
          ),
        ]);
        return { schoolName: school?.name ?? directory.uniqueCode, messages };
      });

      for (const message of rows.messages) {
        const isSmsCenter = message.idempotencyKey.startsWith("platform-sms:");
        const batchId = isSmsCenter ? message.idempotencyKey.split(":")[1] || null : null;
        schoolRows.push({
          id: `school:${directory.schoolId}:${message.id}`,
          batchId,
          source: isSmsCenter ? "school" : "system",
          schoolId: directory.schoolId,
          schoolName: rows.schoolName,
          recipientPhone: message.recipientPhone,
          message: message.body,
          status: message.status,
          attempts: message.attempts,
          providerKey: message.providerKey,
          providerMessageId: message.providerMessageId,
          creditsUsed: message.providerCreditsUsed,
          error: message.lastError,
          createdAt: message.createdAt,
          sentAt: message.sentAt,
        });
      }
    } catch {
      // Keep the rest of the network history visible if one tenant is unavailable.
    }
  }

  const directAudits = await db.auditLogPlatform.findMany({
    where: { action: "platform.sms.direct_sent" },
    orderBy: { createdAt: "desc" },
    take: 150,
    select: { id: true, meta: true, createdAt: true },
  });
  const directRows: PlatformSmsHistoryRow[] = [];
  for (const audit of directAudits) {
    const meta = asRecord(audit.meta);
    const recipients = Array.isArray(meta.recipients) ? meta.recipients : [];
    const message = asString(meta.messageBody) ?? asString(meta.bodyPreview) ?? "";
    const batchId = asString(meta.batchId);
    recipients.forEach((value, index) => {
      const recipient = asRecord(value);
      const ok = recipient.ok === true || recipient.status === "sent";
      directRows.push({
        id: `direct:${audit.id}:${index}`,
        batchId,
        source: "direct",
        schoolId: null,
        schoolName: null,
        recipientPhone: asString(recipient.phone) ?? "Unknown recipient",
        message,
        status: ok ? "sent" : "failed",
        attempts: 1,
        providerKey: asString(recipient.providerKey),
        providerMessageId: asString(recipient.providerMessageId),
        creditsUsed: asNumber(recipient.creditsUsed),
        error: asString(recipient.error),
        createdAt: audit.createdAt,
        sentAt: ok ? audit.createdAt : null,
      });
    });
  }

  const rows = [...schoolRows, ...directRows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 500);
  const summary = rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.status === "sent") acc.sent += 1;
    else if (row.status === "failed") acc.failed += 1;
    else if (row.status === "sending") acc.sending += 1;
    else acc.queued += 1;
    return acc;
  }, { total: 0, sent: 0, failed: 0, queued: 0, sending: 0 });

  return { rows, summary };
}
