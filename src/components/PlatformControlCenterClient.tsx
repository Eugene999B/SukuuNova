"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CreditCard,
  Database,
  Gauge,
  GraduationCap,
  HardDrive,
  LifeBuoy,
  MessageSquareText,
  Plus,
  School,
  Search,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { usePlatformNavigationAccess } from "@/components/PlatformNavigationContext";
import type { getPlatformOverview, getPlatformHealth, listPlatformAudit } from "@/lib/platform-admin-service";
import type { getPlatformOwnerIntelligence } from "@/lib/platform-owner-intelligence";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type Health = Awaited<ReturnType<typeof getPlatformHealth>>;
type Audit = Awaited<ReturnType<typeof listPlatformAudit>>;
type Intelligence = Awaited<ReturnType<typeof getPlatformOwnerIntelligence>>;
type Messaging = { smsBalance: number; smsPurchased: number; activeProvider: string } | null;
type Props = {
  overview: Overview;
  health: Health;
  audit: Audit;
  intelligence: Intelligence;
  messaging: Messaging;
  totalStorageBytes: number;
  userName: string;
  role: string;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  const decimals = index === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function healthLabel(value: Intelligence["schools"][number]["health"]) {
  if (value === "critical") return "Critical";
  if (value === "watch") return "Watch";
  return "Healthy";
}

export default function PlatformControlCenterClient({ overview, health, audit, intelligence, messaging, totalStorageBytes, userName, role }: Props) {
  const access = usePlatformNavigationAccess();
  const schoolCount = Number(overview.totals.schools || 0);
  const learnerCount = Number(overview.totals.students || 0);
  const activeRate = schoolCount ? Math.round((Number(overview.totals.activeSchools || 0) / schoolCount) * 100) : 0;
  const healthGood = health.database === "operational" && health.migrations === "operational";
  const prioritySchools = intelligence.schools.filter((school) => school.health !== "healthy").slice(0, 8);
  const networkEmpty = schoolCount === 0;
  const readiness = networkEmpty ? null : intelligence.summary.averageReadiness;

  const workflows = [
    access?.["schools.manage"] ? { href: "/platform/schools/new", icon: Plus, title: "Onboard a school", body: "Create the tenant, owner access, commercial rule and operational baseline." } : null,
    access?.["schools.view"] ? { href: "/platform/schools", icon: Building2, title: "School network", body: "Search schools and open a complete School 360 operational profile." } : null,
    access?.["plans.manage"] ? { href: "/platform/plans", icon: Workflow, title: "Plans & entitlements", body: "Build packages and control which product capabilities schools receive." } : null,
    access?.["billing.view"] ? { href: "/platform/billing", icon: CreditCard, title: "Billing & SMS", body: "Review platform invoices, collections and communication credit inventory." } : null,
    access?.["support.view"] ? { href: "/platform/support", icon: LifeBuoy, title: "Support desk", body: "Work school cases with tenant context and audited temporary access." } : null,
    access?.["security.manage"] ? { href: "/platform/health", icon: ShieldCheck, title: "System health", body: "Check database, API and operational dependencies before incidents spread." } : null,
  ].filter(Boolean) as Array<{ href: string; icon: typeof School; title: string; body: string }>;

  return <AppShell universe="platform" active="Overview" title="Owner Control Centre" subtitle="Operate the SukuuNova network from one clear command workspace." userName={userName} role={role}>
    <div className="platform-v3">
      <section className="platform-v3-hero">
        <div className="platform-v3-hero-copy">
          <span className="platform-eyebrow">Platform owner workspace</span>
          <h2>{networkEmpty ? "Your clean SukuuNova network is ready." : "Run the network from one place."}</h2>
          <p>{networkEmpty ? "No school tenants exist yet. Start by onboarding the first school; every operational view will populate from live school evidence after that." : "Start with schools that need attention, then move into support, billing, access, health or certification without hunting through disconnected admin screens."}</p>
        </div>
        <div className="platform-v3-actions">
          {access?.["schools.manage"] ? <Link href="/platform/schools/new" className="app-action"><Plus size={15}/><strong>Add school</strong></Link> : null}
          {access?.["schools.view"] ? <Link href="/platform/schools" className="app-pill"><Search size={14}/>Find school</Link> : null}
          {access?.["support.view"] ? <Link href="/platform/support" className="app-pill"><LifeBuoy size={14}/>Support</Link> : null}
        </div>
      </section>

      <section className="platform-v3-kpis" aria-label="Network summary">
        <article className="platform-v3-kpi"><div className="platform-v3-kpi-top"><div><span className="platform-v3-kpi-label">School network</span><strong>{schoolCount.toLocaleString()}</strong></div><span className="platform-v3-kpi-icon"><Building2 size={17}/></span></div><small>{networkEmpty ? "No tenants onboarded yet" : `${activeRate}% active · ${overview.totals.suspendedSchools} suspended`}</small></article>
        <article className={`platform-v3-kpi ${intelligence.summary.criticalSchools ? "is-danger" : ""}`}><div className="platform-v3-kpi-top"><div><span className="platform-v3-kpi-label">Network readiness</span><strong>{readiness == null ? "—" : `${readiness}%`}</strong></div><span className="platform-v3-kpi-icon"><Gauge size={17}/></span></div><small>{networkEmpty ? "Readiness starts after first school setup" : `${intelligence.summary.criticalSchools} critical · ${intelligence.summary.watchSchools} watch`}</small></article>
        <article className="platform-v3-kpi"><div className="platform-v3-kpi-top"><div><span className="platform-v3-kpi-label">Learners</span><strong>{learnerCount.toLocaleString()}</strong></div><span className="platform-v3-kpi-icon"><GraduationCap size={17}/></span></div><small>{Number(overview.totals.classes || 0).toLocaleString()} classes across the network</small></article>
        <article className="platform-v3-kpi"><div className="platform-v3-kpi-top"><div><span className="platform-v3-kpi-label">Tenant database footprint</span><strong>{formatBytes(totalStorageBytes)}</strong></div><span className="platform-v3-kpi-icon"><HardDrive size={17}/></span></div><small>School-owned PostgreSQL row data; external object storage is tracked separately when configured.</small></article>
      </section>

      <div className="platform-v3-grid">
        <section className="platform-v3-panel">
          <div className="platform-v3-panel-head"><div><span className="platform-eyebrow">Needs attention</span><h3>{networkEmpty ? "Start the network" : "Priority schools"}</h3><p>{networkEmpty ? "Create the first tenant and hand off the owner login securely." : "Real readiness and risk signals, ordered by operational importance."}</p></div>{!networkEmpty && access?.["schools.view"] ? <Link href="/platform/schools" className="app-pill">All schools</Link> : null}</div>
          {networkEmpty ? <div className="platform-v3-empty"><span className="platform-v3-empty-icon"><Sparkles size={20}/></span><h3>No school data is hiding here.</h3><p>The production database is clean. Onboard the first school when you are ready, then School 360 will track its people, setup, storage, finance, support and health.</p><div className="platform-v3-empty-actions">{access?.["schools.manage"] ? <Link className="app-action" href="/platform/schools/new"><Plus size={14}/><strong>Create first school</strong></Link> : null}<Link className="app-pill" href="/platform/certification">Pilot gates</Link></div></div> : prioritySchools.length ? <div className="platform-v3-priority-list">{prioritySchools.map((school) => <div className="platform-v3-priority-row" key={school.schoolId}><div className="platform-v3-school"><span className="platform-v3-school-avatar"><School size={16}/></span><div><b>{school.name}</b><small>{school.uniqueCode} · {school.metrics.activeStudents.toLocaleString()} learners</small></div></div><span className={`platform-v3-status is-${school.health}`}>{healthLabel(school.health)}</span><div className="platform-v3-readiness"><strong>{school.readinessScore}%</strong><span className="platform-v3-meter"><i style={{ width: `${school.readinessScore}%` }}/></span></div><div className="platform-v3-finding"><b>{school.issues[0]?.title ?? "No urgent issue"}</b><small>{school.issues[0]?.detail ?? school.recommendedAction}</small></div>{access?.["schools.view"] ? <Link href={`/platform/schools/${school.schoolId}`} className="app-action"><strong>Open 360</strong><ArrowRight size={13}/></Link> : null}</div>)}</div> : <div className="platform-v3-empty"><span className="platform-v3-empty-icon"><ShieldCheck size={20}/></span><h3>All schools are clear.</h3><p>No current critical or warning signal requires intervention. You can continue normal monitoring or inspect any school directly.</p>{access?.["schools.view"] ? <div className="platform-v3-empty-actions"><Link className="app-pill" href="/platform/schools">Browse schools</Link></div> : null}</div>}
        </section>

        <aside className="platform-v3-stack">
          <section className="platform-v3-panel"><div className="platform-v3-panel-head"><div><span className="platform-eyebrow">Operations now</span><h3>Platform status</h3></div>{access?.["security.manage"] ? <Link href="/platform/health" className="app-pill">Health</Link> : null}</div><div className="platform-v3-signal-list">
            <div className="platform-v3-signal"><span><Database size={15}/></span><div><b>PostgreSQL</b><small>{health.database} · {health.latencyMs}ms</small></div><strong>{health.database === "operational" ? "Healthy" : "Review"}</strong></div>
            <div className="platform-v3-signal"><span><Activity size={15}/></span><div><b>Migrations</b><small>Application schema state</small></div><strong>{health.migrations}</strong></div>
            <div className="platform-v3-signal"><span><AlertTriangle size={15}/></span><div><b>Critical findings</b><small>Across school readiness checks</small></div><strong>{intelligence.summary.criticalIssues}</strong></div>
            {messaging ? <div className="platform-v3-signal"><span><MessageSquareText size={15}/></span><div><b>SMS inventory</b><small>{messaging.activeProvider} · {messaging.smsPurchased.toLocaleString()} purchased lifetime</small></div><strong>{messaging.smsBalance.toLocaleString()}</strong></div> : null}
          </div></section>

          <section className="platform-v3-panel"><div className="platform-v3-panel-head"><div><span className="platform-eyebrow">Owner posture</span><h3>What matters next</h3></div></div><div className="platform-v3-signal-list">
            <div className="platform-v3-signal"><span><Users size={15}/></span><div><b>Access risks</b><small>Role or account findings</small></div><strong>{intelligence.summary.accessRisks}</strong></div>
            <div className="platform-v3-signal"><span><GraduationCap size={15}/></span><div><b>Academic gaps</b><small>Setup and workflow findings</small></div><strong>{intelligence.summary.academicRisks}</strong></div>
            <div className="platform-v3-signal"><span><CreditCard size={15}/></span><div><b>Outstanding invoices</b><small>Commercial items requiring review</small></div><strong>{overview.totals.unpaidInvoices}</strong></div>
          </div></section>
        </aside>
      </div>

      <section className="platform-v3-panel"><div className="platform-v3-panel-head"><div><span className="platform-eyebrow">Core workflows</span><h3>Go directly to the job</h3><p>No nested dashboard maze: every card opens the workspace that owns the task.</p></div></div><div className="platform-v3-workflows">{workflows.map(({ href, icon: Icon, title, body }) => <Link href={href} key={href} className="platform-v3-workflow"><span><Icon size={17}/></span><div><b>{title}</b><small>{body}</small></div><ArrowRight size={14}/></Link>)}</div></section>

      <section className="platform-v3-panel"><div className="platform-v3-panel-head"><div><span className="platform-eyebrow">Recent control activity</span><h3>What changed on the platform?</h3></div>{access?.["audit.view"] ? <Link className="app-pill" href="/platform/audit">Open audit</Link> : null}</div>{audit.events.length ? <div className="platform-v3-signal-list">{audit.events.slice(0, 6).map((event) => <div className="platform-v3-signal" key={event.id}><span><UserCog size={15}/></span><div><b>{event.action}</b><small>{event.targetEntity || "Platform"}</small></div><strong>{new Date(event.createdAt).toLocaleDateString()}</strong></div>)}</div> : <div className="platform-v3-empty" style={{ minHeight: 140 }}><span className="platform-v3-empty-icon"><ShieldCheck size={18}/></span><h3>No audited platform changes yet.</h3><p>Your official Platform Owner bootstrap is the beginning of this clean production history.</p></div>}</section>
    </div>
  </AppShell>;
}
