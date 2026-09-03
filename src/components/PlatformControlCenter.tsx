import Link from "next/link";
import { Activity, ArrowRight, CreditCard, Gauge, GraduationCap, LifeBuoy, School, Search, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { getPlatformOverview, getPlatformHealth, listPlatformAudit } from "@/lib/platform-admin-service";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type Health = Awaited<ReturnType<typeof getPlatformHealth>>;
type Audit = Awaited<ReturnType<typeof listPlatformAudit>>;
type SchoolRecord = { id:string; name:string; uniqueCode:string; status:string; createdAt:string | Date; studentCount:number; userCount:number; classCount:number; attendanceToday:number; invoices:number; unpaidInvoices:number; collected:number; subscriptionPlan?: { id:string; name:string; price:number|string } | null };
type Props = { overview: Overview; health: Health; audit: Audit };

function schoolRecords(overview: Overview): SchoolRecord[] {
  return overview.schools.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.uniqueCode !== "string") return [];
    return [{
      id: row.id,
      name: row.name,
      uniqueCode: row.uniqueCode,
      status: typeof row.status === "string" ? row.status : "unknown",
      createdAt: typeof row.createdAt === "string" || row.createdAt instanceof Date ? row.createdAt : new Date(0),
      studentCount: Number(row.studentCount || 0),
      userCount: Number(row.userCount || 0),
      classCount: Number(row.classCount || 0),
      attendanceToday: Number(row.attendanceToday || 0),
      invoices: Number(row.invoices || 0),
      unpaidInvoices: Number(row.unpaidInvoices || 0),
      collected: Number(row.collected || 0),
      subscriptionPlan: row.subscriptionPlan && typeof row.subscriptionPlan === "object" ? row.subscriptionPlan as SchoolRecord["subscriptionPlan"] : null,
    }];
  });
}

function scoreSchool(s: SchoolRecord): number {
  const invoicePressure = s.invoices ? s.unpaidInvoices / s.invoices : 0;
  const dataGap = s.studentCount > 0 && s.userCount === 0 ? 14 : 0;
  const classGap = s.studentCount > 0 && s.classCount === 0 ? 12 : 0;
  const attendanceGap = s.studentCount > 0 && s.attendanceToday === 0 ? 18 : 0;
  const suspension = s.status !== "active" ? 55 : 0;
  return Math.min(100, suspension + Math.min(30, Math.round(invoicePressure * 30)) + dataGap + classGap + attendanceGap);
}

function attentionState(score: number) {
  if (score >= 60) return { label: "Critical", className: "platform-status-critical" };
  if (score >= 25) return { label: "Watch", className: "platform-status-watch" };
  return { label: "Healthy", className: "platform-status-healthy" };
}

function reasons(s: SchoolRecord): string[] {
  const items: string[] = [];
  if (s.status !== "active") items.push("Account suspended");
  if (s.unpaidInvoices > 0) items.push(`${s.unpaidInvoices} unpaid invoice${s.unpaidInvoices === 1 ? "" : "s"}`);
  if (s.studentCount > 0 && s.userCount === 0) items.push("No active user accounts");
  if (s.studentCount > 0 && s.classCount === 0) items.push("No classes configured");
  if (s.studentCount > 0 && s.attendanceToday === 0) items.push("No attendance recorded today");
  return items.slice(0, 2);
}

function Stat({ icon: Icon, label, value, meta }: { icon: typeof School; label: string; value: string; meta: string }) {
  return <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">{label}</span><span className="app-kpi-icon"><Icon size={17} strokeWidth={2}/></span></div><div className="app-kpi-value">{value}</div><div className="app-kpi-meta">{meta}</div></div>;
}

