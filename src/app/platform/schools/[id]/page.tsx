import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PlatformSchoolLifecycle from "@/components/PlatformSchoolLifecycle";
import { requirePlatformSession } from "@/lib/auth";
import { hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import { db, withTenant } from "@/lib/db";
import "@/components/platform-control-plane.css";

export default async function PlatformSchool360Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const { id } = await params;
  await requireSchoolScope(session, id);
  const [canSupport, canBilling, canAudit] = await Promise.all([hasPlatformPermission(session, "support.view"), hasPlatformPermission(session, "billing.view"), hasPlatformPermission(session, "audit.view")]);
  const data = await withTenant(id, async (tx) => {
    const school = await tx.school.findUnique({ where: { id }, select: { id:true,name:true,uniqueCode:true,status:true,createdAt:true,subscriptionPlan:{select:{id:true,name:true,price:true,featureFlags:true}},settings:{select:{timezone:true,gradeCaWeight:true,gradeExamWeight:true}} } });
    if (!school) return null;
    const [students, users, classes, subjects, invoices, payments] = await Promise.all([
      tx.student.count({ where: { status: "active" } }), tx.user.count(), tx.class.count(), tx.subject.count(),
      tx.invoice.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id:true,totalAmount:true,status:true,createdAt:true,student:{select:{name:true}} } }),
      tx.payment.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id:true,amount:true,method:true,reference:true,createdAt:true } }),
    ]);
    const recentMessages = await tx.message.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    const failedMessages = await tx.message.count({ where: { status: "failed", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } });
    return { school, students, users, classes, subjects, invoices, payments, recentMessages, failedMessages };
  });
  if (!data) notFound();
  const audits = canAudit ? await db.$queryRawUnsafe<Array<{ id:string; actorId:string|null; actorName:string|null; actorEmail:string|null; action:string; targetEntity:string|null; createdAt:Date }>>(`SELECT l."id",l."actorId",a."name" AS "actorName",a."email" AS "actorEmail",l."action",l."targetEntity",l."createdAt" FROM "AuditLogPlatform" l LEFT JOIN "PlatformAdmin" a ON a."id"=l."actorId" WHERE l."targetSchoolId"=$1 ORDER BY l."createdAt" DESC LIMIT 40`, id) : [];
  const unpaid = data.invoices.filter((invoice) => invoice.status !== "paid").length;
  const collected = data.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const quickLinks = [
    ["People & records", `/platform/search?q=${encodeURIComponent(data.school.name)}`, "Find people, records and school-scoped entities without leaving the platform shell."],
    ["Finance", `/platform/billing?schoolId=${encodeURIComponent(id)}`, "Review subscription billing, invoice rules and the school financial ledger."],
    ["Activity", `/platform/schools/${id}/activity`, "Investigate the unified tenant and platform activity timeline."],
    ["Security", `/platform/schools/${id}/activity?sensitive=1`, "Inspect sensitive access, security-sensitive and control-plane events."],
    ...(canSupport ? [["Support", `/platform/support?schoolId=${encodeURIComponent(id)}`, "Work the school support queue while retaining school context."]] : []),
  ];
  return <AppShell universe="platform" title={data.school.name} subtitle="School 360 · account, people, finance, support, security and platform activity." active="Schools">
    <div className="app-banner"><div><span className="app-eyebrow">SCHOOL 360</span><h3>{data.school.name}</h3><p>{data.school.uniqueCode} · {data.school.status} · {data.school.subscriptionPlan?.name ?? "No plan assigned"} · created {new Date(data.school.createdAt).toLocaleDateString()}</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="app-pill" href="/platform/schools">Back to schools</Link>{canSupport ? <Link className="app-action" href={`/platform/support?schoolId=${encodeURIComponent(id)}`}><strong>Support</strong>Open case queue</Link> : null}{canBilling ? <Link className="app-pill" href={`/platform/billing?schoolId=${encodeURIComponent(id)}`}>Billing</Link> : null}</div></div>
    <PlatformSchoolLifecycle schoolId={id} status={data.school.status} />
    <div className="app-grid kpis">
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Active students</span></div><div className="app-kpi-value">{data.students.toLocaleString()}</div><div className="app-kpi-meta">Live learner count</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">User accounts</span></div><div className="app-kpi-value">{data.users.toLocaleString()}</div><div className="app-kpi-meta">Staff, teachers and operators</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Classes</span></div><div className="app-kpi-value">{data.classes.toLocaleString()}</div><div className="app-kpi-meta">Configured academic groups</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Collections</span></div><div className="app-kpi-value">₵{collected.toLocaleString()}</div><div className="app-kpi-meta">Recent recorded payments</div></div>
    </div>
    <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">OPERATOR WORKBENCH</span><h2>Every jump stays inside the platform control plane</h2><p>These are the platform-safe workflows currently available for this school. School-only workspaces are intentionally not linked until a scoped impersonation/context switch exists.</p></div></div><div className="app-dashboard-grid">{quickLinks.map(([title,href,body])=><Link key={title} href={href} className="platform-settings-link-card"><div><span className="app-eyebrow">WORKFLOW</span><h3>{title}</h3><p>{body}</p></div><span>→</span></Link>)}</div></section>
    <div className="app-dashboard-grid">
      <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">OPERATING POSTURE</span><h2>What is happening here?</h2><p>Fast signals for support and investigation.</p></div></div><div className="app-list-row"><div><b>Subscription</b><span>{data.school.subscriptionPlan?.name ?? "No plan"}</span></div><span className="app-pill">Commercial</span></div><div className="app-list-row"><div><b>Subjects</b><span>{data.subjects.toLocaleString()} configured</span></div></div><div className="app-list-row"><div><b>Unpaid invoices</b><span>{unpaid.toLocaleString()} of recent invoices</span></div><span className="app-pill">Finance</span></div><div className="app-list-row"><div><b>Messages</b><span>{data.recentMessages.toLocaleString()} created in last 24 hours</span></div><span className={`app-pill ${data.failedMessages ? "is-warning" : ""}`}>{data.failedMessages.toLocaleString()} failed in 7 days</span></div><div className="app-list-row"><div><b>Grade configuration</b><span>{Number(data.school.settings?.gradeCaWeight ?? 0)}% continuous · {Number(data.school.settings?.gradeExamWeight ?? 0)}% exam</span></div></div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">COMMERCIAL ACTIVITY</span><h2>Recent invoices</h2><p>Amounts remain separate from communications-credit balances.</p></div>{canBilling ? <Link className="app-pill" href={`/platform/billing?schoolId=${encodeURIComponent(id)}`}>Configure billing</Link> : null}</div>{data.invoices.slice(0,8).map((invoice)=><div className="app-list-row" key={invoice.id}><div><b>{invoice.student.name}</b><span>₵{Number(invoice.totalAmount).toLocaleString()} · {invoice.status}</span></div><small>{new Date(invoice.createdAt).toLocaleDateString()}</small></div>)}{data.invoices.length===0&&<div className="platform-empty"><strong>No invoices yet.</strong><span>Configure the school’s billing rule before generating the first invoice.</span></div>}</section>
    </div>
    {canAudit ? <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">INVESTIGATION</span><h2>Recent audited platform activity</h2><p>Use the School Activity Center to reconstruct the full tenant timeline, including school-level records.</p></div><Link className="app-action" href={`/platform/schools/${id}/activity`}><strong>Open Activity Center</strong></Link></div>{audits.length===0?<div className="platform-empty"><strong>No platform audit events are recorded for this school yet.</strong><span>That does not imply no school activity exists.</span></div>:audits.slice(0,6).map((event)=><div className="app-list-row" key={event.id}><div><b>{event.action}</b><span>{event.targetEntity ?? "School"} · {event.actorName ? `${event.actorName}${event.actorEmail ? ` · ${event.actorEmail}` : ""}` : event.actorId ? `actor ${event.actorId}` : "system"}</span></div><small>{new Date(event.createdAt).toLocaleString()}</small></div>)}</section> : null}
  </AppShell>;
}
