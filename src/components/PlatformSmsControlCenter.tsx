"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, ChevronRight, History, PlusCircle, Radio, RefreshCw, Send, ShieldCheck, Smartphone, UsersRound, WalletCards } from "lucide-react";
import "./platform-sms-center.css";

type School = { id: string; name: string; uniqueCode: string; status: string; smsBalance: number };
type Allocation = { id: string; schoolId: string; schoolName: string; quantity: number; balanceAfter: number; reference: string | null; notes: string | null; actorId: string; createdAt: string };
type SendHistory = { id: string; action: string; targetSchoolId: string | null; targetEntity: string | null; meta: unknown; createdAt: string };
type Overview = {
  senderId: string;
  activeProvider: string;
  providerBalance: { configured: boolean; available: boolean; balance?: number; currency?: string; error?: string };
  platformBalance: number;
  platformPurchased: number;
  allocatedToSchools: number;
  schools: School[];
  allocationHistory: Allocation[];
  sendHistory: SendHistory[];
};
type Preview = { recipientCount: number; balance: number; segments: number; encoding: string; totalCredits: number; enoughCredits: boolean; balanceAfter: number; billedBody?: string };
type Audience = "guardians" | "teachers" | "staff" | "all";

async function request<T>(payload?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/platform/sms-center", payload ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) } : { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "SMS Center request failed.");
  return data as T;
}
function number(value: number | undefined) { return new Intl.NumberFormat().format(value ?? 0); }
function date(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export default function PlatformSmsControlCenter({ initialData }: { initialData: Overview }) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [schoolId, setSchoolId] = useState(initialData.schools[0]?.id ?? "");
  const [topUpSchoolId, setTopUpSchoolId] = useState(initialData.schools[0]?.id ?? "");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [audience, setAudience] = useState<Audience>("guardians");
  const [schoolBody, setSchoolBody] = useState("");
  const [schoolPreview, setSchoolPreview] = useState<Preview | null>(null);
  const [numbers, setNumbers] = useState("");
  const [directBody, setDirectBody] = useState("");
  const [directPreview, setDirectPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"school" | "direct">("school");

  const selectedSchool = useMemo(() => data.schools.find((school) => school.id === schoolId), [data.schools, schoolId]);

  async function refresh(silent = false) {
    try {
      if (!silent) setBusy("refresh");
      setData(await request<Overview>());
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Refresh failed." }); }
    finally { if (!silent) setBusy(""); }
  }

  async function topUp() {
    const quantity = Number(topUpAmount);
    if (!topUpSchoolId || !Number.isInteger(quantity) || quantity <= 0) return setNotice({ kind: "error", text: "Choose a school and enter a positive whole-number SMS amount." });
    try {
      setBusy("topup"); setNotice(null);
      await request({ action: "topUp", schoolId: topUpSchoolId, quantity });
      setTopUpAmount("");
      await refresh(true);
      setNotice({ kind: "ok", text: `${number(quantity)} SMS credits added successfully. The school's previous balance was preserved.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Top-up failed." }); }
    finally { setBusy(""); }
  }

  async function previewSchool() {
    if (!schoolId || !schoolBody.trim()) return setNotice({ kind: "error", text: "Choose a school and enter the SMS message." });
    try {
      setBusy("school-preview"); setNotice(null);
      setSchoolPreview(await request<Preview>({ action: "previewSchool", schoolId, audience, body: schoolBody }));
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Preview failed." }); }
    finally { setBusy(""); }
  }

  async function sendSchool() {
    try {
      setBusy("school-send"); setNotice(null);
      const result = await request<{ queued: number; totalCredits: number }>({ action: "sendSchool", schoolId, audience, body: schoolBody });
      setSchoolPreview(null); setSchoolBody("");
      await refresh(true);
      setNotice({ kind: "ok", text: `${number(result.queued)} school SMS deliveries queued. ${number(result.totalCredits)} credits reserved.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "School SMS send failed." }); }
    finally { setBusy(""); }
  }

  async function previewDirect() {
    if (!numbers.trim() || !directBody.trim()) return setNotice({ kind: "error", text: "Enter at least one phone number and an SMS message." });
    try {
      setBusy("direct-preview"); setNotice(null);
      setDirectPreview(await request<Preview>({ action: "previewDirect", numbers, body: directBody }));
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Preview failed." }); }
    finally { setBusy(""); }
  }

  async function sendDirect() {
    try {
      setBusy("direct-send"); setNotice(null);
      const result = await request<{ submitted?: number; sent: number; failed: number; refundedCredits: number }>({ action: "sendDirect", numbers, body: directBody });
      setDirectPreview(null); setNumbers(""); setDirectBody("");
      await refresh(true);
      const submitted = result.submitted ?? result.sent;
      setNotice({ kind: result.failed ? "error" : "ok", text: `${number(submitted)} SMS submitted to the provider${result.failed ? `, ${number(result.failed)} failed during submission.` : ". Delivery confirmation will appear in SMS History."}` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Direct SMS send failed." }); }
    finally { setBusy(""); }
  }

  return <div className="sms-center">
    <section className="sms-hero">
      <div>
        <span className="sms-eyebrow"><ShieldCheck size={15}/> SUPER ADMIN CONTROL</span>
        <h2>SMS Control Center</h2>
        <p>Monitor inventory, top up any school, target school audiences and send direct operational SMS from one protected workspace.</p>
      </div>
      <button className="sms-button secondary" onClick={() => refresh()} disabled={Boolean(busy)}><RefreshCw size={16} className={busy === "refresh" ? "spin" : ""}/> Refresh</button>
    </section>

    {notice && <div className={`sms-notice ${notice.kind}`}>{notice.text}</div>}

    <section className="sms-stats">
      <article><span><Radio size={18}/> Provider balance</span><strong>{data.providerBalance.available ? number(data.providerBalance.balance) : "Unavailable"}</strong><small>{data.activeProvider.toUpperCase()} {data.providerBalance.currency || ""}</small></article>
      <article><span><WalletCards size={18}/> Unallocated SMS</span><strong>{number(data.platformBalance)}</strong><small>Available for school allocation</small></article>
      <article><span><Building2 size={18}/> School wallets</span><strong>{number(data.allocatedToSchools)}</strong><small>Credits currently held by schools</small></article>
      <article><span><Smartphone size={18}/> Sender ID</span><strong>{data.senderId}</strong><small>Locked platform-wide</small></article>
    </section>

    <section className="sms-grid two">
      <article className="sms-card">
        <div className="sms-card-title"><div><h3><PlusCircle size={18}/> Quick school top-up</h3><p>Add credits to the existing balance. Top-ups never replace the balance.</p></div></div>
        <label>School<select value={topUpSchoolId} onChange={(e) => setTopUpSchoolId(e.target.value)}>{data.schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {number(school.smsBalance)} left</option>)}</select></label>
        <label>SMS credits<input type="number" min="1" step="1" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder="e.g. 5000" /></label>
        <button className="sms-button" onClick={topUp} disabled={busy === "topup"}>{busy === "topup" ? "Assigning…" : "Assign / Add SMS"}</button>
      </article>

      <article className="sms-card">
        <div className="sms-card-title"><div><h3><Radio size={18}/> Provider status</h3><p>Live provider health and school-allocation inventory are intentionally shown separately.</p></div></div>
        <div className="sms-provider-row"><span>Active provider</span><strong>{data.activeProvider.toUpperCase()}</strong></div>
        <div className="sms-provider-row"><span>Configured</span><strong>{data.providerBalance.configured ? "Yes" : "No"}</strong></div>
        <div className="sms-provider-row"><span>Live balance</span><strong>{data.providerBalance.available ? number(data.providerBalance.balance) : "Not available"}</strong></div>
        {!data.providerBalance.available && data.providerBalance.error && <p className="sms-muted">{data.providerBalance.error}</p>}
      </article>
    </section>

    <section className="sms-card">
      <div className="sms-card-title"><div><h3><Building2 size={18}/> School SMS balances</h3><p>Remaining prepaid SMS segments by school.</p></div><span className="sms-pill">{data.schools.length} schools</span></div>
      <div className="sms-table-wrap"><table><thead><tr><th>School</th><th>Code</th><th>Status</th><th>SMS left</th></tr></thead><tbody>{data.schools.map((school) => <tr key={school.id}><td><strong>{school.name}</strong></td><td>{school.uniqueCode}</td><td><span className={`sms-status ${school.status}`}>{school.status}</span></td><td><strong>{number(school.smsBalance)}</strong></td></tr>)}</tbody></table></div>
    </section>

    <section className="sms-card composer">
      <div className="sms-card-title"><div><h3><Send size={18}/> Send SMS</h3><p>Preview recipients and exact segment cost before sending, or send direct numbers immediately with server-side validation.</p></div></div>
      <div className="sms-tabs"><button className={mode === "school" ? "active" : ""} onClick={() => setMode("school")}><UsersRound size={16}/> School audience</button><button className={mode === "direct" ? "active" : ""} onClick={() => setMode("direct")}><Smartphone size={16}/> Direct numbers</button></div>

      {mode === "school" ? <div className="sms-compose-grid">
        <div>
          <label>School<select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setSchoolPreview(null); }}>{data.schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {number(school.smsBalance)} SMS</option>)}</select></label>
          <label>Audience<select value={audience} onChange={(e) => { setAudience(e.target.value as Audience); setSchoolPreview(null); }}><option value="guardians">Parents / Guardians</option><option value="teachers">Teachers</option><option value="staff">Staff</option><option value="all">Everyone with a valid phone</option></select></label>
          <label>Message<textarea rows={7} maxLength={1600} value={schoolBody} onChange={(e) => { setSchoolBody(e.target.value); setSchoolPreview(null); }} placeholder="Type the SMS message…" /></label>
          <div className="sms-actions"><button className="sms-button secondary" onClick={previewSchool} disabled={busy === "school-preview"}>{busy === "school-preview" ? "Checking…" : "Preview cost"}</button><button className="sms-button" onClick={sendSchool} disabled={!schoolPreview?.enoughCredits || schoolPreview.recipientCount === 0 || busy === "school-send"}>{busy === "school-send" ? "Queuing…" : "Queue SMS"}</button></div>
        </div>
        <PreviewCard preview={schoolPreview} title={selectedSchool?.name || "School audience"} />
      </div> : <div className="sms-compose-grid">
        <div>
          <label>Phone numbers<textarea rows={5} value={numbers} onChange={(e) => { setNumbers(e.target.value); setDirectPreview(null); }} placeholder={"0240000000\n+233240000000\nOne number per line, comma or semicolon"} /></label>
          <label>Message<textarea rows={7} maxLength={1600} value={directBody} onChange={(e) => { setDirectBody(e.target.value); setDirectPreview(null); }} placeholder="Type the direct SMS message…" /></label>
          <div className="sms-actions"><button className="sms-button secondary" onClick={previewDirect} disabled={busy === "direct-preview"}>{busy === "direct-preview" ? "Checking…" : "Preview cost"}</button><button className="sms-button" onClick={sendDirect} disabled={!numbers.trim() || !directBody.trim() || busy === "direct-send"}>{busy === "direct-send" ? "Sending…" : "Send now"}</button></div>
        </div>
        <PreviewCard preview={directPreview} title="Direct SMS" />
      </div>}
    </section>

    <section className="sms-grid two">
      <article className="sms-card">
        <div className="sms-card-title"><div><h3>Allocation history</h3><p>Latest SMS credits assigned to schools.</p></div></div>
        <div className="sms-feed">{data.allocationHistory.length ? data.allocationHistory.slice(0, 12).map((item) => <div key={item.id}><div><strong>{item.schoolName}</strong><span>+{number(item.quantity)} SMS</span></div><small>{date(item.createdAt)} · balance {number(item.balanceAfter)}</small></div>) : <p className="sms-muted">No SMS allocations yet.</p>}</div>
      </article>
      <article className="sms-card">
        <div className="sms-card-title"><div><h3><History size={18}/> SMS delivery history</h3><p>Delivery status belongs in the dedicated history view, where each SMS can be opened for provider and receipt details.</p></div></div>
        <p className="sms-muted">Submitted or accepted does not mean delivered. Open the history to distinguish queued, accepted, delivered, rejected, expired and failed messages.</p>
        <Link href="/platform/sms/history" className="sms-button secondary">Open SMS History <ChevronRight size={16}/></Link>
      </article>
    </section>
  </div>;
}

function PreviewCard({ preview, title }: { preview: Preview | null; title: string }) {
  return <aside className="sms-preview">
    <span className="sms-eyebrow">SEND PREVIEW</span><h4>{title}</h4>
    {!preview ? <p>Run a preview to resolve valid, unique recipients and calculate the exact prepaid SMS segment cost.</p> : <>
      <dl><div><dt>Recipients</dt><dd>{number(preview.recipientCount)}</dd></div><div><dt>Segments each</dt><dd>{number(preview.segments)}</dd></div><div><dt>Encoding</dt><dd>{preview.encoding}</dd></div><div><dt>Total credits</dt><dd>{number(preview.totalCredits)}</dd></div><div><dt>Available</dt><dd>{number(preview.balance)}</dd></div><div><dt>After send</dt><dd>{number(preview.balanceAfter)}</dd></div></dl>
      <div className={`sms-credit-check ${preview.enoughCredits ? "ok" : "error"}`}>{preview.enoughCredits ? "Enough SMS credits to send." : "Not enough SMS credits. Top up first."}</div>
    </>}
  </aside>;
}
