"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeAlert, Building2, GraduationCap, Plus, Search, Users } from "lucide-react";
import type { getPlatformOverview } from "@/lib/platform-admin-service";
import { usePlatformNavigationAccess } from "@/components/PlatformNavigationContext";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type SchoolRecord = { id:string; name:string; uniqueCode:string; status:string; createdAt:string | Date; studentCount:number; userCount:number; classCount:number; attendanceToday:number; invoices:number; unpaidInvoices:number; collected:number; subscriptionPlan?: { id:string; name:string; price:number|string } | null };
type Filter = "all" | "attention" | "active" | "suspended";
type Sort = "attention" | "name" | "students" | "collected";

function schoolRecords(overview: Overview): SchoolRecord[] {
  return overview.schools.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.uniqueCode !== "string") return [];
    return [{ id: row.id, name: row.name, uniqueCode: row.uniqueCode, status: typeof row.status === "string" ? row.status : "unknown", createdAt: typeof row.createdAt === "string" || row.createdAt instanceof Date ? row.createdAt : new Date(0), studentCount: Number(row.studentCount || 0), userCount: Number(row.userCount || 0), classCount: Number(row.classCount || 0), attendanceToday: Number(row.attendanceToday || 0), invoices: Number(row.invoices || 0), unpaidInvoices: Number(row.unpaidInvoices || 0), collected: Number(row.collected || 0), subscriptionPlan: row.subscriptionPlan && typeof row.subscriptionPlan === "object" ? row.subscriptionPlan as SchoolRecord["subscriptionPlan"] : null }];
  });
}

function attentionScore(s: SchoolRecord) {
  const invoicePressure = s.invoices ? s.unpaidInvoices / s.invoices : 0;
  let score = Math.min(30, Math.round(invoicePressure * 30));
  if (s.status !== "active") score += 55;
  if (s.studentCount > 0 && s.userCount === 0) score += 14;
  if (s.studentCount > 0 && s.classCount === 0) score += 12;
  if (s.studentCount > 0 && s.attendanceToday === 0) score += 18;
  return Math.min(100, score);
}
function attentionTone(score:number) { return score >= 60 ? "critical" : score >= 25 ? "watch" : "healthy"; }

