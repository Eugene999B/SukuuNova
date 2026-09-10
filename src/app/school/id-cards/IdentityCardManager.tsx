"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, ImageOff, RefreshCw, Search, ShieldCheck } from "lucide-react";
import "./identity-card-manager.css";

type Card = {
  id: string;
  personType: "student" | "staff";
  studentId: string | null;
  staffId: string | null;
  serial: string;
  personName: string;
  admissionNo: string | null;
  classId: string | null;
  className: string | null;
  roleName: string | null;
  photoUrl: string | null;
  photoReady: boolean;
  issuedAt: string;
  expiresAt: string;
  status: "active" | "revoked";
  isExpired: boolean;
};

type SchoolClass = { id: string; name: string };

export default function IdentityCardManager({ schoolName }: { schoolName: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "student" | "staff">("all");
  const [classId, setClassId] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/identity-cards", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || body.error || "Unable to load identity cards.");
      setCards(Array.isArray(body.cards) ? body.cards : []);
      setClasses(Array.isArray(body.classes) ? body.classes : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load identity cards.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => cards.filter((card) => {
    if (kind !== "all" && card.personType !== kind) return false;
    if (classId !== "all" && (card.personType !== "student" || card.classId !== classId)) return false;
    const haystack = `${card.personName} ${card.serial} ${card.admissionNo ?? ""} ${card.className ?? ""} ${card.roleName ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [cards, classId, kind, query]);

  const filteredIds = filtered.map((card) => card.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const studentCount = cards.filter((card) => card.personType === "student" && card.status === "active" && !card.isExpired).length;
  const staffCount = cards.filter((card) => card.personType === "staff" && card.status === "active" && !card.isExpired).length;
  const portraitMissing = cards.filter((card) => card.status === "active" && !card.isExpired && !card.photoReady).length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function download(scope: "all" | "students" | "staff" | "class" | "selected") {
    setBusy(scope);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/school/identity-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "download",
          scope,
          ...(scope === "selected" ? { ids: [...selected] } : {}),
          ...(scope === "class" ? { classId } : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || body.error || "Unable to create the print pack.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${schoolName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${scope}-identity-cards.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Identity-card print pack downloaded successfully.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the print pack.");
    } finally {
      setBusy("");
    }
  }

  async function mutate(action: "reissue" | "revoke", cardId: string) {
    const confirmation = action === "reissue"
      ? "Reissue this card? The current credential will stop verifying as current."
      : "Revoke this card? It will immediately stop verifying as current.";
    if (!window.confirm(confirmation)) return;
    setBusy(cardId);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/school/identity-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, cardId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || body.error || `Unable to ${action} the card.`);
      setMessage(action === "reissue" ? "New card issued; the previous credential is revoked." : "Identity card revoked.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the identity card.");
    } finally {
      setBusy("");
    }
  }

  return <div className="identity-manager">
    <section className="identity-manager-command">
      <div><span className="app-eyebrow">SCHOOL IDENTITY</span><h2>Student & staff ID cards</h2><p>Print one person, one class, a staff team, or the whole school. Every current card carries the school identity and signed QR verification.</p></div>
      <button type="button" className="app-pill" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </section>

    <section className="identity-manager-kpis">
      <div><small>Current student IDs</small><strong>{studentCount}</strong></div>
      <div><small>Current staff IDs</small><strong>{staffCount}</strong></div>
      <div><small>Missing portrait</small><strong>{portraitMissing}</strong></div>
      <div><small>Selected</small><strong>{selected.size}</strong></div>
    </section>

    <section className="app-card app-panel identity-manager-panel">
      <div className="identity-manager-toolbar">
        <div className="identity-kind-tabs">
          {(["all", "student", "staff"] as const).map((value) => <button key={value} type="button" className={kind === value ? "is-active" : ""} onClick={() => { setKind(value); if (value === "staff") setClassId("all"); }}>{value === "all" ? "All people" : value === "student" ? "Students" : "Staff"}</button>)}
        </div>
        <label className="identity-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, admission no., class or serial"/></label>
        {kind !== "staff" && classes.length ? <label className="identity-class-filter"><span>Class</span><select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="all">All classes</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : null}
      </div>

      <div className="identity-manager-actions">
        <button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void download("all")}><Download size={14}/> Whole school</button>
        <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void download("students")}><Download size={14}/> All students</button>
        <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void download("staff")}><Download size={14}/> All staff</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || classId === "all"} onClick={() => void download("class")}><Download size={14}/> Selected class</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || selected.size === 0} onClick={() => void download("selected")}><Download size={14}/> Selected cards</button>
        <button type="button" className="identity-select-visible" onClick={toggleAll}>{allFilteredSelected ? "Clear visible" : "Select visible"}</button>
      </div>

      {portraitMissing ? <div className="identity-manager-note"><ImageOff size={17}/><div><strong>{portraitMissing} current card{portraitMissing === 1 ? "" : "s"} will print with initials.</strong><span>Open the student or staff profile and add the official portrait for the finished card design.</span></div></div> : null}
      {error ? <div className="identity-manager-alert is-error" role="alert">{error}</div> : null}
      {message ? <div className="identity-manager-alert is-success" role="status">{message}</div> : null}

      {loading ? <div className="identity-manager-empty"><strong>Preparing school identity cards…</strong></div> : filtered.length === 0 ? <div className="identity-manager-empty"><strong>No identity cards match these filters.</strong></div> : <div className="identity-manager-table-wrap">
        <table className="identity-manager-table"><thead><tr><th><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select visible identity cards"/></th><th>Person</th><th>Portrait</th><th>Card</th><th>Valid until</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((card) => {
          const current = card.status === "active" && !card.isExpired;
          const profileHref = card.personType === "student" ? `/school/students/${encodeURIComponent(card.studentId ?? "")}` : `/school/staff/${encodeURIComponent(card.staffId ?? "")}`;
          return <tr key={card.id}><td><input type="checkbox" checked={selected.has(card.id)} onChange={() => toggle(card.id)} aria-label={`Select ${card.personName}`}/></td><td><Link href={profileHref}><strong>{card.personName}</strong></Link><small>{card.personType === "student" ? `${card.admissionNo ?? "No admission no."} · ${card.className ?? "No class"}` : card.roleName ?? "Staff"}</small></td><td><span className={card.photoReady ? "identity-photo-state is-ready" : "identity-photo-state is-missing"}>{card.photoReady ? "Ready" : "Add photo"}</span></td><td><code>{card.serial}</code><small>{card.personType}</small></td><td>{new Date(card.expiresAt).toLocaleDateString("en-GB")}</td><td><span className={current ? "identity-card-state is-current" : "identity-card-state is-invalid"}>{current ? "Current" : card.status === "revoked" ? "Revoked" : "Expired"}</span></td><td><div className="identity-row-actions"><Link href={profileHref}><ShieldCheck size={13}/> Profile</Link><button type="button" disabled={Boolean(busy)} onClick={() => void mutate("reissue", card.id)}>Reissue</button>{card.status === "active" ? <button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => void mutate("revoke", card.id)}>Revoke</button> : null}</div></td></tr>;
        })}</tbody></table>
      </div>}
    </section>
  </div>;
}
