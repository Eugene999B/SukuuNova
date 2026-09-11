import Link from "next/link";
import { ArrowLeft, CheckCircle2, ReceiptText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import OperationsPrintActions from "@/components/OperationsPrintActions";
import { requireSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { schoolStoreSaleDetail } from "@/lib/school-store-service";
import "./store-receipt.css";

const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("en-GH", { dateStyle: "long", timeStyle: "short" });

type ReceiptLine = {
  id: unknown;
  productName: unknown;
  variantLabel: unknown;
  sku: unknown;
  quantity: unknown;
  unitPrice: number;
  lineTotal: number;
};

export default async function StoreReceiptPage({ params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params;
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, access, receipt] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      getSchoolAuthorization(tx, session.userId),
      schoolStoreSaleDetail(tx, session.schoolId, session.userId, saleId),
    ]);
    return { school, role: access.roles.map((role) => role.name).join(" · ") || "School account", ...receipt };
  });
  if (!data.school) return null;
  const sale = data.sale as Record<string, unknown>;
  const lines = data.lines as ReceiptLine[];
  const createdAt = new Date(String(sale.createdAt));
  return <AppShell universe="school" title="Store Receipt" subtitle="Official school store transaction." active="School Store" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name} role={data.role}>
    <div className="store-receipt-page">
      <div className="store-receipt-toolbar"><Link href="/school/store"><ArrowLeft size={15}/>Back to School Store</Link><OperationsPrintActions/></div>
      <article className="store-receipt-sheet">
        <header className="store-receipt-head"><div className="store-receipt-brand">{data.school.logoUrl ? <img src={data.school.logoUrl} alt=""/> : <span>{data.school.name.split(/\s+/).map((part)=>part[0]).slice(0,2).join("").toUpperCase()}</span>}<div><small>OFFICIAL SCHOOL STORE RECEIPT</small><h1>{data.school.name}</h1><p>School code: {data.school.uniqueCode}</p></div></div><div className="store-receipt-number"><ReceiptText size={18}/><span><small>Receipt number</small><strong>{String(sale.receiptNo)}</strong></span></div></header>
        <section className="store-receipt-meta"><div><small>Customer</small><strong>{String(sale.customerName)}</strong><span>{String(sale.customerType)}{sale.customerPhone ? ` · ${String(sale.customerPhone)}` : ""}</span></div><div><small>Payment</small><strong>{String(sale.paymentMethod)}</strong><span>{sale.paymentReference ? String(sale.paymentReference) : "No external reference"}</span></div><div><small>Date</small><strong>{dateTime.format(createdAt)}</strong><span>Processed by {String(sale.cashierName ?? "School account")}</span></div></section>
        <section className="store-receipt-lines"><table><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{lines.map((line) => <tr key={String(line.id)}><td><strong>{String(line.productName)}</strong>{line.variantLabel ? <small>{String(line.variantLabel)}</small> : null}</td><td>{String(line.sku)}</td><td>{String(line.quantity)}</td><td>{money.format(Number(line.unitPrice))}</td><td>{money.format(Number(line.lineTotal))}</td></tr>)}</tbody></table></section>
        <section className="store-receipt-totals"><div><span>Subtotal</span><b>{money.format(Number(sale.subtotal))}</b></div><div><span>Discount</span><b>− {money.format(Number(sale.discount))}</b></div><div className="grand"><span>Amount paid</span><strong>{money.format(Number(sale.total))}</strong></div></section>
        {String(sale.status) === "void" ? <section className="store-receipt-void"><ShieldCheck size={18}/><div><strong>VOID TRANSACTION</strong><p>{String(sale.voidReason || "This transaction was voided.")}</p><small>{sale.voidedAt ? `Voided ${dateTime.format(new Date(String(sale.voidedAt)))}` : ""}{sale.voidedByName ? ` · ${String(sale.voidedByName)}` : ""}</small></div></section> : <section className="store-receipt-confirm"><CheckCircle2 size={18}/><div><strong>Payment recorded</strong><p>Stock was deducted at the time this receipt was created. This receipt remains linked to the school’s auditable sales history.</p></div></section>}
        <footer><span><ShieldCheck size={14}/>Generated from SukuuNova School Store</span><small>Keep this receipt for returns, reconciliation and school records.</small></footer>
      </article>
    </div>
  </AppShell>;
}
