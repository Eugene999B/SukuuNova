import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { enqueueSms } from "./sms-outbox";

export async function createFeeItem(tx: TenantDb, input: { schoolId: string; actorId: string; termId: string; classId?: string; name: string; amount: number; }) {
  await requirePermission(tx, input.actorId, "finance:write");
  if (input.amount <= 0) throw new AppError("Fee amount must be positive.", 400, "INVALID_AMOUNT");
  const term = await tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { id: true, isLocked: true } });
  if (!term) throw new AppError("Term not found.", 404, "TERM_NOT_FOUND");
  if (term.isLocked) throw new AppError("Locked terms cannot receive new fee items.", 409, "TERM_LOCKED");
  if (input.classId) {
    const klass = await tx.class.findFirst({ where: { id: input.classId, schoolId: input.schoolId }, select: { id: true } });
    if (!klass) throw new AppError("Class not found.", 404, "CLASS_NOT_FOUND");
  }
  const item = await tx.feeItem.create({ data: { schoolId: input.schoolId, termId: input.termId, classId: input.classId, name: input.name.trim(), amount: new Prisma.Decimal(input.amount) } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "fee_item.created", entityType: "FeeItem", entityId: item.id, after: item });
  return item;
}

export async function generateInvoice(tx: TenantDb, input: { schoolId: string; actorId: string; studentId: string; termId: string; }) {
  await requirePermission(tx, input.actorId, "invoices:create");
  const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } } });
  if (!student) throw new AppError("Student not found.", 404, "NOT_FOUND");
  const term = await tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { id: true, isLocked: true } });
  if (!term) throw new AppError("Term not found.", 404, "TERM_NOT_FOUND");
  const existing = await tx.invoice.findFirst({ where: { studentId: input.studentId, termId: input.termId, schoolId: input.schoolId } });
  if (existing) throw new AppError("This student already has an invoice for the selected term.", 409, "INVOICE_EXISTS");
  const items = await tx.feeItem.findMany({ where: { schoolId: input.schoolId, termId: input.termId, OR: [{ classId: null }, { classId: student.classId ?? "__none__" }] } });
  if (items.length === 0) throw new AppError("No fee items apply to this student.", 409, "NO_FEE_ITEMS");
  const total = items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const invoice = await tx.invoice.create({ data: { schoolId: input.schoolId, studentId: student.id, termId: input.termId, totalAmount: total } });
  await tx.invoiceLine.createMany({ data: items.map((item) => ({ schoolId: input.schoolId, invoiceId: invoice.id, feeItemId: item.id, amount: item.amount })) });
  for (const link of student.guardians) {
    if (!link.guardian.phone) continue;
    await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "guardian", recipientId: link.guardianId, recipientPhone: link.guardian.phone, body: "SukuuNova invoice: " + student.name + " has fees of GHS " + total.toFixed(2) + ".", templateKey: "invoice_created", templateVariables: { "1": student.name, "2": total.toFixed(2), "3": invoice.id } });
  }
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "invoice.created", entityType: "Invoice", entityId: invoice.id, after: { ...invoice, lines: items.map((item) => item.id) } });
  return invoice;
}

async function refreshInvoiceStatus(tx: TenantDb, invoiceId: string, schoolId?: string) {
  const invoice = await tx.invoice.findFirst({ where: schoolId ? { id: invoiceId, schoolId } : { id: invoiceId }, include: { payments: { include: { reversals: true } } } });
  if (!invoice) throw new AppError("Invoice not found.", 404, "NOT_FOUND");
  const paid = invoice.payments.reduce((sum, payment) => sum.plus(payment.amount).minus(payment.reversals.reduce((reversed, row) => reversed.plus(row.amount), new Prisma.Decimal(0))), new Prisma.Decimal(0));
  if (paid.lessThan(0)) throw new AppError("Invoice accounting invariant violated.", 409, "NEGATIVE_PAID_BALANCE");
  const status = paid.greaterThanOrEqualTo(invoice.totalAmount) ? "paid" : paid.greaterThan(0) ? "partial" : "unpaid";
  await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
  return { invoice, paid, status };
}

