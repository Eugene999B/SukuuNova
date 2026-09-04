"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, CheckCircle2, CreditCard, MessageSquare, RefreshCw, WalletCards } from "lucide-react";

type School = { id: string; name: string; uniqueCode: string; status: string; studentCount: number; subscriptionPlan?: { name: string; price: number | string } | null };
type Billing = { activeStudents: number; calculatedTotal: number; school: School; billing: { billingMode: "flat" | "per_student"; currency: string; studentRate: number; flatRate: number; billingDay: number; graceDays: number; trialDays: number; minimumCharge: number; maximumCharge: number | null; active: boolean } };
type Messaging = { school: { id: string; name: string; uniqueCode: string }; wallet: { smsBalance: number; whatsappBalance: number; smsSellRate: string | number; whatsappSellRate: string | number; smsCostRate: string | number; whatsappCostRate: string | number; lowBalanceThreshold: number }; ledger: Array<{ id: string; channel: string; entryType: string; quantity: number; balanceAfter: number; unitPrice: string | null; notes: string | null; createdAt: string }> };

const money = (currency: string, value: number) => `${currency === "GHS" ? "₵" : currency + " "}${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PlatformBillingStudio() {
  const [schools, setSchools] = useState<School[]>([]), [schoolId, setSchoolId] = useState(""), [billing, setBilling] = useState<Billing | null>(null), [messaging, setMessaging] = useState<Messaging | null>(null), [tab, setTab] = useState<"subscription" | "messaging">("subscription"), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ billingMode: "flat" as "flat" | "per_student", currency: "GHS", studentRate: 0, flatRate: 0, billingDay: 1, graceDays: 7, trialDays: 0, minimumCharge: 0, maximumCharge: null as number | null, active: true });
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [rates, setRates] = useState({ sellRate: 0, costRate: 0, lowBalanceThreshold: 50 });
  const [allocation, setAllocation] = useState({ quantity: 0, unitCost: 0, unitPrice: 0, reference: "", notes: "" });

  async function loadSchools() {
    const response = await fetch("/api/platform/control-plane?view=schools", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { schools: School[] };
    setSchools(data.schools ?? []);
    if (!schoolId && data.schools?.[0]) setSchoolId(data.schools[0].id);
  }
  async function loadSchool(id: string) {
    if (!id) return;
    setBusy(true);
    try {
      const [billingResponse, messagingResponse] = await Promise.all([
        fetch(`/api/platform/control-plane?view=billing&schoolId=${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/platform/control-plane?view=messaging&schoolId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      ]);
      if (billingResponse.ok) {
        const data = await billingResponse.json() as Billing;
        setBilling(data);
        setDraft({ ...data.billing, maximumCharge: data.billing.maximumCharge });
      }
      if (messagingResponse.ok) {
        const data = await messagingResponse.json() as Messaging;
        setMessaging(data);
        const wallet = data.wallet;
        setRates({ sellRate: channel === "sms" ? Number(wallet.smsSellRate) : Number(wallet.whatsappSellRate), costRate: channel === "sms" ? Number(wallet.smsCostRate) : Number(wallet.whatsappCostRate), lowBalanceThreshold: wallet.lowBalanceThreshold });
      }
    } finally { setBusy(false); }
  }
  useEffect(() => { void loadSchools(); }, []);
  useEffect(() => { void loadSchool(schoolId); }, [schoolId]);
  useEffect(() => { if (!messaging) return; const w = messaging.wallet; setRates({ sellRate: channel === "sms" ? Number(w.smsSellRate) : Number(w.whatsappSellRate), costRate: channel === "sms" ? Number(w.smsCostRate) : Number(w.whatsappCostRate), lowBalanceThreshold: w.lowBalanceThreshold }); }, [channel, messaging]);

  const selectedSchool = useMemo(() => schools.find((s) => s.id === schoolId) ?? null, [schoolId, schools]);
  const estimatedTotal = useMemo(() => {
    if (!billing) return 0;
    const base = draft.billingMode === "per_student" ? billing.activeStudents * Number(draft.studentRate) : Number(draft.flatRate);
    return Math.min(draft.maximumCharge == null ? Number.POSITIVE_INFINITY : Number(draft.maximumCharge), Math.max(Number(draft.minimumCharge) || 0, base));
  }, [billing, draft]);
  const saveBilling = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/platform/control-plane", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveSchoolBilling", schoolId, ...draft }) });
      const data = await response.json() as { message?: string; error?: string; calculatedTotal?: number };
      setMessage(response.ok ? "School billing rules saved. The next invoice will use the configured calculation." : (data.message ?? data.error ?? "Unable to save billing rules."));
      if (response.ok) await loadSchool(schoolId);
    } finally { setBusy(false); }
  };
  const saveRates = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/platform/control-plane", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateMessagingRates", schoolId, channel, ...rates }) });
      const data = await response.json() as { message?: string; error?: string };
      setMessage(response.ok ? `${channel === "sms" ? "SMS" : "WhatsApp"} resale pricing saved.` : (data.message ?? data.error ?? "Unable to save communication pricing."));
      if (response.ok) await loadSchool(schoolId);
    } finally { setBusy(false); }
  };
  const allocate = async () => {
    if (!allocation.quantity) { setMessage("Enter a positive or negative credit quantity."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/platform/control-plane", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "allocateMessaging", schoolId, channel, ...allocation }) });
      const data = await response.json() as { message?: string; error?: string };
      setMessage(response.ok ? `${allocation.quantity > 0 ? "Credits allocated" : "Credit adjustment recorded"} for ${channel === "sms" ? "SMS" : "WhatsApp"}.` : (data.message ?? data.error ?? "Unable to update credits."));
      if (response.ok) { setAllocation({ quantity: 0, unitCost: 0, unitPrice: 0, reference: "", notes: "" }); await loadSchool(schoolId); }
    } finally { setBusy(false); }
  };

  return <div className="platform-control-studio">
    <section className="app-card app-panel platform-studio-toolbar">
      <div><span className="app-eyebrow">COMMERCIAL CONTROL</span><h2>Billing & communications</h2><p>Keep school subscriptions separate from the SMS/WhatsApp credit business, with explicit rates and auditable calculations.</p></div>
      <div className="platform-studio-picker"><label><span>School</span><select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}><option value="">Choose a school…</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {school.uniqueCode}</option>)}</select></label><button type="button" className="app-pill" onClick={() => void loadSchool(schoolId)} disabled={busy}><RefreshCw size={14}/>Refresh</button></div>
    </section>
    <div className="platform-studio-tabs"><button type="button" className={tab === "subscription" ? "is-active" : ""} onClick={() => setTab("subscription")}><CreditCard size={15}/>School subscription billing</button><button type="button" className={tab === "messaging" ? "is-active" : ""} onClick={() => setTab("messaging")}><MessageSquare size={15}/>SMS & WhatsApp credits</button></div>
    {message && <div className="app-banner" role="status"><div><h3>{message}</h3><p>Changes are permission-checked and added to the platform audit trail.</p></div><span className="app-pill">Audited</span></div>}
    {tab === "subscription" && billing && <div className="platform-studio-grid">
      <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">HOW THE SCHOOL PAYS</span><h2>{billing.school.name}</h2><p>Choose a flat recurring amount or automatically calculate billing from active students.</p></div><WalletCards size={20}/></div>
        <div className="platform-choice-grid"><button type="button" className={draft.billingMode === "per_student" ? "is-selected" : ""} onClick={() => setDraft({ ...draft, billingMode: "per_student" })}><Calculator size={17}/><strong>Per student</strong><span>Active students × your configured rate.</span></button><button type="button" className={draft.billingMode === "flat" ? "is-selected" : ""} onClick={() => setDraft({ ...draft, billingMode: "flat" })}><CreditCard size={17}/><strong>Flat rate</strong><span>One recurring amount regardless of headcount.</span></button></div>
        <div className="platform-form-grid"><label><span>Currency</span><input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}/></label><label><span>Student rate</span><input type="number" min="0" step="0.01" disabled={draft.billingMode !== "per_student"} value={draft.studentRate} onChange={(e) => setDraft({ ...draft, studentRate: Number(e.target.value) })}/></label><label><span>Flat monthly rate</span><input type="number" min="0" step="0.01" disabled={draft.billingMode !== "flat"} value={draft.flatRate} onChange={(e) => setDraft({ ...draft, flatRate: Number(e.target.value) })}/></label><label><span>Billing day</span><input type="number" min="1" max="28" value={draft.billingDay} onChange={(e) => setDraft({ ...draft, billingDay: Number(e.target.value) })}/></label><label><span>Grace period (days)</span><input type="number" min="0" max="90" value={draft.graceDays} onChange={(e) => setDraft({ ...draft, graceDays: Number(e.target.value) })}/></label><label><span>Trial (days)</span><input type="number" min="0" max="365" value={draft.trialDays} onChange={(e) => setDraft({ ...draft, trialDays: Number(e.target.value) })}/></label><label><span>Minimum charge</span><input type="number" min="0" step="0.01" value={draft.minimumCharge} onChange={(e) => setDraft({ ...draft, minimumCharge: Number(e.target.value) })}/></label><label><span>Maximum charge <em>optional cap</em></span><input type="number" min="0" step="0.01" value={draft.maximumCharge ?? ""} onChange={(e) => setDraft({ ...draft, maximumCharge: e.target.value === "" ? null : Number(e.target.value) })}/></label></div>
        <div className="platform-calculation-card"><div><span className="platform-calculation-label">Live invoice estimate</span><strong>{money(draft.currency, estimatedTotal)}</strong><small>{billing.activeStudents.toLocaleString()} active students · {draft.billingMode === "per_student" ? money(draft.currency, draft.studentRate) + " each" : "flat recurring charge"}</small></div><CheckCircle2 size={22}/></div>
        <button type="button" className="app-action" onClick={() => void saveBilling()} disabled={busy}><CreditCard size={14}/><strong>Save school billing rules</strong></button>
      </section>
      <aside className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">BILLING BEHAVIOUR</span><h2>Operator controls</h2><p>Predictable settings that make invoices easy to explain and review.</p></div></div><div className="platform-rule-list"><div><strong>Automatically count students</strong><span>The invoice engine reads the current active-student count at generation time.</span></div><div><strong>Protect the floor</strong><span>Use a minimum charge when a per-student school has a contracted baseline.</span></div><div><strong>Optional ceiling</strong><span>Cap unexpectedly large bills when you have a commercial commitment.</span></div><div><strong>Separate lifecycle</strong><span>Suspending a school does not delete its billing history.</span></div></div>{selectedSchool && <div className="platform-side-summary"><span>Current plan</span><strong>{selectedSchool.subscriptionPlan?.name ?? "Custom billing"}</strong><small>{selectedSchool.studentCount.toLocaleString()} active students in directory</small></div>}</aside>
    </div>}
    {tab === "subscription" && !billing && <div className="app-card app-panel platform-empty"><strong>Choose a school to configure subscription billing.</strong><span>Each school can use the same central platform but have its own billing basis and rate.</span></div>}
    {tab === "messaging" && messaging && <div className="platform-studio-grid">
      <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">PREPAID RESELLING</span><h2>{messaging.school.name}</h2><p>These balances are separate from subscription billing. Allocate credits you purchased from your provider, then charge schools using your own retail rate.</p></div><MessageSquare size={20}/></div>
        <div className="platform-credit-cards"><div><span>SMS balance</span><strong>{messaging.wallet.smsBalance.toLocaleString()}</strong><small>message units</small></div><div><span>WhatsApp balance</span><strong>{messaging.wallet.whatsappBalance.toLocaleString()}</strong><small>message units</small></div></div>
        <div className="platform-channel-toggle"><button type="button" className={channel === "sms" ? "is-active" : ""} onClick={() => setChannel("sms")}>SMS</button><button type="button" className={channel === "whatsapp" ? "is-active" : ""} onClick={() => setChannel("whatsapp")}>WhatsApp</button></div>
        <div className="platform-form-grid"><label><span>Your selling price / unit</span><input type="number" min="0" step="0.0001" value={rates.sellRate} onChange={(e) => setRates({ ...rates, sellRate: Number(e.target.value) })}/></label><label><span>Your provider cost / unit</span><input type="number" min="0" step="0.0001" value={rates.costRate} onChange={(e) => setRates({ ...rates, costRate: Number(e.target.value) })}/></label><label><span>Low-balance alert threshold</span><input type="number" min="0" value={rates.lowBalanceThreshold} onChange={(e) => setRates({ ...rates, lowBalanceThreshold: Number(e.target.value) })}/></label></div>
        <div className="platform-margin"><span>Margin per unit</span><strong>{money("GHS", Math.max(0, rates.sellRate - rates.costRate))}</strong><small>Estimated margin on each sold message unit.</small></div>
        <button type="button" className="app-action" onClick={() => void saveRates()} disabled={busy}><CreditCard size={14}/><strong>Save resale pricing</strong></button>
        <div className="platform-credit-allocation"><div className="app-card-head"><div><h3>Allocate or adjust credits</h3><p>Positive numbers allocate provider-backed capacity to the school; negative numbers record a correction/refund.</p></div></div><div className="platform-form-grid"><label><span>Quantity</span><input type="number" step="1" value={allocation.quantity} onChange={(e) => setAllocation({ ...allocation, quantity: Number(e.target.value) })}/></label><label><span>Your acquisition cost / unit</span><input type="number" min="0" step="0.0001" value={allocation.unitCost} onChange={(e) => setAllocation({ ...allocation, unitCost: Number(e.target.value) })}/></label><label><span>Your sale price / unit</span><input type="number" min="0" step="0.0001" value={allocation.unitPrice} onChange={(e) => setAllocation({ ...allocation, unitPrice: Number(e.target.value) })}/></label><label><span>Reference</span><input value={allocation.reference} onChange={(e) => setAllocation({ ...allocation, reference: e.target.value })} placeholder="Provider purchase / school invoice ref"/></label><label style={{ gridColumn: "1 / -1" }}><span>Notes</span><input value={allocation.notes} onChange={(e) => setAllocation({ ...allocation, notes: e.target.value })} placeholder="e.g. 5,000 SMS credits bought at provider rate"/></label></div><button type="button" className="app-action" onClick={() => void allocate()} disabled={busy}><WalletCards size={14}/><strong>Post credit allocation</strong></button></div>
      </section>
      <aside className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">AUDITABLE LEDGER</span><h2>Recent credit activity</h2><p>Every allocation and correction stays separate from school subscription invoices.</p></div></div>{messaging.ledger.map((entry) => <div className="platform-ledger-row" key={entry.id}><div><strong>{entry.channel === "sms" ? "SMS" : "WhatsApp"} · {entry.entryType}</strong><span>{entry.quantity > 0 ? "+" : ""}{entry.quantity.toLocaleString()} units · balance {entry.balanceAfter.toLocaleString()}</span></div><small>{new Date(entry.createdAt).toLocaleString()}</small></div>)}{messaging.ledger.length === 0 && <div className="platform-empty"><strong>No credit entries yet.</strong><span>This school has not received a communication credit allocation.</span></div>}</aside>
    </div>}
    {tab === "messaging" && !messaging && <div className="app-card app-panel platform-empty"><strong>Choose a school to manage its SMS/WhatsApp wallet.</strong><span>This ledger is intentionally independent from platform subscription billing.</span></div>}
  </div>;
}
