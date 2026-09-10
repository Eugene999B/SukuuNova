"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  RefreshCw,
  School,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { PlatformAnalyticsNetwork, PlatformAnalyticsSchool } from "@/lib/platform-analytics-service";

type Payload = {
  generatedAt: string;
  windowDays: number;
  network: PlatformAnalyticsNetwork;
  schools: PlatformAnalyticsSchool[];
};

type MetricKey = "riskScore" | "attendanceCoverage" | "activityRate" | "collectionRate";

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function money(value: number) {
  return `₵${Number(value || 0).toLocaleString()}`;
}

function trendClass(value: number) {
  return value > 0.5 ? "is-positive" : value < -0.5 ? "is-negative" : "is-flat";
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span aria-label="No trend data">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${100 - ((value - min) / range) * 84 - 8}`)
    .join(" ");

  return (
    <svg className="platform-analytics-v3-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PlatformNetworkAnalytics() {
  const [data, setData] = useState<Payload | null>(null);
  const [days, setDays] = useState(28);
  const [query, setQuery] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("riskScore");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async (nextDays: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/platform/analytics?days=${nextDays}`, { cache: "no-store" });
      const payload = (await response.json()) as Payload & { error?: string; message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? payload.error ?? "Unable to load network analytics.");
        return;
      }
      setData(payload);
      setMessage("");
    } catch {
      setMessage("Network analytics could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(28);
  }, [load]);

  const schools = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.schools ?? [])
      .filter((school) => !normalized || school.name.toLowerCase().includes(normalized) || school.uniqueCode.toLowerCase().includes(normalized))
      .filter((school) => !riskOnly || school.riskLevel !== "stable")
      .sort((a, b) => Number(b[metric]) - Number(a[metric]));
  }, [data, metric, query, riskOnly]);

  const topRisk = useMemo(() => [...(data?.schools ?? [])].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5), [data]);
  const network = data?.network;

  function changeWindow(value: number) {
    setDays(value);
    void load(value);
  }

  return (
    <div className="platform-analytics-v3">
      <section className="platform-analytics-v3-hero">
        <div className="platform-analytics-v3-hero-copy">
          <span className="platform-analytics-v3-eyebrow">Network intelligence</span>
          <h2>See the network clearly, then act on the right school.</h2>
          <p>Compare school health, attendance, operator activity and commercial exposure without opening every tenant. Every row links directly into School 360 for investigation.</p>
        </div>
        <div className="platform-analytics-v3-actions">
          <Link href="/platform/reports" className="platform-analytics-v3-button"><BarChart3 size={16}/> Reports</Link>
          <button type="button" className="platform-analytics-v3-button" onClick={() => void load(days)} disabled={loading}><RefreshCw size={16}/> {loading ? "Refreshing…" : "Refresh data"}</button>
        </div>
      </section>

      {message ? <div className="platform-analytics-v3-notice" role="status">{message}</div> : null}

      <section className="platform-analytics-v3-toolbar" aria-label="Analytics filters">
        <div className="platform-analytics-v3-field">
          <span className="platform-analytics-v3-label">Analysis window</span>
          <div className="platform-analytics-v3-window">
            {[14, 28, 60, 90].map((value) => <button type="button" key={value} className={days === value ? "is-active" : ""} onClick={() => changeWindow(value)}>{value}d</button>)}
          </div>
        </div>
        <label className="platform-analytics-v3-field">
          <span className="platform-analytics-v3-label">Find a school</span>
          <input className="platform-analytics-v3-search" aria-label="Search analytics schools" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by school name or code" />
        </label>
        <label className="platform-analytics-v3-check"><input type="checkbox" checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} /> Show schools needing attention only</label>
      </section>

      <section className="platform-analytics-v3-kpis" aria-label="Network summary">
        <div className="platform-analytics-v3-kpi"><div className="platform-analytics-v3-kpi-top"><span className="platform-analytics-v3-kpi-label">Network schools</span><span className="platform-analytics-v3-kpi-icon"><School size={17}/></span></div><strong>{network?.schools ?? 0}</strong><p>{network?.critical ?? 0} critical · {network?.watch ?? 0} watch</p></div>
        <div className="platform-analytics-v3-kpi"><div className="platform-analytics-v3-kpi-top"><span className="platform-analytics-v3-kpi-label">Learners</span><span className="platform-analytics-v3-kpi-icon"><Users size={17}/></span></div><strong>{(network?.students ?? 0).toLocaleString()}</strong><p>{(network?.users ?? 0).toLocaleString()} active user accounts across the network</p></div>
        <div className="platform-analytics-v3-kpi"><div className="platform-analytics-v3-kpi-top"><span className="platform-analytics-v3-kpi-label">Attendance coverage</span><span className="platform-analytics-v3-kpi-icon"><Activity size={17}/></span></div><strong>{pct(network?.attendanceCoverage ?? 0)}</strong><p>Weighted learner coverage during the selected window</p></div>
        <div className="platform-analytics-v3-kpi"><div className="platform-analytics-v3-kpi-top"><span className="platform-analytics-v3-kpi-label">Collection rate</span><span className="platform-analytics-v3-kpi-icon"><CircleDollarSign size={17}/></span></div><strong>{pct(network?.collectionRate ?? 0)}</strong><p>Platform invoices collected across active schools</p></div>
        <div className="platform-analytics-v3-kpi"><div className="platform-analytics-v3-kpi-top"><span className="platform-analytics-v3-kpi-label">Outstanding</span><span className="platform-analytics-v3-kpi-icon"><ShieldAlert size={17}/></span></div><strong>{money(network?.outstanding ?? 0)}</strong><p>Current commercial exposure requiring follow-up</p></div>
      </section>

      <div className="platform-analytics-v3-main">
        <section className="platform-analytics-v3-card">
          <div className="platform-analytics-v3-card-head">
            <div><h3>School performance matrix</h3><p>Reorder the network by the signal you want to investigate. Risk remains evidence-based rather than a cosmetic status badge.</p></div>
            <select className="platform-analytics-v3-select" aria-label="Benchmark metric" value={metric} onChange={(event) => setMetric(event.target.value as MetricKey)}>
              <option value="riskScore">Highest risk</option>
              <option value="attendanceCoverage">Attendance coverage</option>
              <option value="activityRate">Operator activity</option>
              <option value="collectionRate">Collection rate</option>
            </select>
          </div>
          <div className="platform-analytics-v3-table-wrap">
            <div className="platform-analytics-v3-table">
              <div className="platform-analytics-v3-table-head"><span>School</span><span>Risk</span><span>Attendance</span><span>Trend</span><span>Finance</span><span>Action</span></div>
              {schools.map((school) => (
                <div className="platform-analytics-v3-row" key={school.id}>
                  <div className="platform-analytics-v3-school"><span className="platform-analytics-v3-school-icon"><School size={18}/></span><div><b>{school.name}</b><span>{school.uniqueCode} · {school.students.toLocaleString()} learners · {school.users.toLocaleString()} users</span></div></div>
                  <div className="platform-analytics-v3-score"><strong>{school.riskScore}/100</strong><span className={`platform-analytics-v3-risk is-${school.riskLevel}`}>{school.riskLevel}</span></div>
                  <div className="platform-analytics-v3-coverage"><span className="platform-analytics-v3-meter"><i style={{ width: `${school.attendanceCoverage}%` }}/></span><span>{pct(school.attendanceCoverage)} coverage</span></div>
                  <div className="platform-analytics-v3-trend"><span className={`platform-analytics-v3-trend-label ${trendClass(school.attendanceTrend)}`}>{school.attendanceTrend >= 0 ? <ArrowUpRight size={15}/> : <ArrowDownRight size={15}/>} {signed(school.attendanceTrend)}pp</span><Sparkline values={school.series.map((row) => school.students ? (row.activeStudents / school.students) * 100 : 0)} /></div>
                  <div className="platform-analytics-v3-finance"><strong>{pct(school.collectionRate)}</strong><span>{money(school.outstanding)} outstanding</span></div>
                  <div><Link href={`/platform/schools/${school.id}`} className="platform-analytics-v3-inspect">Open <ArrowRight size={14}/></Link></div>
                </div>
              ))}
              {!schools.length ? <div className="platform-analytics-v3-empty"><AlertTriangle size={24}/><b>No schools match this view.</b><span>Clear the search or remove the attention-only filter.</span></div> : null}
            </div>
          </div>
        </section>

        <aside className="platform-analytics-v3-side">
          <section className="platform-analytics-v3-card">
            <div className="platform-analytics-v3-card-head"><div><h3>Risk leaders</h3><p>Schools with the highest composite operational risk.</p></div></div>
            {topRisk.map((school, index) => <Link href={`/platform/schools/${school.id}`} className="platform-analytics-v3-risk-row" key={school.id}><span className="platform-analytics-v3-rank">{index + 1}</span><div><b>{school.name}</b><small>{school.riskReasons[0] ?? "No material issue detected"}</small></div><strong>{school.riskScore}</strong></Link>)}
            {!topRisk.length ? <div className="platform-analytics-v3-empty"><b>No school risk signals yet.</b><span>Create or activate a school to begin network benchmarking.</span></div> : null}
          </section>

          <section className="platform-analytics-v3-card">
            <div className="platform-analytics-v3-card-head"><div><h3>How risk is composed</h3><p>The score is a prioritisation aid, not an automatic enforcement decision.</p></div></div>
            <div className="platform-analytics-v3-method">
              <div><b>Attendance</b><strong>up to 43</strong><span>Coverage and declining attendance trend.</span></div>
              <div><b>Operator activity</b><strong>up to 18</strong><span>Observed active-user footprint.</span></div>
              <div><b>Commercial</b><strong>up to 18</strong><span>Invoice collection performance.</span></div>
              <div><b>Access & setup</b><strong>up to 55</strong><span>School status and configuration gaps.</span></div>
            </div>
          </section>
        </aside>
      </div>

      <section className="platform-analytics-v3-card">
        <div className="platform-analytics-v3-card-head"><div><h3>Operational interpretation</h3><p>Use risk to choose where to look first, then confirm the evidence inside School 360 before acting.</p></div></div>
        <div className="platform-analytics-v3-guidance">
          <div><b>Critical</b><p>Open School 360 immediately and confirm the specific failing conditions before intervention.</p></div>
          <div><b>Watch</b><p>Review the leading signal, contact the school where needed, and monitor the next reporting window.</p></div>
          <div><b>Stable</b><p>No material risk is currently detected. Normal platform monitoring can continue.</p></div>
        </div>
      </section>
    </div>
  );
}
