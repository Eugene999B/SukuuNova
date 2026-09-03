import Link from "next/link";
import { Activity, ArrowRight, BadgeAlert, CreditCard, Gauge, GraduationCap, LifeBuoy, School, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { getPlatformOverview, getPlatformHealth, listPlatformAudit } from "@/lib/platform-admin-service";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type Health = Awaited<ReturnType<typeof getPlatformHealth>>;
type Audit = Awaited<ReturnType<typeof listPlatformAudit>>;
type SchoolRecord = Overview["schools"][number];

type Props = { overview: Overview; health: Health; audit: Audit };

function scoreSchool(s: SchoolRecord): number {
  const totalInvoices = Number(s.invoices || 0);
  const unpaidRatio = totalInvoices ? Number(s.unpaidInvoices || 0) / totalInvoices : 0;
  const studentGap = Number(s.studentCount || 0) > 0 && Number(s.userCount || 0) === 0 ? 14 : 0;
  const classGap = Number(s.studentCount || 0) > 0 && Number(s.classCount || 0) === 0 ? 12 : 0;
  const attendanceGap = Number(s.studentCount || 0) > 0 && Number(s.attendanceToday || 0) === 0 ? 18 : 0;
  const financePressure = Math.min(30, Math.round(unpaidRatio * 30));
  const suspension = s.status !== "active" ? 55 : 0;
  return Math.min(100, suspension + financePressure + studentGap + classGap + attendanceGap);
}

function attentionLabel(score: number) {
  if (score >= 60) return { label: "Critical", tone: "#b42318", bg: "#fff1f0" };
  if (score >= 25) return { label: "Watch", tone: "#9a6700", bg: "#fff8e1" };
  return { label: "Healthy", tone: "#087443", bg: "#ecfdf3" };
}

function Stat({ icon: Icon, label, value, meta }: { icon: typeof School; label: string; value: string; meta: string }) {
  return <div className="app-card app-kpi" style={{ padding: 18 }}><div className="app-kpi-top"><span className="app-kpi-label">{label}</span><span className="app-kpi-icon"><Icon size={17} strokeWidth={2.1}/></span></div><div className="app-kpi-value">{value}</div><div className="app-kpi-meta">{meta}</div></div>;
}

export default function PlatformControlCenter({ overview, health, audit }: Props) {
  const schools = overview.schools as SchoolRecord[];
  const attention = [...schools].map((school) => ({ school, score: scoreSchool(school) })).sort((a, b) => b.score - a.score).slice(0, 6);
  const totalCollected = Number(overview.totals.collected || 0);
  const averageAttention = schools.length ? Math.round(attention.reduce((sum, item) => sum + item.score, 0) / attention.length) : 0;
  const activeRate = overview.totals.schools ? Math.round((overview.totals.activeSchools / overview.totals.schools) * 100) : 0;

  return <AppShell universe="platform" title="Control Center" subtitle="Operate the SukuuNova network from one accountable view: schools, risk, finance, access and support.">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",marginTop:20,marginBottom:18}}>
      <div><div style={{fontSize:11,fontWeight:850,color:"var(--sn-primary-deep)",textTransform:"uppercase",letterSpacing:".12em"}}>Network command center</div><h2 style={{margin:"5px 0 2px",fontSize:24,letterSpacing:"-.035em"}}>Know what needs attention before schools report it.</h2><p style={{margin:0,color:"var(--sn-muted)",fontSize:12}}>Signals are derived from live school operations and platform activity.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link href="/platform/schools" className="app-action"><strong>Open schools</strong><ArrowRight size={14}/></Link><Link href="/platform/support" className="app-pill"><LifeBuoy size={14}/> Support queue</Link></div>
    </div>

    <div className="app-grid kpis">
      <Stat icon={School} label="Schools" value={String(overview.totals.schools)} meta={`${activeRate}% active across the network`} />
      <Stat icon={GraduationCap} label="Students" value={Number(overview.totals.students).toLocaleString()} meta={`${Number(overview.totals.classes).toLocaleString()} classes configured`} />
      <Stat icon={CreditCard} label="Collected" value={`₵${totalCollected.toLocaleString()}`} meta={`${overview.totals.unpaidInvoices} unpaid platform invoices`} />
      <Stat icon={Gauge} label="Attention index" value={`${averageAttention}/100`} meta={averageAttention >= 60 ? "Immediate review recommended" : averageAttention >= 25 ? "Some schools need review" : "Network currently stable"} />
    </div>

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.55fr) minmax(320px,.85fr)",gap:18,marginTop:18}}>
      <section className="app-card app-panel" style={{padding:20}}>
        <div className="app-card-head"><div><h2>School attention queue</h2><p>Explainable operational scoring. Open the school record to investigate and act.</p></div><Link href="/platform/schools" className="app-pill">View all</Link></div>
        <div style={{display:"grid",gap:4}}>{attention.map(({school,score})=>{const state=attentionLabel(score);return <div key={school.id} className="app-list-row" style={{alignItems:"center"}}><span className="app-list-icon"><BadgeAlert size={16}/></span><div style={{minWidth:0}}><b>{school.name}</b><span>{school.uniqueCode} · {school.studentCount} students · {school.unpaidInvoices}/{school.invoices} invoices unpaid</span></div><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}><span style={{fontSize:10,fontWeight:850,color:state.tone,background:state.bg,borderRadius:999,padding:"5px 8px"}}>{state.label} · {score}</span><Link className="app-action" href={`/platform/schools/${school.id}`}><strong>Inspect</strong></Link></div></div>})}</div>
        {attention.length===0&&<div style={{padding:"22px 0",color:"var(--sn-muted)"}}>No schools are currently visible to this administrator.</div>}
      </section>

      <section className="app-card app-panel" style={{padding:20}}>
        <div className="app-card-head"><div><h2>Platform posture</h2><p>Core control-plane signals.</p></div></div>
        <div className="app-list-row"><div><b><ShieldCheck size={15} style={{verticalAlign:"-3px",marginRight:7}}/>Access</b><span>Role-based platform permissions enabled</span></div><span className="app-pill">Protected</span></div>
        <div className="app-list-row"><div><b><Activity size={15} style={{verticalAlign:"-3px",marginRight:7}}/>Database</b><span>{health.database} · {health.latencyMs}ms</span></div><span className="app-pill">Live</span></div>
        <div className="app-list-row"><div><b><Users size={15} style={{verticalAlign:"-3px",marginRight:7}}/>Operators</b><span>Use Workers & Permissions for least-privilege access</span></div><Link href="/platform/admins" className="app-pill">Manage</Link></div>
        <div className="app-list-row"><div><b>School coverage</b><span>{overview.totals.activeSchools} active · {overview.totals.suspendedSchools} suspended</span></div><Link href="/platform/schools" className="app-pill">Review</Link></div>
      </section>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:18,marginTop:18}}>
      <section className="app-card app-panel" style={{padding:20}}><div className="app-card-head"><div><h2>Financial exposure</h2><p>Where the platform may need intervention.</p></div></div><div className="app-kpi-value" style={{fontSize:30}}>₵{totalCollected.toLocaleString()}</div><div className="app-list-row"><div><b>{overview.totals.invoices}</b><span>Platform invoices issued</span></div></div><div className="app-list-row"><div><b>{overview.totals.unpaidInvoices}</b><span>Invoices needing attention</span></div><Link href="/platform/billing" className="app-pill">Open billing</Link></div></section>
      <section className="app-card app-panel" style={{padding:20}}><div className="app-card-head"><div><h2>People footprint</h2><p>Network scale at a glance.</p></div></div><div className="app-kpi-value" style={{fontSize:30}}>{Number(overview.totals.users).toLocaleString()}</div><div className="app-list-row"><div><b>{Number(overview.totals.students).toLocaleString()}</b><span>Students</span></div></div><div className="app-list-row"><div><b>{Number(overview.totals.classes).toLocaleString()}</b><span>Classes</span></div><Link href="/platform/analytics" className="app-pill">Analyze</Link></div></section>
      <section className="app-card app-panel" style={{padding:20}}><div className="app-card-head"><div><h2>Recent control activity</h2><p>Latest audited platform actions.</p></div><Link href="/platform/audit" className="app-pill">Audit log</Link></div>{audit.slice(0,5).map((event)=><div className="app-list-row" key={event.id}><div><b>{event.action}</b><span>{event.targetEntity || (event.targetSchoolId ? `School ${event.targetSchoolId}` : "Platform")}</span></div><small>{new Date(event.createdAt).toLocaleDateString()}</small></div>)}{audit.length===0&&<p style={{color:"var(--sn-muted)"}}>No platform activity recorded yet.</p>}</section>
    </div>

    <div style={{marginTop:18,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",padding:"14px 16px",border:"1px solid var(--sn-line)",borderRadius:14,background:"var(--sn-surface-2)",color:"var(--sn-muted)",fontSize:11}}><span style={{fontWeight:850,color:"var(--sn-ink)"}}>Designed for action:</span><span>search a school</span><span>→</span><span>inspect health</span><span>→</span><span>open support / billing / access</span><span>→</span><span>audit the change</span></div>
  </AppShell>;
}
