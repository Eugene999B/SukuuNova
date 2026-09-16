"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, RefreshCw, Search, Smartphone, X } from "lucide-react";
import "./platform-sms-center.css";
import "./platform-sms-history.css";

type HistoryRow = {
  id: string;
  batchId: string | null;
  source: "direct" | "school" | "system";
  schoolId: string | null;
  schoolName: string | null;
  recipientPhone: string;
  message: string;
  status: string;
  statusLabel: string;
  statusGroup: "delivered" | "in_transit" | "failed";
  statusExplanation: string;
  outboxStatus: string | null;
  providerStatus: string | null;
  attempts: number;
  providerKey: string | null;
  providerMessageId: string | null;
  creditsUsed: number | null;
  error: string | null;
  createdAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  updatedAt: string;
};

type HistoryData = {
  rows: HistoryRow[];
  summary: { total: number; delivered: number; inTransit: number; failed: number };
};

type Filter = "all" | "delivered" | "in_transit" | "failed";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function sourceLabel(row: HistoryRow) {
  if (row.source === "direct") return "Platform direct";
  if (row.source === "school") return row.schoolName || "School audience";
  return row.schoolName ? `${row.schoolName} · system` : "System";
}

export default function PlatformSmsHistoryClient({ initialData }: { initialData: HistoryData }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<HistoryRow | null>(null);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialData.rows.filter((row) => {
      if (filter !== "all" && row.statusGroup !== filter) return false;
      if (!needle) return true;
      return [row.recipientPhone, row.message, row.schoolName, row.providerKey, row.providerMessageId, row.statusLabel, row.batchId]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [filter, initialData.rows, query]);

  return <>
    <section className="sms-stats">
      <article><span><Smartphone size={18}/> Total records</span><strong>{initialData.summary.total}</strong><small>SMS delivery records</small></article>
      <article><span><CheckCircle2 size={18}/> Delivered</span><strong>{initialData.summary.delivered}</strong><small>Handset delivery confirmed</small></article>
      <article><span><Clock3 size={18}/> In transit</span><strong>{initialData.summary.inTransit}</strong><small>Queued or provider accepted</small></article>
      <article><span><AlertTriangle size={18}/> Failed</span><strong>{initialData.summary.failed}</strong><small>Rejected, expired or not delivered</small></article>
    </section>

    <section className="sms-card sms-history-compact">
      <div className="sms-card-title">
        <div><h3>SMS delivery history</h3><p>“Submitted / accepted” means the provider accepted the SMS. Only “Delivered” means handset delivery was confirmed.</p></div>
        <button className="sms-button secondary" onClick={() => window.location.reload()}><RefreshCw size={15}/> Refresh</button>
      </div>

      <div className="sms-history-toolbar">
        <div className="sms-history-filters" aria-label="Delivery status filters">
          {(["all", "delivered", "in_transit", "failed"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "in_transit" ? "In transit" : value[0].toUpperCase() + value.slice(1)}</button>)}
        </div>
        <label className="sms-history-search-wrap"><Search size={15}/><input className="sms-history-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search phone, message, school or provider ID" /></label>
      </div>

      <div className="sms-table-wrap"><table><thead><tr><th>Date</th><th>Recipient</th><th>Source</th><th>Status</th><th>Message</th><th></th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id} className="sms-history-row" tabIndex={0} role="button" onClick={() => setSelected(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(row); } }}>
          <td>{formatDate(row.createdAt)}</td>
          <td><strong>{row.recipientPhone}</strong></td>
          <td><div className="sms-history-source"><strong>{sourceLabel(row)}</strong><small>{row.providerKey?.toUpperCase() || "Provider pending"}</small></div></td>
          <td><span className={`sms-status ${row.status}`}>{row.statusLabel}</span></td>
          <td><div className="sms-history-row-message">{row.message}</div></td>
          <td><button className="sms-history-view" onClick={(event) => { event.stopPropagation(); setSelected(row); }}>Details <ChevronRight size={14}/></button></td>
        </tr>)}
        {!rows.length && <tr><td colSpan={6}><div className="sms-history-empty">No SMS records match this view.</div></td></tr>}
      </tbody></table></div>
    </section>

    {selected && <DeliveryDialog row={selected} onClose={() => setSelected(null)} />}
  </>;
}

