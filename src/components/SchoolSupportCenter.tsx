"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, LifeBuoy, MessageSquareReply, RefreshCw, Send, ShieldCheck } from "lucide-react";
import "@/components/school-support-center.css";

type SupportKind = "problem" | "suggestion";
type SupportSeverity = "low" | "medium" | "high" | "critical";
type SupportModule = "general" | "onboarding" | "import" | "academics" | "gradebook" | "report_cards" | "attendance" | "fees" | "communications" | "transport" | "library" | "arcade" | "devices" | "payroll" | "recruitment" | "assets";
type SupportMessage = { id: string; senderType: string; senderName: string; body: string; sentAt: string };
type SupportTicket = {
  id: string; raisedByUserId: string; raisedByName: string; subject: string; status: string; kind: SupportKind; module: SupportModule;
  severity: SupportSeverity; context: Record<string, unknown>; attachmentUrl: string | null; createdAt: string; updatedAt: string; messages: SupportMessage[];
};
type Payload = { access: { canCreate: boolean; canViewOwn: boolean; canManage: boolean }; tickets: SupportTicket[] };

const MODULE_LABELS: Record<SupportModule, string> = {
  general: "General", onboarding: "Onboarding", import: "Data Import", academics: "Academics", gradebook: "Gradebook",
  report_cards: "Report Cards", attendance: "Attendance", fees: "Fees & Finance", communications: "Communications",
  transport: "Transport", library: "Library", arcade: "Learning Arcade", devices: "Devices", payroll: "Payroll",
  recruitment: "Recruitment", assets: "Assets",
};

function messageOf(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as Record<string, unknown>;
  return typeof row.message === "string" ? row.message : typeof row.error === "string" ? row.error : fallback;
}

function when(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(date) : value;
}

