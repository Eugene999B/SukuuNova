import { createId } from "@paralleldrive/cuid2";
import { db, withTenant } from "./db";
import { AppError } from "./errors";
import { appendPlatformAudit } from "./audit";
import { getPlatformSchoolScope, requirePlatformPermission } from "./platform-permissions";
import type { PlatformSession } from "./auth";

const CONFIG_KEYS = ["platform.defaults", "platform.security", "platform.lifecycle", "platform.messaging"] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

type JsonRecord = Record<string, unknown>;

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function assertInScope(session: PlatformSession, schoolId: string) {
  return getPlatformSchoolScope(session).then((scope) => {
    if (scope !== null && !scope.includes(schoolId)) throw new AppError("School is outside your assigned platform scope.", 403, "FORBIDDEN");
  });
}

export async function getPlatformControlSettings(session: PlatformSession) {
  await requirePlatformPermission(session, "settings.manage");
  const rows = await db.$queryRawUnsafe<Array<{ key: string; value: JsonRecord }>>(
    `SELECT "key","value" FROM "PlatformConfiguration" WHERE "key" = ANY($1::text[]) ORDER BY "key"`, CONFIG_KEYS,
  );
  const result: Record<string, JsonRecord> = {};
  for (const key of CONFIG_KEYS) result[key] = rows.find((row) => row.key === key)?.value ?? {};
  return result;
}

export async function updatePlatformControlSettings(session: PlatformSession, key: ConfigKey, value: JsonRecord) {
  await requirePlatformPermission(session, "settings.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can change platform-wide control settings.", 403, "FORBIDDEN");
  await db.$executeRawUnsafe(
    `INSERT INTO "PlatformConfiguration" ("key","value","updatedAt") VALUES ($1,$2::jsonb,CURRENT_TIMESTAMP)
     ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=CURRENT_TIMESTAMP`, key, JSON.stringify(value),
  );
  await appendPlatformAudit({ actorId: session.adminId, action: "platform.configuration.updated", targetEntity: `PlatformConfiguration:${key}`, meta: { key, value } });
  return { key, value };
}

export async function getSchoolBillingConfig(session: PlatformSession, schoolId: string) {
  await requirePlatformPermission(session, "billing.view");
  await assertInScope(session, schoolId);
  return withTenant(schoolId, async (tx) => {
    const [school, config] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true, subscriptionPlan: { select: { id: true, name: true, price: true } } } }),
      tx.$queryRawUnsafe<Array<{ schoolId: string; billingMode: string; currency: string; studentRate: string; flatRate: string; billingDay: number; graceDays: number; trialDays: number; minimumCharge: string; maximumCharge: string | null; active: boolean; updatedAt: Date }>>(
        `SELECT "schoolId","billingMode","currency","studentRate"::text,"flatRate"::text,"billingDay","graceDays","trialDays","minimumCharge"::text,"maximumCharge"::text,"active","updatedAt"
         FROM "PlatformSchoolBillingConfig" WHERE "schoolId"=$1`, schoolId,
      ),
      
    ]);
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const row = config[0] ?? null;
    const students = await tx.student.count({ where: { status: "active" } });
    const billing = row ?? { billingMode: "flat", currency: "GHS", studentRate: "0", flatRate: String(school.subscriptionPlan?.price ?? 0), billingDay: 1, graceDays: 0, trialDays: 0, minimumCharge: "0", maximumCharge: null, active: true, updatedAt: new Date() };
    const rawTotal = billing.billingMode === "per_student" ? students * asNumber(billing.studentRate) : asNumber(billing.flatRate);
    const minimum = asNumber(billing.minimumCharge);
    const maximum = billing.maximumCharge == null ? null : asNumber(billing.maximumCharge);
    const calculatedTotal = Math.min(maximum == null ? Number.POSITIVE_INFINITY : maximum, Math.max(minimum, rawTotal));
    return { school, billing: { ...billing, studentRate: asNumber(billing.studentRate), flatRate: asNumber(billing.flatRate), minimumCharge: minimum, maximumCharge: maximum }, activeStudents: students, calculatedTotal };
  });
}

