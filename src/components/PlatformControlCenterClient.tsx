"use client";

import Link from "next/link";
import { Activity, ArrowRight, CreditCard, Gauge, GraduationCap, LifeBuoy, Plus, School, Search, ShieldCheck, Users, Workflow } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { usePlatformNavigationAccess } from "@/components/PlatformNavigationContext";
import type { getPlatformOverview, getPlatformHealth, listPlatformAudit } from "@/lib/platform-admin-service";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type Health = Awaited<ReturnType<typeof getPlatformHealth>>;
type Audit = Awaited<ReturnType<typeof listPlatformAudit>>;
type Props = { overview: Overview; health: Health; audit: Audit };
type PlatformSchool = { id: string; name: string; uniqueCode: string; status: string; studentCount?: number; unpaidInvoices?: number; attendanceToday?: number };

function isPlatformSchool(value: Overview["schools"][number]): value is Overview["schools"][number] & PlatformSchool {
  return typeof value.id === "string" && typeof value.name === "string" && typeof value.uniqueCode === "string" && typeof value.status === "string";
}

export default function PlatformControlCenterClient({ overview, health, audit }: Props) {
  const access = usePlatformNavigationAccess();
  const schools = overview.schools.filter(isPlatformSchool);
  const attention = schools.filter((school) => String(school.status).toLowerCase() !== "active" || Number(school.unpaidInvoices || 0) > 0 || (Number(school.studentCount || 0) > 0 && Number(school.attendanceToday || 0) === 0)).slice(0, 8);
  const critical = schools.filter((school) => String(school.status).toLowerCase() !== "active").length;
  const activeRate = overview.totals.schools ? Math.round((overview.totals.activeSchools / overview.totals.schools) * 100) : 0;
  const healthGood = health.database === "operational" && health.migrations === "operational";

  return <AppShell universe="platform" active="Overview" title="Control Center" subtitle="A clear command center for schools, commercial operations, support and platform health.">
    <section className="platform-hero platform-hero-command">
      <div><span className="platform-eyebrow">Today’s command center</span><h2>Know what needs action, then open the right workflow.</h2><p>The overview is intentionally decision-first: create a school, find an account, review commercial pressure, or investigate a signal without digging through configuration screens.</p></div>
      <div className="platform-hero-actions">{access?.["schools.manage"] ? <Link href="/platform/schools/new" className="app-action"><Plus size={14}/><strong>Add school</strong>Start onboarding</Link> : null}{access?.["schools.view"] ? <Link href="/platform/schools" className="app-pill"><Search size={14}/> Find a school</Link> : null}{access?.["support.view"] ? <Link href="/platform/support" className="app-pill"><LifeBuoy size={14}/> Support</Link> : null}</div>
    </section>
    <section className="platform-start-grid" aria-label="Start a platform workflow">
      {access?.["schools.view"] ? <Link className="platform-start-card" href="/platform/schools"><span><School size={18}/></span><div><b>Manage schools</b><small>Open the network directory and School 360.</small></div><ArrowRight size={15}/></Link> : null}
      {access?.["plans.manage"] ? <Link className="platform-start-card" href="/platform/plans"><span><Workflow size={18}/></span><div><b>Plans & entitlements</b><small>Package features and assign them to schools.</small></div><ArrowRight size={15}/></Link> : null}
      {access?.["billing.view"] ? <Link className="platform-start-card" href="/platform/billing"><span><CreditCard size={18}/></span><div><b>Platform billing</b><small>Configure, issue, reconcile or fund messaging.</small></div><ArrowRight size={15}/></Link> : null}
      {access?.["audit.view"] ? <Link className="platform-start-card" href="/platform/audit"><span><ShieldCheck size={18}/></span><div><b>Investigate activity</b><small>Trace sensitive platform actions and changes.</small></div><ArrowRight size={15}/></Link> : null}
    </section>
    <div className="app-grid kpis platform-kpis">
      <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">School network</span><span className="app-kpi-icon"><School size={17}/></span></div><div className="app-kpi-value">{overview.totals.schools}</div><div className="app-kpi-meta">{activeRate}% active · {critical} need review</div></div>
      <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Learners</span><span className="app-kpi-icon"><GraduationCap size={17}/></span></div><div className="app-kpi-value">{Number(overview.totals.students).toLocaleString()}</div><div className="app-kpi-meta">{Number(overview.totals.classes).toLocaleString()} classes across network</div></div>
      <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Commercial</span><span className="app-kpi-icon"><CreditCard size={17}/></span></div><div className="app-kpi-value">₵{Number(overview.totals.collected || 0).toLocaleString()}</div><div className="app-kpi-meta">{overview.totals.unpaidInvoices} invoices with balance</div></div>
      <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Platform health</span><span className="app-kpi-icon"><Gauge size={17}/></span></div><div className="app-kpi-value">{healthGood ? "Healthy" : "Review"}</div><div className="app-kpi-meta">Database {health.database} · migrations {health.migrations}</div></div>
    </div>
    <div className="platform-command-grid">
      <section className="app-card app-panel platform-queue"><div className="app-card-head"><div><span className="app-eyebrow">ATTENTION QUEUE</span><h2>What needs a decision?</h2><p>Only the most useful signals are surfaced here. Open the school when you need context.</p></div>{access?.["schools.view"] ? <Link className="app-pill" href="/platform/schools">View all</Link> : null}</div><div className="platform-table-head"><span>School</span><span>Signal</span><span>Why</span><span>Next</span></div><div className="platform-table-body">{attention.map((school) => { const suspended = String(school.status).toLowerCase() !== "active"; const unpaidInvoices = Number(school.unpaidInvoices || 0); const reason = suspended ? "Account status needs review" : unpaidInvoices > 0 ? `${unpaidInvoices} unpaid invoice${unpaidInvoices === 1 ? "" : "s"}` : "No attendance recorded today"; return <div key={school.id} className="platform-table-row"><div className="platform-school-cell"><span className="platform-school-avatar"><School size={16}/></span><div><b>{school.name}</b><small>{school.uniqueCode} · {Number(school.studentCount || 0).toLocaleString()} students</small></div></div><div><span className={`platform-status ${suspended ? "platform-status-critical" : "platform-status-watch"}`}>{suspended ? "Critical" : "Watch"}</span></div><div className="platform-reasons"><span>{reason}</span></div><div>{access?.["schools.view"] ? <Link href={`/platform/schools/${school.id}`} className="app-action"><strong>Inspect</strong><ArrowRight size={13}/></Link> : <span className="app-pill">No action</span>}</div></div>; })}{attention.length === 0 ? <div className="platform-empty"><strong>Everything is quiet.</strong><span>No school currently matches the attention rules.</span></div> : null}</div></section>
      <aside className="platform-side-stack"><section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">CONTROL POSTURE</span><h2>Platform health at a glance</h2><p>The overview is the place to spot a problem, not configure it.</p></div></div><div className="platform-signal"><span className="platform-signal-icon"><ShieldCheck size={15}/></span><div><b>Access control</b><small>Role-based permissions are enforced</small></div><span className="platform-dot is-good"/></div><div className="platform-signal"><span className="platform-signal-icon"><Activity size={15}/></span><div><b>Database</b><small>{health.database} · {health.latencyMs}ms</small></div><span className={`platform-dot ${healthGood ? "is-good" : "is-alert"}`}/></div><div className="platform-signal"><span className="platform-signal-icon"><Users size={15}/></span><div><b>School coverage</b><small>{overview.totals.activeSchools} active · {overview.totals.suspendedSchools} suspended</small></div>{access?.["schools.view"] ? <Link className="app-pill" href="/platform/schools">Review</Link> : null}</div></section><section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">RECENT ACTIVITY</span><h2>What just changed?</h2><p>Recent audited platform actions, kept deliberately short.</p></div>{access?.["audit.view"] ? <Link className="app-pill" href="/platform/audit">Open audit</Link> : null}</div>{audit.events.slice(0,5).map((event) => <div className="platform-activity-row" key={event.id}><div><b>{event.action}</b><small>{event.targetEntity || "Platform"}</small></div><time>{new Date(event.createdAt).toLocaleDateString()}</time></div>)}{audit.events.length === 0 ? <div className="platform-empty"><strong>No audited changes yet.</strong></div> : null}</section></aside>
    </div>
  </AppShell>;
}
