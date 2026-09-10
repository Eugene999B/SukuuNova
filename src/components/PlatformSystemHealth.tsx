"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  RefreshCw,
  Route,
  ServerCog,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type Health = {
  database: string;
  migrations?: string;
  api: string;
  nextjs: string;
  latencyMs: number;
  checkedAt: string;
};

type StateInfo = { good: boolean; label: string };

function stateInfo(value: string): StateInfo {
  const normalized = value.toLowerCase();
  if (["operational", "ok", "healthy"].includes(normalized)) return { good: true, label: "Operational" };
  if (normalized === "self") return { good: true, label: "Reachable" };
  if (normalized === "not checked") return { good: false, label: "Not checked" };
  return { good: false, label: value || "Unknown" };
}

function State({ value }: { value: string }) {
  const state = stateInfo(value);
  return <span className={`platform-health-v3-state ${state.good ? "is-good" : "is-bad"}`}>{state.good ? <CheckCircle2 size={14}/> : <XCircle size={14}/>} {state.label}</span>;
}

export default function PlatformSystemHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [auto, setAuto] = useState(true);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/platform/admin?view=health", { cache: "no-store", signal: controller.signal });
      const payload = (await response.json()) as Health & { error?: string; message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? payload.error ?? "Health check failed.");
        return;
      }
      setHealth(payload);
      setMessage("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Unable to reach the health endpoint.");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [auto, load]);

  const checked = health ? new Date(health.checkedAt).toLocaleString() : "Not checked yet";
  const databaseGood = stateInfo(health?.database ?? "Not checked").good;
  const migrationsGood = stateInfo(health?.migrations ?? "Not checked").good;
  const apiGood = stateInfo(health?.api ?? "Not checked").good;
  const nextGood = stateInfo(health?.nextjs ?? "Not checked").good;
  const allGood = Boolean(health) && databaseGood && migrationsGood && apiGood && nextGood;
  const latency = health?.latencyMs ?? null;
  const latencyLabel = latency === null ? "Not measured" : latency < 100 ? "Fast" : latency < 500 ? "Elevated" : "Slow";

  return (
    <div className="platform-health-v3">
      <section className="platform-health-v3-hero">
        <div className="platform-health-v3-hero-copy">
          <span className="platform-health-v3-eyebrow">Operations telemetry</span>
          <h2>Know whether the platform is healthy before schools feel it.</h2>
          <p>This console checks the control-plane database, applied migration state and the application route serving this operator session. Use it as the first triage point, not as a replacement for logs and infrastructure monitoring.</p>
        </div>
        <div className="platform-health-v3-actions">
          <label className="platform-health-v3-auto"><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)}/> Auto-refresh every 30s</label>
          <button className="platform-health-v3-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> {loading ? "Checking…" : "Run health check"}</button>
        </div>
      </section>

      {message ? <div className="platform-health-v3-alert" role="alert">{message}</div> : null}

      <section className="platform-health-v3-overview" aria-label="Current system health">
        <div className="platform-health-v3-overview-main"><span className={`platform-health-v3-pulse ${allGood ? "" : "is-review"}`}>{allGood ? <ShieldCheck size={22}/> : <AlertTriangle size={22}/>}</span><div><b>{allGood ? "Core platform checks are operational" : loading && !health ? "Checking platform state…" : "Operator review required"}</b><span>Last completed check: {checked}</span></div></div>
        <div className="platform-health-v3-stat"><span>Database latency</span><strong>{latency === null ? "—" : `${latency}ms`}</strong><small>{latencyLabel} · SELECT 1 round-trip</small></div>
        <div className="platform-health-v3-stat"><span>Core checks</span><strong>{[databaseGood, migrationsGood, apiGood, nextGood].filter(Boolean).length}/4</strong><small>Database, migrations, route and app</small></div>
        <div className="platform-health-v3-stat"><span>Refresh mode</span><strong>{auto ? "Live" : "Manual"}</strong><small>{auto ? "Next check within 30 seconds" : "Run checks when required"}</small></div>
      </section>

      <div className="platform-health-v3-grid">
        <section className="platform-health-v3-card">
          <div className="platform-health-v3-card-head"><div><h3>Core service checks</h3><p>Each check answers a specific operational question instead of collapsing everything into one green badge.</p></div><Activity size={20}/></div>
          <div className="platform-health-v3-service"><span className="platform-health-v3-service-icon"><Database size={19}/></span><div><b>PostgreSQL connectivity</b><p>Can the control plane connect to the database and execute a minimal query?</p></div><State value={health?.database ?? "Not checked"}/></div>
          <div className="platform-health-v3-service"><span className="platform-health-v3-service-icon"><Gauge size={19}/></span><div><b>Database migrations</b><p>Has the database recorded completed Prisma migrations instead of presenting an uninitialised schema?</p></div><State value={health?.migrations ?? "Not checked"}/></div>
          <div className="platform-health-v3-service"><span className="platform-health-v3-service-icon"><Route size={19}/></span><div><b>Platform API route</b><p>The authenticated health endpoint is reachable through the current application request path.</p></div><State value={health?.api ?? "Not checked"}/></div>
          <div className="platform-health-v3-service"><span className="platform-health-v3-service-icon"><ServerCog size={19}/></span><div><b>Next.js application</b><p>The application process serving Platform Control is reachable for this request.</p></div><State value={health?.nextjs ?? "Not checked"}/></div>
        </section>

        <section className="platform-health-v3-card">
          <div className="platform-health-v3-card-head"><div><h3>Operator interpretation</h3><p>Use health state to choose the next action; do not restart or roll back from a colour alone.</p></div><Clock3 size={20}/></div>
          <div className="platform-health-v3-guidance">
            <div className="is-good"><b><CheckCircle2 size={16}/> Operational</b><p>Core checks respond normally. Continue ordinary platform work and let auto-refresh watch for change.</p></div>
            <div className="is-warn"><b><AlertTriangle size={16}/> Degraded</b><p>Inspect recent deployments, database latency, background workers and upstream dependencies before schools are affected.</p></div>
            <div className="is-bad"><b><XCircle size={16}/> Incident</b><p>Collect request and infrastructure evidence first. Restart, rollback or failover should follow diagnosis rather than replace it.</p></div>
          </div>
        </section>
      </div>

      <section className="platform-health-v3-card">
        <div className="platform-health-v3-card-head"><div><h3>When something changes</h3><p>A short operator workflow keeps incident response deliberate and auditable.</p></div></div>
        <div className="platform-health-v3-next"><div><b>1 · Confirm</b><p>Run a fresh check and confirm which service changed and whether latency moved with it.</p></div><div><b>2 · Correlate</b><p>Check recent deployments, audit activity, workers and database evidence for the same time window.</p></div><div><b>3 · Act safely</b><p>Choose the smallest justified intervention, then verify recovery with another health check.</p></div></div>
      </section>

      <section className="platform-health-v3-card platform-health-v3-note"><h3>Scope of this check</h3><p>This page confirms application-level reachability, a basic PostgreSQL query and recorded migration state. It does not prove external provider availability, queue throughput, object-storage health, tracker-gateway health or end-user network quality.</p></section>
    </div>
  );
}