export async function saveSchoolBillingConfig(session: PlatformSession, input: {
  schoolId: string; billingMode: "flat" | "per_student"; currency: string; studentRate: number; flatRate: number; billingDay: number; graceDays: number; trialDays: number; minimumCharge: number; maximumCharge: number | null; active: boolean;
}) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin" && !session) throw new AppError("Platform session required.", 401, "UNAUTHORIZED");
  await assertInScope(session, input.schoolId);
  if (input.studentRate < 0 || input.flatRate < 0 || input.minimumCharge < 0) throw new AppError("Billing rates cannot be negative.", 400, "INVALID_BILLING_RATE");
  if (input.maximumCharge !== null && input.maximumCharge < input.minimumCharge) throw new AppError("Maximum charge cannot be below minimum charge.", 400, "INVALID_BILLING_CAP");
  await withTenant(input.schoolId, async (tx) => {
    const exists = await tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true } });
    if (!exists) throw new AppError("School not found.", 404, "NOT_FOUND");
    await tx.$executeRawUnsafe(
      `INSERT INTO "PlatformSchoolBillingConfig" ("schoolId","billingMode","currency","studentRate","flatRate","billingDay","graceDays","trialDays","minimumCharge","maximumCharge","active","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP)
       ON CONFLICT ("schoolId") DO UPDATE SET "billingMode"=EXCLUDED."billingMode","currency"=EXCLUDED."currency","studentRate"=EXCLUDED."studentRate","flatRate"=EXCLUDED."flatRate","billingDay"=EXCLUDED."billingDay","graceDays"=EXCLUDED."graceDays","trialDays"=EXCLUDED."trialDays","minimumCharge"=EXCLUDED."minimumCharge","maximumCharge"=EXCLUDED."maximumCharge","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP`,
      input.schoolId, input.billingMode, input.currency.toUpperCase().slice(0, 8), input.studentRate, input.flatRate, input.billingDay, input.graceDays, input.trialDays, input.minimumCharge, input.maximumCharge,
      input.active,
    );
  });
  await appendPlatformAudit({ actorId: session.adminId, action: "school.billing_configuration.updated", targetSchoolId: input.schoolId, targetEntity: "PlatformSchoolBillingConfig", meta: input });
  return getSchoolBillingConfig(session, input.schoolId);
}

export async function getMessagingWallet(session: PlatformSession, schoolId: string) {
  await requirePlatformPermission(session, "billing.view");
  await assertInScope(session, schoolId);
  return withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const wallet = await tx.$queryRawUnsafe<Array<{ schoolId: string; smsBalance: number; whatsappBalance: number; smsSellRate: string; whatsappSellRate: string; smsCostRate: string; whatsappCostRate: string; lowBalanceThreshold: number; status: string; updatedAt: Date }>>(
      `SELECT "schoolId","smsBalance","whatsappBalance","smsSellRate"::text,"whatsappSellRate"::text,"smsCostRate"::text,"whatsappCostRate"::text,"lowBalanceThreshold","status","updatedAt" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1`, schoolId,
    );
    const ledger = await tx.$queryRawUnsafe<Array<{ id: string; channel: string; entryType: string; quantity: number; balanceAfter: number; unitCost: string | null; unitPrice: string | null; reference: string | null; notes: string | null; actorId: string; createdAt: Date }>>(
      `SELECT "id","channel","entryType","quantity","balanceAfter","unitCost"::text,"unitPrice"::text,"reference","notes","actorId","createdAt" FROM "PlatformMessagingLedger" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC LIMIT 25`, schoolId,
    );
    return { school, wallet: wallet[0] ?? { schoolId, smsBalance: 0, whatsappBalance: 0, smsSellRate: "0", whatsappSellRate: "0", smsCostRate: "0", whatsappCostRate: "0", lowBalanceThreshold: 50, status: "active", updatedAt: new Date() }, ledger };
  });
}

export async function adjustMessagingBalance(session: PlatformSession, input: {
  schoolId: string; channel: "sms" | "whatsapp"; quantity: number; unitCost?: number; unitPrice?: number; reference?: string; notes?: string;
}) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can allocate communication credits.", 403, "FORBIDDEN");
  await assertInScope(session, input.schoolId);
  if (!Number.isInteger(input.quantity) || input.quantity === 0) throw new AppError("Credit quantity must be a non-zero whole number.", 400, "INVALID_QUANTITY");
  const result = await withTenant(input.schoolId, async (tx) => {
    const existing = await tx.$queryRawUnsafe<Array<{ smsBalance: number; whatsappBalance: number }>>(`SELECT "smsBalance","whatsappBalance" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1 FOR UPDATE`, input.schoolId);
    const current = existing[0] ?? { smsBalance: 0, whatsappBalance: 0 };
    const before = input.channel === "sms" ? current.smsBalance : current.whatsappBalance;
    const after = before + input.quantity;
    if (after < 0) throw new AppError("The school does not have enough communication credits for this adjustment.", 409, "INSUFFICIENT_CREDITS");
    await tx.$executeRawUnsafe(
      `INSERT INTO "PlatformMessagingWallet" ("schoolId","smsBalance","whatsappBalance","status","updatedAt") VALUES ($1,$2,$3,'active',CURRENT_TIMESTAMP)
       ON CONFLICT ("schoolId") DO UPDATE SET "smsBalance"=$2,"whatsappBalance"=$3,"updatedAt"=CURRENT_TIMESTAMP`,
      input.schoolId, input.channel === "sms" ? after : current.smsBalance, input.channel === "whatsapp" ? after : current.whatsappBalance,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "PlatformMessagingLedger" ("id","schoolId","channel","entryType","quantity","balanceAfter","unitCost","unitPrice","reference","notes","actorId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      createId(), input.schoolId, input.channel, input.quantity > 0 ? "allocation" : "adjustment", input.quantity, after, input.unitCost ?? null, input.unitPrice ?? null, input.reference ?? null, input.notes ?? null, session.adminId,
    );
    return { before, after };
  });
  await appendPlatformAudit({ actorId: session.adminId, action: input.quantity > 0 ? "messaging.credits.allocated" : "messaging.credits.adjusted", targetSchoolId: input.schoolId, targetEntity: `MessagingWallet:${input.channel}`, meta: { ...input, ...result } });
  return getMessagingWallet(session, input.schoolId);
}

