import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { enqueueNotification } from "./message-outbox";

const CONFIRMATION_WINDOW_MS = 2 * 60 * 1000;

type SnapshotRecipient = { type: "guardian" | "staff"; id: string; phone: string };
type Channel = "sms" | "whatsapp";

function secret() {
  const value = process.env.SCHOOL_AUTH_SECRET;
  if (!value || value.length < 32) throw new AppError("School auth secret is not configured.", 503, "AUTH_NOT_CONFIGURED");
  return value;
}

function tokenFor(schoolId: string, actorId: string, broadcastId: string, expires: number) {
  const payload = Buffer.from(JSON.stringify({ schoolId, actorId, broadcastId, expires, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  return payload + "." + createHmac("sha256", secret()).update(payload).digest("base64url");
}

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

function verifyToken(token: string, schoolId: string, actorId: string) {
  const [part, signature] = token.split(".");
  if (!part || !signature) throw new AppError("Invalid emergency confirmation.", 400, "INVALID_CONFIRMATION");
  const expected = createHmac("sha256", secret()).update(part).digest("base64url");
  const expectedBuffer = Buffer.from(expected); const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) throw new AppError("Invalid emergency confirmation.", 400, "INVALID_CONFIRMATION");
  let payload: { schoolId: string; actorId: string; broadcastId: string; expires: number };
  try { payload = JSON.parse(Buffer.from(part, "base64url").toString()) as typeof payload; } catch { throw new AppError("Invalid emergency confirmation.", 400, "INVALID_CONFIRMATION"); }
  if (payload.schoolId !== schoolId || payload.actorId !== actorId || Date.now() > payload.expires) throw new AppError("Emergency confirmation has expired.", 409, "CONFIRMATION_EXPIRED");
  return payload;
}

function channelsFromSettings(value: Prisma.JsonValue | null | undefined): Channel[] {
  const raw = value && !Array.isArray(value) && typeof value === "object" ? (value as Record<string, Prisma.JsonValue>).channels : value;
  if (!Array.isArray(raw)) return ["sms"];
  const channels = raw.filter((item): item is Channel => item === "sms" || item === "whatsapp");
  return channels.length ? [...new Set(channels)] : ["sms"];
}

export async function prepareEmergencySnapshot(tx: TenantDb, input: { schoolId: string; actorId: string; message: string }) {
  await requirePermission(tx, input.actorId, "broadcast:emergency_send");
  const [guardians, staff, settings] = await Promise.all([
    tx.guardian.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } }),
    tx.user.findMany({ where: { status: "active", phone: { not: null } }, select: { id: true, phone: true } }),
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { notificationChannels: true } })
  ]);
  const snapshot: SnapshotRecipient[] = [
    ...guardians.map((row) => ({ type: "guardian" as const, id: row.id, phone: row.phone! })),
    ...staff.map((row) => ({ type: "staff" as const, id: row.id, phone: row.phone! }))
  ];
  const channels = channelsFromSettings(settings?.notificationChannels);
  const deliveryCount = snapshot.length * channels.length;
  const id = `emergency-${randomBytes(12).toString("hex")}`;
  const expires = Date.now() + CONFIRMATION_WINDOW_MS;
  const token = tokenFor(input.schoolId, input.actorId, id, expires);
  await tx.$executeRaw`
    INSERT INTO "EmergencyBroadcast" (
      "id", "schoolId", "actorId", "message", "recipientSnapshot", "recipientCount", "status",
      "confirmationTokenHash", "confirmationExpiresAt"
    ) VALUES (
      ${id}, ${input.schoolId}, ${input.actorId}, ${input.message.trim()}, ${JSON.stringify(snapshot)}::jsonb, ${deliveryCount},
      'PREVIEWED', ${tokenHash(token)}, ${new Date(expires)}
    )
  `;
  return { broadcastId: id, confirmationToken: token, recipientCount: snapshot.length, deliveryCount, expiresAt: new Date(expires), message: input.message.trim() };
}

export async function confirmEmergencySnapshot(tx: TenantDb, input: { schoolId: string; actorId: string; confirmationToken: string; message: string }) {
  await requirePermission(tx, input.actorId, "broadcast:emergency_send");
  const tokenData = verifyToken(input.confirmationToken, input.schoolId, input.actorId);
  const rows = await tx.$queryRaw<Array<{ id: string; message: string; recipientSnapshot: Prisma.JsonValue; status: string; confirmationExpiresAt: Date; recipientCount: number }>>`
    SELECT "id", "message", "recipientSnapshot", "status", "confirmationExpiresAt", "recipientCount"
    FROM "EmergencyBroadcast"
    WHERE "id" = ${tokenData.broadcastId}
      AND "schoolId" = ${input.schoolId}
      AND "actorId" = ${input.actorId}
      AND "confirmationTokenHash" = ${tokenHash(input.confirmationToken)}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new AppError("Emergency confirmation not found.", 404, "NOT_FOUND");
  if (row.status !== "PREVIEWED") throw new AppError("Emergency broadcast is no longer awaiting confirmation.", 409, "INVALID_STATE");
  if (Date.now() > row.confirmationExpiresAt.getTime()) throw new AppError("Emergency confirmation has expired.", 409, "CONFIRMATION_EXPIRED");
  if (input.message.trim() !== row.message.trim()) throw new AppError("The emergency message changed after preview. Create a new preview before confirming.", 409, "MESSAGE_CHANGED");

  const snapshot = Array.isArray(row.recipientSnapshot) ? row.recipientSnapshot.filter((item): item is SnapshotRecipient => !!item && typeof item === "object" && !Array.isArray(item) && (((item as Record<string, unknown>).type === "guardian") || ((item as Record<string, unknown>).type === "staff")) && typeof (item as Record<string, unknown>).id === "string" && typeof (item as Record<string, unknown>).phone === "string") : [];
  await tx.$executeRaw`UPDATE "EmergencyBroadcast" SET "status"='CONFIRMED', "confirmedAt"=NOW(), "updatedAt"=NOW() WHERE "id"=${row.id} AND "schoolId"=${input.schoolId} AND "status"='PREVIEWED'`;

  let queued = 0;
  for (const recipient of snapshot) {
    const results = await enqueueNotification(tx, {
      schoolId: input.schoolId,
      recipientType: recipient.type,
      recipientId: recipient.id,
      recipientPhone: recipient.phone,
      body: row.message,
      templateKey: "emergency_broadcast",
      templateVariables: { "1": row.message.slice(0, 180) },
      idempotencyKey: `${input.schoolId}:EMERGENCY_BROADCAST:${row.id}:${recipient.id}:v1`
    });
    queued += results.length;
  }

  await tx.$executeRaw`
    UPDATE "EmergencyBroadcast"
    SET "status" = CASE WHEN ${queued} = 0 THEN 'COMPLETED' ELSE 'QUEUED' END,
        "queuedAt" = CASE WHEN ${queued} = 0 THEN "queuedAt" ELSE COALESCE("queuedAt", NOW()) END,
        "completedAt" = CASE WHEN ${queued} = 0 THEN NOW() ELSE "completedAt" END,
        "updatedAt" = NOW()
    WHERE "id" = ${row.id} AND "schoolId" = ${input.schoolId} AND "status" IN ('CONFIRMED','QUEUED','SENDING','PARTIALLY_SENT')
  `;
  return { confirmed: true, broadcastId: row.id, recipientCount: snapshot.length, queued, deliveryCount: row.recipientCount };
}
