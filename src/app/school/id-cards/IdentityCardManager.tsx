"use client";

import { useEffect, useMemo, useState } from "react";

type Card = {
  id: string;
  personType: "student" | "staff";
  serial: string;
  personName: string;
  admissionNo: string | null;
  className: string | null;
  roleName: string | null;
  issuedAt: string;
  expiresAt: string;
  status: "active" | "revoked";
  isExpired: boolean;
};

export default function IdentityCardManager({ schoolName }: { schoolName: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "student" | "staff">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/school/identity-cards", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load identity cards.");
      setCards(body.cards ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load identity cards."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => cards.filter((card) => {
    if (kind !== "all" && card.personType !== kind) return false;
    const haystack = `${card.personName} ${card.serial} ${card.admissionNo ?? ""} ${card.className ?? ""} ${card.roleName ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [cards, kind, query]);

  const filteredIds = filtered.map((card) => card.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function download(scope: "all" | "students" | "staff" | "selected") {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/school/identity-cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "download", scope, ...(scope === "selected" ? { ids: [...selected] } : {}) }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Unable to create the print pack."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${schoolName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-identity-cards.pdf`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setMessage(`Print pack ready: ${scope === "selected" ? selected.size : scope === "all" ? cards.length : cards.filter((card) => scope === "students" ? card.personType === "student" : card.personType === "staff").length} cards.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to create the print pack."); }
    finally { setBusy(false); }
  }

  async function mutate(action: "reissue" | "revoke", cardId: string) {
    if (!window.confirm(action === "reissue" ? "Reissue this card? The current credential will be revoked." : "Revoke this card? It will immediately stop verifying as current.")) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/school/identity-cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, cardId }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `Unable to ${action} the card.`);
      setMessage(action === "reissue" ? "New card issued and the previous card revoked." : "Identity card revoked.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update the identity card."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">School identity</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Student & staff ID cards</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Every active student and staff member can have one current school credential. Each card carries a signed QR code that can be checked independently.</p></div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600"><span className="rounded-full bg-slate-100 px-3 py-1.5">{cards.filter((c) => c.personType === "student").length} students</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{cards.filter((c) => c.personType === "staff").length} staff</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{selected.size} selected</span></div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setKind("all")} className={`rounded-xl px-3 py-2 text-sm font-semibold ${kind === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>All</button>
            <button type="button" onClick={() => setKind("student")} className={`rounded-xl px-3 py-2 text-sm font-semibold ${kind === "student" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Students</button>
            <button type="button" onClick={() => setKind("staff")} className={`rounded-xl px-3 py-2 text-sm font-semibold ${kind === "staff" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Staff</button>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, admission no., class or card serial" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-500 lg:max-w-md" />
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void download("all")} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Download all</button><button type="button" disabled={busy} onClick={() => void download("students")} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Students PDF</button><button type="button" disabled={busy} onClick={() => void download("staff")} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Staff PDF</button><button type="button" disabled={busy || selected.size === 0} onClick={() => void download("selected")} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Download selected</button></div>
          <button type="button" onClick={toggleAll} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">{allFilteredSelected ? "Clear visible" : "Select visible"}</button>
        </div>

        {error ? <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="m-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}
        {loading ? <div className="p-8 text-sm text-slate-500">Preparing school identity cards…</div> : filtered.length === 0 ? <div className="p-8 text-sm text-slate-500">No identity cards match this selection.</div> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-12 px-4 py-3"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select visible identity cards" /></th><th className="px-4 py-3">Person</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Card</th><th className="px-4 py-3">Valid until</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((card) => { const current = card.status === "active" && new Date(card.expiresAt).getTime() > Date.now(); return <tr key={card.id} className="hover:bg-slate-50"><td className="px-4 py-4"><input type="checkbox" checked={selected.has(card.id)} onChange={() => toggle(card.id)} aria-label={`Select ${card.personName}`} /></td><td className="px-4 py-4"><div className="font-semibold text-slate-900">{card.personName}</div><div className="mt-1 text-xs text-slate-500">{card.personType === "student" ? `${card.admissionNo ?? "No admission no."} · ${card.className ?? "No class"}` : (card.roleName ?? "Staff")}</div></td><td className="px-4 py-4 capitalize text-slate-600">{card.personType}</td><td className="px-4 py-4 font-mono text-xs text-slate-600">{card.serial}</td><td className="px-4 py-4 text-slate-600">{new Date(card.expiresAt).toLocaleDateString()}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${current ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{current ? "Current" : card.status === "revoked" ? "Revoked" : "Expired"}</span></td><td className="whitespace-nowrap px-4 py-4 text-right"><div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => void mutate("reissue", card.id)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Reissue</button>{card.status === "active" ? <button type="button" disabled={busy} onClick={() => void mutate("revoke", card.id)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">Revoke</button> : null}</div></td></tr>; })}</tbody></table></div>
        )}
      </section>
      <p className="text-xs leading-5 text-slate-500">Print packs are generated server-side as an A4 PDF with physical ID-1-sized cards. QR verification is signed and does not embed private student or staff data.</p>
    </div>
  );
}
