import { randomUUID } from "node:crypto";
import type { PlatformSession } from "./auth";
import { appendPlatformAudit } from "./audit";
import { db, withTenant } from "./db";
import { AppError } from "./errors";
import { enqueueNotification } from "./message-outbox";
import { adjustMessagingBalance } from "./platform-control-plane-safe-service";
import { adjustMessagingInventory, getMessagingInventory } from "./platform-messaging-inventory-service";
import { requirePlatformPermission } from "./platform-permissions";
import { estimateSmsSegments } from "./sms-segments";
import { getActiveSmsProviderKey, getArkeselBalanceDetails, isActiveSmsProviderConfigured, sendSmsThroughActiveProvider, type SmsSendResult } from "./sms-provider";

export type SmsAudience = "guardians" | "teachers" | "staff" | "all";
export type DirectSmsSender = (input: { phone: string; body: string }) => Promise<SmsSendResult | void>;

type Recipient = { id: string; name: string; phone: string; recipientType: "guardian" | "staff" };
const TEACHER_ROLE_KEYS = new Set(["teacher", "class_teacher", "subject_teacher", "academic_coordinator", "department_head"]);
const NON_STAFF_ROLE_KEYS = new Set(["student", "guardian", "parent"]);
const DIRECT_RECIPIENT_LIMIT = 100;
const SCHOOL_RECIPIENT_LIMIT = 1500;

async function requireSmsAdmin(session: PlatformSession) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can use the SMS Control Center.", 403, "FORBIDDEN");
}

export function normalizeSmsPhone(value: string) {
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (!phone) return null;
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^0\d{9}$/.test(phone)) phone = `+233${phone.slice(1)}`;
  else if (/^233\d{9}$/.test(phone)) phone = `+${phone}`;
  else if (/^\d{8,15}$/.test(phone)) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

export function normalizeSmsPhoneList(value: string | string[]) {
  const raw = Array.isArray(value) ? value : value.split(/[\n,;]+/);
  const normalized = raw.map(normalizeSmsPhone).filter((phone): phone is string => Boolean(phone));
  return [...new Set(normalized)];
}

export function schoolSmsBody(schoolName: string, body: string) {
  const name = schoolName.trim();
  if (!name || body.trimStart().toLocaleLowerCase().startsWith(name.toLocaleLowerCase())) return body;
  return `${name}: ${body}`;
}

export function calculateSmsCredits(body: string, recipients: number) {
  const estimate = estimateSmsSegments(body);
  return { ...estimate, recipients, totalCredits: estimate.segments * recipients };
}

export async function dispatchSmsBatch(numbers: string[], body: string, sender: DirectSmsSender = sendSmsThroughActiveProvider) {
  const results: Array<{ phone: string; ok: boolean; providerKey?: string; providerMessageId?: string; creditsUsed?: number; error?: string }> = [];
  for (const phone of numbers) {
    try {
      const delivery = await sender({ phone, body });
      results.push({ phone, ok: true, providerKey: delivery?.providerKey, providerMessageId: delivery?.providerMessageId, creditsUsed: delivery?.creditsUsed });
    } catch (error) {
      results.push({ phone, ok: false, error: error instanceof Error ? error.message.slice(0, 240) : "SMS delivery failed." });
    }
  }
  return results;
}

async function listSchoolRecipients(schoolId: string, audience: SmsAudience) {
  return withTenant(schoolId, async (tx) => {
    const recipients: Recipient[] = [];
    if (audience === "guardians" || audience === "all") {
      const guardians = await tx.guardian.findMany({ where: { schoolId, phone: { not: null } }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: SCHOOL_RECIPIENT_LIMIT + 1 });
      for (const guardian of guardians) {
        const phone = guardian.phone ? normalizeSmsPhone(guardian.phone) : null;
        if (phone) recipients.push({ id: guardian.id, name: guardian.name, phone, recipientType: "guardian" });
      }
    }
    if (audience !== "guardians") {
      const users = await tx.user.findMany({
        where: { schoolId, status: "active", phone: { not: null } },
        select: { id: true, name: true, phone: true, userRoles: { select: { role: { select: { key: true, name: true } } } } },
        orderBy: { name: "asc" },
        take: SCHOOL_RECIPIENT_LIMIT + 1,
      });
      for (const user of users) {
        const keys = user.userRoles.map((entry) => (entry.role.key || entry.role.name).toLowerCase().replace(/\s+/g, "_"));
        const isTeacher = keys.some((key) => TEACHER_ROLE_KEYS.has(key));
        const isStaff = keys.some((key) => !TEACHER_ROLE_KEYS.has(key) && !NON_STAFF_ROLE_KEYS.has(key));
        if (audience === "teachers" && !isTeacher) continue;
        if (audience === "staff" && !isStaff) continue;
        const phone = user.phone ? normalizeSmsPhone(user.phone) : null;
        if (phone) recipients.push({ id: user.id, name: user.name, phone, recipientType: "staff" });
      }
    }
    const deduped = [...new Map(recipients.map((recipient) => [recipient.phone, recipient])).values()];
    if (deduped.length > SCHOOL_RECIPIENT_LIMIT) throw new AppError(`This audience contains more than ${SCHOOL_RECIPIENT_LIMIT} SMS recipients. Narrow the audience before sending.`, 413, "AUDIENCE_TOO_LARGE");
    return deduped;
  });
}