function DeliveryDialog({ row, onClose }: { row: HistoryRow; onClose: () => void }) {
  const steps: Array<{ label: string; time: string | null; kind: "complete" | "failed" | "pending"; detail: string }> = [
    { label: "Created in SukuuNova", time: row.createdAt, kind: "complete", detail: row.source === "direct" ? "Direct platform SMS created." : "SMS added to the school message queue." },
  ];
  if (row.acceptedAt) steps.push({ label: "Submitted / accepted by provider", time: row.acceptedAt, kind: "complete", detail: "The provider accepted the SMS for routing. This does not yet prove handset delivery." });
  if (row.deliveredAt) steps.push({ label: "Delivered to recipient", time: row.deliveredAt, kind: "complete", detail: "The mobile network confirmed handset delivery." });
  else if (row.failedAt) steps.push({ label: row.statusLabel, time: row.failedAt, kind: "failed", detail: row.statusExplanation });
  else steps.push({ label: "Awaiting delivery receipt", time: null, kind: "pending", detail: row.statusExplanation });

  return <div className="sms-history-modal-backdrop" onMouseDown={onClose}>
    <section className="sms-history-modal" role="dialog" aria-modal="true" aria-label="SMS delivery details" onMouseDown={(event) => event.stopPropagation()}>
      <header className="sms-history-modal-header"><div><span className="sms-eyebrow">SMS DELIVERY DETAILS</span><h3>{row.recipientPhone}</h3></div><button className="sms-history-modal-close" onClick={onClose} aria-label="Close delivery details"><X size={18}/></button></header>
      <div className="sms-history-modal-body">
        <div className="sms-history-status-banner"><div><span className={`sms-status ${row.status}`}>{row.statusLabel}</span><p>{row.statusExplanation}</p></div><small>Updated {formatDate(row.updatedAt)}</small></div>

        <div className="sms-history-detail-grid">
          <Detail label="Recipient" value={row.recipientPhone}/><Detail label="Source" value={sourceLabel(row)}/>
          <Detail label="Sender ID" value="SukuuNova"/><Detail label="Provider" value={row.providerKey?.toUpperCase() || "—"}/>
          <Detail label="Provider message ID" value={row.providerMessageId || "Not returned"}/><Detail label="Credits used" value={row.creditsUsed == null ? "Not reported" : String(row.creditsUsed)}/>
          <Detail label="Attempts" value={String(row.attempts)}/><Detail label="Batch ID" value={row.batchId || "—"}/>
          <Detail label="Provider status" value={row.providerStatus || "Awaiting receipt"}/><Detail label="Outbox status" value={row.outboxStatus || "Direct provider send"}/>
        </div>

        <div className="sms-history-message-box"><span>Message</span>{row.message}</div>

        <div className="sms-history-timeline"><h4>Delivery timeline</h4>{steps.map((step, index) => <div key={`${step.label}-${index}`} className={`sms-history-step ${step.kind}`}><span className="sms-history-step-icon">{step.kind === "failed" ? <AlertTriangle size={13}/> : step.kind === "complete" ? <CheckCircle2 size={13}/> : <Clock3 size={13}/>}</span><div><strong>{step.label}</strong><small>{step.time ? formatDate(step.time) : step.detail}</small>{step.time && <small>{step.detail}</small>}</div></div>)}</div>

        {row.error && <div className="sms-history-error-box">Provider / send error: {row.error}</div>}
      </div>
    </section>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="sms-history-detail"><span>{label}</span><strong>{value}</strong></div>;
}
