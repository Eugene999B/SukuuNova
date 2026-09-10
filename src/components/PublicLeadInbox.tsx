"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Inbox, Mail, MessageCircle, Phone, RotateCcw } from "lucide-react";

type Lead = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  channel: string;
  subject?: string | null;
  message: string;
  status: string;
  createdAt: string;
  repliedAt?: string | null;
  repliedVia?: string | null;
};

function wa(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`;
}

export function PublicLeadInbox() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/platform/public", { cache: "no-store" });
      const payload = await response.json() as { inquiries?: Lead[]; error?: string; message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? payload.error ?? "Could not load website enquiries.");
        return;
      }
      setLeads(Array.isArray(payload.inquiries) ? payload.inquiries : []);
      setMessage("");
    } catch {
      setMessage("Could not load website enquiries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(id: string, status: string, via?: string) {
    try {
      const response = await fetch(`/api/platform/inquiries/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, repliedVia: via }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string; message?: string };
        setMessage(payload.message ?? payload.error ?? "Could not update this enquiry.");
        return;
      }
      await load();
    } catch {
      setMessage("Could not update this enquiry.");
    }
  }

  const shown = useMemo(() => filter === "all" ? leads : leads.filter((lead) => lead.status === filter), [filter, leads]);
  const counts = useMemo(() => ({
    total: leads.length,
    new: leads.filter((lead) => lead.status === "new").length,
    open: leads.filter((lead) => lead.status === "open").length,
    resolved: leads.filter((lead) => lead.status === "resolved").length,
  }), [leads]);

  return <div className="platform-inbox-v3">
    <section className="platform-inbox-v3-hero">
      <div><span className="platform-inbox-v3-eyebrow">Public conversations</span><h2>Turn website enquiries into accountable follow-up.</h2><p>Keep new messages visible, contact the visitor through the channel that makes sense, and close the enquiry only after someone has actually followed up.</p></div>
    </section>

    {message ? <div className="platform-inbox-v3-card platform-inbox-v3-empty" role="status"><b>{message}</b><button className="platform-inbox-v3-action" type="button" onClick={() => void load()}>Try again</button></div> : null}

    <section className="platform-inbox-v3-summary" aria-label="Visitor enquiry summary">
      <div className="platform-inbox-v3-stat"><span>Total enquiries</span><strong>{counts.total}</strong><small>All website conversations</small></div>
      <div className="platform-inbox-v3-stat"><span>New</span><strong>{counts.new}</strong><small>Not yet worked by an operator</small></div>
      <div className="platform-inbox-v3-stat"><span>Open</span><strong>{counts.open}</strong><small>Follow-up still in progress</small></div>
      <div className="platform-inbox-v3-stat"><span>Resolved</span><strong>{counts.resolved}</strong><small>Completed visitor conversations</small></div>
    </section>

    <section className="platform-inbox-v3-card">
      <div className="platform-inbox-v3-head"><div><h3>Visitor inbox</h3><p>Newest website enquiries stay in one queue. Contact actions open the visitor’s own communication channel; SukuuNova records the workflow status separately.</p></div><select aria-label="Filter visitor enquiries" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All enquiries</option><option value="new">New</option><option value="open">Open</option><option value="resolved">Resolved</option></select></div>
      {loading ? <div className="platform-inbox-v3-loading">Loading visitor conversations…</div> : shown.length === 0 ? <div className="platform-inbox-v3-empty"><span><Inbox size={24}/></span><b>{leads.length ? "No enquiries match this filter." : "No website enquiries yet."}</b><span>{leads.length ? "Choose another status to see the rest of the queue." : "When someone contacts SukuuNova from the website, the conversation will appear here."}</span></div> : <div className="platform-inbox-v3-list">{shown.map((lead) => {
        const responseText = `Hi ${lead.name}, thanks for reaching out to SukuuNova.`;
        return <article className="platform-inbox-v3-row" key={lead.id}>
          <span className="platform-inbox-v3-icon"><MessageCircle size={19}/></span>
          <div className="platform-inbox-v3-copy"><div className="platform-inbox-v3-copy-head"><b>{lead.name}{lead.subject ? ` · ${lead.subject}` : ""}</b><span className={`platform-inbox-v3-status is-${lead.status}`}>{lead.status}</span></div><span className="platform-inbox-v3-meta">Received {new Date(lead.createdAt).toLocaleString()} · {lead.channel}</span><p className="platform-inbox-v3-message">{lead.message}</p><div className="platform-inbox-v3-contact">{lead.email ? <span>{lead.email}</span> : null}{lead.phone ? <span>{lead.phone}</span> : null}{lead.repliedAt ? <span>Last follow-up {new Date(lead.repliedAt).toLocaleString()}{lead.repliedVia ? ` via ${lead.repliedVia}` : ""}</span> : null}</div></div>
          <div className="platform-inbox-v3-actions">
            {lead.email ? <a className="platform-inbox-v3-action" href={`mailto:${lead.email}?subject=${encodeURIComponent(`Re: ${lead.subject || "SukuuNova enquiry"}`)}`}><Mail size={14}/> Email</a> : null}
            {lead.phone ? <a className="platform-inbox-v3-action" href={`sms:${lead.phone}?&body=${encodeURIComponent(responseText)}`}><Phone size={14}/> SMS</a> : null}
            {lead.phone ? <a className="platform-inbox-v3-action" href={wa(lead.phone, responseText)} target="_blank" rel="noreferrer"><MessageCircle size={14}/> WhatsApp</a> : null}
            <button className={`platform-inbox-v3-action ${lead.status === "resolved" ? "" : "is-resolve"}`} type="button" onClick={() => void update(lead.id, lead.status === "resolved" ? "open" : "resolved", lead.status === "resolved" ? undefined : "website_reply")}>{lead.status === "resolved" ? <><RotateCcw size={14}/> Re-open</> : <><CheckCircle2 size={14}/> Mark resolved</>}</button>
          </div>
        </article>;
      })}</div>}
    </section>
  </div>;
}
