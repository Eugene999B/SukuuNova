import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { createFeeItem, generateInvoice, recordPayment, reversePayment } from "@/lib/finance-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("feeItem"), termId: z.string(), classId: z.string().optional(), name: z.string().min(1), amount: z.number().positive() }),
  z.object({ action: z.literal("invoice"), studentId: z.string(), termId: z.string() }),
  z.object({ action: z.literal("payment"), invoiceId: z.string(), amount: z.number().positive(), method: z.enum(["momo", "cash", "card"]), reference: z.string().optional() }),
  z.object({ action: z.literal("reversal"), paymentId: z.string(), amount: z.number().positive(), reason: z.string().min(2) })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "finance:read");
      const [feeItems, invoices, payments, reversals, terms, classes, students] = await Promise.all([
        tx.feeItem.findMany({ include: { term: true, class: true }, orderBy: { name: "asc" } }),
        tx.invoice.findMany({ include: { student: { select: { name: true, admissionNo: true } }, term: true, lines: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
        tx.payment.findMany({ orderBy: { createdAt: "desc" }, take: 2000 }),
        tx.paymentReversal.findMany({ orderBy: { createdAt: "desc" }, take: 2000 }),
        tx.term.findMany({ include: { academicYear: { select: { name: true } } }, orderBy: { startDate: "desc" }, take: 50 }),
        tx.class.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        tx.student.findMany({ where: { status: "active" }, select: { id: true, name: true, admissionNo: true, class: { select: { name: true } } }, orderBy: { name: "asc" }, take: 2000 })
      ]);
      return { feeItems, invoices, payments, reversals, terms, classes, students };
    });
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, async (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      switch (input.action) {
        case "feeItem": return await createFeeItem(tx, { ...common, ...input });
        case "invoice": return await generateInvoice(tx, { ...common, ...input });
        case "payment": return await recordPayment(tx, { ...common, ...input });
        case "reversal": return await reversePayment(tx, { ...common, ...input });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
