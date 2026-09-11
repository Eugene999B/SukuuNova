"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, ImageOff, RefreshCw, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import "./identity-card-manager.css";

type Card = {
  id: string;
  personType: "student" | "staff";
  studentId: string | null;
  staffId: string | null;
  serial: string;
  personName: string;
  personNumber: string;
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
type StatusFilter = "current" | "all" | "revoked" | "expired";

function isCurrent(card: Card) {
  return card.status === "active" && !card.isExpired;
}

function downloadName(schoolName: string, label: string) {
  const school = schoolName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "school";
  return `${school}-${label}-id-cards-front-back.pdf`;
}

export default function IdentityCardManager({ schoolName }: { schoolName: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "student" | "staff">("all");
  const [classId, setClassId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("current");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [validityMonths, setValidityMonths] = useState(60);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/identity-cards", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || body.error || "Unable to load identity cards.");
      setCards(Array.isArray(body.cards) ? body.cards : []);
      setClasses(Array.isArray(body.classes) ? body.classes : []);
      setValidityMonths(Number(body.settings?.validityMonths) || 60);
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
    if (statusFilter === "current" && !isCurrent(card)) return false;
    if (statusFilter === "revoked" && card.status !== "revoked") return false;
    if (statusFilter === "expired" && !(card.status === "active" && card.isExpired)) return false;
    const haystack = `${card.personName} ${card.personNumber} ${card.serial} ${card.admissionNo ?? ""} ${card.className ?? ""} ${card.roleName ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [cards, classId, kind, query, statusFilter]);

  const currentFiltered = filtered.filter(isCurrent);
  const selectableIds = currentFiltered.map((card) => card.id);
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const currentStudents = cards.filter((card) => card.personType === "student" && isCurrent(card));
  const currentStaff = cards.filter((card) => card.personType === "staff" && isCurrent(card));
  const portraitMissing = cards.filter((card) => isCurrent(card) && !card.photoReady).length;
  const selectedCurrent = cards.filter((card) => selected.has(card.id) && isCurrent(card));
  const selectedClassCount = classId === "all" ? 0 : cards.filter((card) => card.personType === "student" && card.classId === classId && isCurrent(card)).length;

  function toggle(id: string) {
    const card = cards.find((item) => item.id === id);
    if (!card || !isCurrent(card)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allFilteredSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function download(scope: "all" | "students" | "staff" | "class" | "selected", options?: { ids?: string[]; label?: string }) {
    const busyKey = options?.label || scope;
    setBusy(busyKey);
    setMessage("");
    setError("");
    try {
      const ids = options?.ids ?? (scope === "selected" ? selectedCurrent.map((card) => card.id) : undefined);
      if (scope === "selected" && !ids?.length) throw new Error("Select at least one current card first.");
      if (scope === "class" && classId === "all") throw new Error("Choose a class first.");
      const response = await fetch("/api/school/identity-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "download",
          scope,
          ...(scope === "selected" ? { ids } : {}),
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
      anchor.download = downloadName(schoolName, options?.label || scope);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Front-and-back ID card print pack downloaded. Print at 100% / Actual Size and use duplex long-edge flipping.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the print pack.");
    } finally {
      setBusy("");
    }
  }

  async function saveValidity() {
    setBusy("validity");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/school/identity-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "configure", validityMonths }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Unable to save ID card validity.");
      setMessage(`ID card validity updated to ${validityMonths / 12} year${validityMonths === 12 ? "" : "s"}. Current cards were refreshed; reprint active cards so the QR and expiry match.`);
      setSelected(new Set());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save ID card validity.");
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
      setSelected((current) => { const next = new Set(current); next.delete(cardId); return next; });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the identity card.");
    } finally {
      setBusy("");
    }
  }

  return <div className="identity-manager">
    <section className="identity-manager-command">
      <div><span className="app-eyebrow">SCHOOL IDENTITY</span><h2>Professional student & staff ID cards</h2><p>Every download now contains a designed front and back at standard CR80 card size. The front carries the school logo, portrait and school ID; the QR verification code and practical details live on the back.</p></div>
      <button type="button" className="app-pill" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </section>

    <section className="identity-manager-settings">
      <div><SlidersHorizontal size={18}/><span><strong>Card validity</strong><small>One school-wide period for all student and staff ID downloads. Default: 5 years.</small></span></div>
      <label><span>Validity period</span><select value={validityMonths} onChange={(event) => setValidityMonths(Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => (index + 1) * 12).map((months) => <option value={months} key={months}>{months / 12} year{months === 12 ? "" : "s"}</option>)}</select></label>
      <button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void saveValidity()}>{busy === "validity" ? "Saving…" : "Save validity"}</button>
    </section>

    <section className="identity-manager-kpis">
      <div><small>Current student IDs</small><strong>{currentStudents.length}</strong></div>
      <div><small>Current staff IDs</small><strong>{currentStaff.length}</strong></div>
      <div><small>Missing portrait</small><strong>{portraitMissing}</strong></div>
      <div><small>Current selection</small><strong>{selectedCurrent.length}</strong></div>
    </section>

    <section className="app-card app-panel identity-manager-panel">
      <div className="identity-manager-toolbar">
        <div className="identity-kind-tabs">
          {(["all", "student", "staff"] as const).map((value) => <button key={value} type="button" className={kind === value ? "is-active" : ""} onClick={() => { setKind(value); if (value === "staff") setClassId("all"); }}>{value === "all" ? "All people" : value === "student" ? "Students" : "Staff"}</button>)}
        </div>
        <label className="identity-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, student/staff ID, class, role or card number"/></label>
        <label className="identity-class-filter"><span>Class</span><select value={classId} onChange={(event) => { const value = event.target.value; setClassId(value); if (value !== "all") setKind("student"); }} disabled={!classes.length || kind === "staff"}><option value="all">All classes</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="identity-class-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="current">Current only</option><option value="all">All records</option><option value="revoked">Revoked</option><option value="expired">Expired</option></select></label>
      </div>

      <div className="identity-filter-summary"><strong>{filtered.length}</strong> record{filtered.length === 1 ? "" : "s"} shown · <strong>{currentFiltered.length}</strong> printable with the current filters.</div>

      <div className="identity-manager-actions">
        <button type="button" className="button primary" disabled={Boolean(busy) || currentFiltered.length === 0} onClick={() => void download("selected", { ids: currentFiltered.map((card) => card.id), label: "filtered" })}><Download size={14}/> Print filtered ({currentFiltered.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || currentStudents.length === 0} onClick={() => void download("students")}><Download size={14}/> All students ({currentStudents.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || currentStaff.length === 0} onClick={() => void download("staff")}><Download size={14}/> All staff ({currentStaff.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || classId === "all" || selectedClassCount === 0} onClick={() => void download("class")}><Download size={14}/> Selected class ({selectedClassCount})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || selectedCurrent.length === 0} onClick={() => void download("selected")}><Download size={14}/> Selected cards ({selectedCurrent.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || currentStudents.length + currentStaff.length === 0} onClick={() => void download("all")}><Download size={14}/> Whole school</button>
        <button type="button" className="identity-select-visible" disabled={!selectableIds.length} onClick={toggleAll}>{allFilteredSelected ? "Clear visible" : `Select visible (${selectableIds.length})`}</button>
        {selectedCurrent.length ? <button type="button" className="identity-clear-selected" onClick={() => setSelected(new Set())}>Clear selection</button> : null}
      </div>

      {portraitMissing ? <div className="identity-manager-note"><ImageOff size={17}/><div><strong>{portraitMissing} current card{portraitMissing === 1 ? "" : "s"} will print with initials.</strong><span>Open the student or staff profile and add the official portrait for the finished card design.</span></div></div> : null}
      {error ? <div className="identity-manager-alert is-error" role="alert">{error}</div> : null}
      {message ? <div className="identity-manager-alert is-success" role="status">{message}</div> : null}

      {loading ? <div className="identity-manager-empty"><strong>Preparing school identity cards…</strong></div> : filtered.length === 0 ? <div className="identity-manager-empty"><strong>No identity cards match these filters.</strong><span>Clear the search, class, person type or status filter.</span></div> : <div className="identity-manager-table-wrap">
        <table className="identity-manager-table"><thead><tr><th><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select visible current identity cards"/></th><th>Person</th><th>School ID</th><th>Portrait</th><th>Card number</th><th>Valid until</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((card) => {
          const current = isCurrent(card);
          const profileHref = card.personType === "student" ? `/school/students/${encodeURIComponent(card.studentId ?? "")}` : `/school/staff/${encodeURIComponent(card.staffId ?? "")}`;
          return <tr key={card.id}>
            <td><input type="checkbox" checked={selected.has(card.id)} disabled={!current} onChange={() => toggle(card.id)} aria-label={`Select ${card.personName}`}/></td>
            <td><Link href={profileHref}><strong>{card.personName}</strong></Link><small>{card.personType === "student" ? card.className ?? "No class" : card.roleName ?? "Staff"}</small></td>
            <td><strong className="identity-person-number">{card.personNumber}</strong><small>{card.personType === "student" ? "Student ID" : "Staff ID"}</small></td>
            <td><span className={card.photoReady ? "identity-photo-state is-ready" : "identity-photo-state is-missing"}>{card.photoReady ? "Ready" : "Add photo"}</span></td>
            <td><code>{card.serial}</code></td>
            <td>{new Date(card.expiresAt).toLocaleDateString("en-GB")}</td>
            <td><span className={current ? "identity-card-state is-current" : "identity-card-state is-invalid"}>{current ? "Current" : card.status === "revoked" ? "Revoked" : "Expired"}</span></td>
            <td><div className="identity-row-actions"><Link href={profileHref}><ShieldCheck size={13}/> Profile</Link><button type="button" disabled={Boolean(busy) || !current} onClick={() => void mutate("reissue", card.id)}>Reissue</button>{card.status === "active" ? <button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => void mutate("revoke", card.id)}>Revoke</button> : null}</div></td>
          </tr>;
        })}</tbody></table>
      </div>}
    </section>
  </div>;
}
