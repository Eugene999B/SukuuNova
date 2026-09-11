import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ArrowLeft, CheckCircle2, ReceiptText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import GuardianReceiptPrintButton from "@/components/GuardianReceiptPrintButton";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import "./finance-receipt.css";

type Props = { params: Promise<{ paymentId: string }> };
type ReceiptRow = {
  id: string;
  invoiceId: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  className: string | null;
  termName: string;
  invoiceTotal: Prisma.Decimal;
  invoiceStatus: string;
  amount: Prisma.Decimal;
  method: string;
  reference: string | null;
  createdAt: Date;
};
type LineRow = { feeItemId: string; name: string; amount: Prisma.Decimal };
type ReversalRow = { id: string; amount: Prisma.Decimal; reason: string; createdAt: Date };
type SumRow = { total: Prisma.Decimal | null };

const zero = () => new Prisma.Decimal(0);
const nonNegative = (value: Prisma.Decimal) => (value.lt(0) ? zero() : value);
const money = (value: Prisma.Decimal) => `GH₵ ${value.toFixed(2)}`;
const dateTime = (value: Date) =>
  new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(value);
const methodLabel = (value: string) =>
  value === "momo"
    ? "Mobile Money"
    : value === "card"
      ? "Card / Bank"
      : value === "cash"
        ? "Cash"
        : value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const shortId = (value: string) => value.slice(-10).toUpperCase();

