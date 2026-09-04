#!/usr/bin/env node
/*
 * Final compatibility pass for the Eugene Academy live fixture.
 * It converts only fixture upserts that would attempt to UPDATE append-only
 * financial/payroll rows into create-if-missing operations.
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