"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Clock3, ExternalLink, Filter, RefreshCw, Search, ShieldCheck } from "lucide-react";

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

  const actionOptions = useMemo(() => Array.from(new Set(events.map((event) => event.action))).sort(), [events]);

  const load = useCallback(async (requestedCursor?: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: "audit", limit: "50" });
      if (query.trim()) params.set("q", query.trim());
      if (action !== "all") params.set("action", action);
      if (sensitive) params.set("sensitive", "true");
      if (requestedCursor) params.set("cursor", requestedCursor);
      const response = await fetch(`/api/platform/admin?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as Payload;
      if (!response.ok) {
        setMessage(data.message ?? data.error ?? "Unable to load audit history.");
        return;
      }
      setEvents(data.events ?? []);
      setCursor(requestedCursor ?? null);
      setNextCursor(data.nextCursor ?? null);
      setMessage("");
      setExpanded(null);
    } finally {
      setLoading(false);
    }
  }, [action, query, sensitive]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(null), query.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const sensitiveCount = events.filter((event) => sensitiveAction(event.action)).length;
  return (
    <div className="audit-page-stack">
      <section className="platform-page-header">
        <div>
          <span className="platform-eyebrow">Governance & evidence</span>
          <h2>Audit Investigation</h2>
          <p>Trace who changed what, where and when. Expand an event for its recorded decision context.</p>
        </div>
        <button type="button" className="app-pill" onClick={() => void load(cursor)} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </section>

      {message && <div className="app-banner" role="status"><div><h3>{message}</h3><p>The audit reader is permission-scoped and read-only.</p></div></div>}

      <div className="app-grid kpis platform-kpis">
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Events</span><span className="app-kpi-icon"><ShieldCheck size={17} /></span></div><div className="app-kpi-value">{events.length.toLocaleString()}</div><div className="app-kpi-meta">Current result page</div></div>
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Sensitive</span><span className="app-kpi-icon"><Filter size={17} /></span></div><div className="app-kpi-value">{sensitiveCount}</div><div className="app-kpi-meta">High-impact events on this page</div></div>
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Page</span><span className="app-kpi-icon"><Clock3 size={17} /></span></div><div className="app-kpi-value">{cursor ? "Next" : "1"}</div><div className="app-kpi-meta">Cursor-based navigation</div></div>
      </div>

      <section className="app-card app-panel audit-controls">
        <div className="audit-search"><Search size={15} /><input aria-label="Search audit events" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search action, operator, email, school or target" /></div>
        <div className="audit-filter"><span>Action</span><select aria-label="Filter by action" value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All actions</option>{actionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
        <label className="audit-check"><input type="checkbox" checked={sensitive} onChange={(event) => setSensitive(event.target.checked)} /> Sensitive only</label>
        <Link className="app-pill" href="/platform/search">Cross-system search</Link>
      </section>

      <section className="app-card app-panel audit-table">
        <div className="audit-table-head"><span>Event</span><span>Operator</span><span>Target</span><span>Timestamp</span><span></span></div>
        {events.map((event) => {
          const isOpen = expanded === event.id;
          return <div className="audit-event" key={event.id}>
            <button type="button" className="audit-row" onClick={() => setExpanded(isOpen ? null : event.id)} aria-expanded={isOpen}>
              <div><b>{event.action}</b><small>{event.id}</small></div>
              <div><span>{event.actorName ?? event.actorId}</span><small>{event.actorEmail ?? event.actorId}</small></div>
              <div><span>{event.targetEntity ?? "Platform"}</span><small>{event.targetSchoolId ? `School ${event.targetSchoolId}` : "Network-wide"}</small></div>
              <div><span>{new Date(event.createdAt).toLocaleString()}</span></div>
              <div><ChevronDown className={isOpen ? "audit-chevron open" : "audit-chevron"} size={15} /></div>
            </button>
            {isOpen && <div className="audit-detail">
              <div><strong>Accountable operator</strong><span>{event.actorName ?? "Unknown"}</span><small>{event.actorEmail ?? event.actorId}</small></div>
              <div><strong>Target</strong><span>{event.targetEntity ?? "Platform"}</span><small>{event.targetSchoolId ? event.targetSchoolId : "No school target"}</small></div>
              <div className="audit-meta-block"><strong>Recorded context</strong><pre>{event.meta ? JSON.stringify(event.meta, null, 2) : "No metadata recorded for this event."}</pre></div>
              {event.targetSchoolId && <Link className="app-pill" href={`/platform/schools/${event.targetSchoolId}`}><ExternalLink size={13} /> Open School 360</Link>}
            </div>}
          </div>;
        })}
        {events.length === 0 && <div className="platform-empty">No audit events match the current investigation.</div>}
      </section>

      <div className="audit-pagination">
        <button type="button" className="app-pill" disabled={!cursor || loading} onClick={() => void load(null)}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> First page</button>
        <span>{nextCursor ? "More events available" : "End of matching history"}</span>
        <button type="button" className="app-pill" disabled={!nextCursor || loading} onClick={() => void load(nextCursor)}><ChevronRight size={14} /> Next page</button>
      </div>

      <style jsx global>{`\n        .audit-page-stack{display:grid;gap:16px;margin-top:22px}.audit-controls{display:grid;grid-template-columns:minmax(280px,1fr) auto auto auto;gap:10px;align-items:center;padding:12px}.audit-search{display:flex;align-items:center;gap:8px;height:40px;padding:0 11px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;color:#7d8c9b}.audit-search input{border:0;outline:0;background:transparent;min-width:0;flex:1;font:inherit;font-size:12px;color:#30465a}.audit-filter{display:flex;align-items:center;gap:6px}.audit-filter span{font-size:9px;font-weight:850;color:#788797;text-transform:uppercase;letter-spacing:.07em}.audit-filter select{height:40px;border:1px solid #dbe3ec;border-radius:9px;background:#fff;color:#536577;font:inherit;font-size:11px;padding:0 10px;max-width:280px}.audit-check{display:flex;gap:7px;align-items:center;height:40px;padding:0 4px;font-size:11px;font-weight:700;color:#536577;white-space:nowrap}.audit-check input{width:18px;height:18px}.audit-table{overflow:hidden}.audit-table-head{display:grid;grid-template-columns:minmax(230px,1.3fr) minmax(180px,1fr) minmax(170px,.95fr) 175px 34px;gap:12px;padding:11px 18px;background:#f7f9fb;border-bottom:1px solid #e2e8ee;color:#738193;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.audit-row{width:100%;display:grid;grid-template-columns:minmax(230px,1.3fr) minmax(180px,1fr) minmax(170px,.95fr) 175px 34px;gap:12px;align-items:center;padding:13px 18px;border:0;border-bottom:1px solid #edf1f5;background:#fff;text-align:left;cursor:pointer}.audit-row:hover{background:#fbfcfe}.audit-row b,.audit-row span{display:block;font-size:11px;color:#2d4154;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.audit-row small{display:block;margin-top:3px;font-size:9px;color:#8794a2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.audit-chevron{transition:transform .16s ease}.audit-chevron.open{transform:rotate(180deg)}.audit-detail{display:grid;grid-template-columns:1fr 1fr 1.7fr auto;gap:14px;padding:15px 18px;background:#f9fbfd;border-bottom:1px solid #e3e9ef}.audit-detail strong{display:block;margin-bottom:5px;font-size:9px;color:#718193;text-transform:uppercase;letter-spacing:.08em}.audit-detail span{display:block;font-size:11px;font-weight:700;color:#2c4255}.audit-detail small{display:block;margin-top:3px;font-size:9px;color:#7f8d9c}.audit-meta-block pre{max-height:170px;overflow:auto;margin:0;padding:10px;border:1px solid #e1e7ed;border-radius:8px;background:#fff;color:#46596b;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.audit-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px}.audit-pagination>span{font-size:11px;color:#788797}@media(max-width:1050px){.audit-controls{grid-template-columns:1fr 1fr}.audit-detail{grid-template-columns:1fr 1fr}.audit-detail .app-pill{grid-column:1/-1;justify-self:start}}@media(max-width:760px){.audit-table-head{display:none}.audit-row{grid-template-columns:minmax(0,1fr) 30px;gap:7px;padding:12px 14px}.audit-row>div:nth-child(2),.audit-row>div:nth-child(3),.audit-row>div:nth-child(4){grid-column:1/-1}.audit-row>div:nth-child(5){grid-column:2;grid-row:1}.audit-controls{grid-template-columns:1fr}.audit-detail{grid-template-columns:1fr;padding:14px}.audit-pagination{align-items:stretch;flex-direction:column}}\n      `}</style>
    </div>
  );
}
