"use client";

import { useEffect, useMemo, useState } from "react";
import { PackagePlus, X } from "lucide-react";
import "./school-property-receive-shortcut.css";

type Item = { id: string; itemCode: string; name: string; unit: string; trackSerial: boolean };
type Location = { id: string; name: string; code: string };
type User = { id: string; name: string };
type Payload = { access?: { manage?: boolean }; items?: Item[]; locations?: Location[]; users?: User[]; message?: string; error?: string };

export default function SchoolPropertyReceiveShortcut() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState("good");
  const [serialNumber, setSerialNumber] = useState("");
  const [unitValue, setUnitValue] = useState("");
  const [custodianUserId, setCustodianUserId] = useState("");
  const [notes, setNotes] = useState("");

  const item = useMemo(() => data?.items?.find((entry) => entry.id === itemId) ?? null, [data, itemId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/properties", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not load property options.");
      setData(payload);
      setItemId((current) => current || payload.items?.[0]?.id || "");
      setLocationId((current) => current || payload.locations?.[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load property options.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !data && !loading) void load();
  }, [open, data, loading]);

  useEffect(() => {
    if (item?.trackSerial) setQuantity("1");
  }, [item]);

  async function submit() {
    if (!itemId || !locationId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/school/properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          itemId,
          locationId,
          quantity: item?.trackSerial ? 1 : Number(quantity),
          condition,
          serialNumber: serialNumber || null,
          unitValue: unitValue ? Number(unitValue) : null,
          custodianUserId: custodianUserId || null,
          notes: notes || null,
        }),
      });
      const text = await response.text();
      let payload: { message?: string; error?: string } = {};
      try { payload = text ? JSON.parse(text) : {}; } catch {}
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not receive the property item.");
      setMessage("Property received successfully. Refreshing the register…");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not receive the property item.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="property-receive-shortcut">
      <div><strong>Receive existing property</strong><span>Add more quantity to a known school item without creating a duplicate item record.</span></div>
      <button type="button" onClick={() => setOpen(true)}><PackagePlus size={16}/> Receive item</button>
    </div>
    {open ? <div className="property-receive-backdrop" role="presentation" onMouseDown={() => !saving && setOpen(false)}>
      <section className="property-receive-dialog" role="dialog" aria-modal="true" aria-labelledby="property-receive-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>PROPERTY INTAKE</small><h2 id="property-receive-title">Receive an existing item</h2><p>Select the exact property item and destination before recording quantity.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close" disabled={saving}><X size={18}/></button></header>
        {loading ? <p className="property-receive-state">Loading property options…</p> : null}
        {error ? <p className="property-receive-error">{error}</p> : null}
        {message ? <p className="property-receive-success">{message}</p> : null}
        {!loading && data ? <div className="property-receive-form">
          <label>Property item<select value={itemId} onChange={(event) => setItemId(event.target.value)}><option value="">Choose item</option>{data.items?.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.itemCode}</option>)}</select></label>
          <label>Destination<select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Choose location</option>{data.locations?.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.code}</option>)}</select></label>
          <div className="property-receive-grid"><label>Quantity<input type="number" min="1" value={quantity} disabled={Boolean(item?.trackSerial)} onChange={(event) => setQuantity(event.target.value)}/><small>{item?.trackSerial ? "Serial-tracked items are received one at a time." : item ? `Unit: ${item.unit}` : ""}</small></label><label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option><option value="maintenance">Maintenance</option></select></label></div>
          {item?.trackSerial ? <label>Serial number<input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="Required for individually tracked property"/></label> : null}
          <div className="property-receive-grid"><label>Estimated unit value (GHS)<input type="number" min="0" step="0.01" value={unitValue} onChange={(event) => setUnitValue(event.target.value)}/></label><label>Custodian<select value={custodianUserId} onChange={(event) => setCustodianUserId(event.target.value)}><option value="">No individual custodian</option>{data.users?.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>
          <label>Notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Supplier, delivery note, reason for receipt…"/></label>
          <footer><button type="button" className="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={() => void submit()} disabled={saving || !itemId || !locationId || Number(quantity) < 1 || Boolean(item?.trackSerial && !serialNumber.trim())}>{saving ? "Recording…" : "Receive property"}</button></footer>
        </div> : null}
      </section>
    </div> : null}
  </>;
}
