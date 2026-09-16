import { randomUUID } from "node:crypto";
import { db, withTenant } from "./db";

export type SmsProviderDeliveryStatus =
  | "QUEUED"
  | "SUBMITTED"
  | "DELIVERED"
  | "NOT_DELIVERED"
  | "PROHIBITED"
  | "EXPIRED";

export type SmsDeliveryGroup = "delivered" | "in_transit" | "failed";

const PROVIDER_STATUSES = new Set<SmsProviderDeliveryStatus>([
  "QUEUED",
  "SUBMITTED",
  "DELIVERED",
  "NOT_DELIVERED",
  "PROHIBITED",
  "EXPIRED",
]);

export function normalizeSmsProviderDeliveryStatus(value: string | null | undefined): SmsProviderDeliveryStatus | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_") as SmsProviderDeliveryStatus;
  return PROVIDER_STATUSES.has(normalized) ? normalized : null;
}

export function describeSmsDeliveryStatus(value: string | null | undefined): {
  status: string;
  label: string;
  group: SmsDeliveryGroup;
  explanation: string;
} {
  const status = (value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (status === "DELIVERED") return { status: "delivered", label: "Delivered", group: "delivered", explanation: "The mobile network confirmed delivery to the recipient handset." };
  if (status === "QUEUED") return { status: "queued", label: "Queued by provider", group: "in_transit", explanation: "The provider has queued the SMS and delivery is still pending." };
  if (status === "SUBMITTED" || status === "SENT" || status === "ACCEPTED") return { status: "submitted", label: "Submitted / accepted", group: "in_transit", explanation: "The provider accepted the SMS, but handset delivery has not yet been confirmed." };
  if (status === "PROHIBITED") return { status: "rejected", label: "Rejected / prohibited", group: "failed", explanation: "The provider or mobile network rejected the SMS." };
  if (status === "EXPIRED") return { status: "expired", label: "Expired", group: "failed", explanation: "The delivery window expired before the SMS reached the handset." };
  if (status === "NOT_DELIVERED") return { status: "failed", label: "Not delivered", group: "failed", explanation: "The mobile network reported that the SMS could not be delivered." };
  if (status === "SEND_FAILED" || status === "FAILED") return { status: "failed", label: "Send failed", group: "failed", explanation: "SukuuNova could not successfully submit the SMS to the provider." };
  if (status === "SENDING") return { status: "submitting", label: "Submitting", group: "in_transit", explanation: "SukuuNova is currently submitting the SMS to the provider." };
  return { status: "queued", label: "Queued", group: "in_transit", explanation: "The SMS is waiting to be processed." };
}

// Provider callbacks can be duplicated or arrive out of order. A confirmed
// delivery is final, and a terminal failure must not be downgraded to a later
// QUEUED/SUBMITTED callback. A later DELIVERED receipt is allowed to correct a
// previous terminal failure.
function receiptUpdateSql() {
  return `
    "status"=CASE
      WHEN upper("status")='DELIVERED' THEN "status"
      WHEN upper("status") IN ('NOT_DELIVERED','PROHIBITED','EXPIRED') AND $2 IN ('QUEUED','SUBMITTED') THEN "status"
      ELSE $2
    END,
    "updatedAt"=CURRENT_TIMESTAMP,
    "deliveredAt"=CASE WHEN $2='DELIVERED' THEN COALESCE("deliveredAt",CURRENT_TIMESTAMP) ELSE "deliveredAt" END,
    "failedAt"=CASE
      WHEN upper("status")<>'DELIVERED' AND $2 IN ('NOT_DELIVERED','PROHIBITED','EXPIRED') THEN COALESCE("failedAt",CURRENT_TIMESTAMP)
      ELSE "failedAt"
    END,
    "acceptedAt"=CASE WHEN $2 IN ('QUEUED','SUBMITTED','DELIVERED','NOT_DELIVERED','PROHIBITED','EXPIRED') THEN COALESCE("acceptedAt",CURRENT_TIMESTAMP) ELSE "acceptedAt" END`;
}

export async function applyArkeselSmsDeliveryReceipt(input: { smsId: string; status: string }) {
  const smsId = input.smsId.trim();
  const status = normalizeSmsProviderDeliveryStatus(input.status);
  if (!smsId || !status) return { matched: false, invalid: true };

  const platformUpdated = await db.$executeRawUnsafe(
    `UPDATE "PlatformSmsDelivery" SET ${receiptUpdateSql()} WHERE "providerKey"='arkesel' AND "providerMessageId"=$1`,
    smsId,
    status,
  );
  if (platformUpdated > 0) return { matched: true, scope: "platform" as const, status };

  // Delivery can settle after a school is suspended or otherwise inactive, so
  // search every known tenant directory rather than active schools only.
  const directories = await db.schoolLoginDirectory.findMany({ select: { schoolId: true } });
  for (const directory of directories) {
    const updated = await withTenant(directory.schoolId, (tx) => tx.$executeRawUnsafe(
      `UPDATE "SmsProviderDelivery" SET ${receiptUpdateSql()} WHERE "providerKey"='arkesel' AND "providerMessageId"=$1`,
      smsId,
      status,
    ));
    if (updated > 0) return { matched: true, scope: "school" as const, schoolId: directory.schoolId, status };
  }

  return { matched: false, invalid: false, status };
}

export async function recordPlatformDirectSmsDeliveries(input: {
  batchId: string;
  actorId: string;
  body: string;
  estimatedCreditsPerRecipient: number;
  providerKey: string;
  results: Array<{
    phone: string;
    ok: boolean;
    providerKey?: string;
    providerMessageId?: string;
    creditsUsed?: number;
    error?: string;
  }>;
}) {
  for (const result of input.results) {
    const status = result.ok ? "SUBMITTED" : "SEND_FAILED";
    await db.$executeRawUnsafe(
      `INSERT INTO "PlatformSmsDelivery" (
        "id","batchId","actorId","recipientPhone","messageBody","providerKey","providerMessageId",
        "estimatedCredits","providerCreditsUsed","status","lastError","acceptedAt","failedAt","createdAt","updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        CASE WHEN $10='SUBMITTED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN $10='SEND_FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      )`,
      randomUUID(),
      input.batchId,
      input.actorId,
      result.phone,
      input.body,
      result.providerKey || input.providerKey,
      result.providerMessageId ?? null,
      input.estimatedCreditsPerRecipient,
      result.creditsUsed ?? null,
      status,
      result.error ?? null,
    );
  }
}
