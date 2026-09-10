"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpenCheck,
  BrainCircuit,
  CreditCard,
  Gauge,
  GraduationCap,
  KeyRound,
  LifeBuoy,
  Plus,
  School,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { usePlatformNavigationAccess } from "@/components/PlatformNavigationContext";
import type { getPlatformOverview, getPlatformHealth, listPlatformAudit } from "@/lib/platform-admin-service";
import type { getPlatformOwnerIntelligence, PlatformIssueCategory } from "@/lib/platform-owner-intelligence";
import "@/components/platform-owner-control.css";
import "@/components/platform-owner-simple.css";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type Health = Awaited<ReturnType<typeof getPlatformHealth>>;
type Audit = Awaited<ReturnType<typeof listPlatformAudit>>;
type Intelligence = Awaited<ReturnType<typeof getPlatformOwnerIntelligence>>;
type Props = { overview: Overview; health: Health; audit: Audit; intelligence: Intelligence };

const categoryLabels: Record<PlatformIssueCategory, string> = {
  access: "Accounts & access",
  setup: "School setup",
  academics: "Academic workflow",
  attendance: "Attendance",
  family: "Guardian connections",
  commercial: "Commercial",
};

const categoryActions: Record<PlatformIssueCategory, string> = {
  access: "/platform/admins",
  setup: "/platform/schools",
  academics: "/platform/analytics",
  attendance: "/platform/analytics",
  family: "/platform/schools",
  commercial: "/platform/billing",
};

function healthLabel(value: Intelligence["schools"][number]["health"]) {
  if (value === "critical") return "Critical";
  if (value === "watch") return "Watch";
  return "Healthy";
}

