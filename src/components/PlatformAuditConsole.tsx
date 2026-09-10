"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Clock3, ExternalLink, Filter, RefreshCw, Search, ShieldCheck } from "lucide-react";
import "./platform-audit-v3.css";

type AuditEvent = {
  id: string;
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetSchoolId: string | null;
  targetEntity: string | null;
  createdAt: string;
  meta?: unknown;
};
type Payload = { events: AuditEvent[]; nextCursor: string | null; message?: string; error?: string };

function sensitiveAction(action: string) {
  return /imperson|delete|suspend|permission|password|role|setting|billing/i.test(action);
}

function actionLabel(action: string) {
  return action.replace(/[._-]+/g, " ").replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

export default function PlatformAuditConsole() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");
  const [sensitive, setSensitive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const requestRef = useRef(0);

  const actionOptions = useMemo(() => Array.from(new Set(events.map((event) => event.action))).sort(), [events]);

  const load = useCallback(async (requestedCursor?: string | null) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: "audit", limit: "50" });
      if (query.trim()) params.set("q", query.trim());
      if (action !== "all") params.set("action", action);
      if (sensitive) params.set("sensitive", "true");
      if (requestedCursor) params.set("cursor", requestedCursor);
      const response = await fetch(`/api/platform/admin?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as Payload;
      if (requestId !== requestRef.current) return;
      if (!response.ok) {
        setMessage(data.message ?? data.error ?? "Unable to load audit history.");
        return;
      }
      setEvents(data.events ?? []);
      setCursor(requestedCursor ?? null);
      setNextCursor(data.nextCursor ?? null);
      setMessage("");
      setExpanded(null);
    } catch {
      if (requestId === requestRef.current) setMessage("Audit history could not be loaded.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [action, query, sensitive]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(null), query.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const sensitiveCount = events.filter((event) => sensitiveAction(event.action)).length;
  const schoolTargetCount = events.filter((event) => Boolean(event.targetSchoolId)).length;

  return <div className="platform-audit-v3">
    <section className="platform-audit-v3-hero">
      <div>
        <span className="platform-audit-v3-eyebrow">Governance · evidence trail</span>
        <h2>Trace every important Platform action to an accountable operator.</h2>
        <p>Investigate privileged changes by action, person, target or school. Expand an event only when you need the recorded context behind it.</p>
      </div>
      <button type="button" className="platform-audit-v3-refresh" onClick={() => void load(cursor)} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh evidence"}</button>
    </section>

    {message ? <div className="platform-audit-v3-notice" role="alert">{message}</div> : null}

    <section className="platform-audit-v3-kpis" aria-label="Audit evidence summary">
      <article className="platform-audit-v3-kpi"><div className="platform-audit-v3-kpi-top"><div><span className="platform-audit-v3-kpi-label">Events shown</span><strong>{events.length.toLocaleString()}</strong></div><span className="platform-audit-v3-kpi-icon"><ShieldCheck size={16}/></span></div><small>Current investigation result page</small></article>
      <article className={`platform-audit-v3-kpi ${sensitiveCount ? "is-alert" : ""}`}><div className="platform-audit-v3-kpi-top"><div><span className="platform-audit-v3-kpi-label">Sensitive actions</span><strong>{sensitiveCount}</strong></div><span className="platform-audit-v3-kpi-icon"><Filter size={16}/></span></div><small>Security, access, billing or policy changes</small></article>
      <article className="platform-audit-v3-kpi"><div className="platform-audit-v3-kpi-top"><div><span className="platform-audit-v3-kpi-label">School-targeted</span><strong>{schoolTargetCount}</strong></div><span className="platform-audit-v3-kpi-icon"><Search size={16}/></span></div><small>Events tied to a specific tenant on this page</small></article>
      <article className="platform-audit-v3-kpi"><div className="platform-audit-v3-kpi-top"><div><span className="platform-audit-v3-kpi-label">History position</span><strong>{cursor ? "Older" : "Latest"}</strong></div><span className="platform-audit-v3-kpi-icon"><Clock3 size={16}/></span></div><small>{nextCursor ? "More matching evidence is available" : "End of matching history reached"}</small></article>
    </section>

    <section className="platform-audit-v3-controls" aria-label="Audit investigation filters">
      <label className="platform-audit-v3-search"><Search size={15}/><span className="sr-only">Search audit events</span><input aria-label="Search audit events" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Action, operator, email, school or target"/></label>
      <select className="platform-audit-v3-select" aria-label="Filter by action" value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All actions</option>{actionOptions.map((option) => <option key={option} value={option}>{actionLabel(option)}</option>)}</select>
      <label className="platform-audit-v3-check"><input type="checkbox" checked={sensitive} onChange={(event) => setSensitive(event.target.checked)}/> Sensitive only</label>
      <Link className="platform-audit-v3-search-link" href="/platform/search"><Search size={14}/> Cross-system search</Link>
    </section>

    <section className="platform-audit-v3-card">
      <div className="platform-audit-v3-card-head"><div><span className="platform-audit-v3-eyebrow">Recorded activity</span><h3>Audit investigation</h3><p>Newest matching records appear first. Open a row to inspect actor, target and captured metadata.</p></div><span>{loading ? "Updating…" : `${events.length} shown`}</span></div>
      <div className="platform-audit-v3-table-head" aria-hidden="true"><span>Event</span><span>Operator</span><span>Target</span><span>Timestamp</span><span></span></div>

      {loading && events.length === 0 ? <div className="platform-audit-v3-empty" role="status"><RefreshCw size={20}/><b>Loading audit evidence…</b><span>Retrieving the newest matching Platform records.</span></div> : null}
      {!loading && events.map((event) => {
        const isOpen = expanded === event.id;
        const isSensitive = sensitiveAction(event.action);
        return <div className="platform-audit-v3-event" key={event.id}>
          <button type="button" className="platform-audit-v3-row" onClick={() => setExpanded(isOpen ? null : event.id)} aria-expanded={isOpen}>
            <div className="platform-audit-v3-primary"><span className={`platform-audit-v3-event-icon ${isSensitive ? "is-sensitive" : ""}`}>{isSensitive ? <Filter size={14}/> : <ShieldCheck size={14}/>}</span><span><b>{actionLabel(event.action)}</b><small>{event.id}</small></span></div>
            <div><span>{event.actorName ?? event.actorId}</span><small>{event.actorEmail ?? event.actorId}</small></div>
            <div><span>{event.targetEntity ?? "Platform"}</span><small>{event.targetSchoolId ? `School ${event.targetSchoolId}` : "Network-wide"}</small></div>
            <div><time>{new Date(event.createdAt).toLocaleString()}</time></div>
            <div><ChevronDown className={`platform-audit-v3-chevron ${isOpen ? "is-open" : ""}`} size={15}/></div>
          </button>
          {isOpen ? <div className="platform-audit-v3-detail">
            <div><strong>Accountable operator</strong><span>{event.actorName ?? "Unknown"}</span><small>{event.actorEmail ?? event.actorId}</small></div>
            <div><strong>Target</strong><span>{event.targetEntity ?? "Platform"}</span><small>{event.targetSchoolId ?? "No school target"}</small></div>
            <div className="platform-audit-v3-meta"><strong>Recorded context</strong><pre>{event.meta ? JSON.stringify(event.meta, null, 2) : "No metadata recorded for this event."}</pre></div>
            {event.targetSchoolId ? <Link className="platform-audit-v3-open" href={`/platform/schools/${event.targetSchoolId}`}><ExternalLink size={13}/> Open School 360</Link> : null}
          </div> : null}
        </div>;
      })}
      {!loading && events.length === 0 ? <div className="platform-audit-v3-empty"><Search size={20}/><b>No audit events match this investigation.</b><span>Clear the search or change the action and sensitivity filters.</span></div> : null}
    </section>

    <div className="platform-audit-v3-pagination">
      <button type="button" className="platform-audit-v3-page-button" disabled={!cursor || loading} onClick={() => void load(null)}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }}/> Back to latest</button>
      <span>{nextCursor ? "Older matching events are available." : "You are at the end of the matching history."}</span>
      <button type="button" className="platform-audit-v3-page-button" disabled={!nextCursor || loading} onClick={() => void load(nextCursor)}><ChevronRight size={14}/> Older events</button>
    </div>
  </div>;
}