export default async function SchoolFinanceReceiptPage({ params }: Props) {
  const session = await requireSchoolSession();
  const paymentId = (await params).paymentId;

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "finance:read");

    const rows = await tx.$queryRawUnsafe<ReceiptRow[]>(
      `SELECT p."id",p."invoiceId",i."studentId",s."name" AS "studentName",s."admissionNo",c."name" AS "className",t."name" AS "termName",i."totalAmount" AS "invoiceTotal",i."status" AS "invoiceStatus",p."amount",p."method",p."reference",p."createdAt"
       FROM "Payment" p
       INNER JOIN "Invoice" i ON i."id"=p."invoiceId" AND i."schoolId"=p."schoolId"
       INNER JOIN "Student" s ON s."id"=i."studentId" AND s."schoolId"=i."schoolId"
       LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId"
       INNER JOIN "Term" t ON t."id"=i."termId" AND t."schoolId"=i."schoolId"
       WHERE p."schoolId"=$1 AND p."id"=$2 LIMIT 1`,
      session.schoolId,
      paymentId,
    );
    const receipt = rows[0];
    if (!receipt) return null;

    const [school, lines, reversals, paymentTotal, reversalTotal] = await Promise.all([
      tx.school.findUnique({
        where: { id: session.schoolId },
        select: { name: true, uniqueCode: true, logoUrl: true },
      }),
      tx.$queryRawUnsafe<LineRow[]>(
        `SELECT il."feeItemId",fi."name",il."amount"
         FROM "InvoiceLine" il
         INNER JOIN "FeeItem" fi ON fi."id"=il."feeItemId" AND fi."schoolId"=il."schoolId"
         WHERE il."schoolId"=$1 AND il."invoiceId"=$2 ORDER BY fi."name"`,
        session.schoolId,
        receipt.invoiceId,
      ),
      tx.$queryRawUnsafe<ReversalRow[]>(
        `SELECT r."id",r."amount",r."reason",r."createdAt"
         FROM "PaymentReversal" r
         WHERE r."schoolId"=$1 AND r."paymentId"=$2 ORDER BY r."createdAt"`,
        session.schoolId,
        receipt.id,
      ),
      tx.$queryRawUnsafe<SumRow[]>(
        `SELECT COALESCE(SUM("amount"),0) AS "total" FROM "Payment" WHERE "schoolId"=$1 AND "invoiceId"=$2`,
        session.schoolId,
        receipt.invoiceId,
      ),
      tx.$queryRawUnsafe<SumRow[]>(
        `SELECT COALESCE(SUM(r."amount"),0) AS "total"
         FROM "PaymentReversal" r
         INNER JOIN "Payment" p ON p."id"=r."paymentId" AND p."schoolId"=r."schoolId"
         WHERE r."schoolId"=$1 AND p."invoiceId"=$2`,
        session.schoolId,
        receipt.invoiceId,
      ),
    ]);

    return {
      school,
      receipt,
      lines,
      reversals,
      paymentTotal: paymentTotal[0]?.total ?? zero(),
      reversalTotal: reversalTotal[0]?.total ?? zero(),
    };
  });

  if (!data) notFound();

  const reversed = data.reversals.reduce((sum, row) => sum.plus(row.amount), zero());
  const netTransaction = nonNegative(data.receipt.amount.minus(reversed));
  const invoiceNetPaid = nonNegative(data.paymentTotal.minus(data.reversalTotal));
  const remaining = nonNegative(data.receipt.invoiceTotal.minus(invoiceNetPaid));
  const receiptNo = data.receipt.reference || `SN-${shortId(data.receipt.id)}`;
  const invoiceNo = `INV-${shortId(data.receipt.invoiceId)}`;
  const schoolName = data.school?.name || session.schoolName || "School";
  const fullyPaid = remaining.lte(0);

  return (
    <AppShell
      universe="school"
      title="Payment receipt"
      subtitle="Official finance record generated from the school ledger."
      active="Payments"
      schoolName={schoolName}
      schoolCode={data.school?.uniqueCode || ""}
      userName={session.name}
    >
      <div className="gfr-page">
        <div className="gfr-actions">
          <Link href="/school/fees/payments"><ArrowLeft size={14} />Back to payments</Link>
          <GuardianReceiptPrintButton />
        </div>

        <article className="gfr-paper" aria-label={`Payment receipt ${receiptNo}`}>
          <header className="gfr-document-head">
            <div className="gfr-school-identity">
              <div className="gfr-school-mark">
                {data.school?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.school.logoUrl} alt={`${schoolName} logo`} />
                ) : (
                  <span>{schoolName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div>
                <span className="gfr-brand">OFFICIAL SCHOOL RECEIPT</span>
                <h1>{schoolName}</h1>
                <p>Finance Department · School code {data.school?.uniqueCode || "—"}</p>
              </div>
            </div>
            <div className="gfr-receipt-mark">
              <span className="gfr-document-type">PAYMENT RECEIPT</span>
              <strong>{receiptNo}</strong>
              <span>Issued {dateTime(data.receipt.createdAt)}</span>
            </div>
          </header>

          <section className="gfr-status-row">
            <div className="gfr-status-seal">
              <CheckCircle2 size={20} />
              <span><b>PAYMENT RECORDED</b><small>Verified in the school finance ledger</small></span>
            </div>
            <div className="gfr-paid-hero">
              <span>Net amount received</span>
              <strong>{money(netTransaction)}</strong>
              <small>
                {reversed.gt(0)
                  ? `${money(reversed)} reversed from the original ${money(data.receipt.amount)} payment`
                  : `Original transaction ${money(data.receipt.amount)}`}
              </small>
            </div>
          </section>

          <section className="gfr-party-grid">
            <div><span>Received for</span><strong>{data.receipt.studentName}</strong><p>{data.receipt.admissionNo}{data.receipt.className ? ` · ${data.receipt.className}` : ""}</p></div>
            <div><span>Academic term</span><strong>{data.receipt.termName}</strong><p>{invoiceNo}</p></div>
            <div><span>Payment method</span><strong>{methodLabel(data.receipt.method)}</strong><p>Reference: {receiptNo}</p></div>
            <div><span>Transaction date</span><strong>{dateTime(data.receipt.createdAt)}</strong><p>Ledger record {shortId(data.receipt.id)}</p></div>
          </section>

          <section className="gfr-finance-summary">
            <div><span>This payment</span><strong>{money(data.receipt.amount)}</strong></div>
            <div><span>Reversed</span><strong>{money(reversed)}</strong></div>
            <div><span>Net receipt value</span><strong>{money(netTransaction)}</strong></div>
            <div className={fullyPaid ? "settled" : "balance-due"}><span>Invoice balance</span><strong>{money(remaining)}</strong></div>
          </section>

          <section className="gfr-fees">
            <div className="gfr-section-title"><div><span>INVOICE BREAKDOWN</span><h2>Charges covered by this invoice</h2></div><b>{invoiceNo}</b></div>
            <div className="gfr-fee-head"><span>Description</span><span>Amount</span></div>
            {data.lines.map((line) => <div className="gfr-fee-row" key={line.feeItemId}><span>{line.name}</span><strong>{money(line.amount)}</strong></div>)}
            <div className="gfr-fee-row total"><span>Invoice total</span><strong>{money(data.receipt.invoiceTotal)}</strong></div>
            <div className="gfr-fee-row paid"><span>Total net payments received</span><strong>{money(invoiceNetPaid)}</strong></div>
            <div className="gfr-fee-row balance"><span>Outstanding balance</span><strong>{money(remaining)}</strong></div>
          </section>

          <section className={`gfr-settlement ${fullyPaid ? "paid" : "open"}`}>
            <CheckCircle2 size={20} />
            <div>
              <strong>{fullyPaid ? "Invoice fully settled" : "Payment accepted — balance remains"}</strong>
              <p>{fullyPaid ? "No outstanding amount remains on this invoice after recorded payments and reversals." : `${money(remaining)} remains outstanding on ${invoiceNo}.`}</p>
            </div>
          </section>

          {data.reversals.length ? (
            <section className="gfr-reversals">
              <div className="gfr-section-title"><div><span>AUDIT ADJUSTMENTS</span><h2>Payment reversal history</h2></div><b>{data.reversals.length} record{data.reversals.length === 1 ? "" : "s"}</b></div>
              {data.reversals.map((row) => <div key={row.id}><strong>-{money(row.amount)}</strong><span>{row.reason}</span><small>{dateTime(row.createdAt)}</small></div>)}
            </section>
          ) : null}

          <section className="gfr-verification">
            <ShieldCheck size={20} />
            <div>
              <strong>Protected and auditable</strong>
              <p>This receipt is rendered directly from this school&apos;s tenant-scoped finance ledger. Reversals remain separate audit records and the original payment is never silently rewritten.</p>
            </div>
            <div><span>Receipt record</span><b>{shortId(data.receipt.id)}</b><span>Invoice record</span><b>{shortId(data.receipt.invoiceId)}</b></div>
          </section>

          <footer className="gfr-footer">
            <div><ReceiptText size={15} /><span>{schoolName} · Official payment receipt</span></div>
            <p>Print or save this receipt as PDF for reconciliation, filing or family support. Quote <b>{receiptNo}</b> when tracing this payment.</p>
          </footer>
        </article>
      </div>
    </AppShell>
  );
}
