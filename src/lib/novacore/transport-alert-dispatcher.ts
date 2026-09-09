import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { enqueueNotification, type NotificationTemplateKey } from "@/lib/message-outbox";

type AlertRow = {
  id: string;
  tripId: string;
  studentId: string;
  guardianId: string;
  type: "approaching" | "arriving" | "arrived";
  idempotencyKey: string;
  details: Prisma.JsonValue;
};

type AlertDetails = {
  pickupPointId?: string;
  directDistanceMeters?: number;
  routeDistanceMeters?: number | null;
  etaMinutes?: number | null;
  etaConfidenceMinutes?: number | null;
  predictionVersion?: string;
  reportedAt?: string;
};

type NotificationChannel = "sms" | "whatsapp";

const TEMPLATE_BY_TYPE: Record<AlertRow["type"], NotificationTemplateKey> = {
  approaching: "transport_approaching",
  arriving: "transport_arriving",
  arrived: "transport_arrived",
};

function details(value: Prisma.JsonValue): AlertDetails {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  const row = value as Record<string, Prisma.JsonValue>;
  const numberOrNull = (key: string) => typeof row[key] === "number" && Number.isFinite(row[key]) ? row[key] as number : null;
  return {
    pickupPointId: typeof row.pickupPointId === "string" ? row.pickupPointId : undefined,
    directDistanceMeters: numberOrNull("directDistanceMeters") ?? undefined,
    routeDistanceMeters: numberOrNull("routeDistanceMeters"),
    etaMinutes: numberOrNull("etaMinutes"),
    etaConfidenceMinutes: numberOrNull("etaConfidenceMinutes"),
    predictionVersion: typeof row.predictionVersion === "string" ? row.predictionVersion : undefined,
    reportedAt: typeof row.reportedAt === "string" ? row.reportedAt : undefined,
  };
}

function configuredChannels(value: Prisma.JsonValue | null | undefined): NotificationChannel[] {
  const candidate = value && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, Prisma.JsonValue>).channels
    : value;
  if (!Array.isArray(candidate)) return [];
  return [...new Set(candidate.filter((item): item is NotificationChannel => item === "sms" || item === "whatsapp"))];
}

function hasWhatsAppTemplate(value: Prisma.JsonValue | null | undefined, key: NotificationTemplateKey) {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const candidate = (value as Record<string, Prisma.JsonValue>)[key];
  if (typeof candidate === "string") return Boolean(candidate.trim());
  if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") return false;
  const sid = (candidate as Record<string, Prisma.JsonValue>).contentSid;
  return typeof sid === "string" && Boolean(sid.trim());
}

function etaText(info: AlertDetails) {
  if (info.etaMinutes == null) return "ETA unavailable";
  if (info.etaConfidenceMinutes == null) return `about ${info.etaMinutes} min`;
  return `about ${info.etaMinutes} min (±${info.etaConfidenceMinutes})`;
}

function eventLabel(type: AlertRow["type"]) {
  if (type === "approaching") return "is approaching the pickup point";
  if (type === "arriving") return "is arriving at the pickup point";
  return "has arrived at the pickup point";
}

function messageBody(type: AlertRow["type"], studentName: string, info: AlertDetails) {
  if (type === "arrived") return `SukuuNova transport: ${studentName}'s school bus has arrived at the approved pickup point.`;
  return `SukuuNova transport: ${studentName}'s school bus ${eventLabel(type)}. ETA ${etaText(info)}.`;
}

