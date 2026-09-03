"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeAlert, Building2, CreditCard, GraduationCap, Plus, Search, Users } from "lucide-react";
import type { getPlatformOverview } from "@/lib/platform-admin-service";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type SchoolRecord = Overview["schools"][number];
type Filter = "all" | "attention" | "active" | "suspended";

function attentionScore(s: SchoolRecord) {
  const invoicePressure = Number(s.invoices) ? Number(s.unpaidInvoices) / Number(s.invoices) : 0;
  let score = Math.min(30, Math.round(invoicePressure * 30));
  if (s.status !== "active") score += 55;
  if (Number(s.studentCount) > 0 && Number(s.userCount) === 0) score += 14;
  if (Number(s.studentCount) > 0 && Number(s.classCount) === 0) score += 12;
  if (Number(s.studentCount) > 0 && Number(s.attendanceToday) === 0) score += 18;
  return Math.min(100, score);
}

export default function PlatformSchoolsConsole({ overview }: { overview: Overview }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"attention" | "name" | "students" | "collected">("attention");
  const schools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(overview.schools as SchoolRecord[])]
      .filter((school) => !q || school.name.toLowerCase().includes(q) || school.uniqueCode.toLowerCase().includes(q))
      .filter((school) => filter === "all" || (filter === "attention" && attentionScore(school) >= 25) || (filter === "active" && school.status === "active") || (filter === "suspended" && school.status === "suspended"))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "students" ? Number(b.studentCount) - Number(a.studentCount) : sort === "collected" ? Number(b.collected) - Number(a.collected) : attentionScore(b) - attentionScore(a));
  }, [filter, overview.schools, query, sort]);

  return <>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:16,flexWrap:"wrap",marginTop:20,marginBottom:16}}>
      <div><div style={{fontSize:11,fontWeight:850,color:"var(--sn-primary-deep)",textTransform:"uppercase",letterSpacing:".12em"}}>Network directory</div><h2 style={{margin:"5px 0 3px",fontSize:24,letterSpacing:"-.035em"}}>Schools</h2><p style={{margin:0,color:"var(--sn-muted)",fontSize:12}}>One place to find, inspect, support and manage every school account.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link href="/platform/search" className="app-pill"><Search size={14}/> Global search</Link><Link href="/platform/schools/new" className="app-action"><Plus size={14}/><strong>Create school</strong></Link></div>
    </div>

    <div className="app-grid kpis">
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">All schools</span><span className="app-kpi-icon"><Building2 size={17}/></span></div><div className="app-kpi-value">{overview.totals.schools}</div><div className="app-kpi-meta">{overview.totals.activeSchools} active · {overview.totals.suspendedSchools} suspended</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Students</span><span className="app-kpi-icon"><GraduationCap size={17}/></span></div><div className="app-kpi-value">{Number(overview.totals.students).toLocaleString()}</div><div className="app-kpi-meta">Across all school accounts</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Accounts</span><span className="app-kpi-icon"><Users size={17}/></span></div><div className="app-kpi-value">{Number(overview.totals.users).toLocaleString()}</div><div className="app-kpi-meta">Staff, teachers and operators</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Financial signal</span><span className="app-kpi-icon"><CreditCard size={17}/></span></div><div className="app-kpi-value">{overview.totals.unpaidInvoices}</div><div className="app-kpi-meta">Invoices currently unpaid</div></div>
    </div>

    <section className="app-card app-panel" style={{marginTop:18,padding:18}}>
      <div style={{display:"grid",gridTemplateColumns:"minmax(260px,1fr) auto auto",gap:10,alignItems:"center"}}>
        <label style={{display:"flex",alignItems:"center",gap:9,border:"1px solid var(--sn-line)",borderRadius:12,padding:"10px 12px",background:"var(--sn-surface)"}}><Search size={15} color="var(--sn-muted)"/><input aria-label="Search schools" placeholder="Search by school name or code" value={query} onChange={(e)=>setQuery(e.target.value)} style={{border:0,outline:0,background:"transparent",width:"100%",font: "inherit"}}/></label>
        <select aria-label="Filter schools" value={filter} onChange={(e)=>setFilter(e.target.value as Filter)} style={{minHeight:40,border:"1px solid var(--sn-line)",borderRadius:12,padding:"0 10px",background:"var(--sn-surface)"}}><option value="all">All schools</option><option value="attention">Needs attention</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
        <select aria-label="Sort schools" value={sort} onChange={(e)=>setSort(e.target.value as typeof sort)} style={{minHeight:40,border:"1px solid var(--sn-line)",borderRadius:12,padding:"0 10px",background:"var(--sn-surface)"}}><option value="attention">Sort: attention</option><option value="name">Sort: name</option><option value="students">Sort: students</option><option value="collected">Sort: collected</option></select>
      </div>
    </section>

    <section className="app-card app-panel" style={{marginTop:14,overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:"minmax(280px,2fr) 120px 120px 150px 130px 100px",gap:12,padding:"12px 16px",borderBottom:"1px solid var(--sn-line)",color:"var(--sn-muted)",fontSize:9,fontWeight:850,textTransform:"uppercase",letterSpacing:".08em"}}><span>School</span><span>Status</span><span>Plan</span><span>People</span><span>Finance</span><span>Action</span></div>
      {schools.map((school)=>{const score=attentionScore(school);return <div key={school.id} style={{display:"grid",gridTemplateColumns:"minmax(280px,2fr) 120px 120px 150px 130px 100px",gap:12,alignItems:"center",padding:"15px 16px",borderBottom:"1px solid var(--sn-line)",background:score>=60?"#fffafa":"var(--sn-surface)"}}>
        <div style={{minWidth:0,display:"flex",gap:10,alignItems:"center"}}><span style={{width:34,height:34,borderRadius:10,display:"grid",placeItems:"center",background:"var(--sn-surface-2)",color:"var(--sn-primary-deep)",flex:"0 0 auto"}}><Building2 size={16}/></span><div style={{minWidth:0}}><b style={{display:"block",fontSize:12}}>{school.name}</b><span style={{display:"block",fontSize:10,color:"var(--sn-muted)",marginTop:2}}>{school.uniqueCode} · created {new Date(school.createdAt).toLocaleDateString()}</span></div></div>
        <span className="app-pill" style={{justifySelf:"start"}}>{school.status}</span>
        <span style={{fontSize:11,color:"var(--sn-ink)"}}>{school.subscriptionPlan?.name || "No plan"}</span>
        <span style={{fontSize:11,color:"var(--sn-ink)"}}>{school.studentCount} students · {school.userCount} users</span>
        <span style={{fontSize:11,color:school.unpaidInvoices?"#9a6700":"var(--sn-ink)"}}>{school.unpaidInvoices}/{school.invoices} unpaid</span>
        <Link href={`/platform/schools/${school.id}`} className="app-action" style={{justifyContent:"center"}}><strong>Open</strong><ArrowRight size={13}/></Link>
      </div>})}
      {schools.length===0&&<div style={{padding:40,textAlign:"center",color:"var(--sn-muted)"}}><BadgeAlert size={20} style={{marginBottom:8}}/><div style={{fontWeight:750,color:"var(--sn-ink)"}}>No matching schools</div><div style={{fontSize:11,marginTop:3}}>Try a different search or filter.</div></div>}
    </section>
  </>;
}
