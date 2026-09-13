"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CircleDollarSign,
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
  Users,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { usePlatformNavigationAccess } from "@/components/PlatformNavigationContext";
import type { getPlatformOverview, getPlatformHealth, listPlatformAudit } from "@/lib/platform-admin-service";
import type { getPlatformOwnerIntelligence } from "@/lib/platform-owner-intelligence";
import "./platform-intelligence-dashboard.css";

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

type SchoolRow = {
  id: string;
  name: string;
  uniqueCode: string;
  status: string;
  createdAt: string | Date | null;
  studentCount: number;
  userCount: number;
  classCount: number;
  attendanceToday: number;
  subscriptionPlan?: { name?: string | null } | null;
};

function schoolRow(value: unknown): SchoolRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const subscriptionPlan = row.subscriptionPlan && typeof row.subscriptionPlan === "object" ? row.subscriptionPlan as { name?: string | null } : null;
  return {
    id: typeof row.id === "string" ? row.id : "",
    name: typeof row.name === "string" ? row.name : "Unnamed school",
    uniqueCode: typeof row.uniqueCode === "string" ? row.uniqueCode : "—",
    status: typeof row.status === "string" ? row.status : "active",
    createdAt: row.createdAt instanceof Date || typeof row.createdAt === "string" ? row.createdAt : null,
    studentCount: Number(row.studentCount || 0),
    userCount: Number(row.userCount || 0),
    classCount: Number(row.classCount || 0),
    attendanceToday: Number(row.attendanceToday || 0),
    subscriptionPlan,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GH").format(Number.isFinite(value) ? value : 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

function Bars({ rows, suffix = "" }: { rows: Array<{ label: string; value: number }>; suffix?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <div className="platform-intel-empty-small">No live records yet.</div>;
  return <div className="platform-intel-bars">{rows.map((row) => <div className="platform-intel-bar" key={row.label}>
    <div><span>{row.label}</span><strong>{formatNumber(row.value)}{suffix}</strong></div>
    <i><b style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }}/></i>
  </div>)}</div>;
}

