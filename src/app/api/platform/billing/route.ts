import { NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { requirePlatformSession } from "@/lib/auth";
import { routeError } from "@/lib/errors";
import { getPlatformSchoolScope, requirePlatformPermission } from "@/lib/platform-permissions";
import { appendPlatformAudit } from "@/lib/audit";
import { db, withTenant } from "@/lib/db";
import { z } from "zod";

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), schoolId: z.string().min(1), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  z.object({ action: z.literal("record_payment"), schoolId: z.string().min(1), invoiceId: z.string().min(1), amount: z.number().finite().positive(), method: z.string().trim().min(2).max(40), reference: z.string().trim().max(120).optional() }),
]);

async function scopedSchools(session: { adminId: string; role: string }) {
  const rows = session.role === "super_admin"
    ? await db.schoolLoginDirectory.findMany({ where: { status: "active" }, select: { schoolId: true }, orderBy: { createdAt: "desc" } })
    : await db.$queryRawUnsafe<Array<{ schoolId: string }>>(`SELECT d."schoolId" FROM "SchoolLoginDirectory" d INNER JOIN "PlatformAdminSchoolAccess" a ON a."schoolId"=d."schoolId" WHERE d."status"='active' AND a."adminId"=$1 ORDER BY d."createdAt" DESC`, session.adminId);
  return Promise.all(rows.map(({ schoolId }) => withTenant(schoolId, (tx) => tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true, subscriptionPlan: { select: { name: true, price: true } } } })))).then((schools) => schools.filter(Boolean));
}

