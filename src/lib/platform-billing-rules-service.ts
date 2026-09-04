import { createId } from "@paralleldrive/cuid2";
import { AppError } from "./errors";
import { withTenant } from "./db";
import { getPlatformSchoolScope, requirePlatformPermission } from "./platform-permissions";
import { appendPlatformAudit } from "./audit";
import type { PlatformSession } from "./auth";

async function ensureScope(session: PlatformSession, schoolId: string) {
  const scope = await getPlatformSchoolScope(session);
  if (scope !== null && !scope.includes(schoolId)) throw new AppError("School is outside your assigned platform scope.", 403, "FORBIDDEN");
}

type RulesRow = { billingMode: string; currency: string; studentRate: string; flatRate: string; billingDay: number; graceDays: number; trialDays: number; minimumCharge: string; maximumCharge: string | null; active: boolean; autoGenerateInvoices: boolean; invoiceDueDays: number; taxPercent: string; discountPercent: string; invoicePrefix: string; sendBillingNotifications: boolean };

export async function getBillingRules(session: PlatformSession, schoolId: string) {
  await requirePlatformPermission(session, "billing.view");
  await ensureScope(session, schoolId);
  return withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true, subscriptionPlan: { select: { name: true, price: true } } } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const row = (await tx.$queryRawUnsafe<RulesRow[]>(`SELECT "billingMode","currency","studentRate"::text,"flatRate"::text,"billingDay","graceDays","trialDays","minimumCharge"::text,"maximumCharge"::text,"active","autoGenerateInvoices","invoiceDueDays","taxPercent"::text,"discountPercent"::text,"invoicePrefix","sendBillingNotifications" FROM "PlatformSchoolBillingConfig" WHERE "schoolId"=$1`, schoolId))[0];
    const rules = row ?? { billingMode: "flat", currency: "GHS", studentRate: "0", flatRate: String(school.subscriptionPlan?.price ?? 0), billingDay: 1, graceDays: 7, trialDays: 0, minimumCharge: "0", maximumCharge: null, active: true, autoGenerateInvoices: false, invoiceDueDays: 7, taxPercent: "0", discountPercent: "0", invoicePrefix: "INV", sendBillingNotifications: true };
    const activeStudents = await tx.student.count({ where: { status: "active" } });
    const base = rules.billingMode === "per_student" ? activeStudents * Number(rules.studentRate) : Number(rules.flatRate);
    const discounted = base * (1 - Number(rules.discountPercent) / 100);
    const subtotal = Math.max(Number(rules.minimumCharge), discounted);
    const capped = rules.maximumCharge == null ? subtotal : Math.min(Number(rules.maximumCharge), subtotal);
    const tax = capped * Number(rules.taxPercent) / 100;
    const total = capped + tax;
    return { school, activeStudents, rules: { ...rules, studentRate: Number(rules.studentRate), flatRate: Number(rules.flatRate), minimumCharge: Number(rules.minimumCharge), maximumCharge: rules.maximumCharge == null ? null : Number(rules.maximumCharge), taxPercent: Number(rules.taxPercent), discountPercent: Number(rules.discountPercent) }, estimate: { base, discountedBase: discounted, subtotal: capped, tax, total } };
  });
}

