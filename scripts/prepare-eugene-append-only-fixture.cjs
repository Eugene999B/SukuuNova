#!/usr/bin/env node
/*
 * Compatibility pass for the Eugene Academy live fixture.
 * Converts InvoiceLine upsert to create-if-missing and makes the synthetic
 * payment/reversal scenario safe to replay. Payslips remain create-only in
 * practice because the guarded seed is transactional and one-shot.
 *
 * This preparer is intentionally idempotent: the canonical Eugene preparation
 * pass may already have rewritten parts of the fixture during an earlier
 * deployment attempt, so each transformation is applied only when its
 * original pattern still exists.
 */
const fs = require("fs");

const path = "scripts/seed-realistic-test-school.cjs";
let source = fs.readFileSync(path, "utf8");
let changed = false;

const invoiceLineStart = source.indexOf("      for (const line of lines) await tx.invoiceLine.upsert({");
const invoiceLineEnd = invoiceLineStart >= 0 ? source.indexOf("\n      if (student.id === students[1].id", invoiceLineStart) : -1;
if (invoiceLineStart >= 0 && invoiceLineEnd >= 0) {
  source = source.slice(0, invoiceLineStart) + `      for (const line of lines) {
        const existingInvoiceLine = await tx.invoiceLine.findUnique({ where: { invoiceId_feeItemId: { invoiceId: invoice.id, feeItemId: line.id } } });
        if (!existingInvoiceLine) {
          await tx.invoiceLine.create({ data: { schoolId, invoiceId: invoice.id, feeItemId: line.id, amount: line.amount } });
        }
      }` + source.slice(invoiceLineEnd);
  changed = true;
} else if (!source.includes("const existingInvoiceLine = await tx.invoiceLine.findUnique")) {
  throw new Error("Could not locate InvoiceLine fixture write.");
}

const paymentStart = source.indexOf("        const payment = await tx.payment.create({");
const paymentEnd = paymentStart >= 0 ? source.indexOf("\n      }\n    }\n\n    // Timetable", paymentStart) : -1;
if (paymentStart >= 0 && paymentEnd >= 0) {
  source = source.slice(0, paymentStart) + `        const paymentReference = \`TEST-PARTIAL-\${TEST_CODE}\`;
        const payment = await tx.payment.findFirst({ where: { schoolId, reference: paymentReference } }) || await tx.payment.create({ data: { schoolId, invoiceId: invoice.id, amount: new Prisma.Decimal(1000), method: "cash", reference: paymentReference, createdAt: d("2026-01-15") } });
        const existingReversal = await tx.paymentReversal.findFirst({ where: { schoolId, paymentId: payment.id, reason: "Test reversal of an incorrectly allocated portion" } });
        if (!existingReversal) {
          await tx.paymentReversal.create({ data: { schoolId, paymentId: payment.id, amount: new Prisma.Decimal(250), reason: "Test reversal of an incorrectly allocated portion", reversedBy: users.accountant.id, createdAt: d("2026-01-16") } });
        }` + source.slice(paymentEnd);
  changed = true;
} else if (!source.includes("const paymentReference = `TEST-PARTIAL-\${TEST_CODE}`;")) {
  throw new Error("Could not locate payment/reversal fixture write.");
}

if (changed) {
  fs.writeFileSync(path, source, "utf8");
  console.log("[eugene-academy-trial] immutable ledger compatibility prepared");
} else {
  console.log("[eugene-academy-trial] immutable ledger compatibility already prepared");
}
