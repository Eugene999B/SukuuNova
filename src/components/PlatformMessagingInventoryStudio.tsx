"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, DatabaseZap, Plus, RefreshCw } from "lucide-react";

type Channel = "sms" | "whatsapp";
type Inventory = { channel: Channel; balance: number; totalPurchased: number; updatedAt: string };
type Ledger = { id: string; channel: Channel; entryType: string; quantity: number; balanceAfter: number; unitCost: string | null; schoolId: string | null; reference: string | null; notes: string | null; createdAt: string };
type Payload = { inventory: Inventory[]; ledger: Ledger[] };

export default function PlatformMessagingInventoryStudio() {
  const [data, setData] = useState<Payload | null>(null), [channel, setChannel] = useState<Channel>("sms"), [quantity, setQuantity] = useState(0), [unitCost, setUnitCost] = useState(0), [reference, setReference] = useState(""), [notes, setNotes] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/platform/messaging-inventory", { cache: "no-store" });
    if (response.ok) setData(await response.json() as Payload);
  }
  useEffect(() => { void load(); }, []);

  const selected = useMemo(() => data?.inventory.find((row) => row.channel === channel) ?? { channel, balance: 0, totalPurchased: 0, updatedAt: new Date().toISOString() }, [data, channel]);
  const recordPurchase = async () => {
    if (!quantity || quantity < 1) { setMessage("Enter the number of provider credits purchased."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/platform/messaging-inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "purchase", channel, quantity, unitCost, reference: reference.trim() || undefined, notes: notes.trim() || undefined }) });
      const result = await response.json() as { message?: string; error?: string };
      setMessage(response.ok ? `${channel === "sms" ? "SMS" : "WhatsApp"} provider purchase recorded and added to available inventory.` : (result.message ?? result.error ?? "Unable to record purchase."));
      if (response.ok) { setQuantity(0); setReference(""); setNotes(""); await load(); }
    } finally { setBusy(false); }
  };

  return <section className="app-card app-panel">
    <div className="app-card-head"><div><span className="app-eyebrow">PLATFORM MESSAGING INVENTORY</span><h2>Provider capacity before resale</h2><p>Record the SMS/WhatsApp capacity you purchase first. School wallet allocations then draw down this platform-owned inventory, keeping provider cost and school resale economics traceable.</p></div><Boxes size={21}/></div>
    {message && <div className="app-banner" role="status"><div><h3>{message}</h3><p>Inventory movements are permission-gated and audited.</p></div><span className="app-pill">Controlled</span></div>}
    <div className="platform-credit-cards"><div><span>SMS available</span><strong>{(data?.inventory.find((x) => x.channel === "sms")?.balance ?? 0).toLocaleString()}</strong><small>provider-backed units</small></div><div><span>WhatsApp available</span><strong>{(data?.inventory.find((x) => x.channel === "whatsapp")?.balance ?? 0).toLocaleString()}</strong><small>provider-backed units</small></div><div><span>SMS purchased lifetime</span><strong>{(data?.inventory.find((x) => x.channel === "sms")?.totalPurchased ?? 0).toLocaleString()}</strong><small>units recorded</small></div><div><span>WhatsApp purchased lifetime</span><strong>{(data?.inventory.find((x) => x.channel === "whatsapp")?.totalPurchased ?? 0).toLocaleString()}</strong><small>units recorded</small></div></div>
    <div className="platform-channel-toggle"><button type="button" className={channel === "sms" ? "is-active" : ""} onClick={() => setChannel("sms")}>SMS</button><button type="button" className={channel === "whatsapp" ? "is-active" : ""} onClick={() => setChannel("whatsapp")}>WhatsApp</button></div>
    <div className="platform-form-grid"><label><span>Provider purchase quantity</span><input type="number" min="1" step="1" value={quantity || ""} onChange={(e) => setQuantity(Number(e.target.value))}/></label><label><span>Provider cost / unit</span><input type="number" min="0" step="0.0001" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))}/></label><label><span>Provider reference</span><input value={reference} maxLength={160} placeholder="Invoice, wallet top-up or PO reference" onChange={(e) => setReference(e.target.value)}/></label><label><span>Notes</span><input value={notes} maxLength={500} placeholder="Optional purchase context" onChange={(e) => setNotes(e.target.value)}/></label></div>
    <div className="platform-calculation-card"><div><span className="platform-calculation-label">Available {channel === "sms" ? "SMS" : "WhatsApp"} inventory</span><strong>{selected.balance.toLocaleString()} units</strong><small>After purchase: {(selected.balance + Math.max(quantity, 0)).toLocaleString()} units. School allocations cannot exceed platform inventory.</small></div>{selected.balance === 0 ? <AlertTriangle size={22}/> : <DatabaseZap size={22}/>}</div>
    <button type="button" className="app-action" onClick={() => void recordPurchase()} disabled={busy}><Plus size={14}/><strong>Record provider purchase</strong></button>
    <div style={{ marginTop: 20 }}><div className="app-card-head"><div><span className="app-eyebrow">INVENTORY LEDGER</span><h3>Latest movements</h3></div><button type="button" className="app-pill" onClick={() => void load()} disabled={busy}><RefreshCw size={13}/>Refresh</button></div>{data?.ledger?.length ? data.ledger.slice(0, 12).map((entry) => <div key={entry.id} className="platform-activity-row" style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 12, alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--sn-line)" }}><span className={`platform-status ${entry.quantity > 0 && entry.entryType === "purchase" ? "platform-status-healthy" : "platform-status-watch"}`}>{entry.entryType}</span><span style={{ display: "grid", gap: 3 }}><strong style={{ fontSize: 10.5 }}>{entry.quantity > 0 ? "+" : ""}{entry.quantity.toLocaleString()} {entry.channel.toUpperCase()}</strong><small style={{ color: "var(--sn-muted)", fontSize: 9 }}>{entry.reference ?? "No reference"}{entry.schoolId ? ` · school ${entry.schoolId}` : " · platform"}</small></span><time style={{ fontSize: 9, color: "var(--sn-muted)" }}>{new Date(entry.createdAt).toLocaleString()}</time></div>) : <div className="platform-empty"><strong>No inventory movements yet.</strong><span>Record your first provider purchase before allocating credits to a school.</span></div>}</div>
  </section>;
}
