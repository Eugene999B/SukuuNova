import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ArrowLeft, CheckCircle2, ReceiptText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import GuardianReceiptPrintButton from "@/components/GuardianReceiptPrintButton";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import "./guardian-receipt.css";

type Props={params:Promise<{paymentId:string}>};
type ReceiptRow={id:string;invoiceId:string;studentId:string;studentName:string;admissionNo:string;className:string|null;termName:string;invoiceTotal:Prisma.Decimal;invoiceStatus:string;amount:Prisma.Decimal;method:string;reference:string|null;createdAt:Date};
type LineRow={feeItemId:string;name:string;amount:Prisma.Decimal};
type ReversalRow={id:string;amount:Prisma.Decimal;reason:string;createdAt:Date};
type SumRow={total:Prisma.Decimal|null};

const zero=()=>new Prisma.Decimal(0);
const nonNegative=(value:Prisma.Decimal)=>value.lt(0)?zero():value;
const money=(value:Prisma.Decimal)=>`GH₵${value.toFixed(2)}`;
const dateTime=(value:Date)=>new Intl.DateTimeFormat("en-GH",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Accra"}).format(value);
const methodLabel=(value:string)=>value==="momo"?"Mobile money":value==="card"?"Card / bank":value==="cash"?"Cash":value.replaceAll("_"," ");

export default async function GuardianReceiptPage({params}:Props){
  const session=await requireGuardianSession();
  if(session.needsPasswordChange)redirect("/account/security?required=1");
  const paymentId=(await params).paymentId;
  const data=await withTenant(session.schoolId,async(tx)=>{
    const rows=await tx.$queryRawUnsafe<ReceiptRow[]>(`SELECT p."id",p."invoiceId",i."studentId",s."name" AS "studentName",s."admissionNo",c."name" AS "className",t."name" AS "termName",i."totalAmount" AS "invoiceTotal",i."status" AS "invoiceStatus",p."amount",p."method",p."reference",p."createdAt" FROM "Payment" p INNER JOIN "Invoice" i ON i."id"=p."invoiceId" AND i."schoolId"=p."schoolId" INNER JOIN "Student" s ON s."id"=i."studentId" AND s."schoolId"=i."schoolId" INNER JOIN "StudentGuardian" sg ON sg."studentId"=s."id" AND sg."schoolId"=s."schoolId" LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId" INNER JOIN "Term" t ON t."id"=i."termId" AND t."schoolId"=i."schoolId" WHERE p."schoolId"=$1 AND p."id"=$2 AND sg."guardianId"=$3 LIMIT 1`,session.schoolId,paymentId,session.guardianId);
    const receipt=rows[0];
    if(!receipt)return null;
    const [lines,reversals,paymentTotal,reversalTotal]=await Promise.all([
      tx.$queryRawUnsafe<LineRow[]>(`SELECT il."feeItemId",fi."name",il."amount" FROM "InvoiceLine" il INNER JOIN "FeeItem" fi ON fi."id"=il."feeItemId" AND fi."schoolId"=il."schoolId" WHERE il."schoolId"=$1 AND il."invoiceId"=$2 ORDER BY fi."name"`,session.schoolId,receipt.invoiceId),
      tx.$queryRawUnsafe<ReversalRow[]>(`SELECT r."id",r."amount",r."reason",r."createdAt" FROM "PaymentReversal" r WHERE r."schoolId"=$1 AND r."paymentId"=$2 ORDER BY r."createdAt"`,session.schoolId,receipt.id),
      tx.$queryRawUnsafe<SumRow[]>(`SELECT COALESCE(SUM("amount"),0) AS "total" FROM "Payment" WHERE "schoolId"=$1 AND "invoiceId"=$2`,session.schoolId,receipt.invoiceId),
      tx.$queryRawUnsafe<SumRow[]>(`SELECT COALESCE(SUM(r."amount"),0) AS "total" FROM "PaymentReversal" r INNER JOIN "Payment" p ON p."id"=r."paymentId" AND p."schoolId"=r."schoolId" WHERE r."schoolId"=$1 AND p."invoiceId"=$2`,session.schoolId,receipt.invoiceId),
    ]);
    return {receipt,lines,reversals,paymentTotal:paymentTotal[0]?.total??zero(),reversalTotal:reversalTotal[0]?.total??zero()};
  });
  if(!data)notFound();
  const reversed=data.reversals.reduce((sum,row)=>sum.plus(row.amount),zero());
  const netTransaction=nonNegative(data.receipt.amount.minus(reversed));
  const invoiceNetPaid=nonNegative(data.paymentTotal.minus(data.reversalTotal));
  const remaining=nonNegative(data.receipt.invoiceTotal.minus(invoiceNetPaid));
  const receiptNo=data.receipt.reference||`SN-${data.receipt.id.slice(-10).toUpperCase()}`;

  return <AppShell universe="guardian" title="Payment receipt" subtitle="A protected family payment record." active="Fees & Receipts" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian">
    <div className="gfr-page"><div className="gfr-actions"><Link href={`/guardian/fees?studentId=${encodeURIComponent(data.receipt.studentId)}`}><ArrowLeft size={14}/>Back to fees</Link><GuardianReceiptPrintButton/></div><article className="gfr-paper">
      <header><div><span className="gfr-brand">SUKUUNOVA VERIFIED PAYMENT RECORD</span><h1>{session.schoolName}</h1><p>Family finance receipt</p></div><div className="gfr-receipt-mark"><ReceiptText size={22}/><strong>{receiptNo}</strong><span>{dateTime(data.receipt.createdAt)}</span></div></header>
      <section className="gfr-verified"><ShieldCheck size={18}/><div><strong>Guardian-protected school record</strong><p>This receipt is visible because {data.receipt.studentName} is linked to the signed-in guardian account.</p></div></section>
      <section className="gfr-grid"><div><span>Learner</span><strong>{data.receipt.studentName}</strong><p>{data.receipt.admissionNo} · {data.receipt.className||"Class not set"}</p></div><div><span>Term</span><strong>{data.receipt.termName}</strong><p>Invoice {data.receipt.invoiceId.slice(-10).toUpperCase()}</p></div><div><span>Payment method</span><strong>{methodLabel(data.receipt.method)}</strong><p>Reference {receiptNo}</p></div><div><span>Posted</span><strong>{dateTime(data.receipt.createdAt)}</strong><p>Recorded by the school finance ledger.</p></div></section>
      <section className="gfr-amount"><div><span>Original payment</span><strong>{money(data.receipt.amount)}</strong></div><div><span>Reversed from this payment</span><strong>{money(reversed)}</strong></div><div className="primary"><span>Net value of this receipt</span><strong>{money(netTransaction)}</strong></div></section>
      <section className="gfr-fees"><div className="gfr-section-title"><span>INVOICE BREAKDOWN</span><h2>What this learner was billed for</h2></div>{data.lines.map(line=><div className="gfr-fee-row" key={line.feeItemId}><span>{line.name}</span><strong>{money(line.amount)}</strong></div>)}<div className="gfr-fee-row total"><span>Invoice total</span><strong>{money(data.receipt.invoiceTotal)}</strong></div></section>
      <section className="gfr-balance"><div><span>Total net paid on invoice</span><strong>{money(invoiceNetPaid)}</strong></div><div><span>Remaining invoice balance</span><strong>{money(remaining)}</strong></div><div><CheckCircle2 size={17}/><span>{remaining.lte(0)?"Invoice fully covered":"Payment recorded; balance remains"}</span></div></section>
      {data.reversals.length?<section className="gfr-reversals"><div className="gfr-section-title"><span>REVERSAL HISTORY</span><h2>Audit adjustments to this payment</h2></div>{data.reversals.map(row=><div key={row.id}><strong>-{money(row.amount)}</strong><span>{row.reason}</span><small>{dateTime(row.createdAt)}</small></div>)}</section>:null}
      <footer><p>Generated from SukuuNova’s school finance ledger. A reversal remains a separate auditable record and never silently changes the original payment.</p><span>Receipt ID {data.receipt.id}</span></footer>
    </article></div>
  </AppShell>;
}
