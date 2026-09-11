import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { requirePermission } from "./rbac";
import { enqueueSms } from "./sms-outbox";
import { netPaid, toMoney } from "./money";
import { resolveStudentTermClass } from "./student-term-context";

const termLockKey=(schoolId:string,termId:string)=>`term-mutation:${schoolId}:${termId}`;

type AdjustmentKind = "waiver" | "scholarship" | "sibling_discount";
type AdjustmentMode = "amount" | "percent";
type AdjustmentStatus = "pending" | "approved" | "rejected";

export type FinanceAdjustmentRow = {
  id: string;
  schoolId: string;
  studentId: string;
  invoiceId: string | null;
  termId: string | null;
  kind: AdjustmentKind;
  mode: AdjustmentMode;
  value: Prisma.Decimal;
  siblingGroupKey: string | null;
  reason: string;
  status: AdjustmentStatus;
  requestedBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  fundingSource: string | null;
  fundingReference: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InvoiceFinancialProjection = {
  id: string;
  grossAmount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  status: string;
};

export function calculateAdjustmentReduction(
  grossInput: Prisma.Decimal | number | string,
  adjustments: Array<{ status: string; mode: AdjustmentMode; value: Prisma.Decimal | number | string }>,
) {
  const gross = new Prisma.Decimal(String(grossInput));
  return adjustments.reduce((sum, adjustment) => {
    if (adjustment.status !== "approved") return sum;
    const value = new Prisma.Decimal(String(adjustment.value));
    const reduction = adjustment.mode === "percent" ? gross.mul(value).div(100) : value;
    return sum.plus(reduction);
  }, new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function assertReductionWithinGross(gross: Prisma.Decimal, reduction: Prisma.Decimal) {
  if (reduction.greaterThan(gross)) {
    throw new AppError("Approved scholarships, waivers and discounts cannot exceed the invoice's gross fees.", 409, "ADJUSTMENTS_EXCEED_GROSS");
  }
}

async function adjustmentRows(tx: TenantDb, schoolId: string, whereSql: string, ...params: unknown[]) {
  return tx.$queryRawUnsafe<FinanceAdjustmentRow[]>(
    `SELECT "id","schoolId","studentId","invoiceId","termId","kind","mode","value","siblingGroupKey","reason","status","requestedBy","approvedBy","approvedAt","fundingSource","fundingReference","createdAt","updatedAt" FROM "P3FinanceAdjustment" WHERE "schoolId"=$1 AND ${whereSql}`,
    schoolId,
    ...params,
  );
}

export async function listFinanceAdjustments(tx: TenantDb, schoolId: string, limit = 500) {
  const capped = Math.max(1, Math.min(1000, Math.trunc(limit)));
  return tx.$queryRawUnsafe<FinanceAdjustmentRow[]>(
    `SELECT "id","schoolId","studentId","invoiceId","termId","kind","mode","value","siblingGroupKey","reason","status","requestedBy","approvedBy","approvedAt","fundingSource","fundingReference","createdAt","updatedAt" FROM "P3FinanceAdjustment" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC LIMIT $2`,
    schoolId,
    capped,
  );
}

export async function refreshInvoiceFinancialProjection(tx: TenantDb, schoolId: string, invoiceId: string) {
  await tx.$queryRawUnsafe(`SELECT sukuunova_refresh_invoice_financial_projection($1,$2)`, schoolId, invoiceId);
  const rows = await tx.$queryRawUnsafe<InvoiceFinancialProjection[]>(
    `SELECT "id","grossAmount","adjustmentAmount","totalAmount","status" FROM "Invoice" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    schoolId,
    invoiceId,
  );
  if (!rows[0]) throw new AppError("Invoice not found.", 404, "NOT_FOUND");
  return rows[0];
}

export async function requestFinanceAdjustment(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  studentId: string;
  invoiceId?: string;
  termId?: string;
  kind: AdjustmentKind;
  mode: AdjustmentMode;
  value: number;
  reason: string;
  siblingGroupKey?: string;
  fundingSource?: string;
  fundingReference?: string;
}) {
  await requirePermission(tx, input.actorId, "fees:adjust");
  const value = toMoney(input.value, "INVALID_ADJUSTMENT");
  if (input.mode === "percent" && value.greaterThan(100)) throw new AppError("Percentage adjustments cannot exceed 100%.", 400, "INVALID_ADJUSTMENT");
  const reason = input.reason.trim();
  if (reason.length < 2) throw new AppError("A clear reason is required for a fee adjustment.", 400, "ADJUSTMENT_REASON_REQUIRED");
  const siblingGroupKey = input.siblingGroupKey?.trim() || null;
  const fundingSource = input.fundingSource?.trim() || null;
  const fundingReference = input.fundingReference?.trim() || null;
  if (input.kind === "sibling_discount" && !siblingGroupKey) throw new AppError("Sibling discounts require a sibling group reference.", 400, "SIBLING_GROUP_REQUIRED");
  if (input.kind === "scholarship" && !fundingSource) throw new AppError("Scholarships require a funding source.", 400, "SCHOLARSHIP_FUNDING_REQUIRED");

  const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, select: { id: true } });
  if (!student) throw new AppError("Student not found.", 404, "NOT_FOUND");

  let invoiceId = input.invoiceId?.trim() || null;
  let termId = input.termId?.trim() || null;
  if (invoiceId) {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, schoolId: input.schoolId }, select: { id: true, studentId: true, termId: true } });
    if (!invoice) throw new AppError("Invoice not found.", 404, "NOT_FOUND");
    if (invoice.studentId !== input.studentId) throw new AppError("The selected invoice belongs to another learner.", 409, "ADJUSTMENT_STUDENT_MISMATCH");
    termId = invoice.termId;
  } else {
    if (!termId) throw new AppError("Choose an invoice or academic term for this adjustment.", 400, "ADJUSTMENT_CONTEXT_REQUIRED");
    const term = await tx.term.findFirst({ where: { id: termId, schoolId: input.schoolId }, select: { id: true } });
    if (!term) throw new AppError("Term not found.", 404, "TERM_NOT_FOUND");
    const existingInvoice = await tx.invoice.findFirst({ where: { schoolId: input.schoolId, studentId: input.studentId, termId }, select: { id: true } });
    invoiceId = existingInvoice?.id ?? null;
  }

  const id = createId();
  const rows = await tx.$queryRawUnsafe<FinanceAdjustmentRow[]>(
    `INSERT INTO "P3FinanceAdjustment" ("id","schoolId","studentId","invoiceId","termId","kind","mode","value","siblingGroupKey","reason","status","requestedBy","fundingSource","fundingReference","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id","schoolId","studentId","invoiceId","termId","kind","mode","value","siblingGroupKey","reason","status","requestedBy","approvedBy","approvedAt","fundingSource","fundingReference","createdAt","updatedAt"`,
    id,
    input.schoolId,
    input.studentId,
    invoiceId,
    termId,
    input.kind,
    input.mode,
    value,
    siblingGroupKey,
    reason,
    input.actorId,
    fundingSource,
    fundingReference,
  );
  const adjustment = rows[0];
  if (!adjustment) throw new AppError("Fee adjustment could not be created.", 500, "ADJUSTMENT_CREATE_FAILED");
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "finance.adjustment_requested",
    entityType: "FinanceAdjustment",
    entityId: adjustment.id,
    after: { studentId: input.studentId, invoiceId: adjustment.invoiceId, termId: adjustment.termId, kind: input.kind, mode: input.mode, value: value.toFixed(2), status: "pending", fundingSource },
  });
  return adjustment;
}

export async function decideFinanceAdjustment(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  adjustmentId: string;
  decision: "approve" | "reject";
}) {
  await requirePermission(tx, input.actorId, "fees:approve");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-adjustment:${input.schoolId}:${input.adjustmentId}`}))`;
  const rows = await tx.$queryRawUnsafe<FinanceAdjustmentRow[]>(
    `SELECT "id","schoolId","studentId","invoiceId","termId","kind","mode","value","siblingGroupKey","reason","status","requestedBy","approvedBy","approvedAt","fundingSource","fundingReference","createdAt","updatedAt" FROM "P3FinanceAdjustment" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`,
    input.schoolId,
    input.adjustmentId,
  );
  const adjustment = rows[0];
  if (!adjustment) throw new AppError("Fee adjustment not found.", 404, "NOT_FOUND");
  if (adjustment.status !== "pending") throw new AppError("This fee adjustment has already been decided.", 409, "ADJUSTMENT_CLOSED");
  if (input.decision === "approve" && adjustment.requestedBy === input.actorId) throw new ForbiddenError("The requester cannot approve their own fee adjustment.");
  if (input.decision === "approve" && adjustment.kind === "scholarship" && !adjustment.fundingSource?.trim()) {
    throw new AppError("Scholarships require a funding source before approval.", 409, "SCHOLARSHIP_FUNDING_REQUIRED");
  }
  if (input.decision === "approve" && adjustment.invoiceId) {
    const projection = await refreshInvoiceFinancialProjection(tx, input.schoolId, adjustment.invoiceId);
    const approved = await adjustmentRows(tx, input.schoolId, `"invoiceId"=$2 AND "status"='approved' AND "id"<>$3`, adjustment.invoiceId, adjustment.id);
    const reduction = calculateAdjustmentReduction(projection.grossAmount, [...approved, { ...adjustment, status: "approved" }]);
    assertReductionWithinGross(projection.grossAmount, reduction);
  }
  if (input.decision === "approve" && !adjustment.invoiceId && !adjustment.termId) {
    throw new AppError("This adjustment has no invoice or academic-term context.", 409, "ADJUSTMENT_CONTEXT_REQUIRED");
  }

  const status: AdjustmentStatus = input.decision === "approve" ? "approved" : "rejected";
  const decided = await tx.$queryRawUnsafe<FinanceAdjustmentRow[]>(
    `UPDATE "P3FinanceAdjustment" SET "status"=$1,"approvedBy"=$2,"approvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$3 AND "id"=$4 AND "status"='pending' RETURNING "id","schoolId","studentId","invoiceId","termId","kind","mode","value","siblingGroupKey","reason","status","requestedBy","approvedBy","approvedAt","fundingSource","fundingReference","createdAt","updatedAt"`,
    status,
    input.actorId,
    input.schoolId,
    adjustment.id,
  );
  if (!decided[0]) throw new AppError("This fee adjustment was decided by another request. Refresh and try again.", 409, "ADJUSTMENT_CLOSED");
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: `finance.adjustment_${status}`,
    entityType: "FinanceAdjustment",
    entityId: adjustment.id,
    before: { status: adjustment.status },
    after: { status, invoiceId: decided[0].invoiceId, termId: decided[0].termId },
  });
  return decided[0];
}