export async function dispatchQueuedTransportAlerts(tx: TenantDb, schoolId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`transport-alert-dispatch:${schoolId}`}))`;
  const alerts = await tx.$queryRawUnsafe<AlertRow[]>(
    `SELECT "id","tripId","studentId","guardianId","type","idempotencyKey","details"
     FROM "P3TransportAlert"
     WHERE "schoolId"=$1 AND "status"='queued' AND "type" IN ('approaching','arriving','arrived')
     ORDER BY "queuedAt" ASC
     LIMIT $2`,
    schoolId,
    safeLimit,
  );
  if (!alerts.length) return { examined: 0, dispatched: 0, skipped: 0, messageJobs: 0 };

  const settings = await tx.schoolSettings.findUnique({
    where: { schoolId },
    select: { notificationChannels: true, whatsappTemplateConfig: true },
  });
  const schoolChannels = configuredChannels(settings?.notificationChannels);
  let dispatched = 0;
  let skipped = 0;
  let messageJobs = 0;

  for (const alert of alerts) {
    const [guardian, student] = await Promise.all([
      tx.guardian.findFirst({ where: { id: alert.guardianId, schoolId }, select: { id: true, phone: true } }),
      tx.student.findFirst({ where: { id: alert.studentId, schoolId }, select: { id: true, name: true } }),
    ]);
    if (!guardian?.phone || !student) {
      skipped += 1;
      await tx.$executeRawUnsafe(
        `UPDATE "P3TransportAlert" SET "status"='skipped',"details"="details" || $3::jsonb WHERE "schoolId"=$1 AND "id"=$2`,
        schoolId,
        alert.id,
        JSON.stringify({ dispatchReason: !student ? "student_missing" : "guardian_phone_missing", dispatchedAt: new Date().toISOString() }),
      );
      continue;
    }

    const templateKey = TEMPLATE_BY_TYPE[alert.type];
    const channels = schoolChannels.filter((channel) => channel !== "whatsapp" || hasWhatsAppTemplate(settings?.whatsappTemplateConfig, templateKey));
    if (!channels.length) {
      skipped += 1;
      await tx.$executeRawUnsafe(
        `UPDATE "P3TransportAlert" SET "status"='skipped',"details"="details" || $3::jsonb WHERE "schoolId"=$1 AND "id"=$2`,
        schoolId,
        alert.id,
        JSON.stringify({ dispatchReason: "no_configured_delivery_channel", dispatchedAt: new Date().toISOString() }),
      );
      continue;
    }

    const info = details(alert.details);
    const messages = await enqueueNotification(tx, {
      schoolId,
      recipientType: "guardian",
      recipientId: guardian.id,
      recipientPhone: guardian.phone,
      body: messageBody(alert.type, student.name, info),
      templateKey,
      templateVariables: {
        "1": student.name,
        "2": eventLabel(alert.type),
        "3": etaText(info),
      },
      idempotencyKey: `transport:${alert.idempotencyKey}`,
      channels,
    });
    if (!messages.length) {
      skipped += 1;
      await tx.$executeRawUnsafe(
        `UPDATE "P3TransportAlert" SET "status"='skipped',"details"="details" || $3::jsonb WHERE "schoolId"=$1 AND "id"=$2`,
        schoolId,
        alert.id,
        JSON.stringify({ dispatchReason: "message_outbox_created_no_jobs", dispatchedAt: new Date().toISOString() }),
      );
      continue;
    }

    messageJobs += messages.length;
    dispatched += 1;
    await tx.$executeRawUnsafe(
      `UPDATE "P3TransportAlert"
       SET "status"='outbox',"providerMessageId"=$3,"details"="details" || $4::jsonb
       WHERE "schoolId"=$1 AND "id"=$2`,
      schoolId,
      alert.id,
      messages[0].id,
      JSON.stringify({ messageIds: messages.map((message) => message.id), channels: messages.map((message) => message.channel), dispatchedAt: new Date().toISOString() }),
    );
  }

  return { examined: alerts.length, dispatched, skipped, messageJobs };
}

export async function reconcileTransportAlertDeliveries(tx: TenantDb, schoolId: string, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const alerts = await tx.$queryRawUnsafe<Array<{ id: string; details: Prisma.JsonValue }>>(
    `SELECT "id","details" FROM "P3TransportAlert" WHERE "schoolId"=$1 AND "status"='outbox' ORDER BY "queuedAt" ASC LIMIT $2`,
    schoolId,
    safeLimit,
  );
  let sent = 0;
  let failed = 0;
  for (const alert of alerts) {
    const raw = alert.details && !Array.isArray(alert.details) && typeof alert.details === "object"
      ? alert.details as Record<string, Prisma.JsonValue>
      : {};
    const messageIds = Array.isArray(raw.messageIds) ? raw.messageIds.filter((id): id is string => typeof id === "string") : [];
    if (!messageIds.length) continue;
    const messages = await tx.message.findMany({ where: { schoolId, id: { in: messageIds } }, select: { id: true, status: true, sentAt: true, lastError: true } });
    if (messages.length !== messageIds.length) continue;
    if (messages.some((message) => message.status === "queued" || message.status === "sending")) continue;

    if (messages.some((message) => message.status === "sent")) {
      const sentAt = messages.flatMap((message) => message.sentAt ? [message.sentAt] : []).sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date();
      await tx.$executeRawUnsafe(
        `UPDATE "P3TransportAlert" SET "status"='sent',"sentAt"=$3,"details"="details" || $4::jsonb WHERE "schoolId"=$1 AND "id"=$2`,
        schoolId,
        alert.id,
        sentAt,
        JSON.stringify({ deliveryStatuses: messages.map((message) => ({ id: message.id, status: message.status })) }),
      );
      sent += 1;
      continue;
    }

    await tx.$executeRawUnsafe(
      `UPDATE "P3TransportAlert" SET "status"='failed',"details"="details" || $3::jsonb WHERE "schoolId"=$1 AND "id"=$2`,
      schoolId,
      alert.id,
      JSON.stringify({ deliveryStatuses: messages.map((message) => ({ id: message.id, status: message.status, error: message.lastError })) }),
    );
    failed += 1;
  }
  return { examined: alerts.length, sent, failed };
}
