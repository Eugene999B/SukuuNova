"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, LifeBuoy, MessageSquare, RefreshCw, Search, ShieldAlert } from "lucide-react";

type School = { id: string; name: string; uniqueCode: string };
type Ticket = { id: string; subject: string; status: string; createdAt: string; raisedByUserId: string };
type TicketDetail = Ticket & { schoolId: string; messages?: Array<{ id: string; senderId: string; body: string; sentAt: string }> };
type User = { id: string; name: string; email: string | null; phone: string | null; status: string };

type TicketStatus = "open" | "in_progress" | "resolved";

const STATUS_LABEL: Record<TicketStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

export default function SupportConsole() {
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ticketId, setTicketId] = useState("");
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [status, setStatus] = useState<TicketStatus>("in_progress");
  const [body, setBody] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TicketStatus>("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadSchools() {
    setLoading(true);
    try {
      const response = await fetch("/api/platform/phase4?view=schools", { cache: "no-store" });
      const data = await response.json() as { schools?: School[] };
      if (response.ok) setSchools(data.schools ?? []);
    } finally { setLoading(false); }
  }

  async function loadTicketDetail(nextSchoolId: string, nextTicketId: string) {
    if (!nextSchoolId || !nextTicketId) { setTicketDetail(null); return; }
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/platform/phase4?view=support_ticket&schoolId=${encodeURIComponent(nextSchoolId)}&ticketId=${encodeURIComponent(nextTicketId)}`, { cache: "no-store" });
      const data = await response.json() as { ticket?: TicketDetail; message?: string };
      if (response.ok && data.ticket) setTicketDetail(data.ticket);
      else { setTicketDetail(null); setMessage(data.message ?? "Could not load the selected case conversation."); }
    } finally { setDetailLoading(false); }
  }

  async function selectSchool(id: string) {
    setSchoolId(id); setTicketId(""); setTicketDetail(null); setMessage("");
    if (!id) { setTickets([]); setUsers([]); return; }
    setLoading(true);
    try {
      const [ticketResponse, snapshotResponse] = await Promise.all([
        fetch(`/api/platform/phase4?view=support&schoolId=${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/platform/admin?view=school&schoolId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      ]);
      if (ticketResponse.ok) { const data = await ticketResponse.json() as { tickets?: Ticket[] }; setTickets(data.tickets ?? []); }
      if (snapshotResponse.ok) { const data = await snapshotResponse.json() as { users?: User[] }; setUsers(data.users ?? []); }
    } catch { setMessage("Could not load the selected school support workspace."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadSchools(); }, []);

  const visibleTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => !q || ticket.subject.toLowerCase().includes(q) || ticket.id.toLowerCase().includes(q)).filter((ticket) => filter === "all" || ticket.status === filter);
  }, [filter, query, tickets]);
  const selectedTicket = tickets.find((ticket) => ticket.id === ticketId) ?? null;
  const counts = useMemo(() => ({ open: tickets.filter((ticket) => ticket.status === "open").length, inProgress: tickets.filter((ticket) => ticket.status === "in_progress").length, resolved: tickets.filter((ticket) => ticket.status === "resolved").length }), [tickets]);

  async function updateTicket() {
    if (!schoolId || !ticketId) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/platform/phase4", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "supportUpdate", schoolId, ticketId, status, body: body.trim() || undefined }) });
      const data = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? "Case updated and the action was audited." : (data.message ?? data.error ?? "Could not update the case."));
      if (response.ok) { setBody(""); await selectSchool(schoolId); await loadTicketDetail(schoolId, ticketId); }
    } finally { setLoading(false); }
  }

  async function impersonate() {
    if (!schoolId || !targetUser || reason.trim().length < 5) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/platform/phase4", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "impersonate", schoolId, userId: targetUser, reason: reason.trim() }) });
      const data = await response.json() as { error?: string; message?: string; expiresInSeconds?: number };
      setMessage(response.ok ? `Support access approved for ${Math.round((data.expiresInSeconds ?? 0) / 60)} minutes and audited.` : (data.message ?? data.error ?? "Could not start support access."));
      if (response.ok) setReason("");
    } finally { setLoading(false); }
  }

  return <div className="support-page-stack">
    <div className="support-header"><div><span className="platform-eyebrow">Operations desk</span><h2>Support command</h2><p>Choose a school, triage the case, preserve context, and escalate into audited access only when the case requires it.</p></div><button type="button" className="app-pill" onClick={() => void loadSchools()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
    <div className="app-grid kpis platform-kpis"><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Open</span><span className="app-kpi-icon"><LifeBuoy size={17}/></span></div><div className="app-kpi-value">{counts.open}</div><div className="app-kpi-meta">Waiting for an operator</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">In progress</span><span className="app-kpi-icon"><Clock3 size={17}/></span></div><div className="app-kpi-value">{counts.inProgress}</div><div className="app-kpi-meta">Actively being handled</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Resolved</span><span className="app-kpi-icon"><CheckCircle2 size={17}/></span></div><div className="app-kpi-value">{counts.resolved}</div><div className="app-kpi-meta">Closed cases in current school view</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Selected school</span><span className="app-kpi-icon"><ShieldAlert size={17}/></span></div><div className="app-kpi-value" style={{ fontSize: 20 }}>{schools.find((school) => school.id === schoolId)?.uniqueCode ?? "—"}</div><div className="app-kpi-meta">Case and access context</div></div></div>

    <div className="support-workspace">
      <section className="app-card app-panel support-cases"><div className="support-section-head"><div><h2>Case queue</h2><p>Keep the school context fixed while you work through cases.</p></div><select aria-label="School" value={schoolId} onChange={(event) => void selectSchool(event.target.value)}><option value="">Choose school…</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {school.uniqueCode}</option>)}</select></div>
        <div className="support-toolbar"><label className="support-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search case subject or ID" aria-label="Search support cases"/></label><div className="support-status-tabs">{([['all','All'],['open','Open'],['in_progress','In progress'],['resolved','Resolved']] as const).map(([value,label]) => <button type="button" className={filter === value ? "is-active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
        <div className="support-case-list">{visibleTickets.map((ticket) => <button type="button" className={`support-case ${ticketId===ticket.id ? "is-selected" : ""}`} key={ticket.id} disabled={detailLoading && ticketId===ticket.id} onClick={() => { setTicketId(ticket.id); setStatus((ticket.status as TicketStatus) || "in_progress"); void loadTicketDetail(schoolId, ticket.id); }}><span className="support-case-icon"><MessageSquare size={15}/></span><span className="support-case-copy"><b>{ticket.subject}</b><small>{ticket.id} · opened {new Date(ticket.createdAt).toLocaleDateString()}</small></span><span className={`support-badge support-badge-${ticket.status}`}>{STATUS_LABEL[ticket.status as TicketStatus] ?? ticket.status}</span></button>)}{visibleTickets.length===0&&<div className="support-empty">{schoolId ? "No cases match the current view." : "Choose a school to load its support queue."}</div>}</div>
      </section>

      <section className="app-card app-panel support-detail"><div className="support-section-head"><div><h2>{selectedTicket ? selectedTicket.subject : "Case workspace"}</h2><p>{selectedTicket ? `${selectedTicket.id} · ${STATUS_LABEL[selectedTicket.status as TicketStatus] ?? selectedTicket.status}` : "Select a case from the queue to see its evidence and controls."}</p></div>{selectedTicket && <Link className="app-pill" href={`/platform/schools/${schoolId}`}>School 360</Link>}</div>{selectedTicket ? detailLoading && !ticketDetail ? <div className="support-empty large">Loading case evidence…</div> : <><div className="support-conversation">{(ticketDetail?.messages ?? []).map((item)=><div className="support-message" key={item.id}><small>{item.senderId} · {new Date(item.sentAt).toLocaleString()}</small><p>{item.body}</p></div>)}{!ticketDetail?.messages?.length && <div className="support-empty">No messages were attached to this case.</div>}</div><div className="support-action-box"><label><span>Status</span><select value={status} onChange={(event)=>setStatus(event.target.value as TicketStatus)}>{Object.entries(STATUS_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Reply / operator note</span><textarea value={body} onChange={(event)=>setBody(event.target.value)} placeholder="Record the next useful action or reply…" rows={4}/></label><button type="button" className="app-action" disabled={loading || detailLoading} onClick={()=>void updateTicket()}><CheckCircle2 size={14}/><strong>Save case update</strong>Write to audit trail</button></div></> : <div className="support-empty large">The detail pane becomes the working surface once a case is selected.</div>}</section>

      <section className="app-card app-panel support-access"><div className="support-section-head"><div><h2>Audited access</h2><p>Use temporary access only for diagnosis. Every session requires a reason and is time-limited.</p></div><ShieldAlert size={20} color="var(--sn-muted)"/></div><label><span>School user</span><select value={targetUser} onChange={(event)=>setTargetUser(event.target.value)} disabled={!schoolId}><option value="">Choose user…</option>{users.map((user)=><option key={user.id} value={user.id}>{user.name} · {user.email || user.phone || "No contact"}</option>)}</select></label><label><span>Reason</span><textarea value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Why is support access necessary?" rows={4}/></label><button type="button" className="app-action" disabled={loading || !schoolId || !targetUser || reason.trim().length < 5} onClick={()=>void impersonate()}><ShieldAlert size={14}/><strong>Start temporary support access</strong>Audit the session</button>{message && <div className="support-result" role="status">{message}</div>}</section>
    </div>
    <style jsx global>{`\n      .support-page-stack{display:grid;gap:16px;margin-top:22px}.support-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.support-header h2{margin:6px 0 5px;font-size:28px;letter-spacing:-.04em;color:#17283a}.support-header p{margin:0;max-width:780px;color:#6f7e8e;font-size:12px;line-height:1.5}.support-workspace{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1.2fr) minmax(280px,.65fr);gap:16px;align-items:start}.support-cases,.support-detail,.support-access{overflow:hidden}.support-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 14px}.support-section-head h2{margin:0;font-size:15px;color:#253648}.support-section-head p{margin:4px 0 0;font-size:10px;color:#7e8c9a;line-height:1.45}.support-section-head select{min-width:170px;height:34px;border:1px solid #dbe3ec;border-radius:9px;background:#fff;color:#526477;font:inherit;font-size:9.5px;padding:0 8px}.support-toolbar{display:grid;gap:9px;padding:0 20px 12px}.support-search{display:flex;align-items:center;gap:8px;height:36px;border:1px solid #dbe3ec;border-radius:9px;background:#fff;padding:0 10px;color:#7e8d9d}.support-search input{border:0;outline:0;background:transparent;min-width:0;flex:1;font:inherit;font-size:10px}.support-status-tabs{display:flex;gap:5px;flex-wrap:wrap}.support-status-tabs button{height:28px;padding:0 9px;border:1px solid #dbe3ec;border-radius:999px;background:#fff;color:#6b7b8d;font-size:8.5px;font-weight:800;cursor:pointer}.support-status-tabs button.is-active{background:#eef5fb;border-color:#c9d9e9;color:#275277}.support-case-list{border-top:1px solid #edf1f5}.support-case{display:grid;grid-template-columns:29px minmax(0,1fr) auto;align-items:center;gap:9px;width:100%;padding:11px 20px;border:0;border-bottom:1px solid #edf1f5;background:#fff;text-align:left;cursor:pointer}.support-case:hover{background:#fafcfe}.support-case:disabled{cursor:wait}.support-case.is-selected{background:#f1f6fb}.support-case-icon{display:grid;place-items:center;width:29px;height:29px;border-radius:8px;background:#eff4f8;color:#5e778e}.support-case-copy{min-width:0}.support-case-copy b{display:block;font-size:10px;color:#2a3b4c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.support-case-copy small{display:block;margin-top:2px;color:#8794a2;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.support-badge{display:inline-flex;padding:4px 6px;border-radius:999px;font-size:7.5px;font-weight:850;white-space:nowrap}.support-badge-open{background:#fff6df;color:#8f6700}.support-badge-in_progress{background:#edf4fb;color:#2a597d}.support-badge-resolved{background:#edf9f2;color:#287b50}.support-empty{display:grid;place-items:center;gap:5px;min-height:140px;padding:25px;text-align:center;color:#8794a2;font-size:10px}.support-empty.large{min-height:260px}.support-conversation{padding:0 20px 12px;max-height:410px;overflow:auto;border-top:1px solid #edf1f5}.support-message{padding:11px 0;border-bottom:1px solid #edf1f5}.support-message small{display:block;color:#8492a1;font-size:8px}.support-message p{margin:4px 0 0;color:#405366;font-size:10px;line-height:1.55;white-space:pre-wrap}.support-action-box{display:grid;gap:9px;padding:14px 20px;background:#fafbfd;border-top:1px solid #e8edf2}.support-action-box label,.support-access label{display:grid;gap:5px}.support-action-box label>span,.support-access label>span{font-size:8.5px;font-weight:850;color:#647589;text-transform:uppercase;letter-spacing:.07em}.support-action-box textarea,.support-access textarea{resize:vertical}.support-access{padding-bottom:18px}.support-access>.support-section-head{padding-bottom:12px}.support-access label{padding:0 20px;margin-top:10px}.support-access .app-action{margin:12px 20px 0}.support-result{margin:12px 20px 0;padding:10px;border:1px solid #dce7ef;border-radius:9px;background:#f5f9fc;color:#496176;font-size:9px;line-height:1.45}.support-page-stack input,.support-page-stack select,.support-page-stack textarea{box-sizing:border-box;border:1px solid #dbe3ec;border-radius:9px;background:#fff;color:#314558;font:inherit;font-size:10px;padding:9px 10px;outline:none}.support-page-stack input:focus,.support-page-stack select:focus,.support-page-stack textarea:focus{border-color:#a9bfd3;box-shadow:0 0 0 3px rgba(83,125,160,.1)}@media(max-width:1150px){.support-workspace{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.support-access{grid-column:1 / -1}}@media(max-width:760px){.support-header{align-items:flex-start}.support-workspace{grid-template-columns:1fr}.support-access{grid-column:auto}.support-section-head{flex-direction:column}.support-section-head select{width:100%}}\n    `}</style>
  </div>;
}