export default function PlatformSchoolsConsole({ overview }: { overview: Overview }) {
  const platformAccess = usePlatformNavigationAccess();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("attention");
  const allSchools = useMemo(() => schoolRecords(overview), [overview]);
  const schools = useMemo(() => { const q = query.trim().toLowerCase(); return allSchools.filter((school) => !q || school.name.toLowerCase().includes(q) || school.uniqueCode.toLowerCase().includes(q)).filter((school) => filter === "all" || (filter === "attention" && attentionScore(school) >= 25) || (filter === "active" && school.status === "active") || (filter === "suspended" && school.status === "suspended")).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "students" ? b.studentCount - a.studentCount : sort === "collected" ? b.collected - a.collected : attentionScore(b) - attentionScore(a)); }, [allSchools, filter, query, sort]);
  const critical = allSchools.filter((school) => attentionScore(school) >= 60).length;
  const needsAttention = allSchools.filter((school) => attentionScore(school) >= 25).length;
  const canOnboard = platformAccess?.["schools.manage"] === true;
  const resetFilters = () => { setQuery(""); setFilter("all"); setSort("attention"); };

  return <div className="platform-page-stack">
    <section className="platform-page-header">
      <div><span className="platform-eyebrow">Network directory</span><h2>Schools</h2><p>Find a school, open its 360 view, or start a new school account. The directory stays focused on the next operator action.</p></div>
      <div className="platform-header-actions"><Link href="/platform/search" className="app-pill"><Search size={14}/> Global search</Link>{canOnboard ? <Link href="/platform/schools/new" className="app-action"><Plus size={14}/><strong>Add school</strong>Start onboarding</Link> : null}</div>
    </section>
    <section className="app-card app-panel platform-start-banner"><div><span className="platform-eyebrow">NEW ACCOUNT</span><h3>Bring a school onto SukuuNova</h3><p>Set school identity, owner access, commercial rules and operational defaults in one guided onboarding flow.</p></div>{canOnboard ? <Link href="/platform/schools/new" className="app-action"><Plus size={14}/><strong>Add a school</strong>Begin guided setup</Link> : <span className="app-pill">Requires schools.manage</span>}</section>
    <div className="app-grid kpis platform-kpis"><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">School accounts</span><span className="app-kpi-icon"><Building2 size={17}/></span></div><div className="app-kpi-value">{overview.totals.schools.toLocaleString()}</div><div className="app-kpi-meta">{overview.totals.activeSchools} active · {overview.totals.suspendedSchools} suspended</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Students</span><span className="app-kpi-icon"><GraduationCap size={17}/></span></div><div className="app-kpi-value">{Number(overview.totals.students).toLocaleString()}</div><div className="app-kpi-meta">Across every school tenant</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">School users</span><span className="app-kpi-icon"><Users size={17}/></span></div><div className="app-kpi-value">{Number(overview.totals.users).toLocaleString()}</div><div className="app-kpi-meta">Staff, teachers and operators</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Attention queue</span><span className="app-kpi-icon"><BadgeAlert size={17}/></span></div><div className="app-kpi-value">{needsAttention}</div><div className="app-kpi-meta">{critical} critical · {Math.max(0, needsAttention - critical)} watch</div></div></div>
    <section className="app-card app-panel platform-filter-bar"><div className="platform-filter-search"><Search size={16}/><input aria-label="Search schools" placeholder="Search by school name or unique code" value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">Clear</button>}</div><div className="platform-filter-chips" aria-label="School filters">{([['all','All'],['attention','Needs attention'],['active','Active'],['suspended','Suspended']] as const).map(([value,label]) => <button type="button" key={value} className={`platform-filter-chip ${filter === value ? 'is-active' : ''}`} onClick={() => setFilter(value)}>{label}<span>{value==='all'?allSchools.length:value==='attention'?needsAttention:value==='active'?overview.totals.activeSchools:overview.totals.suspendedSchools}</span></button>)}</div><div className="platform-filter-tools"><label><span>Sort</span><select aria-label="Sort schools" value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="attention">Attention</option><option value="name">Name</option><option value="students">Students</option><option value="collected">Collections</option></select></label>{(query || filter !== 'all' || sort !== 'attention') && <button type="button" className="app-pill" onClick={resetFilters}>Reset</button>}</div></section>
    <section className="app-card app-panel platform-school-table" aria-label="School accounts"><div className="platform-table-toolbar"><div><b>{schools.length.toLocaleString()}</b><span>matching school accounts</span></div><span>Open a school to continue the workflow.</span></div><div className="platform-school-grid platform-school-grid-head"><span>School</span><span>State</span><span>Plan</span><span>People</span><span>Finance</span><span>Open</span></div>{schools.map((school) => { const score = attentionScore(school); const tone = attentionTone(score); return <div key={school.id} className={`platform-school-grid platform-school-row platform-tone-${tone}`}><div className="platform-school-primary"><span className="platform-school-avatar"><Building2 size={16}/></span><div><b>{school.name}</b><small>{school.uniqueCode} · created {new Date(school.createdAt).toLocaleDateString()}</small></div></div><div><span className={`platform-status platform-status-${tone}`}>{score >= 60 ? "Critical" : score >= 25 ? "Watch" : school.status}</span></div><div><span className="platform-table-value">{school.subscriptionPlan?.name || "No plan"}</span><small className="platform-table-muted">{school.subscriptionPlan ? `₵${Number(school.subscriptionPlan.price || 0).toLocaleString()} / month` : "Needs assignment"}</small></div><div><span className="platform-table-value">{school.studentCount.toLocaleString()} students</span><small className="platform-table-muted">{school.userCount.toLocaleString()} users · {school.classCount.toLocaleString()} classes</small></div><div><span className={`platform-table-value ${school.unpaidInvoices ? 'is-warning' : ''}`}>{school.unpaidInvoices}/{school.invoices} unpaid</span><small className="platform-table-muted">₵{Number(school.collected || 0).toLocaleString()} collected</small></div><div><Link href={`/platform/schools/${school.id}`} className="app-action"><strong>Open</strong><ArrowRight size={13}/></Link></div></div>; })}{schools.length === 0 && <div className="platform-empty"><BadgeAlert size={22}/><b>No schools match the current view.</b><span>Change the search or filters to continue.</span><button type="button" className="app-action" onClick={resetFilters}><strong>Reset view</strong></button></div>}</section>
  </div>;
}