export async function updateMessagingRates(session: PlatformSession, input: { schoolId: string; channel: "sms" | "whatsapp"; sellRate: number; costRate: number; lowBalanceThreshold: number }) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can change communication pricing.", 403, "FORBIDDEN");
  await assertInScope(session, input.schoolId);
  if (input.sellRate < 0 || input.costRate < 0 || input.lowBalanceThreshold < 0) throw new AppError("Messaging rates and thresholds cannot be negative.", 400, "INVALID_MESSAGING_RATE");
  await withTenant(input.schoolId, async (tx) => {
    const current = await tx.$queryRawUnsafe<Array<{ smsBalance: number; whatsappBalance: number; smsSellRate: string; whatsappSellRate: string; smsCostRate: string; whatsappCostRate: string; lowBalanceThreshold: number }>>(`SELECT * FROM "PlatformMessagingWallet" WHERE "schoolId"=$1 FOR UPDATE`, input.schoolId);
    const base = current[0] ?? { smsBalance: 0, whatsappBalance: 0, smsSellRate: "0", whatsappSellRate: "0", smsCostRate: "0", whatsappCostRate: "0", lowBalanceThreshold: 50 };
    const values = input.channel === "sms"
      ? [base.smsBalance, base.whatsappBalance, input.sellRate, Number(base.whatsappSellRate), input.costRate, Number(base.whatsappCostRate)]
      : [base.smsBalance, base.whatsappBalance, Number(base.smsSellRate), input.sellRate, Number(base.smsCostRate), input.costRate];
    await tx.$executeRawUnsafe(
      `INSERT INTO "PlatformMessagingWallet" ("schoolId","smsBalance","whatsappBalance","smsSellRate","whatsappSellRate","smsCostRate","whatsappCostRate","lowBalanceThreshold","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',CURRENT_TIMESTAMP)
       ON CONFLICT ("schoolId") DO UPDATE SET "smsBalance"=$2,"whatsappBalance"=$3,"smsSellRate"=$4,"whatsappSellRate"=$5,"smsCostRate"=$6,"whatsappCostRate"=$7,"lowBalanceThreshold"=$8,"updatedAt"=CURRENT_TIMESTAMP`, input.schoolId, ...values, input.lowBalanceThreshold,
    );
  });
  await appendPlatformAudit({ actorId: session.adminId, action: "messaging.pricing.updated", targetSchoolId: input.schoolId, targetEntity: `MessagingWallet:${input.channel}`, meta: input });
  return getMessagingWallet(session, input.schoolId);
}

export async function changeSchoolLifecycle(session: PlatformSession, input: { schoolId: string; action: "lock" | "suspend" | "reactivate" | "archive" | "delete" }) {
  await requirePlatformPermission(session, "schools.suspend");
  if (input.action === "delete" && session.role !== "super_admin") throw new AppError("Only Super Admin can decommission a school.", 403, "FORBIDDEN");
  await assertInScope(session, input.schoolId);
  const targetStatus = input.action === "lock" ? "locked" : input.action === "suspend" ? "suspended" : input.action === "reactivate" ? "active" : input.action === "archive" ? "archived" : "deleted";
  const result = await withTenant(input.schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, name: true, status: true } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    await tx.school.update({ where: { id: input.schoolId }, data: { status: targetStatus } });
    await tx.schoolLoginDirectory.update({ where: { schoolId: input.schoolId }, data: { status: targetStatus } });
    return { ...school, status: targetStatus };
  });
  await appendPlatformAudit({ actorId: session.adminId, action: `school.lifecycle.${input.action}`, targetSchoolId: input.schoolId, targetEntity: "School", meta: { beforeStatus: result.status === targetStatus ? undefined : result.status, afterStatus: targetStatus } });
  return result;
}
