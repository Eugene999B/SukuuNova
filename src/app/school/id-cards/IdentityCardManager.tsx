"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileDown,
  ImageOff,
  LoaderCircle,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
type PrintStage = "preparing" | "rendering" | "combining" | "saving" | "retrying";
type PrintProgress = {
  label: string;
  stage: PrintStage;
  currentPart: number;
  totalParts: number;
  completedCards: number;
  totalCards: number;
  retryAttempt?: number;
};

const CLIENT_PRINT_PACK = 32;
const PRINT_RETRIES = 2;

function isCurrent(card: Card) {
  return card.status === "active" && !card.isExpired;
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "school";
}

function downloadName(schoolName: string, label: string) {
  return `${safeFilename(schoolName)}-${safeFilename(label)}-id-cards-a4-duplex.pdf`;
}

function chunk<T>(items: T[], size: number) {
  const parts: T[][] = [];
  for (let index = 0; index < items.length; index += size) parts.push(items.slice(index, index + size));
  return parts;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function pdfBytesBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}

function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  return disposition.match(/filename="([^"]+)"/i)?.[1] || fallback;
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
  const [serverPackLimit, setServerPackLimit] = useState(64);
  const [printProgress, setPrintProgress] = useState<PrintProgress | null>(null);
  const printAbortRef = useRef<AbortController | null>(null);

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
      setServerPackLimit(Math.max(8, Number(body.printPackLimit) || 64));
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
  const currentStudents = cards.filter((card) => card.personType === "student" && isCurrent(card));
  const currentStaff = cards.filter((card) => card.personType === "staff" && isCurrent(card));
  const currentCards = cards.filter(isCurrent);
  const selectedCurrent = cards.filter((card) => selected.has(card.id) && isCurrent(card));
  const selectedClassCards = classId === "all" ? [] : currentStudents.filter((card) => card.classId === classId);
  const selectableIds = currentFiltered.map((card) => card.id);
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const portraitMissing = currentCards.filter((card) => !card.photoReady).length;

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

  function cancelPrint() {
    printAbortRef.current?.abort();
  }

  async function requestPrintPart(
    ids: string[],
    part: number,
    totalParts: number,
    signal: AbortSignal,
    label: string,
    completedCards: number,
    totalCards: number,
  ) {
    let lastMessage = `Unable to prepare print pack ${part} of ${totalParts}.`;
    for (let attempt = 0; attempt <= PRINT_RETRIES; attempt += 1) {
      if (attempt > 0) {
        setPrintProgress({ label, stage: "retrying", currentPart: part, totalParts, completedCards, totalCards, retryAttempt: attempt });
        await sleep(650 * attempt, signal);
      }
      const response = await fetch("/api/school/identity-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({ action: "download", scope: "selected", ids, part, totalParts }),
      });
      if (response.ok) return response;
      const body = await response.json().catch(() => ({}));
      lastMessage = body.message || body.error || lastMessage;
      if (response.status < 500 || attempt === PRINT_RETRIES) throw new Error(lastMessage);
    }
    throw new Error(lastMessage);
  }

  async function downloadBulk(label: string, targetCards: Card[]) {
    const printable = targetCards.filter(isCurrent);
    if (!printable.length) {
      setError("No current identity cards are available for this print action.");
      return;
    }

    const controller = new AbortController();
    printAbortRef.current = controller;
    setBusy(`bulk-${label}`);
    setMessage("");
    setError("");

    const packSize = Math.max(8, Math.min(CLIENT_PRINT_PACK, serverPackLimit));
    const parts = chunk(printable, packSize);
    setPrintProgress({ label, stage: "preparing", currentPart: 0, totalParts: parts.length, completedCards: 0, totalCards: printable.length });

    try {
      const pdfLib = parts.length > 1 ? await import("pdf-lib") : null;
      const combined = pdfLib ? await pdfLib.PDFDocument.create() : null;
      let singleBlob: Blob | null = null;
      let completedCards = 0;

      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        setPrintProgress({ label, stage: "rendering", currentPart: index + 1, totalParts: parts.length, completedCards, totalCards: printable.length });
        const response = await requestPrintPart(
          part.map((card) => card.id),
          index + 1,
          parts.length,
          controller.signal,
          label,
          completedCards,
          printable.length,
        );

        if (combined && pdfLib) {
          const source = await pdfLib.PDFDocument.load(await response.arrayBuffer());
          const pages = await combined.copyPages(source, source.getPageIndices());
          pages.forEach((page) => combined.addPage(page));
        } else {
          singleBlob = await response.blob();
        }

        completedCards += part.length;
        setPrintProgress({ label, stage: "rendering", currentPart: index + 1, totalParts: parts.length, completedCards, totalCards: printable.length });
      }

      let finalBlob: Blob;
      if (combined) {
        setPrintProgress({ label, stage: "combining", currentPart: parts.length, totalParts: parts.length, completedCards: printable.length, totalCards: printable.length });
        finalBlob = pdfBytesBlob(await combined.save({ useObjectStreams: true, addDefaultPage: false }));
      } else if (singleBlob) {
        finalBlob = singleBlob;
      } else {
        throw new Error("The print engine completed without producing a PDF.");
      }

      setPrintProgress({ label, stage: "saving", currentPart: parts.length, totalParts: parts.length, completedCards: printable.length, totalCards: printable.length });
      saveBlob(finalBlob, downloadName(schoolName, label));
      setMessage(`${printable.length} front-and-back ID card${printable.length === 1 ? "" : "s"} prepared successfully. Print the A4 duplex PDF at 100% / Actual Size and flip on the long edge.`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") setError("ID-card printing was cancelled before the file was created.");
      else setError(reason instanceof Error ? reason.message : "Unable to create the print pack.");
    } finally {
      printAbortRef.current = null;
      setPrintProgress(null);
      setBusy("");
    }
  }

  async function downloadSingle(card: Card) {
    if (!isCurrent(card)) return;
    const href = card.personType === "student"
      ? `/api/school/identity-cards/student/${encodeURIComponent(card.studentId ?? "")}`
      : `/api/school/identity-cards/staff/${encodeURIComponent(card.staffId ?? "")}`;
    const controller = new AbortController();
    printAbortRef.current = controller;
    setBusy(`single-${card.id}`);
    setMessage("");
    setError("");
    setPrintProgress({ label: card.personName, stage: "rendering", currentPart: 1, totalParts: 1, completedCards: 0, totalCards: 1 });
    try {
      const response = await fetch(href, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || body.error || "Unable to prepare this identity card.");
      }
      const blob = await response.blob();
      setPrintProgress({ label: card.personName, stage: "saving", currentPart: 1, totalParts: 1, completedCards: 1, totalCards: 1 });
      saveBlob(blob, responseFilename(response, `${safeFilename(card.personName)}-identity-card-front-back.pdf`));
      setMessage(`${card.personName}'s two-sided CR80 ID card downloaded.`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") setError("ID-card printing was cancelled.");
      else setError(reason instanceof Error ? reason.message : "Unable to prepare this identity card.");
    } finally {
      printAbortRef.current = null;
      setPrintProgress(null);
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
      setMessage(`ID card validity updated to ${validityMonths / 12} year${validityMonths === 12 ? "" : "s"}. Reprint active cards so the expiry date printed on each card matches the live verification record.`);
      setSelected(new Set());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save ID card validity.");
    } finally {
      setBusy("");
    }
  }

  async function mutate(action: "reissue" | "revoke", cardId: string) {
    const prompt = action === "reissue"
      ? "Reissue this card? A new credential will be issued and this printed card will no longer be current."
      : "Revoke this card? It will immediately stop verifying as current.";
    if (!window.confirm(prompt)) return;
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

  const progressPercent = printProgress
    ? Math.max(4, Math.min(100, Math.round((printProgress.completedCards / Math.max(1, printProgress.totalCards)) * 100)))
    : 0;
  const progressText = printProgress?.stage === "retrying"
    ? `Print pack ${printProgress.currentPart} had a temporary error — retrying (${printProgress.retryAttempt}/${PRINT_RETRIES})…`
    : printProgress?.stage === "combining"
      ? "Combining prepared sheets into one PDF…"
      : printProgress?.stage === "saving"
        ? "Final file is ready — starting your download…"
        : printProgress?.stage === "rendering"
          ? `Preparing print pack ${printProgress.currentPart} of ${printProgress.totalParts}…`
          : "Starting secure print preparation…";

  return <div className="identity-manager">
    <section className="identity-manager-command">
      <div><span className="app-eyebrow">SCHOOL IDENTITY</span><h2>Professional student & staff ID cards</h2><p>Two-sided CR80 school credentials with a resilient large-school print engine. Long jobs are divided into safe server packs, streamed into one browser-side PDF, retried on temporary server errors, and kept outside database transactions.</p></div>
      <button type="button" className="app-pill" onClick={() => void load()} disabled={loading || Boolean(busy)}><RefreshCw size={14}/> Refresh</button>
    </section>

    <section className="identity-manager-settings">
      <div><SlidersHorizontal size={18}/><span><strong>Card validity</strong><small>One school-wide period for student and staff credentials. Default: 5 years.</small></span></div>
      <label><span>Validity period</span><select value={validityMonths} onChange={(event) => setValidityMonths(Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => (index + 1) * 12).map((months) => <option value={months} key={months}>{months / 12} year{months === 12 ? "" : "s"}</option>)}</select></label>
      <button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void saveValidity()}>{busy === "validity" ? <><LoaderCircle className="identity-spin" size={14}/> Saving…</> : "Save validity"}</button>
    </section>

    <section className="identity-manager-settings identity-print-guide">
      <div><Printer size={18}/><span><strong>CR80 · 85.60 × 53.98 mm</strong><small>Standard ID-1 physical dimensions used by professional PVC card printers.</small></span></div>
      <div><span><strong>PVC / card printer</strong><small>Use Print ID on one person. The PDF contains exact-size Front and Back pages.</small></span></div>
      <div><span><strong>A4 office / print shop</strong><small>Bulk jobs are cut-ready and mirrored for duplex alignment. Print 100% / Actual Size, long-edge flip.</small></span></div>
    </section>

    <section className="identity-manager-kpis">
      <div><small>Current student IDs</small><strong>{currentStudents.length}</strong></div>
      <div><small>Current staff IDs</small><strong>{currentStaff.length}</strong></div>
      <div><small>Missing portrait</small><strong>{portraitMissing}</strong></div>
      <div><small>Current selection</small><strong>{selectedCurrent.length}</strong></div>
    </section>

    <section className="app-card app-panel identity-manager-panel">
      <div className="identity-manager-toolbar">
        <div className="identity-kind-tabs">{(["all", "student", "staff"] as const).map((value) => <button key={value} type="button" className={kind === value ? "is-active" : ""} onClick={() => { setKind(value); if (value === "staff") setClassId("all"); }}>{value === "all" ? "All people" : value === "student" ? "Students" : "Staff"}</button>)}</div>
        <label className="identity-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, student/staff ID, class, role or card number"/></label>
        <label className="identity-class-filter"><span>Class</span><select value={classId} onChange={(event) => { const value = event.target.value; setClassId(value); if (value !== "all") setKind("student"); }} disabled={!classes.length || kind === "staff"}><option value="all">All classes</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="identity-class-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="current">Current only</option><option value="all">All records</option><option value="revoked">Revoked</option><option value="expired">Expired</option></select></label>
      </div>

      <div className="identity-filter-summary"><strong>{filtered.length}</strong> record{filtered.length === 1 ? "" : "s"} shown · <strong>{currentFiltered.length}</strong> printable.</div>

      <div className="identity-manager-actions">
        <button type="button" className="button primary" disabled={Boolean(busy) || currentFiltered.length === 0} onClick={() => void downloadBulk("filtered", currentFiltered)}><Download size={14}/> Print filtered ({currentFiltered.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || currentStudents.length === 0} onClick={() => void downloadBulk("all-students", currentStudents)}><Download size={14}/> All students ({currentStudents.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || currentStaff.length === 0} onClick={() => void downloadBulk("all-staff", currentStaff)}><Download size={14}/> All staff ({currentStaff.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || classId === "all" || selectedClassCards.length === 0} onClick={() => void downloadBulk("selected-class", selectedClassCards)}><Download size={14}/> Selected class ({selectedClassCards.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || selectedCurrent.length === 0} onClick={() => void downloadBulk("selected-cards", selectedCurrent)}><Download size={14}/> Selected cards ({selectedCurrent.length})</button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || currentCards.length === 0} onClick={() => void downloadBulk("whole-school", currentCards)}><Download size={14}/> Whole school ({currentCards.length})</button>
        <button type="button" className="identity-select-visible" disabled={!selectableIds.length || Boolean(busy)} onClick={toggleAll}>{allFilteredSelected ? "Clear visible" : `Select visible (${selectableIds.length})`}</button>
        {selectedCurrent.length ? <button type="button" className="identity-clear-selected" disabled={Boolean(busy)} onClick={() => setSelected(new Set())}>Clear selection</button> : null}
      </div>

      {printProgress ? <div className="identity-print-progress" role="status" aria-live="polite">
        <div className="identity-print-progress-icon"><LoaderCircle className="identity-spin" size={22}/></div>
        <div className="identity-print-progress-copy"><strong>{progressText}</strong><span>{printProgress.label} · {printProgress.completedCards} of {printProgress.totalCards} card{printProgress.totalCards === 1 ? "" : "s"} prepared</span><div className="identity-print-progress-track"><i style={{ width: `${progressPercent}%` }}/></div></div>
        <button type="button" className="identity-print-cancel" onClick={cancelPrint}><X size={14}/> Cancel</button>
      </div> : null}

      {portraitMissing ? <div className="identity-manager-note"><ImageOff size={17}/><div><strong>{portraitMissing} current card{portraitMissing === 1 ? "" : "s"} will print with initials.</strong><span>Add an official portrait from the student or staff profile for the finished credential.</span></div></div> : null}
      {error ? <div className="identity-manager-alert is-error" role="alert">{error}</div> : null}
      {message ? <div className="identity-manager-alert is-success" role="status"><CheckCircle2 size={15}/>{message}</div> : null}

      {loading ? <div className="identity-manager-empty"><LoaderCircle className="identity-spin" size={19}/><strong>Preparing school identity cards…</strong></div> : filtered.length === 0 ? <div className="identity-manager-empty"><strong>No identity cards match these filters.</strong><span>Clear the search, class, person type or status filter.</span></div> : <div className="identity-manager-table-wrap">
        <table className="identity-manager-table"><thead><tr><th><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select visible current identity cards"/></th><th>Person</th><th>School ID</th><th>Portrait</th><th>Card number</th><th>Valid until</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((card) => {
          const current = isCurrent(card);
          const profileHref = card.personType === "student" ? `/school/students/${encodeURIComponent(card.studentId ?? "")}` : `/school/staff/${encodeURIComponent(card.staffId ?? "")}`;
          const printingThis = busy === `single-${card.id}`;
          return <tr key={card.id}>
            <td><input type="checkbox" checked={selected.has(card.id)} disabled={!current || Boolean(busy)} onChange={() => toggle(card.id)} aria-label={`Select ${card.personName}`}/></td>
            <td><Link href={profileHref}><strong>{card.personName}</strong></Link><small>{card.personType === "student" ? card.className ?? "No class" : card.roleName ?? "Staff"}</small></td>
            <td><strong className="identity-person-number">{card.personNumber}</strong><small>{card.personType === "student" ? "Student ID" : "Staff ID"}</small></td>
            <td><span className={card.photoReady ? "identity-photo-state is-ready" : "identity-photo-state is-missing"}>{card.photoReady ? "Ready" : "Add photo"}</span></td>
            <td><code>{card.serial}</code></td>
            <td>{new Date(card.expiresAt).toLocaleDateString("en-GB")}</td>
            <td><span className={current ? "identity-card-state is-current" : "identity-card-state is-invalid"}>{current ? "Current" : card.status === "revoked" ? "Revoked" : "Expired"}</span></td>
            <td><div className="identity-row-actions">{current ? <button type="button" disabled={Boolean(busy)} onClick={() => void downloadSingle(card)}>{printingThis ? <LoaderCircle className="identity-spin" size={13}/> : <Printer size={13}/>} {printingThis ? "Preparing…" : "Print ID"}</button> : null}<Link href={profileHref}><ShieldCheck size={13}/> Profile</Link><button type="button" disabled={Boolean(busy) || card.status === "revoked"} onClick={() => void mutate("reissue", card.id)}>{card.status === "active" && card.isExpired ? "Renew" : "Reissue"}</button>{card.status === "active" ? <button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => void mutate("revoke", card.id)}>Revoke</button> : null}</div></td>
          </tr>;
        })}</tbody></table>
      </div>}

      <div className="identity-print-engine-note"><FileDown size={15}/><span><strong>Large-school print engine:</strong> jobs are rendered in safe packs of up to {Math.min(CLIENT_PRINT_PACK, serverPackLimit)} cards, each pack is released after its pages are copied, and one final PDF is downloaded. Temporary 5xx errors are retried automatically.</span></div>
    </section>
  </div>;
}