export async function createFeeItem(tx: TenantDb, input: { schoolId: string; actorId: string; termId: string; classId?: string; name: string; amount: number; }) {
  await requirePermission(tx, input.actorId, "finance:write");
  const feeAmount = toMoney(input.amount);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLockKey(input.schoolId,input.termId)}))`;
  const term = await tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { id: true, isLocked: true } });
  if (!term) throw new AppError("Term not found.", 404, "TERM_NOT_FOUND");
  if (term.isLocked) throw new AppError("Locked terms cannot receive new fee items.", 409, "TERM_LOCKED");
  if (input.classId) {
    const klass = await tx.class.findFirst({ where: { id: input.classId, schoolId: input.schoolId }, select: { id: true } });
    if (!klass) throw new AppError("Class not found.", 404, "CLASS_NOT_FOUND");
  }
  const item = await tx.feeItem.create({ data: { schoolId: input.schoolId, termId: input.termId, classId: input.classId, name: input.name.trim(), amount: feeAmount } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "fee_item.created", entityType: "FeeItem", entityId: item.id, after: item });
  return item;
}

export async function generateInvoice(tx: TenantDb, input: { schoolId: string; actorId: string; studentId: string; termId: string; }) {
  await requirePermission(tx, input.actorId, "invoices:create");
  const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } } });
  if (!student) throw new AppError("Student not found.", 404, "NOT_FOUND");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLockKey(input.schoolId,input.termId)}))`;
  const term = await tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { id: true, isLocked: true } });
  if (!term) throw new AppError("Term not found.", 404, "TERM_NOT_FOUND");
  if (term.isLocked) throw new AppError("Locked terms cannot receive new invoices.", 409, "TERM_LOCKED");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-generation:${input.schoolId}:${input.studentId}:${input.termId}`}))`;
  const existing = await tx.invoice.findFirst({ where: { studentId: input.studentId, termId: input.termId, schoolId: input.schoolId } });
  if (existing) throw new AppError("This student already has an invoice for the selected term.", 409, "INVOICE_EXISTS");
  const termClass = await resolveStudentTermClass(tx, { schoolId: input.schoolId, studentId: input.studentId, termId: input.termId });
  const items = await tx.feeItem.findMany({ where: { schoolId: input.schoolId, termId: input.termId, OR: [{ classId: null }, { classId: termClass.classId }] } });
  if (items.length === 0) throw new AppError("No fee items apply to this student.", 409, "NO_FEE_ITEMS");
  const gross = items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const preApproved = await adjustmentRows(tx, input.schoolId, `"studentId"=$2 AND "termId"=$3 AND "invoiceId" IS NULL AND "status"='approved'`, input.studentId, input.termId);
  assertReductionWithinGross(gross, calculateAdjustmentReduction(gross, preApproved));

  const invoice = await tx.invoice.create({ data: { schoolId: input.schoolId, studentId: student.id, termId: input.termId, totalAmount: gross } });
  await tx.$executeRawUnsafe(`UPDATE "Invoice" SET "classId"=$1 WHERE "schoolId"=$2 AND "id"=$3`, termClass.classId, input.schoolId, invoice.id);
  await tx.invoiceLine.createMany({ data: items.map((item) => ({ schoolId: input.schoolId, invoiceId: invoice.id, feeItemId: item.id, amount: item.amount })) });
  await tx.$executeRawUnsafe(
    `UPDATE "P3FinanceAdjustment" SET "invoiceId"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$2 AND "studentId"=$3 AND "termId"=$4 AND "invoiceId" IS NULL AND "status" IN ('pending','approved')`,
    invoice.id,
    input.schoolId,
    input.studentId,
    input.termId,
  );
  const projection = await refreshInvoiceFinancialProjection(tx, input.schoolId, invoice.id);
  for (const link of student.guardians) {
    if (!link.guardian.phone) continue;
    await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "guardian", recipientId: link.guardianId, recipientPhone: link.guardian.phone, body: "SukuuNova invoice: " + student.name + " has an amount due of GHS " + projection.totalAmount.toFixed(2) + ".", templateKey: "invoice_created", templateVariables: { "1": student.name, "2": projection.totalAmount.toFixed(2), "3": invoice.id } });
  }
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "invoice.created",
    entityType: "Invoice",
    entityId: invoice.id,
    after: { invoiceId: invoice.id, classId: termClass.classId, classSource: termClass.source, grossAmount: projection.grossAmount.toFixed(2), adjustmentAmount: projection.adjustmentAmount.toFixed(2), totalAmount: projection.totalAmount.toFixed(2), lines: items.map((item) => item.id) },
  });
  return tx.invoice.findFirst({ where: { id: invoice.id, schoolId: input.schoolId } });
}

