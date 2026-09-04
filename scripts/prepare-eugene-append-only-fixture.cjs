#!/usr/bin/env node
/*
 * Final compatibility pass for the Eugene Academy live fixture.
 * It converts fixture writes that would UPDATE append-only records into
 * create-if-missing operations and makes immutable payment scenarios replayable.
 */
const fs = require("fs");

const path = "scripts/seed-realistic-test-school.cjs";
let source = fs.readFileSync(path, "utf8");

const invoiceLineStart = source.indexOf("      for (const line of lines) await tx.invoiceLine.upsert({");
const invoiceLineEnd = invoiceLineStart >= 0 ? source.indexOf("\n      if (student.id === students[1].id", invoiceLineStart) : -1;
if (invoiceLineStart < 0 || invoiceLineEnd < 0) throw new Error("Could not locate InvoiceLine fixture write.");
source = source.slice(0, invoiceLineStart) + `      for (const line of lines) {
        const existingInvoiceLine = await tx.invoiceLine.findUnique({ where: { invoiceId_feeItemId: { invoiceId: invoice.id, feeItemId: line.id } } });
        if (!existingInvoiceLine) {
          await tx.invoiceLine.create({ data: { schoolId, invoiceId: invoice.id, feeItemId: line.id, amount: line.amount } });
        }
      }` + source.slice(invoiceLineEnd);

const paymentStart = source.indexOf("        const payment = await tx.payment.create({");
const paymentEnd = paymentStart >= 0 ? source.indexOf("\n      }\n    }\n\n    // Timetable", paymentStart) : -1;
if (paymentStart < 0 || paymentEnd < 0) throw new Error("Could not locate payment/reversal fixture write.");
source = source.slice(0, paymentStart) + `        const paymentReference = \`TEST-PARTIAL-\${TEST_CODE}\`;
        const payment = await tx.payment.findFirst({ where: { schoolId, reference: paymentReference } }) || await tx.payment.create({ data: { schoolId, invoiceId: invoice.id, amount: new Prisma.Decimal(1000), method: "cash", reference: paymentReference, createdAt: d("2026-01-15") } });
        const existingReversal = await tx.paymentReversal.findFirst({ where: { schoolId, paymentId: payment.id, reason: "Test reversal of an incorrectly allocated portion" } });
        if (!existingReversal) {
          await tx.paymentReversal.create({ data: { schoolId, paymentId: payment.id, amount: new Prisma.Decimal(250), reason: "Test reversal of an incorrectly allocated portion", reversedBy: users.accountant.id, createdAt: d("2026-01-16") } });
        }` + source.slice(paymentEnd);

const payslipStart = source.indexOf("    for (const key of [\"principal\",\"accountant\",\"class.teacher\",\"subject.teacher\",\"hr\"]) await tx.payslip.upsert({");
const payslipEnd = payslipStart >= 0 ? source.indexOf("\n\n    for (const [n,key]", payslipStart) : -1;
if (payslipStart < 0 || payslipEnd < 0) throw new Error("Could not locate Payslip fixture write.");
source = source.slice(0, payslipStart) + `    for (const key of ["principal","accountant","class.teacher","subject.teacher","hr"]) {
      const existingPayslip = await tx.payslip.findFirst({ where: { schoolId, payrollRunId: payroll.id, staffId: users[key].id } });
      if (!existingPayslip) {
        await tx.payslip.create({ data: { schoolId, payrollRunId: payroll.id, staffId: users[key].id, gross: new Prisma.Decimal(5000), deductions: { ssnit: 300, tax: 450 }, net: new Prisma.Decimal(4250) } });
      }
    }` + source.slice(payslipEnd);

fs.writeFileSync(path, source, "utf8");
console.log("[eugene-academy-trial] append-only fixture compatibility prepared");