async function schoolWalletBalance(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ smsBalance: number }>>(`SELECT "smsBalance" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1 LIMIT 1`, schoolId);
    return rows[0]?.smsBalance ?? 0;
  });
}

async function totalAllocatedSchoolSms() {
  const directories = await db.schoolLoginDirectory.findMany({ select: { schoolId: true } });
  let total = 0;
  for (const directory of directories) total += await schoolWalletBalance(directory.schoolId);
  return total;
}

async function raiseSmsInventoryFloor(session: PlatformSession, targetBalance: number) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ balance: number }>>(`SELECT "balance" FROM "PlatformMessagingInventory" WHERE "channel"='sms' FOR UPDATE`);
    const current = rows[0]?.balance ?? 0;
    if (targetBalance <= current) return current;
    const quantity = targetBalance - current;
    await tx.$executeRawUnsafe(`UPDATE "PlatformMessagingInventory" SET "balance"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "channel"='sms'`, targetBalance);
    const reference = `arkesel-auto-reconcile:${new Date().toISOString()}`;
    await tx.$executeRawUnsafe(
      `INSERT INTO "PlatformMessagingInventoryLedger" ("id","channel","entryType","quantity","balanceAfter","unitCost","providerKey","reference","notes","actorId") VALUES ($1,'sms','adjustment',$2,$3,NULL,'arkesel',$4,$5,$6)`,
      randomUUID(), quantity, targetBalance, reference, "Auto-reconciled unallocated SMS to live Arkesel balance minus school wallet commitments.", session.adminId,
    );
    await appendPlatformAudit({
      actorId: session.adminId,
      action: "messaging.inventory.adjusted",
      targetEntity: "MessagingInventory:sms",
      meta: { channel: "sms", providerKey: "arkesel", quantity, balanceBefore: current, balanceAfter: targetBalance, reference, source: "automatic_provider_reconciliation" },
    }, tx);
    return targetBalance;
  });
}

async function getProviderBackedInventory(session: PlatformSession) {
  const inventory = await getMessagingInventory(session);
  let currentBalance = inventory.inventory.find((row) => row.channel === "sms")?.balance ?? 0;
  const activeProvider = await getActiveSmsProviderKey();
  if (activeProvider !== "arkesel") return { balance: currentBalance, source: "platform" as const };

  const provider = await getArkeselBalanceDetails();
  if (!provider.available || provider.balance === undefined) return { balance: currentBalance, source: "platform" as const };

  const allocated = await totalAllocatedSchoolSms();
  const providerFree = Math.max(0, Math.floor(provider.balance) - allocated);
  if (providerFree > currentBalance) currentBalance = await raiseSmsInventoryFloor(session, providerFree);
  return { balance: Math.min(currentBalance, providerFree), source: "arkesel" as const, providerBalance: provider.balance, allocated };
}

export async function topUpSchoolSms(session: PlatformSession, input: { schoolId: string; quantity: number; reference?: string; notes?: string }) {
  await requireSmsAdmin(session);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new AppError("Enter a positive whole number of SMS credits to assign.", 400, "INVALID_QUANTITY");
  const backed = await getProviderBackedInventory(session);
  if (backed.balance < input.quantity) throw new AppError(`Only ${backed.balance} unallocated SMS credits are currently available.`, 409, "INSUFFICIENT_INVENTORY");
  const result = await adjustMessagingBalance(session, { schoolId: input.schoolId, channel: "sms", quantity: input.quantity, reference: input.reference || `sms-center:${randomUUID()}`, notes: input.notes || "SMS Control Center top-up" });
  await appendPlatformAudit({ actorId: session.adminId, action: "platform.sms.school_topped_up", targetSchoolId: input.schoolId, targetEntity: "PlatformMessagingWallet:sms", meta: { quantity: input.quantity, balanceAfter: result.wallet.smsBalance, reference: input.reference ?? null } });
  return result;
}

export async function previewSchoolSms(session: PlatformSession, input: { schoolId: string; audience: SmsAudience; body: string }) {
  await requireSmsAdmin(session);
  const school = await withTenant(input.schoolId, (tx) => tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, name: true, uniqueCode: true } }));
  if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
  const [recipients, balance] = await Promise.all([listSchoolRecipients(input.schoolId, input.audience), schoolWalletBalance(input.schoolId)]);
  const billedBody = schoolSmsBody(school.name, input.body.trim());
  const estimate = calculateSmsCredits(billedBody, recipients.length);
  return { school, audience: input.audience, recipientCount: recipients.length, balance, billedBody, ...estimate, enoughCredits: balance >= estimate.totalCredits, balanceAfter: balance - estimate.totalCredits };
}