async function refreshInvoiceStatus(tx: TenantDb, invoiceId: string, schoolId: string) {
  const projection = await refreshInvoiceFinancialProjection(tx, schoolId, invoiceId);
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, schoolId }, include: { payments: { include: { reversals: true } } } });
  if (!invoice) throw new AppError("Invoice not found.", 404, "NOT_FOUND");
  const paid = netPaid(invoice.payments);
  if (paid.lessThan(0)) throw new AppError("Invoice accounting invariant violated.", 409, "NEGATIVE_PAID_BALANCE");
  return { invoice, paid, status: projection.status };
}

export async function recordPayment(tx: TenantDb, input: { schoolId: string; actorId: string; invoiceId: string; amount: number; method: "momo" | "cash" | "card" | "bank" | "cheque"; reference: string; }) {
  await requirePermission(tx, input.actorId, "payments:record");
  const amount = toMoney(input.amount);
  const reference = input.reference.trim();
  if (!reference) throw new AppError("A payment reference or receipt number is required so retries cannot create duplicate payments.", 400, "REFERENCE_REQUIRED");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-payment:${input.schoolId}:${input.invoiceId}`}))`;

  const existing = await tx.payment.findFirst({ where: { schoolId: input.schoolId, reference }, select: { id: true, invoiceId: true, amount: true, method: true } });
  if (existing) {
    if (existing.invoiceId === input.invoiceId && existing.amount.equals(amount) && existing.method === input.method) return existing;
    throw new AppError("This payment reference has already been used for a different transaction.", 409, "DUPLICATE_PAYMENT_REFERENCE");
  }

  const current = await refreshInvoiceStatus(tx, input.invoiceId, input.schoolId);
  if (current.status === "paid") throw new AppError("This invoice is already fully paid. Record an approved credit or refund separately.", 409, "INVOICE_ALREADY_PAID");
  const outstanding = current.invoice.totalAmount.minus(current.paid);
  if (amount.greaterThan(outstanding)) throw new AppError("Payment exceeds the outstanding invoice balance. Handle the extra amount as an approved credit or refund.", 409, "OVERPAYMENT_REQUIRES_REVIEW");

  let payment;
  try {
    payment = await tx.payment.create({ data: { schoolId: input.schoolId, invoiceId: input.invoiceId, amount, method: input.method, reference, reconciledBy: input.actorId } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const duplicate = await tx.payment.findFirst({ where: { schoolId: input.schoolId, reference }, select: { id: true, invoiceId: true, amount: true, method: true } });
      if (duplicate && duplicate.invoiceId === input.invoiceId && duplicate.amount.equals(amount) && duplicate.method === input.method) return duplicate;
      throw new AppError("This payment reference has already been used for a different transaction.", 409, "DUPLICATE_PAYMENT_REFERENCE");
    }
    throw error;
  }
  const result = await refreshInvoiceStatus(tx, input.invoiceId, input.schoolId);
  const guardians = await tx.studentGuardian.findMany({ where: { schoolId: input.schoolId, studentId: result.invoice.studentId, isPrimary: true }, include: { guardian: true } });
  for (const link of guardians) {
    if (!link.guardian.phone) continue;
    await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "guardian", recipientId: link.guardianId, recipientPhone: link.guardian.phone, body: "SukuuNova payment received: GHS " + payment.amount.toFixed(2) + ". Invoice is " + result.status + ".", templateKey: "payment_received", templateVariables: { "1": payment.amount.toFixed(2), "2": result.status, "3": input.invoiceId } });
  }
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "payment.recorded", entityType: "Payment", entityId: payment.id, after: payment });
  return payment;
}

