"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CircleCheckBig, Gauge, HardDrive, Plus, Search, TriangleAlert } from "lucide-react";
import type { getPlatformOverview } from "@/lib/platform-admin-service";
import type { getPlatformOwnerIntelligence } from "@/lib/platform-owner-intelligence";
import type { SchoolStorageEstimate } from "@/lib/platform-storage-service";
import { usePlatformNavigationAccess } from "@/components/PlatformNavigationContext";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type Intelligence = Awaited<ReturnType<typeof getPlatformOwnerIntelligence>>;
type SchoolRecord = {
  id: string;
  name: string;
  uniqueCode: string;
  status: string;
  createdAt: string | Date;
  studentCount: number;
  userCount: number;
  classCount: number;
  invoices: number;
  unpaidInvoices: number;
  collected: number;
  subscriptionPlan?: { id: string; name: string; price: number | string } | null;
};
type Filter = "all" | "attention" | "active" | "suspended";
type Sort = "attention" | "name" | "students" | "storage" | "collected";

type Props = {
  overview: Overview;
  intelligence: Intelligence;
  storageBySchool: Record<string, SchoolStorageEstimate>;
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
      invoices: Number(row.invoices || 0),
      unpaidInvoices: Number(row.unpaidInvoices || 0),
      collected: Number(row.collected || 0),
      subscriptionPlan: row.subscriptionPlan && typeof row.subscriptionPlan === "object" ? row.subscriptionPlan as SchoolRecord["subscriptionPlan"] : null,
    }];
  });
}

