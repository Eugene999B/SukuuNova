import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { enqueueSms } from "./sms-outbox";

export async function createFeeItem(tx: TenantDb, input: {
  schoolId: string; actorId: string; termId: string; classId?: string; name: string; amount: number;
}) {
  await requirePermission(tx, input.actorId, "finance:write");
  if (input.amount <= 0) throw new AppError("Fee amount must be positive.", 400, "INVALID_AMOUNT");
  const item = await tx.feeItem.create({ data: {
    schoolId: input.schoolId, termId: input.termId, classId: input.classId,
    name: input.name.trim(), amount: new Prisma.Decimal(input.amount)
  } });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId, actorId: input.actorId, action: "fee_item.created",
    entityType: "FeeItem", entityId: item.id, after: item
  });
  return item;
}

export async function generateInvoice(tx: TenantDb, input: {
  schoolId: string; actorId: string; studentId: string; termId: string;
}) {
  await requirePermission(tx, input.actorId, "invoices:create");
  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } }
  });
  if (!student) throw new AppError("Student not found.", 404, "NOT_FOUND");
  const existing = await tx.invoice.findUnique({ where: { studentId_termId: { studentId: input.studentId, termId: input.termId } } });
  if (existing) throw new AppError("This student already has an invoice for the selected term.", 409, "INVOICE_EXISTS");
  const items = await tx.feeItem.findMany({
    where: { termId: input.termId, OR: [{ classId: null }, { classId: student.classId ?? "__none__" }] }
  });
  if (items.length === 0) throw new AppError("No fee items apply to this student.", 409, "NO_FEE_ITEMS");
  const total = items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const invoice = await tx.invoice.create({ data: {
    schoolId: input.schoolId, studentId: student.id, termId: input.termId, totalAmount: total
  } });
  await tx.invoiceLine.createMany({ data: items.map((item) => ({
    schoolId: input.schoolId, invoiceId: invoice.id, feeItemId: item.id, amount: item.amount
  })) });
  for (const link of student.guardians) {
    await enqueueSms(tx, {
      schoolId: input.schoolId,
      recipientType: "guardian",
      recipientId: link.guardianId,
      recipientPhone: link.guardian.phone,
      body: "SukuuNova invoice: " + student.name + " has fees of GHS " + total.toFixed(2) + ".",
      templateKey: "invoice_created",
      templateVariables: { "1": student.name, "2": total.toFixed(2), "3": invoice.id }
    });
  }
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId, actorId: input.actorId, action: "invoice.created",
    entityType: "Invoice", entityId: invoice.id, after: { ...invoice, lines: items.map((item) => item.id) }
  });
  return invoice;
}

async function refreshInvoiceStatus(tx: TenantDb, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId }, include: { payments: { include: { reversals: true } } }
  });
  if (!invoice) throw new AppError("Invoice not found.", 404, "NOT_FOUND");
  const paid = invoice.payments.reduce(
    (sum, payment) => sum.plus(payment.amount).minus(
      payment.reversals.reduce((reversed, row) => reversed.plus(row.amount), new Prisma.Decimal(0))
    ),
    new Prisma.Decimal(0)
  );
  const status = paid.greaterThanOrEqualTo(invoice.totalAmount)
    ? "paid" : paid.greaterThan(0) ? "part_paid" : "unpaid";
  await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
  return { invoice, paid, status };
}

export async function recordPayment(tx: TenantDb, input: {
  schoolId: string; actorId: string; invoiceId: string; amount: number;
  method: "momo" | "cash" | "card" | "bank" | "cheque"; reference?: string;
}) {
  await requirePermission(tx, input.actorId, "payments:record");
  if (input.amount <= 0) throw new AppError("Payment amount must be positive.", 400, "INVALID_AMOUNT");
  if ((input.method === "momo" || input.method === "bank" || input.method === "cheque") && !input.reference?.trim()) {
    throw new AppError("A transaction/reference number is required for this payment method.", 400, "REFERENCE_REQUIRED");
  }

  const current = await refreshInvoiceStatus(tx, input.invoiceId);
  if (current.status === "paid") {
    throw new AppError("This invoice is already fully paid. Record an approved credit or refund separately.", 409, "INVOICE_ALREADY_PAID");
  }
  const outstanding = current.invoice.totalAmount.minus(current.paid);
  const amount = new Prisma.Decimal(input.amount);
  if (amount.greaterThan(outstanding)) {
    throw new AppError("Payment exceeds the outstanding invoice balance. Handle the extra amount as an approved credit or refund.", 409, "OVERPAYMENT_REQUIRES_REVIEW");
  }

  const payment = await tx.payment.create({ data: {
    schoolId: input.schoolId, invoiceId: input.invoiceId, amount,
    method: input.method, reference: input.reference?.trim(), reconciledBy: input.actorId
  } });
  const result = await refreshInvoiceStatus(tx, input.invoiceId);
  const guardians = await tx.studentGuardian.findMany({
    where: { studentId: result.invoice.studentId, isPrimary: true }, include: { guardian: true }
  });
  for (const link of guardians) {
    await enqueueSms(tx, {
      schoolId: input.schoolId,
      recipientType: "guardian",
      recipientId: link.guardianId,
      recipientPhone: link.guardian.phone,
      body: "SukuuNova payment received: GHS " + payment.amount.toFixed(2) + ". Invoice is " + result.status + ".",
      templateKey: "payment_received",
      templateVariables: { "1": payment.amount.toFixed(2), "2": result.status, "3": input.invoiceId }
    });
  }
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId, actorId: input.actorId, action: "payment.recorded",
    entityType: "Payment", entityId: payment.id, after: payment
  });
  return payment;
}

export async function reversePayment(tx: TenantDb, input: {
  schoolId: string; actorId: string; paymentId: string; amount: number; reason: string;
}) {
  await requirePermission(tx, input.actorId, "payments:record");
  const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { reversals: true } });
  if (!payment) throw new AppError("Payment not found.", 404, "NOT_FOUND");
  const reversed = payment.reversals.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0) || reversed.plus(amount).greaterThan(payment.amount)) {
    throw new AppError("Reversal exceeds the unreversed payment balance.", 400, "INVALID_REVERSAL");
  }
  const reversal = await tx.paymentReversal.create({ data: {
    schoolId: input.schoolId, paymentId: payment.id, amount,
    reason: input.reason.trim(), reversedBy: input.actorId
  } });
  await refreshInvoiceStatus(tx, payment.invoiceId);
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId, actorId: input.actorId, action: "payment.reversed",
    entityType: "PaymentReversal", entityId: reversal.id, after: reversal
  });
  return reversal;
}