function Ring({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className="platform-intel-ring" style={{ "--platform-ring": `${safe * 3.6}deg` } as CSSProperties}><div><strong>{safe}%</strong><span>{label}</span></div></div>;
}

function Kpi({ icon: Icon, label, value, detail, href, alert = false }: { icon: typeof School; label: string; value: string; detail: string; href?: string; alert?: boolean }) {
  const body = <><span className="platform-intel-kpi-icon"><Icon size={17}/></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></>;
  return href ? <Link href={href} className={`platform-intel-kpi ${alert ? "is-alert" : ""}`}>{body}</Link> : <article className={`platform-intel-kpi ${alert ? "is-alert" : ""}`}>{body}</article>;
}

export default function PlatformIntelligenceDashboard({ overview, health, audit, intelligence, messaging, totalStorageBytes, userName, role }: Props) {
  const access = usePlatformNavigationAccess();
  const schools = overview.schools.map(schoolRow).filter((item): item is SchoolRow => Boolean(item));
  const schoolCount = Number(overview.totals.schools || 0);
  const activeSchools = Number(overview.totals.activeSchools || 0);
  const suspendedSchools = Number(overview.totals.suspendedSchools || 0);
  const learners = Number(overview.totals.students || 0);
  const users = Number(overview.totals.users || 0);
  const classes = Number(overview.totals.classes || 0);
  const activeRate = schoolCount ? Math.round((activeSchools / schoolCount) * 100) : 0;
  const avgLearners = schoolCount ? Math.round(learners / schoolCount) : 0;
  const readiness = schoolCount ? intelligence.summary.averageReadiness : 0;
  const collected = Number(overview.totals.collected || 0);
  const unpaidInvoices = Number(overview.totals.unpaidInvoices || 0);
  const invoiceCount = Number(overview.totals.invoices || 0);
  const healthGood = health.database === "operational" && health.migrations === "operational";

  const now = new Date();
  const newSchoolsThisMonth = schools.filter((school) => {
    if (!school.createdAt) return false;
    const created = new Date(school.createdAt);
    return created.getUTCFullYear() === now.getUTCFullYear() && created.getUTCMonth() === now.getUTCMonth();
  }).length;

  const topSchools = [...schools].sort((a, b) => b.studentCount - a.studentCount).slice(0, 8).map((school) => ({ label: school.name, value: school.studentCount }));
  const planMap = new Map<string, number>();
  for (const school of schools) {
    const plan = school.subscriptionPlan?.name || "No plan assigned";
    planMap.set(plan, (planMap.get(plan) || 0) + 1);
  }
  const planRows = [...planMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const healthRows = [
    { label: "Healthy", value: intelligence.summary.healthySchools },
    { label: "Watch", value: intelligence.summary.watchSchools },
    { label: "Critical", value: intelligence.summary.criticalSchools },
  ];
  const prioritySchools = intelligence.schools.filter((school) => school.health !== "healthy").slice(0, 6);

  const workflows = [
    access?.["schools.manage"] ? { href: "/platform/schools/new", icon: Plus, title: "Onboard school", detail: "Create a tenant and owner access." } : null,
    access?.["schools.view"] ? { href: "/platform/schools", icon: Building2, title: "School network", detail: "Search tenants and open School 360." } : null,
    access?.["plans.manage"] ? { href: "/platform/plans", icon: Workflow, title: "Plans", detail: "Manage packages and entitlements." } : null,
    access?.["billing.view"] ? { href: "/platform/billing", icon: CircleDollarSign, title: "Billing", detail: "Review invoices and collections." } : null,
    access?.["support.view"] ? { href: "/platform/support", icon: LifeBuoy, title: "Support", detail: "Work school support cases." } : null,
    access?.["security.manage"] ? { href: "/platform/health", icon: ShieldCheck, title: "System health", detail: "Inspect platform dependencies." } : null,
  ].filter(Boolean) as Array<{ href: string; icon: typeof School; title: string; detail: string }>;

  return <AppShell universe="platform" active="Overview" title="Platform intelligence" subtitle="SukuuNova network command centre" userName={userName} role={role}>
    <div className="platform-intel">
      <section className="platform-intel-hero">
        <div><span className="platform-intel-eyebrow"><Sparkles size={14}/> Platform owner intelligence</span><h1>See the whole SukuuNova network at a glance.</h1><p>Schools, learners, users, readiness, billing, storage, risk and system health are brought together into one live control surface.</p></div>
        <div className="platform-intel-hero-actions">{access?.["schools.manage"] ? <Link href="/platform/schools/new" className="platform-intel-primary"><Plus size={15}/>Add school</Link> : null}{access?.["schools.view"] ? <Link href="/platform/schools" className="platform-intel-secondary"><Search size={14}/>Find school</Link> : null}</div>
      </section>

      <section className="platform-intel-kpis">
        <Kpi icon={Building2} label="Total schools" value={formatNumber(schoolCount)} detail={`${activeSchools} active · ${suspendedSchools} suspended`} href="/platform/schools" />
        <Kpi icon={ShieldCheck} label="Active network" value={`${activeRate}%`} detail={`${newSchoolsThisMonth} new this month`} href="/platform/schools" />
        <Kpi icon={GraduationCap} label="Learners" value={formatNumber(learners)} detail={`${formatNumber(avgLearners)} average per school`} href="/platform/analytics" />
        <Kpi icon={Users} label="User accounts" value={formatNumber(users)} detail="School user accounts across tenants" href="/platform/analytics" />
        <Kpi icon={School} label="Classes" value={formatNumber(classes)} detail="Academic class records network-wide" href="/platform/analytics" />
        <Kpi icon={Gauge} label="Readiness" value={schoolCount ? `${readiness}%` : "—"} detail={`${intelligence.summary.watchSchools} watch · ${intelligence.summary.criticalSchools} critical`} href="/platform/schools" alert={intelligence.summary.criticalSchools > 0} />
        <Kpi icon={CircleDollarSign} label="Platform collections" value={formatMoney(collected)} detail={`${unpaidInvoices} unpaid of ${invoiceCount} invoices`} href="/platform/billing" alert={unpaidInvoices > 0} />
        <Kpi icon={HardDrive} label="Tenant data" value={formatBytes(totalStorageBytes)} detail="Estimated PostgreSQL tenant footprint" href="/platform/health" />
      </section>

      <section className="platform-intel-grid platform-intel-grid-3">
        <article className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>Network status</span><h2>Active tenants</h2></div><Link href="/platform/schools">Schools</Link></div><div className="platform-intel-ring-layout"><Ring value={activeRate} label="active schools"/><div className="platform-intel-mini-stats"><span><b>{activeSchools}</b><small>Active</small></span><span><b>{suspendedSchools}</b><small>Suspended</small></span><span><b>{newSchoolsThisMonth}</b><small>New this month</small></span></div></div></article>
        <article className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>School health</span><h2>Readiness distribution</h2></div><Link href="/platform/schools">Inspect</Link></div><Bars rows={healthRows}/></article>
        <article className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>Commercial footprint</span><h2>Schools by plan</h2></div><Link href="/platform/plans">Plans</Link></div><Bars rows={planRows}/></article>
      </section>

      <section className="platform-intel-grid platform-intel-grid-main">
        <article className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>Network population</span><h2>Largest schools by learners</h2><p>Current active learner records per tenant.</p></div><Link href="/platform/analytics">Analytics</Link></div><Bars rows={topSchools}/></article>
        <article className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>System now</span><h2>Operational health</h2></div><Link href="/platform/health">Health</Link></div><div className="platform-intel-signals">
          <div><span><Database size={16}/></span><div><b>PostgreSQL</b><small>{health.database} · {health.latencyMs}ms response</small></div><strong className={health.database === "operational" ? "is-good" : "is-warn"}>{health.database === "operational" ? "Healthy" : "Review"}</strong></div>
          <div><span><Activity size={16}/></span><div><b>Migrations</b><small>Application schema state</small></div><strong className={health.migrations === "operational" ? "is-good" : "is-warn"}>{health.migrations}</strong></div>
          <div><span><AlertTriangle size={16}/></span><div><b>Critical findings</b><small>Readiness and operational risk</small></div><strong>{intelligence.summary.criticalIssues}</strong></div>
          <div><span><Users size={16}/></span><div><b>Access risks</b><small>Role and account findings</small></div><strong>{intelligence.summary.accessRisks}</strong></div>
          {messaging ? <div><span><MessageSquareText size={16}/></span><div><b>SMS inventory</b><small>{messaging.activeProvider} · {formatNumber(messaging.smsPurchased)} purchased</small></div><strong>{formatNumber(messaging.smsBalance)}</strong></div> : null}
        </div><div className={`platform-intel-health-banner ${healthGood ? "is-good" : "is-warn"}`}>{healthGood ? <ShieldCheck size={17}/> : <AlertTriangle size={17}/>}<span>{healthGood ? "Core platform services are operational." : "One or more core platform services need review."}</span></div></article>
      </section>

      <section className="platform-intel-grid platform-intel-grid-main">
        <article className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>Needs attention</span><h2>Priority schools</h2><p>Schools with warning or critical readiness signals.</p></div><Link href="/platform/schools">All schools</Link></div>{prioritySchools.length ? <div className="platform-intel-priority">{prioritySchools.map((school) => <Link href={`/platform/schools/${school.schoolId}`} key={school.schoolId}><span className={`platform-intel-health-dot is-${school.health}`}/><div><b>{school.name}</b><small>{school.uniqueCode} · {formatNumber(school.metrics.activeStudents)} learners · {school.issues[0]?.title ?? school.recommendedAction}</small></div><strong>{school.readinessScore}%</strong><ArrowRight size={14}/></Link>)}</div> : <div className="platform-intel-clear"><ShieldCheck size={22}/><div><b>All schools are clear.</b><span>No school currently has a warning or critical readiness state.</span></div></div>}</article>
        <article className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>Network posture</span><h2>Risk summary</h2></div></div><div className="platform-intel-risk-grid"><div><strong>{intelligence.summary.criticalIssues}</strong><span>Critical findings</span></div><div><strong>{intelligence.summary.accessRisks}</strong><span>Access risks</span></div><div><strong>{intelligence.summary.academicRisks}</strong><span>Academic gaps</span></div><div><strong>{unpaidInvoices}</strong><span>Unpaid invoices</span></div></div><p className="platform-intel-note">Daily-active-user telemetry is not currently stored by SukuuNova, so this dashboard shows real user accounts rather than inventing an “active today” number.</p></article>
      </section>

      <section className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>Core workflows</span><h2>Go straight to the work</h2></div></div><div className="platform-intel-workflows">{workflows.map(({ href, icon: Icon, title, detail }) => <Link href={href} key={href}><span><Icon size={17}/></span><div><b>{title}</b><small>{detail}</small></div><ArrowRight size={14}/></Link>)}</div></section>

      <section className="platform-intel-panel"><div className="platform-intel-panel-head"><div><span>Audit pulse</span><h2>Recent platform activity</h2></div>{access?.["audit.view"] ? <Link href="/platform/audit">Open audit</Link> : null}</div>{audit.events.length ? <div className="platform-intel-audit">{audit.events.slice(0, 8).map((event) => <div key={event.id}><span><BarChart3 size={15}/></span><div><b>{event.action}</b><small>{event.targetEntity || event.targetSchoolId || "Platform"}</small></div><time>{new Date(event.createdAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</time></div>)}</div> : <div className="platform-intel-clear"><ShieldCheck size={20}/><div><b>No audited changes yet.</b><span>Platform activity will appear here as administrators work.</span></div></div>}</section>
    </div>
  </AppShell>;
}