export async function saveBillingRules(session: PlatformSession, input: {
  schoolId: string; billingMode: "flat" | "per_student"; currency: string; studentRate: number; flatRate: number; billingDay: number; graceDays: number; trialDays: number; minimumCharge: number; maximumCharge: number | null; active: boolean; autoGenerateInvoices: boolean; invoiceDueDays: number; taxPercent: number; discountPercent: number; invoicePrefix: string; sendBillingNotifications: boolean;
}) {
  await requirePlatformPermission(session, "billing.manage");
  await ensureScope(session, input.schoolId);
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can change commercial billing policy.", 403, "FORBIDDEN");
  if (input.taxPercent < 0 || input.taxPercent > 100 || input.discountPercent < 0 || input.discountPercent > 100) throw new AppError("Tax and discount percentages must be between 0 and 100.", 400, "INVALID_PERCENTAGE");
  if (input.invoiceDueDays < 0 || input.invoiceDueDays > 90) throw new AppError("Invoice due days must be between 0 and 90.", 400, "INVALID_DUE_DAYS");
  if (!input.invoicePrefix.trim()) throw new AppError("Invoice prefix is required.", 400, "INVALID_INVOICE_PREFIX");
  await withTenant(input.schoolId, async (tx) => {
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformSchoolBillingConfig" ("schoolId","billingMode","currency","studentRate","flatRate","billingDay","graceDays","trialDays","minimumCharge","maximumCharge","active","autoGenerateInvoices","invoiceDueDays","taxPercent","discountPercent","invoicePrefix","sendBillingNotifications","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO UPDATE SET "billingMode"=EXCLUDED."billingMode","currency"=EXCLUDED."currency","studentRate"=EXCLUDED."studentRate","flatRate"=EXCLUDED."flatRate","billingDay"=EXCLUDED."billingDay","graceDays"=EXCLUDED."graceDays","trialDays"=EXCLUDED."trialDays","minimumCharge"=EXCLUDED."minimumCharge","maximumCharge"=EXCLUDED."maximumCharge","active"=EXCLUDED."active","autoGenerateInvoices"=EXCLUDED."autoGenerateInvoices","invoiceDueDays"=EXCLUDED."invoiceDueDays","taxPercent"=EXCLUDED."taxPercent","discountPercent"=EXCLUDED."discountPercent","invoicePrefix"=EXCLUDED."invoicePrefix","sendBillingNotifications"=EXCLUDED."sendBillingNotifications","updatedAt"=CURRENT_TIMESTAMP`, input.schoolId, input.billingMode, input.currency.toUpperCase().slice(0,8), input.studentRate, input.flatRate, input.billingDay, input.graceDays, input.trialDays, input.minimumCharge, input.maximumCharge, input.active, input.autoGenerateInvoices, input.invoiceDueDays, input.taxPercent, input.discountPercent, input.invoicePrefix.trim().slice(0,20), input.sendBillingNotifications);
  });
  await appendPlatformAudit({ actorId: session.adminId, action: "school.billing_rules.updated", targetSchoolId: input.schoolId, targetEntity: "PlatformSchoolBillingConfig", meta: input });
  return getBillingRules(session, input.schoolId);
}

export async function generateBillingRulesInvoice(session: PlatformSession, schoolId: string, period: string) {
  await requirePlatformPermission(session, "billing.manage");
  await ensureScope(session, schoolId);
  const result = await withTenant(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, subscriptionPlan: { select: { name: true, price: true } } } });
    if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
    const existing = (await tx.$queryRawUnsafe<Array<{ id: string; amount: string; status: string; calculation: unknown }>>(`SELECT "id","amount"::text,"status","calculation" FROM "PlatformInvoice" WHERE "schoolId"=$1 AND "period"=$2 LIMIT 1`, schoolId, period))[0];
    if (existing) return { ...existing, amount: Number(existing.amount), existing: true };
    const row = (await tx.$queryRawUnsafe<RulesRow[]>(`SELECT "billingMode","currency","studentRate"::text,"flatRate"::text,"billingDay","graceDays","trialDays","minimumCharge"::text,"maximumCharge"::text,"active","autoGenerateInvoices","invoiceDueDays","taxPercent"::text,"discountPercent"::text,"invoicePrefix","sendBillingNotifications" FROM "PlatformSchoolBillingConfig" WHERE "schoolId"=$1 AND "active"=true`, schoolId))[0];
    const activeStudents = row?.billingMode === "per_student" ? await tx.student.count({ where: { status: "active" } }) : 0;
    const base = row ? (row.billingMode === "per_student" ? activeStudents * Number(row.studentRate) : Number(row.flatRate)) : Number(school.subscriptionPlan?.price ?? 0);
    if (!row && !school.subscriptionPlan) throw new AppError("Configure school billing before generating an invoice.", 409, "BILLING_RULE_REQUIRED");
    const discount = row ? base * Number(row.discountPercent) / 100 : 0;
    const discounted = base - discount;
    const floor = row ? Number(row.minimumCharge) : 0;
    const capped = Math.min(row?.maximumCharge == null ? Number.POSITIVE_INFINITY : Number(row.maximumCharge), Math.max(floor, discounted));
    const tax = row ? capped * Number(row.taxPercent) / 100 : 0;
    const amount = capped + tax;
    const calculation = { billingMode: row?.billingMode ?? "plan", currency: row?.currency ?? "GHS", activeStudents, baseAmount: base, discountPercent: row ? Number(row.discountPercent) : 0, discountAmount: discount, minimumCharge: floor, cappedSubtotal: capped, taxPercent: row ? Number(row.taxPercent) : 0, taxAmount: tax, finalAmount: amount, invoicePrefix: row?.invoicePrefix ?? "INV", invoiceDueDays: row?.invoiceDueDays ?? row?.graceDays ?? 0, planName: school.subscriptionPlan?.name ?? null };
    const created = (await tx.$queryRawUnsafe<Array<{ id: string }>>(`INSERT INTO "PlatformInvoice" ("id","schoolId","period","amount","status","calculation") VALUES ($1,$2,$3,$4,'unpaid',$5::jsonb) RETURNING "id"`, createId(), schoolId, period, amount, JSON.stringify(calculation)))[0];
    return { id: created.id, amount, status: "unpaid", existing: false, calculation };
  });
  await appendPlatformAudit({ actorId: session.adminId, action: result.existing ? "platform.billing.invoice_already_exists" : "platform.billing.invoice_generated", targetSchoolId: schoolId, targetEntity: `PlatformInvoice:${result.id}`, meta: result });
  return result;
}
