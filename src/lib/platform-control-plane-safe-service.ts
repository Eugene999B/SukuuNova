import { db, withTenant } from "./db";
import { AppError } from "./errors";
import { appendPlatformAudit } from "./audit";
import { getPlatformSchoolScope, requirePlatformPermission } from "./platform-permissions";
import type { PlatformSession } from "./auth";

type ConfigKey = "platform.defaults" | "platform.security" | "platform.lifecycle" | "platform.messaging";
type JsonRecord = Record<string, unknown>;
type Channel = "sms" | "whatsapp";

async function assertScope(session: PlatformSession, schoolId: string) {
  const scope = await getPlatformSchoolScope(session);
  if (scope !== null && !scope.includes(schoolId)) throw new AppError("School is outside your assigned platform scope.", 403, "FORBIDDEN");
}

export async function getPlatformControlSettings(session: PlatformSession) {
  await requirePlatformPermission(session, "settings.manage");
  const rows = await db.$queryRawUnsafe<Array<{ key: string; value: JsonRecord }>>(`SELECT "key","value" FROM "PlatformConfiguration" WHERE "key" = ANY($1::text[]) ORDER BY "key"`, ["platform.defaults", "platform.security", "platform.lifecycle", "platform.messaging"]);
  const result: Record<string, JsonRecord> = {};
  for (const key of ["platform.defaults", "platform.security", "platform.lifecycle", "platform.messaging"] as ConfigKey[]) result[key] = rows.find((row) => row.key === key)?.value ?? {};
  return result;
}

export async function updatePlatformControlSettings(session: PlatformSession, key: ConfigKey, value: JsonRecord) {
  await requirePlatformPermission(session, "settings.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can change platform-wide control settings.", 403, "FORBIDDEN");
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformConfiguration" ("key","value","updatedAt") VALUES ($1,$2::jsonb,CURRENT_TIMESTAMP) ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=CURRENT_TIMESTAMP`, key, JSON.stringify(value));
    await appendPlatformAudit({ actorId: session.adminId, action: "platform.configuration.updated", targetEntity: `PlatformConfiguration:${key}`, meta: { key, value } }, tx);
  });
  return { key, value };
}

export async function getSchoolBillingConfig(session: PlatformSession, schoolId: string) {
  await requirePlatformPermission(session, "billing.view");
  await assertScope(session, schoolId);
  return withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true, subscriptionPlan: { select: { id: true, name: true, price: true } } } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const rows = await tx.$queryRawUnsafe<Array<{ billingMode: string; currency: string; studentRate: string; flatRate: string; billingDay: number; graceDays: number; trialDays: number; minimumCharge: string; maximumCharge: string | null; active: boolean }>>(`SELECT "billingMode","currency","studentRate"::text,"flatRate"::text,"billingDay","graceDays","trialDays","minimumCharge"::text,"maximumCharge"::text,"active" FROM "PlatformSchoolBillingConfig" WHERE "schoolId"=$1`, schoolId);
    const row = rows[0] ?? null;
    const billing = row ?? { billingMode: "flat", currency: "GHS", studentRate: "0", flatRate: String(school.subscriptionPlan?.price ?? 0), billingDay: 1, graceDays: 0, trialDays: 0, minimumCharge: "0", maximumCharge: null, active: true };
    const activeStudents = await tx.student.count({ where: { status: "active" } });
    const base = billing.billingMode === "per_student" ? activeStudents * Number(billing.studentRate) : Number(billing.flatRate);
    const minimum = Number(billing.minimumCharge);
    const maximum = billing.maximumCharge === null ? null : Number(billing.maximumCharge);
    return { school, activeStudents, calculatedTotal: Math.min(maximum ?? Number.POSITIVE_INFINITY, Math.max(minimum, base)), billing: { ...billing, studentRate: Number(billing.studentRate), flatRate: Number(billing.flatRate), minimumCharge: minimum, maximumCharge: maximum } };
  });
}

export async function saveSchoolBillingConfig(session: PlatformSession, input: { schoolId: string; billingMode: "flat" | "per_student"; currency: string; studentRate: number; flatRate: number; billingDay: number; graceDays: number; trialDays: number; minimumCharge: number; maximumCharge: number | null; active: boolean }) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can change school commercial policy.", 403, "FORBIDDEN");
  await assertScope(session, input.schoolId);
  if (input.maximumCharge !== null && input.maximumCharge < input.minimumCharge) throw new AppError("Maximum charge cannot be below minimum charge.", 400, "INVALID_BILLING_CAP");
  await withTenant(input.schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformSchoolBillingConfig" ("schoolId","billingMode","currency","studentRate","flatRate","billingDay","graceDays","trialDays","minimumCharge","maximumCharge","active","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO UPDATE SET "billingMode"=EXCLUDED."billingMode","currency"=EXCLUDED."currency","studentRate"=EXCLUDED."studentRate","flatRate"=EXCLUDED."flatRate","billingDay"=EXCLUDED."billingDay","graceDays"=EXCLUDED."graceDays","trialDays"=EXCLUDED."trialDays","minimumCharge"=EXCLUDED."minimumCharge","maximumCharge"=EXCLUDED."maximumCharge","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP`, input.schoolId, input.billingMode, input.currency.toUpperCase().slice(0, 8), input.studentRate, input.flatRate, input.billingDay, input.graceDays, input.trialDays, input.minimumCharge, input.maximumCharge, input.active);
    await appendPlatformAudit({ actorId: session.adminId, action: "school.billing_configuration.updated", targetSchoolId: input.schoolId, targetEntity: "PlatformSchoolBillingConfig", meta: input }, tx);
  });
  return getSchoolBillingConfig(session, input.schoolId);
}

