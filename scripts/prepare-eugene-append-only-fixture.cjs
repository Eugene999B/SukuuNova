#!/usr/bin/env node
/*
 * Compatibility pass for the Eugene Academy live fixture.
 * Converts the immutable InvoiceLine fixture from upsert to create-if-missing
 * and makes the synthetic payment/reversal scenario replay-safe.
 *
 * The canonical Eugene preparation pass runs immediately before this script in
 * Railway predeploy and again inside the runtime wrapper. Therefore this pass
 * must tolerate both the original fixture and an already-transformed fixture.
 */
const fs = require("fs");

const path = "scripts/seed-realistic-test-school.cjs";
let source = fs.readFileSync(path, "utf8");
let changed = false;

// The mature fixture currently uses a single-line InvoiceLine upsert. Match
// that actual structure rather than relying on an older `lines` variable.
const invoiceLineRegex = /^(\s*)for \(const item of feeItems\.filter\(\(f\) => f\.termId === term\.id\)\) await tx\.invoiceLine\.upsert\(\{.*?\}\);$/m;
const invoiceLineMatch = source.match(invoiceLineRegex);
if (invoiceLineMatch) {
  const indent = invoiceLineMatch[1];
  source = source.replace(invoiceLineRegex, `${indent}for (const item of feeItems.filter((f) => f.termId === term.id)) {\n${indent}  const existingInvoiceLine = await tx.invoiceLine.findUnique({ where: { invoiceId_feeItemId: { invoiceId: invoice.id, feeItemId: item.id } } });\n${indent}  if (!existingInvoiceLine) {\n${indent}    await tx.invoiceLine.create({ data: { schoolId, invoiceId: invoice.id, feeItemId: item.id, amount: item.amount } });\n${indent}  }\n${indent}}`);
  changed = true;
}

// On later runs, the canonical structure is already create-if-missing. Treat
// either that structure or the absence of an invoice-line block as replay-safe.
if (!invoiceLineMatch && !source.includes("existingInvoiceLine") && source.includes("tx.invoiceLine.upsert")) {
  throw new Error("Could not safely locate InvoiceLine fixture write.");
}

// Make the synthetic partial payment + reversal create-only by matching the
// actual Payment create block. This is also safe to replay after transformation.
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
} else if (paymentStart < 0 && !source.includes("const paymentReference = `TEST-PARTIAL-\${TEST_CODE}`;")) {
  if (source.includes("TEST-PARTIAL-")) {
    throw new Error("Could not safely locate payment/reversal fixture write.");
  }
}

if (changed) {
  fs.writeFileSync(path, source, "utf8");
  console.log("[eugene-academy-trial] immutable ledger compatibility prepared");
} else {
  console.log("[eugene-academy-trial] immutable ledger compatibility already prepared");
}
