import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, History, Send, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import "@/components/platform-sms-center.css";
import { requirePlatformSession } from "@/lib/auth";
import { getPlatformSmsHistory } from "@/lib/platform-sms-history-service";

export const dynamic = "force-dynamic";

function number(value: number) {
  return new Intl.NumberFormat().format(value);
}

function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(value);
}

function sourceLabel(source: "direct" | "school" | "system") {
  if (source === "direct") return "Direct SMS";
  if (source === "school") return "SMS Center · School";
  return "School / System";
}

export default async function PlatformSmsHistoryPage() {
  const session = await requirePlatformSession();
  const history = await getPlatformSmsHistory(session);
  const pending = history.summary.queued + history.summary.sending;

  return <AppShell
    universe="platform"
    title="SMS History"
    subtitle="Delivery-level SMS history across direct sends, school audiences and system messaging."
    active="SMS Center"
    userName={session.name}
    role={session.role}
  >
    <div className="sms-center">
      <section className="sms-hero">
        <div>
          <span className="sms-eyebrow"><History size={15}/> DELIVERY AUDIT</span>
          <h2>SMS History</h2>
          <p>See who was contacted, the message sent, delivery state, provider reference, attempts and failure reason.</p>
        </div>
        <Link href="/platform/sms" className="sms-button secondary"><ArrowLeft size={16}/> Back to SMS Center</Link>
      </section>

      <section className="sms-stats">
        <article><span><History size={18}/> Total records</span><strong>{number(history.summary.total)}</strong><small>Latest 500 delivery records</small></article>
        <article><span><CheckCircle2 size={18}/> Successful</span><strong>{number(history.summary.sent)}</strong><small>Provider accepted and marked sent</small></article>
        <article><span><XCircle size={18}/> Failed</span><strong>{number(history.summary.failed)}</strong><small>Delivery failed after processing</small></article>
        <article><span><Clock3 size={18}/> Pending</span><strong>{number(pending)}</strong><small>Queued or currently sending</small></article>
      </section>

      <section className="sms-card">
        <div className="sms-card-title">
          <div><h3><Send size={18}/> Delivery records</h3><p>Newest SMS first. Direct sends and school/system outbox messages appear in one operational history.</p></div>
          <span className="sms-pill">{history.rows.length} shown</span>
        </div>
        <div className="sms-table-wrap sms-history-table">
          <table>
            <thead><tr><th>Date</th><th>Source</th><th>School</th><th>Recipient</th><th>Message</th><th>Status</th><th>Provider</th><th>Attempts</th></tr></thead>
            <tbody>
              {history.rows.length ? history.rows.map((row) => <tr key={row.id}>
                <td><strong>{date(row.createdAt)}</strong>{row.sentAt ? <small>Sent {date(row.sentAt)}</small> : null}</td>
                <td>{sourceLabel(row.source)}{row.batchId ? <small>Batch {row.batchId.slice(0, 8)}</small> : null}</td>
                <td>{row.schoolName ?? "Platform"}</td>
                <td><strong>{row.recipientPhone}</strong></td>
                <td><div className="sms-history-message">{row.message || "—"}</div>{row.error ? <small className="sms-history-error">{row.error}</small> : null}</td>
                <td><span className={`sms-status ${row.status}`}>{row.status}</span></td>
                <td>{row.providerKey?.toUpperCase() ?? "—"}{row.providerMessageId ? <small>{row.providerMessageId}</small> : null}</td>
                <td>{row.attempts}</td>
              </tr>) : <tr><td colSpan={8}><p className="sms-muted">No SMS delivery records yet.</p></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </AppShell>;
}
