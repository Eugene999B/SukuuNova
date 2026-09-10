"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  LifeBuoy,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import PlatformWorkflowDialog from "@/components/PlatformWorkflowDialog";

type School = { id: string; name: string; uniqueCode: string };
type Ticket = { id: string; subject: string; status: string; createdAt: string; raisedByUserId: string };
type TicketDetail = Ticket & { schoolId: string; messages?: Array<{ id: string; senderId: string; body: string; sentAt: string }> };
type User = { id: string; name: string; email: string | null; phone: string | null; status: string };
type TicketStatus = "open" | "in_progress" | "resolved";

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

function statusLabel(value: string) {
  return STATUS_LABEL[value as TicketStatus] ?? value;
}

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
  const [accessOpen, setAccessOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TicketStatus>("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSchools = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/platform/phase4?view=schools", { cache: "no-store" });
      const data = await response.json() as { schools?: School[]; message?: string };
      if (response.ok) {
        setSchools(data.schools ?? []);
      } else {
        setMessage(data.message ?? "Could not load schools for support.");
      }
    } catch {
      setMessage("Could not load schools for support.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTicketDetail = useCallback(async (nextSchoolId: string, nextTicketId: string) => {
    if (!nextSchoolId || !nextTicketId) {
      setTicketDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/platform/phase4?view=support_ticket&schoolId=${encodeURIComponent(nextSchoolId)}&ticketId=${encodeURIComponent(nextTicketId)}`, { cache: "no-store" });
      const data = await response.json() as { ticket?: TicketDetail; message?: string };
      if (response.ok && data.ticket) {
        setTicketDetail(data.ticket);
      } else {
        setTicketDetail(null);
        setMessage(data.message ?? "Could not load the selected case conversation.");
      }
    } catch {
      setTicketDetail(null);
      setMessage("Could not load the selected case conversation.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const selectSchool = useCallback(async (id: string) => {
    setSchoolId(id);
    setTicketId("");
    setTicketDetail(null);
    setMessage("");
    setTargetUser("");
    if (!id) {
      setTickets([]);
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      const [ticketResponse, snapshotResponse] = await Promise.all([
        fetch(`/api/platform/phase4?view=support&schoolId=${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/platform/admin?view=school&schoolId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      ]);
      if (ticketResponse.ok) {
        const data = await ticketResponse.json() as { tickets?: Ticket[] };
        setTickets(data.tickets ?? []);
      } else {
        setTickets([]);
      }
      if (snapshotResponse.ok) {
        const data = await snapshotResponse.json() as { users?: User[] };
        setUsers(data.users ?? []);
      } else {
        setUsers([]);
      }
    } catch {
      setMessage("Could not load the selected school support workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  const visibleTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tickets
      .filter((ticket) => !normalized || ticket.subject.toLowerCase().includes(normalized) || ticket.id.toLowerCase().includes(normalized))
      .filter((ticket) => filter === "all" || ticket.status === filter);
  }, [filter, query, tickets]);

  const selectedTicket = tickets.find((ticket) => ticket.id === ticketId) ?? null;
  const selectedSchool = schools.find((school) => school.id === schoolId) ?? null;
  const counts = useMemo(() => ({
    open: tickets.filter((ticket) => ticket.status === "open").length,
    inProgress: tickets.filter((ticket) => ticket.status === "in_progress").length,
    resolved: tickets.filter((ticket) => ticket.status === "resolved").length,
  }), [tickets]);

  async function updateTicket() {
    if (!schoolId || !ticketId) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/phase4", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "supportUpdate", schoolId, ticketId, status, body: body.trim() || undefined }),
      });
      const data = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? "Case updated and written to the audit trail." : (data.message ?? data.error ?? "Could not update the case."));
      if (response.ok) {
        setBody("");
        await selectSchool(schoolId);
        setTicketId(ticketId);
        await loadTicketDetail(schoolId, ticketId);
      }
    } catch {
      setMessage("Could not update the support case.");
    } finally {
      setLoading(false);
    }
  }

  async function impersonate() {
    if (!schoolId || !targetUser || reason.trim().length < 5) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/phase4", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "impersonate", schoolId, userId: targetUser, reason: reason.trim() }),
      });
      const data = await response.json() as { error?: string; message?: string; expiresInSeconds?: number };
      setMessage(response.ok ? `Temporary support access approved for ${Math.round((data.expiresInSeconds ?? 0) / 60)} minutes and audited.` : (data.message ?? data.error ?? "Could not start support access."));
      if (response.ok) setReason("");
    } catch {
      setMessage("Could not start temporary support access.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="platform-support-v3">
      <section className="platform-support-v3-hero">
        <div className="platform-support-v3-hero-copy">
          <span className="platform-support-v3-eyebrow">Operations desk</span>
          <h2>Resolve school issues without losing context.</h2>
          <p>Choose the school once, work its case queue, open School 360 when deeper evidence is needed, and use temporary access only through the audited break-glass workflow.</p>
        </div>
        <button type="button" className="platform-support-v3-button" onClick={() => void loadSchools()} disabled={loading}><RefreshCw size={16}/> {loading ? "Refreshing…" : "Refresh schools"}</button>
      </section>

      {message ? <div className="platform-support-v3-notice" role="status">{message}</div> : null}

      <section className="platform-support-v3-context" aria-label="Support context">
        <div className="platform-support-v3-context-school">
          <label><span>School support context</span><select aria-label="School" value={schoolId} onChange={(event) => void selectSchool(event.target.value)}><option value="">Choose a school…</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {school.uniqueCode}</option>)}</select></label>
        </div>
        <div className="platform-support-v3-stat"><span>Open cases</span><strong>{counts.open}</strong><small>Waiting for operator action</small></div>
        <div className="platform-support-v3-stat"><span>In progress</span><strong>{counts.inProgress}</strong><small>Currently being handled</small></div>
        <div className="platform-support-v3-stat"><span>Resolved</span><strong>{counts.resolved}</strong><small>Closed in this school context</small></div>
      </section>

      <div className="platform-support-v3-workspace">
        <section className="platform-support-v3-card">
          <div className="platform-support-v3-card-head"><div><h3>Case queue</h3><p>{selectedSchool ? `${selectedSchool.name} · ${selectedSchool.uniqueCode}` : "Choose a school to load its support cases."}</p></div><LifeBuoy size={20}/></div>
          <div className="platform-support-v3-toolbar">
            <label className="platform-support-v3-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject or case ID" aria-label="Search support cases"/></label>
            <div className="platform-support-v3-tabs">{([['all', 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']] as const).map(([value, label]) => <button type="button" className={filter === value ? "is-active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
          </div>
          <div>
            {visibleTickets.map((ticket) => <button type="button" className={`platform-support-v3-case ${ticketId === ticket.id ? "is-selected" : ""}`} key={ticket.id} disabled={detailLoading && ticketId === ticket.id} onClick={() => { setTicketId(ticket.id); setStatus((ticket.status as TicketStatus) || "in_progress"); void loadTicketDetail(schoolId, ticket.id); }}><span className="platform-support-v3-case-icon"><MessageSquare size={16}/></span><span className="platform-support-v3-case-copy"><b>{ticket.subject}</b><small>{ticket.id} · opened {new Date(ticket.createdAt).toLocaleDateString()}</small></span><span className={`platform-support-v3-badge platform-support-v3-badge-${ticket.status}`}>{statusLabel(ticket.status)}</span></button>)}
            {!visibleTickets.length ? <div className="platform-support-v3-empty"><b>{schoolId ? "No cases match this view." : "No school selected."}</b><span>{schoolId ? "Change the status filter or search." : "Choose a school above to load its support queue."}</span></div> : null}
          </div>
        </section>

        <section className="platform-support-v3-card">
          <div className="platform-support-v3-card-head"><div><h3>{selectedTicket ? selectedTicket.subject : "Case workspace"}</h3><p>{selectedTicket ? `${selectedTicket.id} · ${statusLabel(selectedTicket.status)}` : "Select a case to review its conversation and record the next action."}</p></div>{selectedTicket ? <Link className="platform-support-v3-link" href={`/platform/schools/${schoolId}`}>School 360</Link> : null}</div>
          {selectedTicket ? detailLoading && !ticketDetail ? <div className="platform-support-v3-empty is-large"><b>Loading case evidence…</b></div> : <>
            <div className="platform-support-v3-conversation">{(ticketDetail?.messages ?? []).map((item) => <div className="platform-support-v3-message" key={item.id}><small>{item.senderId} · {new Date(item.sentAt).toLocaleString()}</small><p>{item.body}</p></div>)}{!ticketDetail?.messages?.length ? <div className="platform-support-v3-empty"><b>No messages attached.</b><span>You can still record an operator note or status change below.</span></div> : null}</div>
            <div className="platform-support-v3-action-box"><label><span>Case status</span><select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus)}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Reply / operator note</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Record the next useful action, evidence or reply…" rows={5}/></label><button type="button" className="platform-support-v3-primary" disabled={loading || detailLoading} onClick={() => void updateTicket()}><CheckCircle2 size={16}/> Save case update</button></div>
          </> : <div className="platform-support-v3-empty is-large"><MessageSquare size={24}/><b>No case selected.</b><span>Choose a case from the queue to keep the conversation and actions in one workspace.</span></div>}
        </section>

        <section className="platform-support-v3-card">
          <div className="platform-support-v3-card-head"><div><h3>Audited access</h3><p>Break-glass entry is deliberately separate from ordinary case handling.</p></div><ShieldAlert size={20}/></div>
          <div className="platform-support-v3-access-copy"><p>Temporary school access should be used only when evidence cannot be resolved from Platform Control.</p><ul><li>Requires a selected school and user.</li><li>Requires an operator reason.</li><li>Is time-limited and visibly auditable.</li></ul><button type="button" className="platform-support-v3-primary" disabled={!schoolId} onClick={() => setAccessOpen(true)}><ShieldAlert size={16}/> Start temporary access</button></div>
          <PlatformWorkflowDialog open={accessOpen} onClose={() => setAccessOpen(false)} eyebrow="BREAK-GLASS ACCESS" title="Enter school workspace" description="The session is reason-gated, time-limited, visibly marked to the school and written to both platform and school audit logs.">
            <div className="platform-dialog-form"><label><span>School user</span><select value={targetUser} onChange={(event) => setTargetUser(event.target.value)} disabled={!schoolId}><option value="">Choose user…</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email || user.phone || "No contact"}</option>)}</select></label><label><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is temporary access necessary?" rows={4}/></label><button type="button" className="app-action" disabled={loading || !schoolId || !targetUser || reason.trim().length < 5} onClick={() => void impersonate()}><ShieldAlert size={14}/><strong>Start temporary support access</strong>Audit the session</button>{message ? <div className="platform-support-v3-result" role="status">{message}</div> : null}</div>
          </PlatformWorkflowDialog>
        </section>
      </div>
    </div>
  );
}