export default function PlatformSchoolsConsole({ overview, intelligence, storageBySchool }: Props) {
  const platformAccess = usePlatformNavigationAccess();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("attention");
  const allSchools = useMemo(() => schoolRecords(overview), [overview]);
  const intelligenceBySchool = useMemo(() => new Map(intelligence.schools.map((school) => [school.schoolId, school])), [intelligence]);
  const needsAttention = intelligence.schools.filter((school) => school.health !== "healthy").length;
  const critical = intelligence.schools.filter((school) => school.health === "critical").length;
  const totalStorage = Object.values(storageBySchool).reduce((sum, item) => sum + item.bytes, 0);
  const canOnboard = platformAccess?.["schools.manage"] === true;

  const schools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allSchools
      .filter((school) => !q || school.name.toLowerCase().includes(q) || school.uniqueCode.toLowerCase().includes(q))
      .filter((school) => {
        const condition = intelligenceBySchool.get(school.id)?.health ?? "healthy";
        if (filter === "all") return true;
        if (filter === "attention") return condition !== "healthy";
        if (filter === "active") return school.status === "active";
        return school.status === "suspended";
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "students") return b.studentCount - a.studentCount;
        if (sort === "storage") return (storageBySchool[b.id]?.bytes ?? 0) - (storageBySchool[a.id]?.bytes ?? 0);
        if (sort === "collected") return b.collected - a.collected;
        return (intelligenceBySchool.get(b.id)?.attentionScore ?? 0) - (intelligenceBySchool.get(a.id)?.attentionScore ?? 0);
      });
  }, [allSchools, filter, intelligenceBySchool, query, sort, storageBySchool]);

  const resetFilters = () => { setQuery(""); setFilter("all"); setSort("attention"); };

  return <div className="platform-v3">
    <section className="platform-v3-hero">
      <div className="platform-v3-hero-copy"><span className="platform-eyebrow">School network</span><h2>{allSchools.length ? "Every school, one clear directory." : "Ready for your first school."}</h2><p>{allSchools.length ? "Search once, see operational condition immediately, then open School 360 for the complete tenant picture." : "The production network is empty. Create the first school when you have the official information ready."}</p></div>
      <div className="platform-v3-actions">{canOnboard ? <Link href="/platform/schools/new" className="app-action"><Plus size={15}/><strong>{allSchools.length ? "Add school" : "Create first school"}</strong></Link> : null}</div>
    </section>

    <section className="platform-v3-kpis" aria-label="School network totals">
      <article className="platform-v3-kpi"><div className="platform-v3-kpi-top"><div><span className="platform-v3-kpi-label">Schools</span><strong>{allSchools.length}</strong></div><span className="platform-v3-kpi-icon"><Building2 size={17}/></span></div><small>{overview.totals.activeSchools} active · {overview.totals.suspendedSchools} suspended</small></article>
      <article className={`platform-v3-kpi ${critical ? "is-danger" : needsAttention ? "is-alert" : ""}`}><div className="platform-v3-kpi-top"><div><span className="platform-v3-kpi-label">Need attention</span><strong>{needsAttention}</strong></div><span className="platform-v3-kpi-icon"><TriangleAlert size={17}/></span></div><small>{critical} critical · {Math.max(0, needsAttention - critical)} watch</small></article>
      <article className="platform-v3-kpi"><div className="platform-v3-kpi-top"><div><span className="platform-v3-kpi-label">Average readiness</span><strong>{allSchools.length ? `${intelligence.summary.averageReadiness}%` : "—"}</strong></div><span className="platform-v3-kpi-icon"><Gauge size={17}/></span></div><small>{allSchools.length ? `${intelligence.summary.healthySchools} schools currently healthy` : "Starts after the first tenant is configured"}</small></article>
      <article className="platform-v3-kpi"><div className="platform-v3-kpi-top"><div><span className="platform-v3-kpi-label">Database footprint</span><strong>{formatBytes(totalStorage)}</strong></div><span className="platform-v3-kpi-icon"><HardDrive size={17}/></span></div><small>School-owned PostgreSQL row data across the network</small></article>
    </section>

    {allSchools.length ? <section className="platform-schools-v3-toolbar" aria-label="School filters">
      <div className="platform-schools-v3-search"><Search size={15}/><input aria-label="Search schools" placeholder="Search school name or code" value={query} onChange={(event) => setQuery(event.target.value)}/>{query ? <button type="button" onClick={() => setQuery("")}>Clear</button> : null}</div>
      <div className="platform-schools-v3-filters">{([['all','All'],['attention','Needs attention'],['active','Active'],['suspended','Suspended']] as const).map(([value,label]) => <button type="button" key={value} className={`platform-schools-v3-filter ${filter === value ? "is-active" : ""}`} onClick={() => setFilter(value)}>{label}<span>{value === "all" ? allSchools.length : value === "attention" ? needsAttention : value === "active" ? overview.totals.activeSchools : overview.totals.suspendedSchools}</span></button>)}</div>
      <select className="platform-schools-v3-sort" aria-label="Sort schools" value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="attention">Sort: attention</option><option value="name">Sort: name</option><option value="students">Sort: learners</option><option value="storage">Sort: storage</option><option value="collected">Sort: collections</option></select>
    </section> : null}

    {allSchools.length === 0 ? <section className="platform-v3-panel"><div className="platform-v3-empty"><span className="platform-v3-empty-icon"><CircleCheckBig size={20}/></span><h3>The school network is clean and empty.</h3><p>No demo, Eugene Academy or test tenant remains. When you give us the first real trial-school information, create it here and its operational profile will appear immediately.</p>{canOnboard ? <div className="platform-v3-empty-actions"><Link href="/platform/schools/new" className="app-action"><Plus size={14}/><strong>Onboard first school</strong></Link></div> : null}</div></section> : schools.length ? <section className="platform-school-card-grid" aria-label="School accounts">{schools.map((school) => {
      const signal = intelligenceBySchool.get(school.id);
      const health = signal?.health ?? (school.status === "active" ? "healthy" : "critical");
      const storage = storageBySchool[school.id];
      const topFinding = signal?.issues[0]?.title ?? "No current operational finding";
      return <Link href={`/platform/schools/${school.id}`} key={school.id} className="platform-school-card">
        <div className="platform-school-card-head"><div className="platform-school-card-identity"><span><Building2 size={18}/></span><div><h3>{school.name}</h3><p>{school.uniqueCode} · Created {new Date(school.createdAt).toLocaleDateString()}</p></div></div><span className={`platform-v3-status is-${health}`}>{health === "healthy" ? "Healthy" : health === "watch" ? "Watch" : "Critical"}</span></div>
        <div className="platform-school-card-metrics"><div><span>Readiness</span><strong>{signal ? `${signal.readinessScore}%` : "—"}</strong></div><div><span>Learners</span><strong>{school.studentCount.toLocaleString()}</strong></div><div><span>Users</span><strong>{school.userCount.toLocaleString()}</strong></div><div><span>Storage</span><strong className="platform-school-card-storage">{formatBytes(storage?.bytes ?? 0)}</strong></div></div>
        <div className="platform-school-card-metrics"><div><span>Classes</span><strong>{school.classCount.toLocaleString()}</strong></div><div><span>Plan</span><strong>{school.subscriptionPlan?.name || "No plan"}</strong></div><div><span>Unpaid</span><strong>{school.unpaidInvoices}/{school.invoices}</strong></div><div><span>Collections</span><strong>₵{school.collected.toLocaleString()}</strong></div></div>
        <div className="platform-school-card-bottom"><div className="platform-school-card-plan"><span>Top operational signal</span><strong>{topFinding}</strong></div><span className="platform-school-card-open">Open School 360 <ArrowRight size={14}/></span></div>
      </Link>;
    })}</section> : <section className="platform-v3-panel"><div className="platform-v3-empty"><span className="platform-v3-empty-icon"><Search size={20}/></span><h3>No schools match this view.</h3><p>Change the search or filter instead of staring at an empty table.</p><div className="platform-v3-empty-actions"><button type="button" className="app-pill" onClick={resetFilters}>Reset filters</button></div></div></section>}
  </div>;
}
