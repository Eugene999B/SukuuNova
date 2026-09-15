import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { recordPayment } from "./finance-service";

export async function recordLegacyInvoicePayment(tx: TenantDb, input: {
  schoolId: string; actorId: string; studentId: string; invoiceId: string;
  amount: number; method: "cash" | "momo" | "bank" | "card" | "cheque"; reference: string;
}) {
  await requirePermission(tx, input.actorId, "payments:record");
  const invoice = await tx.invoice.findFirst({
    where: { id: input.invoiceId, schoolId: input.schoolId, studentId: input.studentId },
    select: { id: true },
  });
  if (!invoice) throw new AppError("Invoice not found for this learner.", 404, "NOT_FOUND");
  const charges = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "FinanceStudentCharge" WHERE "schoolId"=$1 AND "invoiceId"=$2 LIMIT 1',
    input.schoolId, input.invoiceId,
  );
  if (charges.length) throw new AppError("Choose the fee categories for this invoice.", 409, "CATEGORY_ALLOCATION_REQUIRED");
  return recordPayment(tx, input);
}
