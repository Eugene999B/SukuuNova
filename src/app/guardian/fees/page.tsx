import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { Banknote, CheckCircle2, CircleDollarSign, CreditCard, FileText, ReceiptText, TrendingUp, UsersRound, WalletCards } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { getGuardianFamilyContext } from "@/lib/guardian-family-context";
import "./guardian-fees-v2.css";

type Props = { searchParams: Promise<{ studentId?: string }> };
type Learner = { id:string; name:string; admissionNo:string; photoUrl:string|null; className:string|null };
type Invoice = { id:string; studentId:string; termName:string; totalAmount:Prisma.Decimal; status:string; createdAt:Date };
type Line = { invoiceId:string; feeItemId:string; name:string; amount:Prisma.Decimal };
type Payment = { id:string; invoiceId:string; amount:Prisma.Decimal; method:string; reference:string|null; createdAt:Date };
type Reversal = { id:string; paymentId:string; amount:Prisma.Decimal; reason:string; createdAt:Date };

const zero = () => new Prisma.Decimal(0);
const money = (value:Prisma.Decimal) => `GH₵${value.toFixed(2)}`;
const shortDate = (value:Date) => new Intl.DateTimeFormat("en-GH",{day:"numeric",month:"short",year:"numeric"}).format(value);
const methodLabel = (value:string) => value === "momo" ? "Mobile money" : value === "card" ? "Card / bank" : value === "cash" ? "Cash" : value.replaceAll("_"," ");
const statusLabel = (value:string) => value === "partial" ? "Part paid" : value.charAt(0).toUpperCase()+value.slice(1);

