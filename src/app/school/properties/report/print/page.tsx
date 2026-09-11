import Link from "next/link";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import OperationsPrintActions from "@/components/OperationsPrintActions";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { schoolPropertyExportRows, schoolPropertyMovementExportRows } from "@/lib/school-properties-service";
import "./property-report-print.css";

const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 });
const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" });

export default async function PropertyReportPrintPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, register, movements] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      schoolPropertyExportRows(tx, session.schoolId, session.userId),
      schoolPropertyMovementExportRows(tx, session.schoolId, session.userId),
    ]);
    return { school, register, movements };
  });
  if (!data.school) return null;
  const activeUnits = data.register.filter((row) => !["destroyed","disposed"].includes(String(row.status))).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const attentionUnits = data.register.filter((row) => ["damaged","maintenance"].includes(String(row.condition)) || ["maintenance","lost"].includes(String(row.status))).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const totalValue = data.register.filter((row) => !["destroyed","disposed"].includes(String(row.status))).reduce((sum, row) => sum + Number(row.quantity ?? 0) * Number(row.unitValue ?? 0), 0);
  const locations = new Set(data.register.map((row) => String(row.locationCode || "")).filter(Boolean)).size;

  return <main className="property-report-print-page">
    <div className="property-report-toolbar"><Link href="/school/properties"><ArrowLeft size={15}/>Back to School Properties</Link><OperationsPrintActions/></div>
    <article className="property-report-sheet">
      <header><div className="property-report-brand">{data.school.logoUrl ? <img src={data.school.logoUrl} alt=""/> : <span>{data.school.name.split(/\s+/).map((part)=>part[0]).slice(0,2).join("").toUpperCase()}</span>}<div><small>SUKUUNOVA PROPERTY CONTROL</small><h1>{data.school.name}</h1><p>School Property Register · {data.school.uniqueCode}</p></div></div><div className="property-report-generated"><Building2 size={18}/><span><small>Generated</small><strong>{when.format(new Date())}</strong></span></div></header>
      <section className="property-report-summary"><div><small>Locations represented</small><strong>{locations}</strong></div><div><small>Active units</small><strong>{activeUnits.toLocaleString()}</strong></div><div><small>Needs attention</small><strong>{attentionUnits.toLocaleString()}</strong></div><div><small>Estimated value</small><strong>{money.format(totalValue)}</strong></div></section>
      <section className="property-report-section"><div className="property-report-section-head"><div><span>REGISTER</span><h2>Property by location</h2></div><small>{data.register.length} holding records</small></div><div className="property-report-table"><table><thead><tr><th>Item</th><th>Location</th><th>Qty</th><th>Condition / status</th><th>Serial / custodian</th><th>Unit value</th></tr></thead><tbody>{data.register.map((row, index) => <tr key={`${String(row.itemCode)}-${String(row.locationCode)}-${index}`}><td><strong>{String(row.itemName)}</strong><small>{String(row.itemCode)}{row.category ? ` · ${String(row.category)}` : ""}</small></td><td><strong>{String(row.locationName)}</strong><small>{String(row.locationCode)} · {String(row.locationType)}</small></td><td>{String(row.quantity)} {String(row.unit)}</td><td><strong>{String(row.condition)}</strong><small>{String(row.status)}</small></td><td><strong>{row.serialNumber ? String(row.serialNumber) : "—"}</strong><small>{row.custodian ? String(row.custodian) : "No named custodian"}</small></td><td>{row.unitValue === null ? "—" : money.format(Number(row.unitValue))}</td></tr>)}</tbody></table></div></section>
      <section className="property-report-section"><div className="property-report-section-head"><div><span>RECENT MOVEMENT</span><h2>Latest property events</h2></div><small>Showing {Math.min(data.movements.length,50)} latest entries</small></div><div className="property-report-table"><table><thead><tr><th>Date</th><th>Item</th><th>Action</th><th>From / to</th><th>Reason</th><th>Recorded by</th></tr></thead><tbody>{data.movements.slice(0,50).map((row,index)=><tr key={`${String(row.itemCode)}-${String(row.createdAt)}-${index}`}><td>{when.format(new Date(String(row.createdAt)))}</td><td><strong>{String(row.itemName)}</strong><small>{String(row.itemCode)} · {String(row.quantity)}</small></td><td>{String(row.action)}</td><td>{row.fromLocation ? String(row.fromLocation) : "—"} {row.toLocation && row.fromLocation ? "→" : ""} {row.toLocation ? String(row.toLocation) : ""}</td><td><strong>{String(row.reason)}</strong><small>{row.reference ? String(row.reference) : "No reference"}</small></td><td>{row.recordedBy ? String(row.recordedBy) : "School account"}</td></tr>)}</tbody></table></div></section>
      <footer><span><ShieldCheck size={14}/>Tenant-scoped school property record generated by SukuuNova.</span><small>Movement history supports custody, maintenance, loss and disposal accountability.</small></footer>
    </article>
  </main>;
}