export async function getMessagingWallet(session: PlatformSession, schoolId: string) {
  await requirePlatformPermission(session, "billing.view");
  await assertScope(session, schoolId);
  return withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const wallet = await tx.$queryRawUnsafe<Array<{ schoolId: string; smsBalance: number; whatsappBalance: number; smsSellRate: string; whatsappSellRate: string; smsCostRate: string; whatsappCostRate: string; lowBalanceThreshold: number; status: string; updatedAt: Date }>>(`SELECT "schoolId","smsBalance","whatsappBalance","smsSellRate"::text,"whatsappSellRate"::text,"smsCostRate"::text,"whatsappCostRate"::text,"lowBalanceThreshold","status","updatedAt" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1`, schoolId);
    const ledger = await tx.$queryRawUnsafe<Array<{ id: string; channel: string; entryType: string; quantity: number; balanceAfter: number; unitCost: string | null; unitPrice: string | null; reference: string | null; notes: string | null; actorId: string; createdAt: Date }>>(`SELECT "id","channel","entryType","quantity","balanceAfter","unitCost"::text,"unitPrice"::text,"reference","notes","actorId","createdAt" FROM "PlatformMessagingLedger" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC LIMIT 25`, schoolId);
    return { school, wallet: wallet[0] ?? { schoolId, smsBalance: 0, whatsappBalance: 0, smsSellRate: "0", whatsappSellRate: "0", smsCostRate: "0", whatsappCostRate: "0", lowBalanceThreshold: 50, status: "active", updatedAt: new Date() }, ledger };
  });
}

export async function adjustMessagingBalance(session: PlatformSession, input: { schoolId: string; channel: Channel; quantity: number; unitCost?: number; unitPrice?: number; reference?: string; notes?: string }) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can allocate communication credits.", 403, "FORBIDDEN");
  await assertScope(session, input.schoolId);
  if (!Number.isInteger(input.quantity) || input.quantity === 0) throw new AppError("Credit quantity must be a non-zero whole number.", 400, "INVALID_QUANTITY");
  await withTenant(input.schoolId, async (tx) => {
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformMessagingWallet" ("schoolId","status","updatedAt") VALUES ($1,'active',CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO NOTHING`, input.schoolId);
    const updated = await tx.$queryRawUnsafe<Array<{ smsBalance: number; whatsappBalance: number }>>(`UPDATE "PlatformMessagingWallet" SET "smsBalance" = CASE WHEN $2='sms' THEN "smsBalance"+$3 ELSE "smsBalance" END, "whatsappBalance" = CASE WHEN $2='whatsapp' THEN "whatsappBalance"+$3 ELSE "whatsappBalance" END, "updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND (($2='sms' AND "smsBalance"+$3>=0) OR ($2='whatsapp' AND "whatsappBalance"+$3>=0)) RETURNING "smsBalance","whatsappBalance"`, input.schoolId, input.channel, input.quantity);
    if (!updated[0]) throw new AppError("The school does not have enough communication credits for this adjustment.", 409, "INSUFFICIENT_CREDITS");
    const after = input.channel === "sms" ? updated[0].smsBalance : updated[0].whatsappBalance;
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformMessagingLedger" ("id","schoolId","channel","entryType","quantity","balanceAfter","unitCost","unitPrice","reference","notes","actorId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, crypto.randomUUID(), input.schoolId, input.channel, input.quantity > 0 ? "allocation" : "adjustment", input.quantity, after, input.unitCost ?? null, input.unitPrice ?? null, input.reference ?? null, input.notes ?? null, session.adminId);
    await appendPlatformAudit({ actorId: session.adminId, action: input.quantity > 0 ? "messaging.credits.allocated" : "messaging.credits.adjusted", targetSchoolId: input.schoolId, targetEntity: `MessagingWallet:${input.channel}`, meta: { ...input, balanceAfter: after } }, tx);
  });
  return getMessagingWallet(session, input.schoolId);
}

export async function updateMessagingRates(session: PlatformSession, input: { schoolId: string; channel: Channel; sellRate: number; costRate: number; lowBalanceThreshold: number }) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can change communication pricing.", 403, "FORBIDDEN");
  await assertScope(session, input.schoolId);
  if (input.sellRate < 0 || input.costRate < 0 || input.lowBalanceThreshold < 0) throw new AppError("Messaging rates and thresholds cannot be negative.", 400, "INVALID_MESSAGING_RATE");
  await withTenant(input.schoolId, async (tx) => {
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformMessagingWallet" ("schoolId","status","updatedAt") VALUES ($1,'active',CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO NOTHING`, input.schoolId);
    const sql = input.channel === "sms"
      ? `UPDATE "PlatformMessagingWallet" SET "smsSellRate"=$2,"smsCostRate"=$3,"lowBalanceThreshold"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1`
      : `UPDATE "PlatformMessagingWallet" SET "whatsappSellRate"=$2,"whatsappCostRate"=$3,"lowBalanceThreshold"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1`;
    await tx.$executeRawUnsafe(sql, input.schoolId, input.sellRate, input.costRate, input.lowBalanceThreshold);
    await appendPlatformAudit({ actorId: session.adminId, action: "messaging.pricing.updated", targetSchoolId: input.schoolId, targetEntity: `MessagingWallet:${input.channel}`, meta: input }, tx);
  });
  return getMessagingWallet(session, input.schoolId);
}