export async function GET() {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "billing.view");
    const schools = await scopedSchools(session);
    const summaries = await Promise.all(schools.map(async (school) => {
      if (!school) return null;
      const [invoices, payments] = await withTenant(school.id, (tx) => Promise.all([
        tx.$queryRawUnsafe<Array<{ id: string; period: string; amount: string; status: string; createdAt: string }>>(`SELECT "id","period","amount"::text,"status","createdAt" FROM "PlatformInvoice" WHERE "schoolId"=$1 ORDER BY "period" DESC`, school.id),
        tx.$queryRawUnsafe<Array<{ id: string; platformInvoiceId: string; amount: string; method: string; reference: string|null; createdAt: string }>>(`SELECT "id","platformInvoiceId","amount"::text,"method","reference","createdAt" FROM "PlatformPayment" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC`, school.id),
      ]));
      const paidByInvoice = new Map<string, number>();
      for (const payment of payments) paidByInvoice.set(payment.platformInvoiceId, (paidByInvoice.get(payment.platformInvoiceId) ?? 0) + Number(payment.amount));
      const normalizedInvoices = invoices.map((invoice) => {
        const due = Number(invoice.amount);
        const paid = paidByInvoice.get(invoice.id) ?? 0;
        return { ...invoice, amount: due, paid, outstanding: Math.max(0, due - paid), overpaid: Math.max(0, paid - due), effectiveStatus: paid >= due ? "paid" : invoice.status };
      });
      return { school, invoices: normalizedInvoices, payments, totals: { invoiced: normalizedInvoices.reduce((n, i) => n + i.amount, 0), paid: normalizedInvoices.reduce((n, i) => n + i.paid, 0), outstanding: normalizedInvoices.reduce((n, i) => n + i.outstanding, 0), overpaid: normalizedInvoices.reduce((n, i) => n + i.overpaid, 0) } };
    }));
    return NextResponse.json({ schools: summaries.filter(Boolean) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    const input = postSchema.parse(await request.json());
    await requirePlatformPermission(session, "billing.manage");
    const schoolScope = await getPlatformSchoolScope(session);
    if (schoolScope !== null && !schoolScope.includes(input.schoolId)) return NextResponse.json({ error: "FORBIDDEN", message: "This worker is not assigned to manage this school." }, { status: 403 });

    if (input.action === "generate") {
      const result = await withTenant(input.schoolId, async (tx) => {
        const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { subscriptionPlan: { select: { name: true, price: true } } } });
        if (!school?.subscriptionPlan) return null;

        let invoice = (await tx.$queryRawUnsafe<Array<{ id: string; amount: string; status: string }>>(
          `INSERT INTO "PlatformInvoice" ("id","schoolId","period","amount","status") VALUES ($1,$2,$3,$4,'unpaid') ON CONFLICT ("schoolId","period") DO NOTHING RETURNING "id","amount"::text,"status"`,
          createId(), input.schoolId, input.period, Number(school.subscriptionPlan.price),
        ))[0];
        const existing = !invoice;
        invoice = invoice ?? (await tx.$queryRawUnsafe<Array<{ id: string; amount: string; status: string }>>(
          `SELECT "id","amount"::text,"status" FROM "PlatformInvoice" WHERE "schoolId"=$1 AND "period"=$2 LIMIT 1`,
          input.schoolId, input.period,
        ))[0];
        if (!invoice) throw new Error("Invoice generation did not create or locate an invoice.");

        const payments = (await tx.$queryRawUnsafe<Array<{ paid: string }>>(
          `SELECT COALESCE(SUM("amount"),0)::text paid FROM "PlatformPayment" WHERE "schoolId"=$1 AND "platformInvoiceId"=$2`,
          input.schoolId, invoice.id,
        ))[0];
        return { id: invoice.id, period: input.period, amount: Number(invoice.amount), planName: school.subscriptionPlan.name, status: invoice.status, existing, paid: Number(payments?.paid ?? 0) };
      });
      if (!result) return NextResponse.json({ error: "PLAN_REQUIRED", message: "Assign a subscription plan before generating an invoice." }, { status: 409 });
      await appendPlatformAudit({ actorId: session.adminId, action: result.existing ? "platform.billing.invoice_already_exists" : "platform.billing.invoice_generated", targetSchoolId: input.schoolId, targetEntity: `PlatformInvoice:${result.id}`, meta: result });
      return NextResponse.json({ ok: true, invoice: result, idempotent: result.existing });
    }

    const result = await withTenant(input.schoolId, async (tx) => {
      const invoice = (await tx.$queryRawUnsafe<Array<{ id: string; amount: string }>>(`SELECT "id","amount"::text FROM "PlatformInvoice" WHERE "id"=$1 AND "schoolId"=$2 FOR UPDATE`, input.invoiceId, input.schoolId))[0];
      if (!invoice) return null;
      if (input.reference) {
        const existing = (await tx.$queryRawUnsafe<Array<{ id: string; platformInvoiceId: string; amount: string; method: string }>>(
          `SELECT "id","platformInvoiceId","amount"::text,"method" FROM "PlatformPayment" WHERE "schoolId"=$1 AND "reference"=$2 LIMIT 1`,
          input.schoolId, input.reference,
        ))[0];
        if (existing) {
          if (existing.platformInvoiceId !== input.invoiceId) return { duplicateReference: true } as const;
          const paid = Number((await tx.$queryRawUnsafe<Array<{ paid: string }>>(
            `SELECT COALESCE(SUM("amount"),0)::text paid FROM "PlatformPayment" WHERE "schoolId"=$1 AND "platformInvoiceId"=$2`, input.schoolId, input.invoiceId,
          ))[0]?.paid ?? 0);
          const due = Number(invoice.amount);
          const status = paid >= due ? "paid" : "unpaid";
          return { paymentId: existing.id, invoiceId: input.invoiceId, due, paid, outstanding: Math.max(0, due - paid), overpaid: Math.max(0, paid - due), status, method: existing.method, idempotent: true } as const;
        }
      }
      const paymentId = createId();
      await tx.$executeRawUnsafe(`INSERT INTO "PlatformPayment" ("id","schoolId","platformInvoiceId","amount","method","reference","reconciledBy") VALUES ($1,$2,$3,$4,$5,$6,$7)`, paymentId, input.schoolId, input.invoiceId, input.amount, input.method, input.reference ?? null, session.adminId);
      const paid = Number((await tx.$queryRawUnsafe<Array<{ paid: string }>>(`SELECT COALESCE(SUM("amount"),0)::text paid FROM "PlatformPayment" WHERE "schoolId"=$1 AND "platformInvoiceId"=$2`, input.schoolId, input.invoiceId))[0]?.paid ?? 0);
      const due = Number(invoice.amount);
      const status = paid >= due ? "paid" : "unpaid";
      await tx.$executeRawUnsafe(`UPDATE "PlatformInvoice" SET "status"=$1 WHERE "id"=$2 AND "schoolId"=$3`, status, input.invoiceId, input.schoolId);
      return { paymentId, invoiceId: input.invoiceId, due, paid, outstanding: Math.max(0, due - paid), overpaid: Math.max(0, paid - due), status } as const;
    });
    if (!result) return NextResponse.json({ error: "NOT_FOUND", message: "Platform invoice not found." }, { status: 404 });
    if ("duplicateReference" in result) return NextResponse.json({ error: "DUPLICATE_REFERENCE", message: "That payment reference is already recorded for another invoice in this school." }, { status: 409 });
    if ("idempotent" in result) return NextResponse.json({ ok: true, reconciliation: result, idempotent: true });
    await appendPlatformAudit({ actorId: session.adminId, action: "platform.billing.payment_recorded", targetSchoolId: input.schoolId, targetEntity: `PlatformInvoice:${input.invoiceId}`, meta: { ...result, method: input.method } });
    return NextResponse.json({ ok: true, reconciliation: result });
  } catch (error) { return routeError(error); }
}