export async function sendSchoolSms(session: PlatformSession, input: { schoolId: string; audience: SmsAudience; body: string }) {
  await requireSmsAdmin(session);
  if (!(await isActiveSmsProviderConfigured())) throw new AppError("The active SMS provider is not configured.", 503, "SMS_PROVIDER_UNAVAILABLE");
  const preview = await previewSchoolSms(session, input);
  if (preview.recipientCount === 0) throw new AppError("No valid phone numbers were found for this audience.", 400, "NO_RECIPIENTS");
  if (!preview.enoughCredits) throw new AppError(`This school needs ${preview.totalCredits} SMS credits but only has ${preview.balance}.`, 409, "INSUFFICIENT_CREDITS");
  const recipients = await listSchoolRecipients(input.schoolId, input.audience);
  const batchId = randomUUID();
  await withTenant(input.schoolId, async (tx) => {
    for (const recipient of recipients) {
      await enqueueNotification(tx, { schoolId: input.schoolId, recipientType: recipient.recipientType, recipientId: recipient.id, recipientPhone: recipient.phone, body: input.body.trim(), channels: "sms", idempotencyKey: `platform-sms:${batchId}` });
    }
  });
  await appendPlatformAudit({ actorId: session.adminId, action: "platform.sms.school_queued", targetSchoolId: input.schoolId, targetEntity: `SmsBatch:${batchId}`, meta: { batchId, audience: input.audience, recipientCount: recipients.length, segmentsPerRecipient: preview.segments, totalCredits: preview.totalCredits, messageBody: input.body.trim(), bodyPreview: input.body.trim().slice(0, 160) } });
  return { ok: true, batchId, queued: recipients.length, ...preview };
}

export async function previewDirectSms(session: PlatformSession, input: { numbers: string | string[]; body: string }) {
  await requireSmsAdmin(session);
  const numbers = normalizeSmsPhoneList(input.numbers);
  if (numbers.length > DIRECT_RECIPIENT_LIMIT) throw new AppError(`Direct sends are limited to ${DIRECT_RECIPIENT_LIMIT} unique phone numbers per batch.`, 413, "TOO_MANY_RECIPIENTS");
  const backed = await getProviderBackedInventory(session);
  const estimate = calculateSmsCredits(input.body.trim(), numbers.length);
  return { numbers, recipientCount: numbers.length, balance: backed.balance, balanceSource: backed.source, ...estimate, enoughCredits: backed.balance >= estimate.totalCredits, balanceAfter: backed.balance - estimate.totalCredits };
}

export async function sendDirectSms(session: PlatformSession, input: { numbers: string | string[]; body: string }, sender: DirectSmsSender = sendSmsThroughActiveProvider) {
  await requireSmsAdmin(session);
  if (!(await isActiveSmsProviderConfigured())) throw new AppError("The active SMS provider is not configured.", 503, "SMS_PROVIDER_UNAVAILABLE");
  const preview = await previewDirectSms(session, input);
  if (preview.recipientCount === 0) throw new AppError("Enter at least one valid phone number.", 400, "NO_RECIPIENTS");
  if (!preview.enoughCredits) throw new AppError(`SukuuNova needs ${preview.totalCredits} SMS credits but only ${preview.balance} are currently unallocated.`, 409, "INSUFFICIENT_INVENTORY");
  const batchId = randomUUID();
  await adjustMessagingInventory(session, { channel: "sms", quantity: -preview.totalCredits, reference: `direct-sms:${batchId}`, notes: `Reserved for ${preview.recipientCount} direct SMS recipient(s).` });
  const messageBody = input.body.trim();
  const results = await dispatchSmsBatch(preview.numbers, messageBody, sender);
  const failed = results.filter((result) => !result.ok);
  const refundedCredits = failed.length * preview.segments;
  if (refundedCredits > 0) await adjustMessagingInventory(session, { channel: "sms", quantity: refundedCredits, reference: `direct-sms-refund:${batchId}`, notes: `Refund for ${failed.length} failed direct SMS recipient(s).` });
  const sent = results.length - failed.length;
  await appendPlatformAudit({
    actorId: session.adminId,
    action: "platform.sms.direct_sent",
    targetEntity: `SmsBatch:${batchId}`,
    meta: {
      batchId,
      recipientCount: results.length,
      sent,
      failed: failed.length,
      segmentsPerRecipient: preview.segments,
      reservedCredits: preview.totalCredits,
      refundedCredits,
      messageBody,
      bodyPreview: messageBody.slice(0, 160),
      recipients: results.map((result) => ({
        phone: result.phone,
        ok: result.ok,
        status: result.ok ? "sent" : "failed",
        providerKey: result.providerKey,
        providerMessageId: result.providerMessageId,
        creditsUsed: result.creditsUsed,
        error: result.error,
      })),
    },
  });
  return { ok: failed.length === 0, batchId, sent, failed: failed.length, refundedCredits, results };
}
