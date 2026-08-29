import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/platform-auth";
import { withPlatformDb } from "@/lib/platform-db";

export default async function PlatformSchool360Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformSession();
  const { id } = await params;
  const data = await withPlatformDb(async (db) => {
    const school = await db.school.findUnique({ where: { id }, include: { subscriptionPlan: true, settings: true } });
    if (!school) return null;
    const [students, users, classes, subjects, invoices, payments, audits] = await Promise.all([
      db.student.count({ where: { schoolId: id } }),
      db.user.count({ where: { schoolId: id } }),
      db.class.count({ where: { schoolId: id } }),
      db.subject.count({ where: { schoolId: id } }),
      db.invoice.findMany({ where: { schoolId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, totalAmount: true, status: true, createdAt: true, student: { select: { name: true } } } }),
      db.payment.findMany({ where: { schoolId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, amount: true, method: true, reference: true, createdAt: true } }),
      db.auditLogPlatform.findMany({ where: { targetSchoolId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, actorId: true, action: true, targetEntity: true, createdAt: true } })
    ]);
    return { school, students, users, classes, subjects, invoices, payments, audits };
  });
  if (!data) notFound();
  const unpaid = data.invoices.filter((invoice) => invoice.status !== "paid").length;
  const collected = data.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  return <AppShell universe="platform" title={data.school.name} subtitle="One place to understand this school’s account, people, learning setup, commercial state and recent platform activity." active="Schools">
    <div className="app-banner"><div><h3>{data.school.name}</h3><p>{data.school.uniqueCode} · {data.school.status} · {data.school.subscriptionPlan?.name ?? "No plan assigned"}</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="app-pill" href="/platform/schools">Back to schools</Link><Link className="app-action" href={`/platform/support?schoolId=${encodeURIComponent(id)}`}><strong>Support</strong>Open school support</Link></div></div>
    <div className="app-grid kpis">
      <div className="app-card app-kpi"><span className="app-kpi-label">Students</span><div className="app-kpi-value">{data.students}</div><div className="app-kpi-meta">Learners in this school</div></div>
      <div className="app-card app-kpi"><span className="app-kpi-label">Accounts</span><div className="app-kpi-value">{data.users}</div><div className="app-kpi-meta">School user accounts</div></div>
      <div className="app-card app-kpi"><span className="app-kpi-label">Academic groups</span><div className="app-kpi-value">{data.classes}</div><div className="app-kpi-meta">Classes configured</div></div>
      <div className="app-card app-kpi"><span className="app-kpi-label">Collected</span><div className="app-kpi-value">₵{collected.toLocaleString()}</div><div className="app-kpi-meta">Recent recorded payments</div></div>
    </div>
    <div className="app-dashboard-grid">
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>School posture</h2><p>Quick signals for platform support.</p></div></div><div className="app-list-row"><div><b>Plan</b><span>{data.school.subscriptionPlan?.name ?? "No plan"}</span></div><span className="app-pill">{data.school.status}</span></div><div className="app-list-row"><div><b>Subjects</b><span>{data.subjects} configured</span></div></div><div className="app-list-row"><div><b>Invoices needing attention</b><span>{unpaid}</span></div><span className="app-pill">Finance</span></div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Commercial activity</h2><p>Recent invoices and collection activity.</p></div></div>{data.invoices.slice(0,8).map((invoice)=><div className="app-list-row" key={invoice.id}><div><b>{invoice.student.name}</b><span>₵{Number(invoice.totalAmount).toLocaleString()} · {invoice.status}</span></div><small>{new Date(invoice.createdAt).toLocaleDateString()}</small></div>)}{data.invoices.length===0&&<p>No invoices have been recorded yet.</p>}</section>
    </div>
    <section className="app-card app-panel"><div className="app-card-head"><div><h2>Recent platform activity</h2><p>Support and control actions involving this school.</p></div></div>{data.audits.length===0?<p>No platform audit events are recorded for this school yet.</p>:data.audits.map((event)=><div className="app-list-row" key={event.id}><div><b>{event.action}</b><span>{event.targetEntity ?? "School"} · actor {event.actorId}</span></div><small>{new Date(event.createdAt).toLocaleString()}</small></div>)}</section>
  </AppShell>;
}
