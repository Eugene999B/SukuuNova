import type { PlatformSession } from "./auth";
import { db, withTenant } from "./db";
import { AppError } from "./errors";
import { requirePlatformPermission } from "./platform-permissions";
import { describeSmsDeliveryStatus, type SmsDeliveryGroup } from "./sms-delivery-receipts";

type SchoolSmsRow = {
  id: string;
  recipientPhone: string;
  body: string;
  messageStatus: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
  idempotencyKey: string;
  providerKey: string | null;
  providerMessageId: string | null;
  providerCreditsUsed: number | null;
  providerStatus: string | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  providerUpdatedAt: Date | null;
};

type DirectSmsRow = {
  id: string;
  batchId: string;
  recipientPhone: string;
  messageBody: string;
  providerKey: string;
  providerMessageId: string | null;
  providerCreditsUsed: number | null;
  status: string;
  lastError: string | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  statusLabel: string;
  statusGroup: SmsDeliveryGroup;
  statusExplanation: string;
  outboxStatus: string | null;
  providerStatus: string | null;
  attempts: number;
  providerKey: string | null;
  providerMessageId: string | null;
  creditsUsed: number | null;
  error: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  updatedAt: Date;
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

function rowStatus(providerStatus: string | null, outboxStatus: string | null) {
  return describeSmsDeliveryStatus(providerStatus || outboxStatus || "queued");
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
            `SELECT m."id",m."recipientPhone",m."body",m."status" AS "messageStatus",m."attempts",m."lastError",m."sentAt",m."createdAt",m."idempotencyKey",
                    d."providerKey",d."providerMessageId",d."providerCreditsUsed",d."status" AS "providerStatus",
                    d."acceptedAt",d."deliveredAt",d."failedAt",d."updatedAt" AS "providerUpdatedAt"
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
        const delivery = rowStatus(message.providerStatus, message.messageStatus);
        const acceptedAt = message.acceptedAt ?? (message.messageStatus === "sent" ? message.sentAt : null);
        schoolRows.push({
          id: `school:${directory.schoolId}:${message.id}`,
          batchId,
          source: isSmsCenter ? "school" : "system",
          schoolId: directory.schoolId,
          schoolName: rows.schoolName,
          recipientPhone: message.recipientPhone,
          message: message.body,
          status: delivery.status,
          statusLabel: delivery.label,
          statusGroup: delivery.group,
          statusExplanation: delivery.explanation,
          outboxStatus: message.messageStatus,
          providerStatus: message.providerStatus,
          attempts: message.attempts,
          providerKey: message.providerKey,
          providerMessageId: message.providerMessageId,
          creditsUsed: message.providerCreditsUsed,
          error: message.lastError,
          createdAt: message.createdAt,
          acceptedAt,
          deliveredAt: message.deliveredAt,
          failedAt: message.failedAt,
          updatedAt: message.providerUpdatedAt ?? message.sentAt ?? message.createdAt,
        });
      }
    } catch {
      // Keep the rest of the network history visible if one tenant is unavailable.
    }
  }

  const persistedDirect = await db.$queryRawUnsafe<DirectSmsRow[]>(
    `SELECT "id","batchId","recipientPhone","messageBody","providerKey","providerMessageId","providerCreditsUsed","status","lastError",
            "acceptedAt","deliveredAt","failedAt","createdAt","updatedAt"
       FROM "PlatformSmsDelivery"
      ORDER BY "createdAt" DESC
      LIMIT 300`,
  );

  const directRows: PlatformSmsHistoryRow[] = persistedDirect.map((message) => {
    const delivery = rowStatus(message.status, null);
    return {
      id: `direct:${message.id}`,
      batchId: message.batchId,
      source: "direct" as const,
      schoolId: null,
      schoolName: null,
      recipientPhone: message.recipientPhone,
      message: message.messageBody,
      status: delivery.status,
      statusLabel: delivery.label,
      statusGroup: delivery.group,
      statusExplanation: delivery.explanation,
      outboxStatus: null,
      providerStatus: message.status,
      attempts: 1,
      providerKey: message.providerKey,
      providerMessageId: message.providerMessageId,
      creditsUsed: message.providerCreditsUsed,
      error: message.lastError,
      createdAt: message.createdAt,
      acceptedAt: message.acceptedAt,
      deliveredAt: message.deliveredAt,
      failedAt: message.failedAt,
      updatedAt: message.updatedAt,
    };
  });

  // Keep pre-delivery-receipt direct sends visible. These legacy audit rows are
  // intentionally labelled Submitted/accepted rather than Delivered because no
  // handset delivery receipt was stored for them.
  const persistedProviderIds = new Set(persistedDirect.map((row) => row.providerMessageId).filter((value): value is string => Boolean(value)));
  const persistedBatchRecipients = new Set(persistedDirect.map((row) => `${row.batchId}:${row.recipientPhone}`));
  const directAudits = await db.auditLogPlatform.findMany({
    where: { action: "platform.sms.direct_sent" },
    orderBy: { createdAt: "desc" },
    take: 150,
    select: { id: true, meta: true, createdAt: true },
  });
  for (const audit of directAudits) {
    const meta = asRecord(audit.meta);
    const recipients = Array.isArray(meta.recipients) ? meta.recipients : [];
    const message = asString(meta.messageBody) ?? asString(meta.bodyPreview) ?? "";
    const batchId = asString(meta.batchId);
    recipients.forEach((value, index) => {
      const recipient = asRecord(value);
      const phone = asString(recipient.phone) ?? "Unknown recipient";
      const providerMessageId = asString(recipient.providerMessageId);
      if ((providerMessageId && persistedProviderIds.has(providerMessageId)) || (batchId && persistedBatchRecipients.has(`${batchId}:${phone}`))) return;
      const accepted = recipient.ok === true || recipient.status === "sent" || recipient.status === "submitted";
      const rawStatus = accepted ? "SUBMITTED" : "SEND_FAILED";
      const delivery = describeSmsDeliveryStatus(rawStatus);
      directRows.push({
        id: `legacy-direct:${audit.id}:${index}`,
        batchId,
        source: "direct",
        schoolId: null,
        schoolName: null,
        recipientPhone: phone,
        message,
        status: delivery.status,
        statusLabel: delivery.label,
        statusGroup: delivery.group,
        statusExplanation: delivery.explanation,
        outboxStatus: null,
        providerStatus: rawStatus,
        attempts: 1,
        providerKey: asString(recipient.providerKey) ?? asString(meta.providerKey),
        providerMessageId,
        creditsUsed: asNumber(recipient.creditsUsed),
        error: asString(recipient.error),
        createdAt: audit.createdAt,
        acceptedAt: accepted ? audit.createdAt : null,
        deliveredAt: null,
        failedAt: accepted ? null : audit.createdAt,
        updatedAt: audit.createdAt,
      });
    });
  }

  const rows = [...schoolRows, ...directRows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 500);
  const summary = rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.statusGroup === "delivered") acc.delivered += 1;
    else if (row.statusGroup === "failed") acc.failed += 1;
    else acc.inTransit += 1;
    return acc;
  }, { total: 0, delivered: 0, inTransit: 0, failed: 0 });

  return { rows, summary };
}