export default function PlatformControlCenterClient({ overview, health, audit, intelligence }: Props) {
  const access = usePlatformNavigationAccess();
  const activeRate = overview.totals.schools ? Math.round((overview.totals.activeSchools / overview.totals.schools) * 100) : 0;
  const healthGood = health.database === "operational" && health.migrations === "operational";
  const prioritySchools = intelligence.schools.filter((school) => school.health !== "healthy").slice(0, 10);
  const maxCategory = Math.max(1, ...Object.values(intelligence.categoryCounts));

  return <AppShell universe="platform" active="Overview" title="Owner Control Center" subtitle="See priority schools first, then drill into the network only when needed.">
    <section className="platform-hero platform-hero-command owner-command-hero">
      <div>
        <span className="platform-eyebrow">Platform owner</span>
        <h2>What needs attention across SukuuNova?</h2>
        <p className="owner-command-copy">Start with priority schools. Open the deeper network, security and audit detail only when you need it.</p>
      </div>
      <div className="platform-hero-actions">
        {access?.["schools.manage"] ? <Link href="/platform/schools/new" className="app-action"><Plus size={14}/><strong>Add school</strong></Link> : null}
        {access?.["schools.view"] ? <Link href="/platform/schools" className="app-pill"><Search size={14}/> Schools</Link> : null}
        {access?.["support.view"] ? <Link href="/platform/support" className="app-pill"><LifeBuoy size={14}/> Support</Link> : null}
      </div>
    </section>

    <section className="owner-intelligence-kpis" aria-label="Platform owner summary">
      <div className="owner-intelligence-card owner-intelligence-primary"><span><BrainCircuit size={16}/></span><div><small>Network readiness</small><strong>{intelligence.summary.averageReadiness}%</strong></div></div>
      <div className="owner-intelligence-card"><span><AlertTriangle size={16}/></span><div><small>Critical schools</small><strong>{intelligence.summary.criticalSchools}</strong></div></div>
      <div className="owner-intelligence-card"><span><KeyRound size={16}/></span><div><small>Access risks</small><strong>{intelligence.summary.accessRisks}</strong></div></div>
      <div className="owner-intelligence-card"><span><BookOpenCheck size={16}/></span><div><small>Academic gaps</small><strong>{intelligence.summary.academicRisks}</strong></div></div>
    </section>

    <div className="owner-control-grid owner-control-grid-simple">
      <section className="app-card app-panel owner-priority-panel">
        <div className="app-card-head"><div><span className="app-eyebrow">NEEDS ATTENTION</span><h2>Priority schools</h2><p>Open the school with the clearest operational problem first.</p></div>{access?.["schools.view"] ? <Link className="app-pill" href="/platform/schools">All schools</Link> : null}</div>
        <div className="owner-priority-head"><span>School</span><span>Condition</span><span>Readiness</span><span>Top finding</span><span>Action</span></div>
        <div className="owner-priority-body">
          {prioritySchools.map((school) => <div className="owner-priority-row" key={school.schoolId}>
            <div className="owner-school-name"><span className="platform-school-avatar"><School size={16}/></span><div><b>{school.name}</b><small>{school.uniqueCode} · {school.metrics.activeStudents.toLocaleString()} learners</small></div></div>
            <div><span className={`owner-health owner-health-${school.health}`}>{healthLabel(school.health)} · {school.attentionScore}</span><small className="owner-mini-meta">{school.issues.length} finding{school.issues.length === 1 ? "" : "s"}</small></div>
            <div className="owner-readiness"><strong>{school.readinessScore}%</strong><span><i style={{ width: `${school.readinessScore}%` }}/></span></div>
            <div className="owner-finding"><b>{school.issues[0]?.title ?? "No urgent issue"}</b><small>{school.issues[0]?.detail ?? school.recommendedAction}</small>{school.issues[1] ? <em>+ {school.issues.length - 1} more finding{school.issues.length - 1 === 1 ? "" : "s"}</em> : null}</div>
            <div>{access?.["schools.view"] ? <Link href={`/platform/schools/${school.schoolId}`} className="app-action"><strong>Inspect</strong><ArrowRight size={13}/></Link> : <span className="app-pill">Restricted</span>}</div>
          </div>)}
          {prioritySchools.length === 0 ? <div className="platform-empty owner-all-clear"><ShieldCheck size={22}/><strong>No school currently needs priority intervention.</strong><span>The current checks found no critical or warning conditions.</span></div> : null}
        </div>
      </section>

      <aside className="platform-side-stack owner-side-stack">
        <section className="app-card app-panel owner-issue-map">
          <div className="app-card-head"><div><span className="app-eyebrow">ISSUE MAP</span><h2>Where problems cluster</h2></div></div>
          {(Object.entries(intelligence.categoryCounts) as Array<[PlatformIssueCategory, number]>).map(([category, count]) => <Link href={categoryActions[category]} className="owner-category-row" key={category}>
            <div><b>{categoryLabels[category]}</b><small>{count} finding{count === 1 ? "" : "s"}</small></div>
            <span className="owner-category-meter"><i style={{ width: `${Math.round((count / maxCategory) * 100)}%` }}/></span>
            <strong>{count}</strong>
          </Link>)}
        </section>
      </aside>
    </div>

    <details className="sn-progressive owner-more">
      <summary>More owner tools</summary>
      <div className="sn-progressive-body">
        <section className="platform-start-grid owner-start-grid" aria-label="Platform owner tools">
          {access?.["schools.view"] ? <Link className="platform-start-card" href="/platform/schools"><span><School size={18}/></span><div><b>School 360</b><small>People, setup, billing, access and audit.</small></div><ArrowRight size={15}/></Link> : null}
          {access?.["support.manage"] ? <Link className="platform-start-card" href="/platform/notifications"><span><BellRing size={18}/></span><div><b>Notify schools</b><small>Operational platform communication.</small></div><ArrowRight size={15}/></Link> : null}
          {access?.["admins.view"] ? <Link className="platform-start-card" href="/platform/admins"><span><Users size={18}/></span><div><b>Workers & access</b><small>Platform roles and school scope.</small></div><ArrowRight size={15}/></Link> : null}
          {access?.["security.manage"] ? <Link className="platform-start-card" href="/platform/health"><span><Activity size={18}/></span><div><b>System health</b><small>Database and operational signals.</small></div><ArrowRight size={15}/></Link> : null}
        </section>
      </div>
    </details>

    <details className="sn-progressive owner-more">
      <summary>Network, health and recent activity</summary>
      <div className="sn-progressive-body owner-details-grid">
        <div className="app-grid kpis platform-kpis owner-network-kpis">
          <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">School network</span><span className="app-kpi-icon"><School size={17}/></span></div><div className="app-kpi-value">{overview.totals.schools}</div><div className="app-kpi-meta">{activeRate}% active · {intelligence.summary.healthySchools} healthy</div></div>
          <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Learners</span><span className="app-kpi-icon"><GraduationCap size={17}/></span></div><div className="app-kpi-value">{Number(overview.totals.students).toLocaleString()}</div><div className="app-kpi-meta">{Number(overview.totals.classes).toLocaleString()} classes</div></div>
          <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Commercial</span><span className="app-kpi-icon"><CreditCard size={17}/></span></div><div className="app-kpi-value">₵{Number(overview.totals.collected || 0).toLocaleString()}</div><div className="app-kpi-meta">{overview.totals.unpaidInvoices} unpaid invoices</div></div>
          <div className="app-card app-kpi platform-stat"><div className="app-kpi-top"><span className="app-kpi-label">Platform health</span><span className="app-kpi-icon"><Gauge size={17}/></span></div><div className="app-kpi-value">{healthGood ? "Healthy" : "Review"}</div><div className="app-kpi-meta">Database {health.database} · migrations {health.migrations}</div></div>
        </div>

        <section className="app-card app-panel">
          <div className="app-card-head"><div><span className="app-eyebrow">CONTROL POSTURE</span><h2>System health</h2></div></div>
          <div className="platform-signal"><span className="platform-signal-icon"><ShieldCheck size={15}/></span><div><b>Permission model</b><small>Role and tenant permissions enforced</small></div><span className="platform-dot is-good"/></div>
          <div className="platform-signal"><span className="platform-signal-icon"><Activity size={15}/></span><div><b>Database</b><small>{health.database} · {health.latencyMs}ms</small></div><span className={`platform-dot ${healthGood ? "is-good" : "is-alert"}`}/></div>
          <div className="platform-signal"><span className="platform-signal-icon"><BrainCircuit size={15}/></span><div><b>Diagnostic coverage</b><small>{intelligence.summary.schools} schools · {intelligence.summary.criticalIssues} critical findings</small></div><span className={`platform-dot ${intelligence.summary.criticalIssues === 0 ? "is-good" : "is-alert"}`}/></div>
        </section>

        <section className="app-card app-panel">
          <div className="app-card-head"><div><span className="app-eyebrow">RECENT ACTIVITY</span><h2>What just changed?</h2></div>{access?.["audit.view"] ? <Link className="app-pill" href="/platform/audit">Open audit</Link> : null}</div>
          {audit.events.slice(0, 6).map((event) => <div className="platform-activity-row" key={event.id}><div><b>{event.action}</b><small>{event.targetEntity || "Platform"}</small></div><time>{new Date(event.createdAt).toLocaleDateString()}</time></div>)}
          {audit.events.length === 0 ? <div className="platform-empty"><strong>No audited changes yet.</strong></div> : null}
        </section>
      </div>
    </details>

    <details className="sn-progressive owner-more">
      <summary>How owner intelligence works</summary>
      <div className="sn-progressive-body owner-explain-grid">
        <div><KeyRound size={17}/><b>Access</b><p>Disabled access, missing accounts, missing roles and unfinished first-login security.</p></div>
        <div><Workflow size={17}/><b>Connections</b><p>Learners without classes, classes without teachers and missing teaching assignments.</p></div>
        <div><BookOpenCheck size={17}/><b>Academics</b><p>Calendar readiness and whether academic workflows have started receiving evidence.</p></div>
        <div><UserRoundCheck size={17}/><b>Families</b><p>Guardian links needed for portal access, alerts and report delivery.</p></div>
        <div><Activity size={17}/><b>Attendance</b><p>Attendance checks respect real school days and blocked calendar days.</p></div>
        <div><CreditCard size={17}/><b>Commercial</b><p>Outstanding platform invoices increase attention without changing setup readiness.</p></div>
      </div>
    </details>
  </AppShell>;
}