export default function PlatformControlCenter({ overview, health, audit }: Props) {
  const schools = schoolRecords(overview);
  const attention = [...schools].map((school) => ({ school, score: scoreSchool(school) })).sort((a, b) => b.score - a.score);
  const critical = attention.filter((item) => item.score >= 60).length;
  const watch = attention.filter((item) => item.score >= 25 && item.score < 60).length;
  const activeRate = overview.totals.schools ? Math.round((overview.totals.activeSchools / overview.totals.schools) * 100) : 0;
  const averageAttention = attention.length ? Math.round(attention.reduce((sum, item) => sum + item.score, 0) / attention.length) : 0;

  return <AppShell universe="platform" title="Control Center" subtitle="Operate the SukuuNova network from one accountable command surface.">
    <section className="platform-hero">
      <div>
        <span className="platform-eyebrow">Network command center</span>
        <h2>Start with what needs a decision.</h2>
        <p>Find an account, understand its state, take the next permitted action, and leave an auditable trail.</p>
      </div>
      <div className="platform-hero-actions">
        <Link href="/platform/schools" className="app-action"><Search size={14}/><strong>Find a school</strong><ArrowRight size={14}/></Link>
        <Link href="/platform/support" className="app-pill"><LifeBuoy size={14}/> Open support</Link>
      </div>
    </section>

    <div className="app-grid kpis platform-kpis">
      <Stat icon={School} label="Schools" value={String(overview.totals.schools)} meta={`${activeRate}% active · ${critical} critical`} />
      <Stat icon={GraduationCap} label="Students" value={Number(overview.totals.students).toLocaleString()} meta={`${Number(overview.totals.classes).toLocaleString()} classes across network`} />
      <Stat icon={CreditCard} label="Collections" value={`₵${Number(overview.totals.collected || 0).toLocaleString()}`} meta={`${overview.totals.unpaidInvoices} invoices need attention`} />
      <Stat icon={Gauge} label="Attention index" value={`${averageAttention}/100`} meta={`${critical} critical · ${watch} watch`} />
    </div>

    <div className="platform-command-grid">
      <section className="app-card app-panel platform-queue">
        <div className="app-card-head"><div><h2>Attention queue</h2><p>Priority is explainable: suspension, finance pressure, missing setup, and operating inactivity.</p></div><Link className="app-pill" href="/platform/schools">All schools</Link></div>
        <div className="platform-table-head"><span>School</span><span>Signal</span><span>Reason</span><span>Next step</span></div>
        <div className="platform-table-body">
          {attention.slice(0, 10).map(({ school, score }) => {
            const state = attentionState(score);
            const why = reasons(school);
            return <div key={school.id} className="platform-table-row">
              <div className="platform-school-cell"><span className="platform-school-avatar"><School size={16}/></span><div><b>{school.name}</b><small>{school.uniqueCode} · {school.studentCount.toLocaleString()} students · {school.subscriptionPlan?.name || "No plan"}</small></div></div>
              <div><span className={`platform-status ${state.className}`}>{state.label}</span><small className="platform-score">{score}/100</small></div>
              <div className="platform-reasons">{why.length ? why.map((reason) => <span key={reason}>{reason}</span>) : <span>No issue detected</span>}</div>
              <div><Link href={`/platform/schools/${school.id}`} className="app-action"><strong>Inspect</strong><ArrowRight size={13}/></Link></div>
            </div>;
          })}
          {attention.length === 0 && <div className="platform-empty">No schools are currently visible to this administrator.</div>}
        </div>
      </section>

      <aside className="platform-side-stack">
        <section className="app-card app-panel"><div className="app-card-head"><div><h2>Control posture</h2><p>System signals that affect every school.</p></div></div>
          <div className="platform-signal"><span className="platform-signal-icon"><ShieldCheck size={15}/></span><div><b>Access control</b><small>Role-based permissions are enforced</small></div><span className="platform-dot is-good"/></div>
          <div className="platform-signal"><span className="platform-signal-icon"><Activity size={15}/></span><div><b>Database</b><small>{health.database} · {health.latencyMs}ms</small></div><span className="platform-dot is-good"/></div>
          <div className="platform-signal"><span className="platform-signal-icon"><Users size={15}/></span><div><b>School coverage</b><small>{overview.totals.activeSchools} active · {overview.totals.suspendedSchools} suspended</small></div><Link className="app-pill" href="/platform/schools">Review</Link></div>
        </section>
        <section className="app-card app-panel"><div className="app-card-head"><div><h2>Operator shortcuts</h2><p>Common decisions should not require hunting through menus.</p></div></div>
          <Link className="platform-shortcut" href="/platform/schools"><span><School size={15}/></span><div><b>Manage schools</b><small>Open accounts, statuses, plans and school 360</small></div><ArrowRight size={14}/></Link>
          <Link className="platform-shortcut" href="/platform/billing"><span><CreditCard size={15}/></span><div><b>Resolve billing</b><small>Invoices, collections and reconciliation</small></div><ArrowRight size={14}/></Link>
          <Link className="platform-shortcut" href="/platform/admins"><span><Users size={15}/></span><div><b>Review operators</b><small>Least-privilege roles and school scope</small></div><ArrowRight size={14}/></Link>
          <Link className="platform-shortcut" href="/platform/audit"><span><ShieldCheck size={15}/></span><div><b>Investigate activity</b><small>Search sensitive actions and change history</small></div><ArrowRight size={14}/></Link>
        </section>
      </aside>
    </div>

    <div className="platform-lower-grid">
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Network snapshot</h2><p>Scale and commercial context without burying the operator in charts.</p></div><Link className="app-pill" href="/platform/analytics">Open analytics</Link></div><div className="platform-metric-row"><div><b>{Number(overview.totals.users).toLocaleString()}</b><small>Users</small></div><div><b>{Number(overview.totals.classes).toLocaleString()}</b><small>Classes</small></div><div><b>{overview.totals.invoices.toLocaleString()}</b><small>Invoices</small></div><div><b>{overview.totals.unpaidInvoices.toLocaleString()}</b><small>Unpaid</small></div></div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Recent platform activity</h2><p>Most recent audited control-plane actions.</p></div><Link className="app-pill" href="/platform/audit">View audit</Link></div>{audit.events.slice(0,5).map((event) => <div className="platform-activity-row" key={event.id}><div><b>{event.action}</b><small>{event.targetEntity || (event.targetSchoolId ? `School ${event.targetSchoolId}` : "Platform")}</small></div><time>{new Date(event.createdAt).toLocaleDateString()}</time></div>)}{audit.events.length===0&&<div className="platform-empty">No platform activity has been recorded yet.</div>}</section>
    </div>
  </AppShell>;
}
