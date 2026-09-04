"use client";

import Link from "next/link";
import { Activity, ArrowRight, CreditCard, Gauge, GraduationCap, LifeBuoy, School, Search, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { usePlatformNavigationAccess } from "@/components/PlatformNavigationContext";
import type { getPlatformOverview, getPlatformHealth, listPlatformAudit } from "@/lib/platform-admin-service";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type Health = Awaited<ReturnType<typeof getPlatformHealth>>;
type Audit = Awaited<ReturnType<typeof listPlatformAudit>>;
type Props = { overview: Overview; health: Health; audit: Audit };
type PlatformSchool = {
  id: string;
  name: string;
  uniqueCode: string;
  status: string;
  studentCount?: number;
  unpaidInvoices?: number;
  attendanceToday?: number;
};

function isPlatformSchool(value: Overview["schools"][number]): value is Overview["schools"][number] & PlatformSchool {
  return typeof value.id === "string" && typeof value.name === "string" && typeof value.uniqueCode === "string" && typeof value.status === "string";
}

export default function PlatformControlCenterClient({ overview, health, audit }: Props) {
  const access = usePlatformNavigationAccess();
  const schools = overview.schools.filter(isPlatformSchool);
  const critical = schools.filter((school) => String(school.status).toLowerCase() !== "active").length;
  const attention = schools.filter((school) => String(school.status).toLowerCase() !== "active" || Number(school.unpaidInvoices || 0) > 0 || (Number(school.studentCount || 0) > 0 && Number(school.attendanceToday || 0) === 0)).slice(0, 10);
  const activeRate = overview.totals.schools ? Math.round((overview.totals.activeSchools / overview.totals.schools) * 100) : 0;
  const healthGood = health.database === "operational" && health.migrations === "operational";

  return <AppShell universe="platform" active="Overview" title="Control Center" subtitle="Operate the SukuuNova network from one accountable command surface.">
    <section className="platform-hero">
      <div><span className="platform-eyebrow">Network command center</span><h2>Start with what needs a decision.</h2><p>Find an account, understand its state, take the next permitted action, and leave an auditable trail.</p></div>
      <div className="platform-hero-actions">{access?.["schools.view"] ? <Link href="/platform/schools" className="app-action"><Search size={14}/><strong>Find a school</strong><ArrowRight size={14}/></Link> : null}{access?.["support.view"] ? <Link href="/platform/support" className="app-pill"><LifeBuoy size={14}/> Open support</Link> : null}</div>
    </section>
    <div className="app-grid kpis platform-kpis">
      <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Schools</span><span className="app-kpi-icon"><School size={17}/></span></div><div className="app-kpi-value">{overview.totals.schools}</div><div className="app-kpi-meta">{activeRate}% active · {critical} need review</div></div>
      <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Students</span><span className="app-kpi-icon"><GraduationCap size={17}/></span></div><div className="app-kpi-value">{Number(overview.totals.students).toLocaleString()}</div><div className="app-kpi-meta">{Number(overview.totals.classes).toLocaleString()} classes across network</div></div>
      <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Collections</span><span className="app-kpi-icon"><CreditCard size={17}/></span></div><div className="app-kpi-value">₵{Number(overview.totals.collected || 0).toLocaleString()}</div><div className="app-kpi-meta">{overview.totals.unpaidInvoices} invoices need attention</div></div>
      <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">System</span><span className="app-kpi-icon"><Gauge size={17}/></span></div><div className="app-kpi-value">{healthGood ? "Healthy" : "Review"}</div><div className="app-kpi-meta">Database {health.database} · migrations {health.migrations}</div></div>
    </div>
    <div className="platform-command-grid">
      <section className="app-card app-panel platform-queue"><div className="app-card-head"><div><h2>Attention queue</h2><p>Prioritise schools with account, finance, setup or operating signals.</p></div>{access?.["schools.view"] ? <Link className="app-pill" href="/platform/schools">All schools</Link> : null}</div><div className="platform-table-head"><span>School</span><span>Signal</span><span>Reason</span><span>Next step</span></div><div className="platform-table-body">{attention.map((school) => { const suspended = String(school.status).toLowerCase() !== "active"; const unpaidInvoices = Number(school.unpaidInvoices || 0); const reason = suspended ? "Account status needs review" : unpaidInvoices > 0 ? `${unpaidInvoices} unpaid invoice${unpaidInvoices === 1 ? "" : "s"}` : "No attendance recorded today"; return <div key={school.id} className="platform-table-row"><div className="platform-school-cell"><span className="platform-school-avatar"><School size={16}/></span><div><b>{school.name}</b><small>{school.uniqueCode} · {Number(school.studentCount || 0).toLocaleString()} students</small></div></div><div><span className={`platform-status ${suspended ? "platform-status-critical" : "platform-status-watch"}`}>{suspended ? "Critical" : "Watch"}</span></div><div className="platform-reasons"><span>{reason}</span></div><div>{access?.["schools.view"] ? <Link href={`/platform/schools/${school.id}`} className="app-action"><strong>Inspect</strong><ArrowRight size={13}/></Link> : <span className="app-pill">No action</span>}</div></div>; })}{attention.length===0 && <div className="platform-empty">No schools currently require operator attention.</div>}</div></section>
      <aside className="platform-side-stack"><section className="app-card app-panel"><div className="app-card-head"><div><h2>Control posture</h2><p>Signals that affect every school.</p></div></div><div className="platform-signal"><span className="platform-signal-icon"><ShieldCheck size={15}/></span><div><b>Access control</b><small>Role-based permissions are enforced</small></div><span className="platform-dot is-good"/></div><div className="platform-signal"><span className="platform-signal-icon"><Activity size={15}/></span><div><b>Database</b><small>{health.database} · {health.latencyMs}ms</small></div><span className={`platform-dot ${healthGood ? "is-good" : "is-alert"}`}/></div><div className="platform-signal"><span className="platform-signal-icon"><Users size={15}/></span><div><b>School coverage</b><small>{overview.totals.activeSchools} active · {overview.totals.suspendedSchools} suspended</small></div>{access?.["schools.view"] ? <Link className="app-pill" href="/platform/schools">Review</Link> : null}</div></section><section className="app-card app-panel"><div className="app-card-head"><div><h2>Operator shortcuts</h2><p>Only actions this operator can execute.</p></div></div>{access?.["schools.view"] ? <Link className="platform-shortcut" href="/platform/schools"><span><School size={15}/></span><div><b>Manage schools</b><small>Open accounts and School 360</small></div><ArrowRight size={14}/></Link> : null}{access?.["billing.view"] ? <Link className="platform-shortcut" href="/platform/billing"><span><CreditCard size={15}/></span><div><b>Resolve billing</b><small>Invoices and collections</small></div><ArrowRight size={14}/></Link> : null}{access?.["admins.view"] ? <Link className="platform-shortcut" href="/platform/admins"><span><Users size={15}/></span><div><b>Review operators</b><small>Roles and school scope</small></div><ArrowRight size={14}/></Link> : null}{access?.["audit.view"] ? <Link className="platform-shortcut" href="/platform/audit"><span><ShieldCheck size={15}/></span><div><b>Investigate activity</b><small>Audit and change history</small></div><ArrowRight size={14}/></Link> : null}</section></aside>
    </div>
    <div className="platform-lower-grid"><section className="app-card app-panel"><div className="app-card-head"><div><h2>Network snapshot</h2><p>Scale and commercial context without burying the operator in charts.</p></div><Link className="app-pill" href="/platform/analytics">Open analytics</Link></div><div className="platform-metric-row"><div><b>{Number(overview.totals.users).toLocaleString()}</b><small>Users</small></div><div><b>{Number(overview.totals.classes).toLocaleString()}</b><small>Classes</small></div><div><b>{Number(overview.totals.invoices).toLocaleString()}</b><small>Invoices</small></div><div><b>{Number(overview.totals.unpaidInvoices).toLocaleString()}</b><small>Unpaid</small></div></div></section>{access?.["audit.view"] ? <section className="app-card app-panel"><div className="app-card-head"><div><h2>Recent platform activity</h2><p>Most recent audited control-plane actions.</p></div><Link className="app-pill" href="/platform/audit">View audit</Link></div>{audit.events.slice(0,5).map((event) => <div className="platform-activity-row" key={event.id}><div><b>{event.action}</b><small>{event.targetEntity || "Platform"}</small></div><time>{new Date(event.createdAt).toLocaleDateString()}</time></div>)}</section> : null}</div>
  </AppShell>;
}