export default function SchoolSupportCenter() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<SupportKind>("problem");
  const [module, setModule] = useState<SupportModule>("general");
  const [severity, setSeverity] = useState<SupportSeverity>("medium");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/school/support", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageOf(payload, "Could not load Support Center."));
      setData(payload as Payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load Support Center.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const tickets = data?.tickets ?? [];
    return {
      open: tickets.filter((ticket) => ["open", "in_progress"].includes(ticket.status)).length,
      critical: tickets.filter((ticket) => ticket.severity === "critical" && ["open", "in_progress"].includes(ticket.status)).length,
      resolved: tickets.filter((ticket) => ["resolved", "closed"].includes(ticket.status)).length,
      suggestions: tickets.filter((ticket) => ticket.kind === "suggestion").length,
    };
  }, [data]);

  async function createTicket() {
    if (!subject.trim() || !body.trim()) { setError("Add a subject and describe the issue or suggestion."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/school/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create", kind, module, severity, subject, body,
          attachmentUrl: attachmentUrl.trim() || null,
          context: {
            pagePath: window.location.pathname,
            browser: navigator.userAgent.slice(0, 300),
            schoolWorkflow: MODULE_LABELS[module],
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageOf(payload, "Could not create the support case."));
      setSubject(""); setBody(""); setAttachmentUrl(""); setKind("problem"); setModule("general"); setSeverity("medium");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the support case.");
    } finally { setBusy(false); }
  }

  async function reply(ticketId: string) {
    const text = replies[ticketId]?.trim();
    if (!text) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/school/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", ticketId, body: text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageOf(payload, "Could not send the reply."));
      setReplies((current) => ({ ...current, [ticketId]: "" }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send the reply.");
    } finally { setBusy(false); }
  }

  return <div className="school-support-center">
    <section className="support-command">
      <div><span className="app-eyebrow">PILOT SUPPORT</span><h2>Problems and ideas should become traceable work</h2><p>Send SukuuNova a structured case with the affected module and severity. Replies stay attached to the same case so your school and platform support share one history.</p></div>
      <span className="support-trust"><ShieldCheck size={16}/> Tenant-scoped support</span>
    </section>

    {error ? <div className="support-error" role="alert"><AlertTriangle size={15}/><span>{error}</span></div> : null}

    <section className="support-kpis" aria-label="Support summary">
      <div><span><LifeBuoy size={15}/></span><div><small>Open cases</small><strong>{stats.open}</strong></div></div>
      <div><span><AlertTriangle size={15}/></span><div><small>Critical open</small><strong>{stats.critical}</strong></div></div>
      <div><span><CheckCircle2 size={15}/></span><div><small>Resolved</small><strong>{stats.resolved}</strong></div></div>
      <div><span><Lightbulb size={15}/></span><div><small>Suggestions</small><strong>{stats.suggestions}</strong></div></div>
    </section>

    <div className="support-layout">
      {data?.access.canCreate ? <section className="app-card app-panel support-create">
        <div className="app-card-head"><div><span className="app-eyebrow">NEW CASE</span><h2>Tell us what happened</h2><p>Critical is for a school-blocking or safety-sensitive failure. Suggestions should normally use low or medium severity.</p></div></div>
        <div className="support-form-grid">
          <label><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value as SupportKind)} disabled={busy}><option value="problem">Problem</option><option value="suggestion">Suggestion</option></select></label>
          <label><span>Module</span><select value={module} onChange={(event) => setModule(event.target.value as SupportModule)} disabled={busy}>{Object.entries(MODULE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as SupportSeverity)} disabled={busy}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        </div>
        <label className="support-field"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={240} placeholder="e.g. Report cards are not sending by SMS" disabled={busy}/></label>
        <label className="support-field"><span>Description</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={6} placeholder="What were you doing, what did you expect, and what happened instead?" disabled={busy}/></label>
        <details className="sn-progressive"><summary>Add screenshot or attachment link</summary><div className="sn-progressive-body"><label className="support-field"><span>HTTPS or SukuuNova file path</span><input value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} maxLength={2000} placeholder="https://... or /files/..." disabled={busy}/></label><p className="support-hint">Direct screenshot upload will use SukuuNova's certified storage path when that uploader is available; raw image data is not stored inside the ticket record.</p></div></details>
        <button type="button" className="app-action" onClick={() => void createTicket()} disabled={busy || !subject.trim() || !body.trim()}><Send size={14}/><strong>Submit case</strong></button>
      </section> : null}

      <section className="app-card app-panel support-queue">
        <div className="app-card-head"><div><span className="app-eyebrow">CASE QUEUE</span><h2>{data?.access.canManage ? "School support cases" : "Your support cases"}</h2></div><button type="button" className="app-pill" onClick={() => void load()} disabled={busy}><RefreshCw size={13}/> Refresh</button></div>
        <div className="support-ticket-list">
          {(data?.tickets ?? []).map((ticket) => <details className={`support-ticket is-${ticket.severity}`} key={ticket.id}>
            <summary>
              <div className="support-ticket-main"><div><span className={`support-kind is-${ticket.kind}`}>{ticket.kind}</span><span className={`support-severity is-${ticket.severity}`}>{ticket.severity}</span><span className="support-status">{ticket.status.replace(/_/g, " ")}</span></div><strong>{ticket.subject}</strong><small>{MODULE_LABELS[ticket.module] ?? ticket.module} · raised by {ticket.raisedByName} · {when(ticket.updatedAt)}</small></div>
            </summary>
            <div className="support-thread">
              {ticket.messages.map((message) => <article className={`support-message is-${message.senderType}`} key={message.id}><div><strong>{message.senderName}</strong><small>{when(message.sentAt)}</small></div><p>{message.body}</p></article>)}
              {ticket.attachmentUrl ? <a href={ticket.attachmentUrl} target="_blank" rel="noreferrer" className="support-attachment">Open screenshot / attachment</a> : null}
              {data?.access.canViewOwn ? <div className="support-reply"><textarea rows={3} value={replies[ticket.id] ?? ""} onChange={(event) => setReplies((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Reply to this case…" maxLength={5000} disabled={busy}/><button type="button" className="app-action" onClick={() => void reply(ticket.id)} disabled={busy || !(replies[ticket.id]?.trim())}><MessageSquareReply size={14}/><strong>Send reply</strong></button></div> : null}
            </div>
          </details>)}
          {!busy && data && data.tickets.length === 0 ? <div className="platform-empty"><strong>No support cases yet.</strong><span>Problems and pilot suggestions will appear here after they are submitted.</span></div> : null}
        </div>
      </section>
    </div>
  </div>;
}
