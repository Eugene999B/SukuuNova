#!/usr/bin/env node
/*
 * Final compatibility pass for the Eugene Academy live fixture.
 * It converts fixture upserts that would attempt to UPDATE append-only
 * financial/payroll rows into create-if-missing operations, and makes
 * immutable payment scenarios safe to replay.
 */
const fs = require("fs");

const path = "scripts/seed-realistic-test-school.cjs";
let source = fs.readFileSync(path, "utf8");

const invoiceLinePattern = /      for \(const line of lines\) await tx\.invoiceLine\.upsert\(\{ where: \{ invoiceId_feeItemId: \{ invoiceId: invoice\.id, feeItemId: line\.id \} \}, update: \{ amount: line\.amount, schoolId \}, create: \{ schoolId, invoiceId: invoice\.id, feeItemId: line\.id, amount: line\.amount \} \}\);/;
const invoiceLineReplacement = `      for (const line of lines) {
        const existingInvoiceLine = await tx.invoiceLine.findUnique({ where: { invoiceId_feeItemId: { invoiceId: invoice.id, feeItemId: line.id } } });
        if (!existingInvoiceLine) {
          await tx.invoiceLine.create({ data: { schoolId, invoiceId: invoice.id, feeItemId: line.id, amount: line.amount } });
        }
      }`;
if (!invoiceLinePattern.test(source)) throw new Error("Could not locate InvoiceLine fixture write.");
source = source.replace(invoiceLinePattern, invoiceLineReplacement);

const paymentPattern = /        const payment = await tx\.payment\.create\(\{ data: \{ schoolId, invoiceId: invoice\.id, amount: new Prisma\.Decimal\(1000\), method: "bank_transfer", reference: `TEST-PARTIAL-\$\{TEST_CODE\}`, createdAt: d\("2026-01-15"\) \} \}\);\n        await tx\.paymentReversal\.create\(\{ schoolId, paymentId: payment\.id, amount: new Prisma\.Decimal\(250\), reason: "Test reversal of an incorrectly allocated portion", reversedBy: users\.accountant\.id, createdAt: d\("2026-01-16"\) \} \}\);/;
const paymentReplacement = `        const paymentReference = ` + "`TEST-PARTIAL-${TEST_CODE}`" + `;
        const payment = await tx.payment.findFirst({ where: { schoolId, reference: paymentReference } }) || await tx.payment.create({ data: { schoolId, invoiceId: invoice.id, amount: new Prisma.Decimal(1000), method: "cash", reference: paymentReference, createdAt: d("2026-01-15") } });
        const existingReversal = await tx.paymentReversal.findFirst({ where: { schoolId, paymentId: payment.id, reason: "Test reversal of an incorrectly allocated portion" } });
        if (!existingReversal) {
          await tx.paymentReversal.create({ data: { schoolId, paymentId: payment.id, amount: new Prisma.Decimal(250), reason: "Test reversal of an incorrectly allocated portion", reversedBy: users.accountant.id, createdAt: d("2026-01-16") } });
        }`;
if (!paymentPattern.test(source)) throw new Error("Could not locate payment/reversal fixture write.");
source = source.replace(paymentPattern, paymentReplacement);

const payslipPattern = /    for \(const key of \["principal","accountant","class\.teacher","subject\.teacher","hr"\]\) await tx\.payslip\.upsert\(\{ where: \{ schoolId_payrollRunId_staffId: \{ schoolId, payrollRunId: payroll\.id, staffId: users\[key\]\.id \} \}, update: \{\}, create: \{ schoolId, payrollRunId: payroll\.id, staffId: users\[key\]\.id, gross: new Prisma\.Decimal\(5000\), deductions: \{ ssnit: 300, tax: 450 \}, net: new Prisma\.Decimal\(4250\) \} \}\);/;
const payslipReplacement = `    for (const key of ["principal","accountant","class.teacher","subject.teacher","hr"]) {
      const existingPayslip = await tx.payslip.findFirst({ where: { schoolId, payrollRunId: payroll.id, staffId: users[key].id } });
      if (!existingPayslip) {
        await tx.payslip.create({ data: { schoolId, payrollRunId: payroll.id, staffId: users[key].id, gross: new Prisma.Decimal(5000), deductions: { ssnit: 300, tax: 450 }, net: new Prisma.Decimal(4250) } });
      }
    }`;
if (!payslipPattern.test(source)) throw new Error("Could not locate Payslip fixture write.");
source = source.replace(payslipPattern, payslipReplacement);

fs.writeFileSync(path, source, "utf8");
console.log("[eugene-academy-trial] append-only fixture compatibility prepared");
