"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, RefreshCw, School, Users } from "lucide-react";
import type { PlatformAnalyticsSchool } from "@/lib/platform-analytics-service";

type Payload = { generatedAt: string; windowDays: number; network: Record<string, number>; schools: PlatformAnalyticsSchool[] };

type MetricKey = "riskScore" | "attendanceCoverage" | "activityRate" | "collectionRate";

function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)}`; }
function pct(value: number) { return `${Math.round(value)}%`; }
function trendClass(value: number) { return value > 0.5 ? "is-positive" : value < -0.5 ? "is-negative" : "is-flat"; }

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span className="analytics-spark-empty">—</span>;
  const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${100 - ((value - min) / range) * 84 - 8}`).join(" ");
  return <svg className="analytics-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function PlatformNetworkAnalytics() {
  const [data, setData] = useState<Payload | null>(null);
  const [days, setDays] = useState(28);
  const [query, setQuery] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("riskScore");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load(nextDays = days) {
    setLoading(true);
    try {
      const response = await fetch(`/api/platform/analytics?days=${nextDays}`, { cache: "no-store" });
      const payload = await response.json() as Payload & { error?: string; message?: string };
      if (!response.ok) { setMessage(payload.message ?? payload.error ?? "Unable to load network analytics."); return; }
      setData(payload); setMessage("");
    } catch { setMessage("Network analytics could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const schools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.schools ?? []).filter((school) => !q || school.name.toLowerCase().includes(q) || school.uniqueCode.toLowerCase().includes(q)).filter((school) => !riskOnly || school.riskLevel !== "stable");
  }, [data, query, riskOnly]);
  const topRisk = data?.schools.slice(0, 5) ?? [];
  const network = data?.network;

  return <div className="analytics-page-stack">
    <section className="platform-page-header">
      <div><span className="platform-eyebrow">Network intelligence</span><h2>Analytics</h2><p>Compare every school on operational coverage, adoption, collections and explainable risk signals.</p></div>
      <div className="platform-header-actions"><Link href="/platform/reports" className="app-pill"><BarChart3 size={14}/> Reports</Link><button type="button" className="app-pill" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> {loading ? "Refreshing" : "Refresh"}</button></div>
    </section>

    {message && <div className="app-banner" role="status"><div><h3>{message}</h3><p>The analytics endpoint remains permission-scoped and school-safe.</p></div></div>}
    <section className="analytics-controlbar app-card app-panel">
      <div className="analytics-control-group"><span className="analytics-control-label">Window</span><div className="analytics-toggle-group">{[14,28,60,90].map((value) => <button type="button" key={value} className={days===value?"is-active":""} onClick={() => { setDays(value); void load(value); }}>{value}d</button>)}</div></div>
      <label className="analytics-search"><span>Find school</span><input aria-label="Search analytics schools" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Name or code"/></label>
      <label className="analytics-check"><input type="checkbox" checked={riskOnly} onChange={(event)=>setRiskOnly(event.target.checked)}/> Needs attention only</label>
    </section>

    <div className="app-grid kpis platform-kpis">
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Network schools</span><span className="app-kpi-icon"><School size={17}/></span></div><div className="app-kpi-value">{network?.schools ?? 0}</div><div className="app-kpi-meta">{network?.critical ?? 0} critical · {network?.watch ?? 0} watch</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Attendance coverage</span><span className="app-kpi-icon"><Activity size={17}/></span></div><div className="app-kpi-value">{pct(network?.attendanceCoverage ?? 0)}</div><div className="app-kpi-meta">Distinct students reached during the window</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Collection rate</span><span className="app-kpi-icon">₵</span></div><div className="app-kpi-value">{pct(network?.collectionRate ?? 0)}</div><div className="app-kpi-meta">Platform invoicing collected</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Outstanding</span><span className="app-kpi-icon">₵</span></div><div className="app-kpi-value">₵{Number(network?.outstanding ?? 0).toLocaleString()}</div><div className="app-kpi-meta">Commercial exposure across the network</div></div>
    </div>

    <div className="analytics-primary-grid">
      <section className="app-card app-panel analytics-benchmark">
        <div className="app-card-head"><div><h2>School benchmark</h2><p>Every score is traceable to measurable operational conditions. Select a metric to reorder the table.</p></div><select aria-label="Benchmark metric" value={metric} onChange={(event)=>setMetric(event.target.value as MetricKey)}><option value="riskScore">Risk</option><option value="attendanceCoverage">Attendance</option><option value="activityRate">Activity</option><option value="collectionRate">Collections</option></select></div>
        <div className="analytics-table-head"><span>School</span><span>Score</span><span>Coverage</span><span>Trend</span><span>Finance</span><span>Open</span></div>
        <div className="analytics-table-body">
          {[...schools].sort((a,b)=>Number(b[metric])-Number(a[metric])).map((school)=><div className="analytics-table-row" key={school.id}>
            <div className="analytics-school"><span className="analytics-school-avatar"><School size={15}/></span><div><b>{school.name}</b><small>{school.uniqueCode} · {school.students.toLocaleString()} students · {school.users.toLocaleString()} users</small></div></div>
            <div><strong>{metric === "riskScore" ? `${school.riskScore}/100` : pct(school[metric])}</strong><span className={`analytics-risk analytics-risk-${school.riskLevel}`}>{school.riskLevel}</span></div>
            <div><span className="analytics-meter"><i style={{ width: `${school.attendanceCoverage}%` }}/></span><small>{pct(school.attendanceCoverage)} attendance</small></div>
            <div className="analytics-trend"><span className={trendClass(school.attendanceTrend)}>{school.attendanceTrend >= 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {signed(school.attendanceTrend)}pp</span><Sparkline values={school.series.map((row)=>school.students ? (row.activeStudents/school.students)*100 : 0)}/></div>
            <div><b>{pct(school.collectionRate)}</b><small>₵{school.outstanding.toLocaleString()} outstanding</small></div>
            <div><Link href={`/platform/schools/${school.id}`} className="app-action"><strong>Inspect</strong><ArrowUpRight size={13}/></Link></div>
          </div>)}
          {schools.length === 0 && <div className="platform-empty"><AlertTriangle size={20}/><b>No schools match this view.</b><span>Change the search or attention filter.</span></div>}
        </div>
      </section>

      <aside className="analytics-side-stack">
        <section className="app-card app-panel"><div className="app-card-head"><div><h2>Risk leaders</h2><p>Highest composite scores right now.</p></div></div>{topRisk.map((school,index)=><Link href={`/platform/schools/${school.id}`} className="analytics-risk-row" key={school.id}><span className="analytics-rank">{index+1}</span><div><b>{school.name}</b><small>{school.riskReasons[0] ?? "No material issue detected"}</small></div><strong>{school.riskScore}</strong></Link>)}{topRisk.length===0&&<div className="platform-empty">No school risk signals yet.</div>}</section>
        <section className="app-card app-panel"><div className="app-card-head"><div><h2>How the score works</h2><p>Weighted, bounded and explainable. No black-box classification.</p></div></div><div className="analytics-method"><div><span>Attendance</span><strong>0–25</strong><small>Coverage + declining trend</small></div><div><span>Activity</span><strong>0–18</strong><small>Observed active-user footprint</small></div><div><span>Commercial</span><strong>0–18</strong><small>Collection performance</small></div><div><span>Access & setup</span><strong>0–55</strong><small>Status and configuration gaps</small></div></div></section>
      </aside>
    </div>

    <section className="app-card app-panel analytics-bottom"><div className="app-card-head"><div><h2>Operational interpretation</h2><p>Use the signals to decide what to investigate, not to replace human judgement.</p></div><Users size={18} color="var(--sn-muted)"/></div><div className="analytics-guidance-grid"><div><b>Critical</b><span>Inspect School 360 now; confirm account status, support need and commercial exposure.</span></div><div><b>Watch</b><span>Compare the recent trend with the school’s normal operating baseline before intervening.</span></div><div><b>Stable</b><span>No immediate platform intervention suggested; continue observing the rolling window.</span></div></div></section>
  </div>;
}
