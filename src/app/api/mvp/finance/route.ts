import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cacheTenantRead } from "@/lib/server-cache";
import {
  createFeeItem,
  decideFinanceAdjustment,
  generateInvoice,
  listFinanceAdjustments,
  recordPayment,
  requestFinanceAdjustment,
  reversePayment,
} from "@/lib/finance-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("feeItem"), termId: z.string().min(1).max(100), classId: z.string().min(1).max(100).optional(), name: z.string().trim().min(1).max(160), amount: z.number().finite().positive().max(1_000_000_000) }),
  z.object({ action: z.literal("invoice"), studentId: z.string().min(1).max(100), termId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("payment"), invoiceId: z.string().min(1).max(100), amount: z.number().finite().positive().max(1_000_000_000), method: z.enum(["momo", "cash", "card", "bank", "cheque"]), reference: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("reversal"), paymentId: z.string().min(1).max(100), amount: z.number().finite().positive().max(1_000_000_000), reason: z.string().trim().min(2).max(500), idempotencyKey: z.string().trim().min(8).max(100).optional() }),
  z.object({
    action: z.literal("adjustmentRequest"),
    studentId: z.string().min(1).max(100),
    invoiceId: z.string().min(1).max(100).optional(),
    termId: z.string().min(1).max(100).optional(),
    kind: z.enum(["waiver", "scholarship", "sibling_discount"]),
    mode: z.enum(["amount", "percent"]),
    value: z.number().finite().positive().max(1_000_000_000),
    reason: z.string().trim().min(2).max(500),
    siblingGroupKey: z.string().trim().min(1).max(120).optional(),
    fundingSource: z.string().trim().min(2).max(200).optional(),
    fundingReference: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({ action: z.literal("adjustmentDecision"), adjustmentId: z.string().min(1).max(100), decision: z.enum(["approve", "reject"]) }),
]);

type InvoiceProjectionRow = {
  id: string;
  classId: string | null;
  className: string | null;
  grossAmount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  status: string;
};

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const permissions = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "finance:read");
      const [canWriteFees, canCreateInvoices, canRecordPayments, canReversePayments, canExportFinance, canAdjustFees, canApproveAdjustments] = await Promise.all([
        hasPermission(tx, session.userId, "finance:write"),
        hasPermission(tx, session.userId, "invoices:create"),
        hasPermission(tx, session.userId, "payments:record"),
        hasPermission(tx, session.userId, "payments:reverse"),
        hasPermission(tx, session.userId, "exports:finance"),
        hasPermission(tx, session.userId, "fees:adjust"),
        hasPermission(tx, session.userId, "fees:approve"),
      ]);
      return { canWriteFees, canCreateInvoices, canRecordPayments, canReversePayments, canExportFinance, canAdjustFees, canApproveAdjustments };
    });

    const data = await cacheTenantRead(
      ["finance", "workspace-v5", session.schoolId],
      () => withTenant(session.schoolId, async (tx) => {
        const [feeItems, invoices, payments, reversals, terms, classes, students, adjustments, projections] = await Promise.all([
          tx.feeItem.findMany({
            include: {
              term: { select: { id: true, name: true, academicYear: { select: { name: true } } } },
              class: { select: { id: true, name: true } },
            },
            orderBy: [{ term: { startDate: "desc" } }, { name: "asc" }],
            take: 1000,
          }),
          tx.invoice.findMany({
            include: {
              student: { select: { id: true, name: true, admissionNo: true, class: { select: { id: true, name: true } } } },
              term: { select: { id: true, name: true, academicYear: { select: { name: true } } } },
              lines: { include: { feeItem: { select: { id: true, name: true } } } },
            },
            orderBy: { createdAt: "desc" },
            take: 1500,
          }),
          tx.payment.findMany({
            include: {
              invoice: {
                select: {
                  id: true,
                  totalAmount: true,
                  status: true,
                  student: { select: { id: true, name: true, admissionNo: true, class: { select: { id: true, name: true } } } },
                  term: { select: { id: true, name: true, academicYear: { select: { name: true } } } },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 3000,
          }),
          tx.paymentReversal.findMany({
            select: { id: true, paymentId: true, amount: true, reason: true, reversedBy: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 3000,
          }),
          tx.term.findMany({ include: { academicYear: { select: { name: true } } }, orderBy: { startDate: "desc" }, take: 50 }),
          tx.class.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
          tx.student.findMany({
            where: { status: "active" },
            select: { id: true, name: true, admissionNo: true, classId: true, class: { select: { id: true, name: true } } },
            orderBy: { name: "asc" },
            take: 3000,
          }),
          listFinanceAdjustments(tx, session.schoolId, 1000),
          tx.$queryRawUnsafe<InvoiceProjectionRow[]>(
            `SELECT i."id",i."classId",c."name" AS "className",i."grossAmount",i."adjustmentAmount",i."totalAmount",i."status" FROM "Invoice" i LEFT JOIN "Class" c ON c."id"=i."classId" AND c."schoolId"=i."schoolId" WHERE i."schoolId"=$1 ORDER BY i."createdAt" DESC LIMIT 1500`,
            session.schoolId,
          ),
        ]);

        const projectionByInvoice = new Map(projections.map((row) => [row.id, row]));
        const withHistoricalClass = <T extends { id: string; student?: { class?: { id: string; name: string } | null } | null }>(row: T) => {
          const projection = projectionByInvoice.get(row.id);
          if (!projection) return row;
          return {
            ...row,
            grossAmount: projection.grossAmount,
            adjustmentAmount: projection.adjustmentAmount,
            totalAmount: projection.totalAmount,
            status: projection.status,
            student: row.student ? {
              ...row.student,
              class: projection.classId ? { id: projection.classId, name: projection.className ?? "Historical class" } : row.student.class,
            } : row.student,
          };
        };
        const resolvedInvoices = invoices.map(withHistoricalClass);
        const resolvedPayments = payments.map((payment) => ({
          ...payment,
          invoice: payment.invoice ? withHistoricalClass(payment.invoice) : payment.invoice,
        }));
        return { feeItems, invoices: resolvedInvoices, payments: resolvedPayments, reversals, terms, classes, students, adjustments };
      }),
      15,
      [`finance:${session.schoolId}`]
    );

    return NextResponse.json(
      { ...data, permissions },
      { headers: { "cache-control": "private, max-age=15, stale-while-revalidate=15" } }
    );
  } catch (error) {
    return routeError(error);
  }
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
        case "adjustmentRequest": return await requestFinanceAdjustment(tx, { ...common, ...input });
        case "adjustmentDecision": return await decideFinanceAdjustment(tx, { ...common, adjustmentId: input.adjustmentId, decision: input.decision });
      }
    });
    revalidatePath("/school/fees");
    revalidatePath("/school/fees/overview");
    revalidatePath("/school/fees/invoices");
    revalidatePath("/school/fees/payments");
    revalidatePath("/school/fees/arrears");
    revalidatePath("/school/fees/reports");
    revalidatePath("/guardian");
    revalidatePath("/guardian/fees");
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