export async function reversePayment(tx: TenantDb, input: { schoolId: string; actorId: string; paymentId: string; amount: number; reason: string; idempotencyKey?: string; }) {
  await requirePermission(tx, input.actorId, "payments:reverse");
  const reason = input.reason.trim();
  if (reason.length < 2) throw new AppError("A reason is required when reversing a payment.", 400, "REVERSAL_REASON_REQUIRED");
  const key = input.idempotencyKey?.trim().slice(0, 100) || null;
  if (key) {
    const prior = await tx.paymentReversal.findFirst({ where: { schoolId: input.schoolId, idempotencyKey: key }, select: { id: true, paymentId: true, amount: true } });
    if (prior) return prior;
  }
  const payment = await tx.payment.findFirst({ where: { id: input.paymentId, schoolId: input.schoolId }, include: { reversals: true } });
  if (!payment) throw new AppError("Payment not found.", 404, "NOT_FOUND");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-payment:${input.schoolId}:${payment.invoiceId}`}))`;
  const currentPayment = await tx.payment.findFirst({ where: { id: input.paymentId, schoolId: input.schoolId }, include: { reversals: true } });
  if (!currentPayment) throw new AppError("Payment not found.", 404, "NOT_FOUND");
  const reversed = currentPayment.reversals.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  const amount = toMoney(input.amount);
  if (reversed.plus(amount).greaterThan(currentPayment.amount)) throw new AppError("Reversal exceeds the unreversed payment balance.", 400, "INVALID_REVERSAL");
  let reversal;
  try {
    reversal = await tx.paymentReversal.create({ data: { schoolId: input.schoolId, paymentId: currentPayment.id, amount, reason, reversedBy: input.actorId, ...(key ? { idempotencyKey: key } : {}) } });
  } catch (error) {
    if (key && (error as { code?: string }).code === "P2002") {
      const raced = await tx.paymentReversal.findFirst({ where: { schoolId: input.schoolId, idempotencyKey: key }, select: { id: true, paymentId: true, amount: true } });
      if (raced) return raced;
    }
    throw error;
  }
  await refreshInvoiceStatus(tx, currentPayment.invoiceId, input.schoolId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "payment.reversed", entityType: "PaymentReversal", entityId: reversal.id, after: reversal });
  return reversal;
}