export async function recordPayment(tx: TenantDb, input: { schoolId: string; actorId: string; invoiceId: string; amount: number; method: "momo" | "cash" | "card" | "bank" | "cheque"; reference?: string; }) {
  await requirePermission(tx, input.actorId, "payments:record");
  if (input.amount <= 0) throw new AppError("Payment amount must be positive.", 400, "INVALID_AMOUNT");
  const reference = input.reference?.trim() || undefined;
  if ((input.method === "momo" || input.method === "bank" || input.method === "cheque") && !reference) throw new AppError("A transaction/reference number is required for this payment method.", 400, "REFERENCE_REQUIRED");

  // Serialize balance validation, payment creation and invoice-status refresh for
  // this invoice. Without this lock, concurrent collectors could both observe the
  // same outstanding balance and independently pass the overpayment check.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-payment:${input.schoolId}:${input.invoiceId}`}))`;
  const current = await refreshInvoiceStatus(tx, input.invoiceId, input.schoolId);
  if (current.status === "paid") throw new AppError("This invoice is already fully paid. Record an approved credit or refund separately.", 409, "INVOICE_ALREADY_PAID");
  const outstanding = current.invoice.totalAmount.minus(current.paid);
  const amount = new Prisma.Decimal(input.amount);
  if (amount.greaterThan(outstanding)) throw new AppError("Payment exceeds the outstanding invoice balance. Handle the extra amount as an approved credit or refund.", 409, "OVERPAYMENT_REQUIRES_REVIEW");
  if (reference) {
    const existing = await tx.payment.findFirst({ where: { schoolId: input.schoolId, reference }, select: { id: true, invoiceId: true, amount: true, method: true } });
    if (existing) {
      if (existing.invoiceId === input.invoiceId && existing.amount.equals(amount) && existing.method === input.method) return existing;
      throw new AppError("This payment reference has already been used for a different transaction.", 409, "DUPLICATE_PAYMENT_REFERENCE");
    }
  }
  let payment;
  try {
    payment = await tx.payment.create({ data: { schoolId: input.schoolId, invoiceId: input.invoiceId, amount, method: input.method, reference, reconciledBy: input.actorId } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002" && reference) {
      const existing = await tx.payment.findFirst({ where: { schoolId: input.schoolId, reference }, select: { id: true, invoiceId: true, amount: true, method: true } });
      if (existing && existing.invoiceId === input.invoiceId && existing.amount.equals(amount) && existing.method === input.method) return existing;
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

export async function reversePayment(tx: TenantDb, input: { schoolId: string; actorId: string; paymentId: string; amount: number; reason: string; }) {
  await requirePermission(tx, input.actorId, "payments:reverse");
  const reason = input.reason.trim();
  if (reason.length < 2) throw new AppError("A reason is required when reversing a payment.", 400, "REVERSAL_REASON_REQUIRED");
  const payment = await tx.payment.findFirst({ where: { id: input.paymentId, schoolId: input.schoolId }, include: { reversals: true } });
  if (!payment) throw new AppError("Payment not found.", 404, "NOT_FOUND");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-payment:${input.schoolId}:${payment.invoiceId}`}))`;
  const currentPayment = await tx.payment.findFirst({ where: { id: input.paymentId, schoolId: input.schoolId }, include: { reversals: true } });
  if (!currentPayment) throw new AppError("Payment not found.", 404, "NOT_FOUND");
  const reversed = currentPayment.reversals.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0) || reversed.plus(amount).greaterThan(currentPayment.amount)) throw new AppError("Reversal exceeds the unreversed payment balance.", 400, "INVALID_REVERSAL");
  const reversal = await tx.paymentReversal.create({ data: { schoolId: input.schoolId, paymentId: currentPayment.id, amount, reason, reversedBy: input.actorId } });
  await refreshInvoiceStatus(tx, currentPayment.invoiceId, input.schoolId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "payment.reversed", entityType: "PaymentReversal", entityId: reversal.id, after: reversal });
  return reversal;
}