export default async function GuardianFeesPage({ searchParams }:Props) {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const requestedStudentId=(await searchParams).studentId?.trim()||null;

  const data=await withTenant(session.schoolId,async(tx)=>{
    const family=await getGuardianFamilyContext(tx,{schoolId:session.schoolId,guardianId:session.guardianId,userId:session.userId,studentId:requestedStudentId});
    const selectedId=family.selectedChild?.id??null;
    const [learners,invoices,lines,payments,reversals]=await Promise.all([
      tx.$queryRawUnsafe<Learner[]>(`SELECT s."id",s."name",s."admissionNo",s."photoUrl",c."name" AS "className" FROM "Student" s LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId" INNER JOIN "StudentGuardian" sg ON sg."studentId"=s."id" AND sg."schoolId"=s."schoolId" WHERE s."schoolId"=$1 AND sg."guardianId"=$2 AND s."status"='active' AND ($3::text IS NULL OR s."id"=$3) ORDER BY s."name"`,session.schoolId,session.guardianId,selectedId),
      tx.$queryRawUnsafe<Invoice[]>(`SELECT i."id",i."studentId",t."name" AS "termName",i."totalAmount",i."status",i."createdAt" FROM "Invoice" i INNER JOIN "StudentGuardian" sg ON sg."studentId"=i."studentId" AND sg."schoolId"=i."schoolId" INNER JOIN "Term" t ON t."id"=i."termId" AND t."schoolId"=i."schoolId" WHERE i."schoolId"=$1 AND sg."guardianId"=$2 AND ($3::text IS NULL OR i."studentId"=$3) ORDER BY i."createdAt" DESC`,session.schoolId,session.guardianId,selectedId),
      tx.$queryRawUnsafe<Line[]>(`SELECT il."invoiceId",il."feeItemId",fi."name",il."amount" FROM "InvoiceLine" il INNER JOIN "Invoice" i ON i."id"=il."invoiceId" AND i."schoolId"=il."schoolId" INNER JOIN "StudentGuardian" sg ON sg."studentId"=i."studentId" AND sg."schoolId"=i."schoolId" INNER JOIN "FeeItem" fi ON fi."id"=il."feeItemId" AND fi."schoolId"=il."schoolId" WHERE il."schoolId"=$1 AND sg."guardianId"=$2 AND ($3::text IS NULL OR i."studentId"=$3) ORDER BY fi."name"`,session.schoolId,session.guardianId,selectedId),
      tx.$queryRawUnsafe<Payment[]>(`SELECT p."id",p."invoiceId",p."amount",p."method",p."reference",p."createdAt" FROM "Payment" p INNER JOIN "Invoice" i ON i."id"=p."invoiceId" AND i."schoolId"=p."schoolId" INNER JOIN "StudentGuardian" sg ON sg."studentId"=i."studentId" AND sg."schoolId"=i."schoolId" WHERE p."schoolId"=$1 AND sg."guardianId"=$2 AND ($3::text IS NULL OR i."studentId"=$3) ORDER BY p."createdAt" DESC`,session.schoolId,session.guardianId,selectedId),
      tx.$queryRawUnsafe<Reversal[]>(`SELECT r."id",r."paymentId",r."amount",r."reason",r."createdAt" FROM "PaymentReversal" r INNER JOIN "Payment" p ON p."id"=r."paymentId" AND p."schoolId"=r."schoolId" INNER JOIN "Invoice" i ON i."id"=p."invoiceId" AND i."schoolId"=p."schoolId" INNER JOIN "StudentGuardian" sg ON sg."studentId"=i."studentId" AND sg."schoolId"=i."schoolId" WHERE r."schoolId"=$1 AND sg."guardianId"=$2 AND ($3::text IS NULL OR i."studentId"=$3) ORDER BY r."createdAt" DESC`,session.schoolId,session.guardianId,selectedId),
    ]);
    return {family,learners,invoices,lines,payments,reversals};
  });

  const reversalsByPayment=new Map<string,Reversal[]>();
  for(const reversal of data.reversals)reversalsByPayment.set(reversal.paymentId,[...(reversalsByPayment.get(reversal.paymentId)||[]),reversal]);
  const paymentsByInvoice=new Map<string,Payment[]>();
  for(const payment of data.payments)paymentsByInvoice.set(payment.invoiceId,[...(paymentsByInvoice.get(payment.invoiceId)||[]),payment]);
  const linesByInvoice=new Map<string,Line[]>();
  for(const line of data.lines)linesByInvoice.set(line.invoiceId,[...(linesByInvoice.get(line.invoiceId)||[]),line]);
  const netPayment=(payment:Payment)=>payment.amount.minus((reversalsByPayment.get(payment.id)||[]).reduce((sum,row)=>sum.plus(row.amount),zero()));
  const invoicePaid=(invoiceId:string)=>(paymentsByInvoice.get(invoiceId)||[]).reduce((sum,row)=>sum.plus(netPayment(row)),zero());
  const totalBilled=data.invoices.reduce((sum,row)=>sum.plus(row.totalAmount),zero());
  const totalPaid=data.invoices.reduce((sum,row)=>sum.plus(invoicePaid(row.id)),zero());
  const outstanding=Prisma.Decimal.max(zero(),totalBilled.minus(totalPaid));
  const collection=totalBilled.gt(0)?Math.max(0,Math.min(100,Number(totalPaid.div(totalBilled).mul(100).toFixed(0)))):100;
  const paymentTotal=data.payments.reduce((sum,row)=>sum.plus(netPayment(row)),zero());
  const reversedTotal=data.reversals.reduce((sum,row)=>sum.plus(row.amount),zero());

  const learnerSummary=(learner:Learner)=>{
    const invoices=data.invoices.filter(row=>row.studentId===learner.id);
    const billed=invoices.reduce((sum,row)=>sum.plus(row.totalAmount),zero());
    const paid=invoices.reduce((sum,row)=>sum.plus(invoicePaid(row.id)),zero());
    return {invoices,billed,paid,due:Prisma.Decimal.max(zero(),billed.minus(paid)),coverage:billed.gt(0)?Math.max(0,Math.min(100,Number(paid.div(billed).mul(100).toFixed(0)))):100};
  };

  return <AppShell universe="guardian" title="Fees & receipts" subtitle="A complete family finance picture, broken down by learner, invoice, fee item and payment." active="Fees & Receipts" schoolName={session.schoolName} schoolCode="" userName={data.family.guardian.name} role="Guardian">
    <div className="gfi-page">
      <section className="gfi-hero"><div><span>FAMILY FINANCE INTELLIGENCE</span><h1>Know exactly what every cedi is for.</h1><p>Billed fees, net payments, reversals, balances and payment references stay separated by learner so one child’s account never hides another’s.</p></div><div className="gfi-hero-score"><strong>{collection}%</strong><span>family fee coverage</span><i><b style={{width:`${collection}%`}}/></i></div></section>

      {data.family.children.length>1?<nav className="gfi-switcher" aria-label="Choose learner"><Link href="/guardian/fees" className={!data.family.selectedChild?"active":""}><UsersRound size={16}/><span><strong>All children</strong><small>Combined finance view</small></span></Link>{data.family.children.map(child=><Link key={child.id} href={`/guardian/fees?studentId=${encodeURIComponent(child.id)}`} className={data.family.selectedChild?.id===child.id?"active":""}><span className="gfi-mini-avatar">{child.name.slice(0,2).toUpperCase()}</span><span><strong>{child.name}</strong><small>{child.className||"Class not set"}</small></span></Link>)}</nav>:null}

      <section className="gfi-kpis">
        <article><span><ReceiptText size={16}/>Total billed</span><strong>{money(totalBilled)}</strong><p>{data.invoices.length} invoice{data.invoices.length===1?"":"s"} in this view.</p></article>
        <article><span><CircleDollarSign size={16}/>Net paid</span><strong>{money(totalPaid)}</strong><p>{data.payments.length} payment record{data.payments.length===1?"":"s"}, after reversals.</p></article>
        <article className={outstanding.gt(0)?"warning":"good"}><span><WalletCards size={16}/>Outstanding</span><strong>{money(outstanding)}</strong><p>{outstanding.gt(0)?"Balance still due across this learner scope.":"No balance is currently outstanding."}</p></article>
        <article><span><TrendingUp size={16}/>Coverage</span><strong>{collection}%</strong><p>{money(reversedTotal)} reversed · {money(paymentTotal)} net receipts.</p><i><b style={{width:`${collection}%`}}/></i></article>
      </section>

      <section className="gfi-section"><header><div><span>LEARNER ACCOUNTS</span><h2>Breakdown by child</h2><p>Each learner has an independent billed, paid and balance position.</p></div></header><div className="gfi-learners">{data.learners.map(learner=>{const summary=learnerSummary(learner);return <article key={learner.id}><div className="gfi-person"><span>{learner.photoUrl?<Image src={learner.photoUrl} alt="" width={52} height={52} unoptimized/>:learner.name.slice(0,2).toUpperCase()}</span><div><h3>{learner.name}</h3><p>{learner.admissionNo} · {learner.className||"Class not set"}</p></div></div><div className="gfi-learner-money"><div><span>Billed</span><strong>{money(summary.billed)}</strong></div><div><span>Paid</span><strong>{money(summary.paid)}</strong></div><div><span>Due</span><strong>{money(summary.due)}</strong></div></div><div className="gfi-progress"><span><b>{summary.coverage}%</b> covered</span><i><b style={{width:`${summary.coverage}%`}}/></i></div>{!data.family.selectedChild?<Link href={`/guardian/fees?studentId=${encodeURIComponent(learner.id)}`}>Open full account <FileText size={13}/></Link>:null}</article>})}</div></section>

      <section className="gfi-section"><header><div><span>INVOICE INTELLIGENCE</span><h2>What was charged?</h2><p>Every invoice expands into its actual fee items, payments and remaining balance.</p></div></header>{data.invoices.length?<div className="gfi-invoices">{data.invoices.map(invoice=>{const learner=data.learners.find(row=>row.id===invoice.studentId);const rows=linesByInvoice.get(invoice.id)||[];const paid=invoicePaid(invoice.id);const due=Prisma.Decimal.max(zero(),invoice.totalAmount.minus(paid));const coverage=invoice.totalAmount.gt(0)?Math.max(0,Math.min(100,Number(paid.div(invoice.totalAmount).mul(100).toFixed(0)))):100;return <article key={invoice.id} className="gfi-invoice"><div className="gfi-invoice-head"><div><span className={`gfi-status ${due.lte(0)?"paid":paid.gt(0)?"partial":"unpaid"}`}>{due.lte(0)?"Paid":paid.gt(0)?"Part paid":statusLabel(invoice.status)}</span><h3>{learner?.name||"Linked learner"} · {invoice.termName}</h3><p>Issued {shortDate(invoice.createdAt)} · Invoice {invoice.id.slice(-8).toUpperCase()}</p></div><div><strong>{money(due)}</strong><span>remaining</span></div></div><div className="gfi-invoice-progress"><i><b style={{width:`${coverage}%`}}/></i><span>{coverage}% covered</span></div><div className="gfi-lines">{rows.map(line=><div key={line.feeItemId}><span>{line.name}</span><strong>{money(line.amount)}</strong></div>)}<div className="total"><span>Total billed</span><strong>{money(invoice.totalAmount)}</strong></div></div><div className="gfi-invoice-payments">{(paymentsByInvoice.get(invoice.id)||[]).length?(paymentsByInvoice.get(invoice.id)||[]).map(payment=>{const reversed=(reversalsByPayment.get(payment.id)||[]).reduce((sum,row)=>sum.plus(row.amount),zero());return <div key={payment.id}><span className="gfi-payment-icon">{payment.method==="cash"?<Banknote size={15}/>:<CreditCard size={15}/>}</span><div><strong>{money(netPayment(payment))} net payment</strong><p>{methodLabel(payment.method)} · {shortDate(payment.createdAt)} · Ref {payment.reference||payment.id.slice(-8).toUpperCase()}</p>{reversed.gt(0)?<small>{money(reversed)} reversed: {(reversalsByPayment.get(payment.id)||[]).map(row=>row.reason).join(" · ")}</small>:null}</div><CheckCircle2 size={16}/></div>}):<p className="gfi-no-payment">No payment has been posted against this invoice yet.</p>}</div></article>})}</div>:<div className="gfi-empty"><ReceiptText size={28}/><strong>No fee invoices in this learner scope</strong><p>When the school issues fees, the full breakdown will appear here.</p></div>}</section>
    </div>
  </AppShell>;
}
