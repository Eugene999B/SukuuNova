import { randomUUID } from "node:crypto";
import type { PlatformSession } from "./auth";
import { appendPlatformAudit } from "./audit";
import { AppError } from "./errors";
import {
  calculateSmsCredits,
  dispatchSmsBatch,
  normalizeSmsPhoneList,
  type DirectSmsSender,
} from "./platform-sms-center-service";
import { requirePlatformPermission } from "./platform-permissions";
import { recordPlatformDirectSmsDeliveries } from "./sms-delivery-receipts";
import {
  getActiveSmsProviderKey,
  getArkeselBalanceDetails,
  isActiveSmsProviderConfigured,
  sendSmsThroughActiveProvider,
} from "./sms-provider";

const DIRECT_RECIPIENT_LIMIT = 100;

async function requireDirectSmsAdmin(session: PlatformSession) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") {
    throw new AppError("Only Super Admin can use direct platform SMS.", 403, "FORBIDDEN");
  }
}

export function calculateProviderDirectAvailability(
  providerBalance: number | null,
  body: string,
  recipients: number,
) {
  const estimate = calculateSmsCredits(body, recipients);
  const balanceKnown = providerBalance !== null;
  return {
    ...estimate,
    balance: providerBalance ?? 0,
    balanceKnown,
    enoughCredits: !balanceKnown || (providerBalance ?? 0) >= estimate.totalCredits,
    balanceAfter: balanceKnown ? (providerBalance ?? 0) - estimate.totalCredits : 0,
  };
}

async function getDirectProviderCapacity() {
  const providerKey = await getActiveSmsProviderKey();

  if (providerKey === "arkesel") {
    const provider = await getArkeselBalanceDetails();
    if (!provider.available || typeof provider.balance !== "number") {
      throw new AppError(
        provider.error || "The live Arkesel SMS balance could not be read.",
        503,
        "SMS_PROVIDER_BALANCE_UNAVAILABLE",
      );
    }
    return {
      providerKey,
      balance: Math.max(0, Math.floor(provider.balance)),
      balanceKnown: true as const,
    };
  }

  // Other providers may not expose a live balance endpoint. In that case the
  // provider itself remains the source of truth and will accept/reject sends.
  return { providerKey, balance: null, balanceKnown: false as const };
}

export async function previewPlatformDirectSms(
  session: PlatformSession,
  input: { numbers: string | string[]; body: string },
) {
  await requireDirectSmsAdmin(session);
  const numbers = normalizeSmsPhoneList(input.numbers);
  if (numbers.length > DIRECT_RECIPIENT_LIMIT) {
    throw new AppError(
      `Direct sends are limited to ${DIRECT_RECIPIENT_LIMIT} unique phone numbers per batch.`,
      413,
      "TOO_MANY_RECIPIENTS",
    );
  }

  const capacity = await getDirectProviderCapacity();
  const availability = calculateProviderDirectAvailability(
    capacity.balance,
    input.body.trim(),
    numbers.length,
  );

  return {
    numbers,
    recipientCount: numbers.length,
    providerKey: capacity.providerKey,
    balanceSource: "provider" as const,
    ...availability,
  };
}

export async function sendPlatformDirectSms(
  session: PlatformSession,
  input: { numbers: string | string[]; body: string },
  sender: DirectSmsSender = sendSmsThroughActiveProvider,
) {
  await requireDirectSmsAdmin(session);
  if (!(await isActiveSmsProviderConfigured())) {
    throw new AppError("The active SMS provider is not configured.", 503, "SMS_PROVIDER_UNAVAILABLE");
  }

  const preview = await previewPlatformDirectSms(session, input);
  if (preview.recipientCount === 0) {
    throw new AppError("Enter at least one valid phone number.", 400, "NO_RECIPIENTS");
  }
  if (preview.balanceKnown && !preview.enoughCredits) {
    throw new AppError(
      `${preview.providerKey.toUpperCase()} needs ${preview.totalCredits} SMS credits for this send but the live provider balance is ${preview.balance}.`,
      409,
      "INSUFFICIENT_PROVIDER_BALANCE",
    );
  }

  const batchId = randomUUID();
  const messageBody = input.body.trim();
  const results = await dispatchSmsBatch(preview.numbers, messageBody, sender);
  const failed = results.filter((result) => !result.ok);
  const submitted = results.length - failed.length;
  const chargedCredits = results.reduce(
    (total, result) => total + (result.ok ? result.creditsUsed ?? preview.segments : 0),
    0,
  );

  await recordPlatformDirectSmsDeliveries({
    batchId,
    actorId: session.adminId,
    body: messageBody,
    estimatedCreditsPerRecipient: preview.segments,
    providerKey: preview.providerKey,
    results,
  });

  await appendPlatformAudit({
    actorId: session.adminId,
    action: "platform.sms.direct_sent",
    targetEntity: `SmsBatch:${batchId}`,
    meta: {
      batchId,
      providerKey: preview.providerKey,
      balanceSource: "provider",
      providerBalanceBefore: preview.balanceKnown ? preview.balance : null,
      recipientCount: results.length,
      submitted,
      sent: submitted,
      failed: failed.length,
      segmentsPerRecipient: preview.segments,
      estimatedCredits: preview.totalCredits,
      chargedCredits,
      messageBody,
      bodyPreview: messageBody.slice(0, 160),
      recipients: results.map((result) => ({
        phone: result.phone,
        ok: result.ok,
        status: result.ok ? "submitted" : "send_failed",
        providerKey: result.providerKey,
        providerMessageId: result.providerMessageId,
        creditsUsed: result.creditsUsed,
        error: result.error,
      })),
    },
  });

  return {
    ok: failed.length === 0,
    batchId,
    submitted,
    sent: submitted,
    failed: failed.length,
    refundedCredits: 0,
    chargedCredits,
    results,
  };
}
