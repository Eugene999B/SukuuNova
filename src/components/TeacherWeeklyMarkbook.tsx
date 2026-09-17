"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, CloudOff, Loader2, Plus, Search, Users, X } from "lucide-react";
import type { GradebookChange } from "@/lib/gradebook-input";
import type { MarkStatus } from "@/lib/mark-sheet-input";

type Snapshot = { id: string; value: number; status: string; enteredAt: string } | null;
type Cell = { value: string; status: MarkStatus };
type Work = { id: string; workNumber: number; workDate: string; maxScore: number; recorded: number };
type Row = { student: { id: string; name: string; admissionNo: string }; scores: Record<string, Snapshot> };
type Props = {
  weekNumber: number;
  classId: string;
  subjectId: string;
  termId: string;
  termStart: string;
  termEnd: string;
  nextWorkNumber: number;
  works: Work[];
  rows: Row[];
  locked?: boolean;
};

function cellKey(workId: string, studentId: string) {
  return `${workId}::${studentId}`;
}

function fromSnapshot(snapshot: Snapshot): Cell {
  if (!snapshot) return { value: "", status: "present" };
  if (snapshot.status === "absent") return { value: "0", status: "absent" };
  if (snapshot.status === "excused") return { value: "0", status: "excused" };
  return { value: String(snapshot.value), status: "present" };
}

function sameCell(left: Cell | undefined, right: Cell) {
  if (!left || left.status !== right.status) return false;
  if (!left.value.trim() || !right.value.trim()) return left.value.trim() === right.value.trim();
  return Number(left.value) === Number(right.value);
}

function inputValue(cell: Cell) {
  if (cell.status === "absent") return "A";
  if (cell.status === "excused") return "E";
  return cell.value;
}

function parseInput(value: string): Cell {
  const normalized = value.trim().toUpperCase();
  if (normalized === "A") return { value: "0", status: "absent" };
  if (normalized === "E") return { value: "0", status: "excused" };
  return { value, status: "present" };
}

function storedCell(value: unknown): value is Cell {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { value?: unknown; status?: unknown };
  return typeof candidate.value === "string" && (candidate.status === "present" || candidate.status === "absent" || candidate.status === "excused");
}

function prettyDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
}

export default function TeacherWeeklyMarkbook({
  weekNumber,
  classId,
  subjectId,
  termId,
  termStart,
  termEnd,
  nextWorkNumber,
  works,
  rows,
  locked = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const initialSnapshots = useMemo(() => {
    const result: Record<string, Snapshot> = {};
    for (const work of works) {
      for (const row of rows) result[cellKey(work.id, row.student.id)] = row.scores[work.id] ?? null;
    }
    return result;
  }, [rows, works]);

  const initialCells = useMemo(() => {
    return Object.fromEntries(Object.entries(initialSnapshots).map(([key, snapshot]) => [key, fromSnapshot(snapshot)])) as Record<string, Cell>;
  }, [initialSnapshots]);

  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>(initialSnapshots);
  const [cells, setCells] = useState<Record<string, Cell>>(initialCells);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [activeWorkId, setActiveWorkId] = useState(works[0]?.id ?? "");
  const [bulkMark, setBulkMark] = useState("");
  const [savingKeys, setSavingKeys] = useState<Set<string>>(() => new Set());
  const [offlineKeys, setOfflineKeys] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showNewWork, setShowNewWork] = useState(works.length === 0);
  const [newWorkDate, setNewWorkDate] = useState("");
  const [newWorkMax, setNewWorkMax] = useState(10);
  const [creatingWork, setCreatingWork] = useState(false);

  const cellsRef = useRef(cells);
  const snapshotsRef = useRef(snapshots);
  const timers = useRef<Record<string, number>>({});
  const inFlight = useRef(new Set<string>());
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { snapshotsRef.current = snapshots; }, [snapshots]);
  useEffect(() => {
    if (!activeWorkId && works[0]) setActiveWorkId(works[0].id);
  }, [activeWorkId, works]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.student.name} ${row.student.admissionNo}`.toLowerCase().includes(needle));
  }, [query, rows]);

  const activeWork = works.find((work) => work.id === activeWorkId) ?? works[0] ?? null;
  const dirtyKeys = useMemo(() => Object.keys(cells).filter((key) => !sameCell(cells[key], fromSnapshot(snapshots[key] ?? null))), [cells, snapshots]);
  const dirtySet = useMemo(() => new Set(dirtyKeys), [dirtyKeys]);
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.student.id));

  function storageKey(workId: string) {
    return `sukuunova:mark-sheet:${workId}`;
  }

  function readPending(workId: string): Record<string, Cell> {
    if (typeof window === "undefined") return {};
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey(workId)) || "{}") as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => storedCell(value))) as Record<string, Cell>;
    } catch {
      return {};
    }
  }

  function writePending(workId: string, studentId: string, cell: Cell | null) {
    if (typeof window === "undefined") return;
    try {
      const pending = readPending(workId);
      if (cell) pending[studentId] = cell;
      else delete pending[studentId];
      if (Object.keys(pending).length) window.localStorage.setItem(storageKey(workId), JSON.stringify(pending));
      else window.localStorage.removeItem(storageKey(workId));
    } catch {
      // Server autosave still works if local storage is unavailable.
    }
  }

  function markSaving(key: string, active: boolean) {
    setSavingKeys((current) => {
      const next = new Set(current);
      if (active) next.add(key); else next.delete(key);
      return next;
    });
  }

  function markOffline(key: string, active: boolean) {
    setOfflineKeys((current) => {
      const next = new Set(current);
      if (active) next.add(key); else next.delete(key);
      return next;
    });
  }

  function buildChange(work: Work, row: Row, cell: Cell, snapshot: Snapshot): GradebookChange | null {
    const expected = snapshot ? { ...snapshot, status: snapshot.status as MarkStatus } : null;
    if (!cell.value.trim() && cell.status === "present") {
      return snapshot ? { action: "clearScore", studentId: row.student.id, assessmentId: work.id, expected } : null;
    }

    const value = Number(cell.value);
    if (cell.status === "present" && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cell.value.trim()) || !Number.isFinite(value))) {
      throw new Error(`${row.student.name}: enter a valid number from 0 to ${work.maxScore}.`);
    }
    if (value < 0 || value > work.maxScore || (cell.status !== "present" && value !== 0)) {
      throw new Error(`${row.student.name}: enter a mark from 0 to ${work.maxScore}, A for absent or E for excused.`);
    }
    return { action: "score", studentId: row.student.id, assessmentId: work.id, value, status: cell.status, expected };
  }

  function scheduleSave(workId: string, studentId: string, delay = 450) {
    if (locked || typeof window === "undefined") return;
    const key = cellKey(workId, studentId);
    if (timers.current[key]) window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(() => void saveCell(workId, studentId), delay);
  }

  function updateCell(workId: string, studentId: string, nextCell: Cell, delay = 450) {
    if (locked) return;
    const key = cellKey(workId, studentId);
    const next = { ...cellsRef.current, [key]: nextCell };
    cellsRef.current = next;
    setCells(next);
    writePending(workId, studentId, nextCell);
    markOffline(key, false);
    setError("");
    setMessage("");
    scheduleSave(workId, studentId, delay);
  }

  async function saveCell(workId: string, studentId: string) {
    if (locked) return;
    const key = cellKey(workId, studentId);
    if (inFlight.current.has(key)) {
      scheduleSave(workId, studentId, 250);
      return;
    }

    const work = works.find((candidate) => candidate.id === workId);
    const row = rows.find((candidate) => candidate.student.id === studentId);
    if (!work || !row) return;

    const cell = cellsRef.current[key];
    const snapshot = snapshotsRef.current[key] ?? null;
    if (!cell || sameCell(cell, fromSnapshot(snapshot))) {
      writePending(workId, studentId, null);
      markOffline(key, false);
      return;
    }

    let change: GradebookChange | null;
    try {
      change = buildChange(work, row, cell, snapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This mark cannot be saved.");
      return;
    }
    if (!change) return;

    const submitted = { ...cell };
    inFlight.current.add(key);
    markSaving(key, true);
    markOffline(key, false);

    try {
      const response = await fetch("/api/mvp/gradebook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "batch", changes: [change] }),
      });
      const data = await response.json().catch(() => ({})) as {
        message?: string;
        error?: string;
        result?: { studentId: string; assessmentId: string; expected: Snapshot }[];
      };
      if (!response.ok) throw new Error(data.message || data.error || "The mark could not be saved.");
      const result = data.result?.[0];
      if (!result || result.studentId !== studentId || result.assessmentId !== workId) {
        throw new Error("SukuuNova did not receive a complete save confirmation. The mark remains queued on this device.");
      }

      const nextSnapshots = { ...snapshotsRef.current, [key]: result.expected };
      snapshotsRef.current = nextSnapshots;
      setSnapshots(nextSnapshots);

      if (sameCell(cellsRef.current[key], submitted)) {
        const nextCells = { ...cellsRef.current, [key]: fromSnapshot(result.expected) };
        cellsRef.current = nextCells;
        setCells(nextCells);
        writePending(workId, studentId, null);
      } else {
        scheduleSave(workId, studentId, 160);
      }
      setError("");
      markOffline(key, false);
    } catch (cause) {
      writePending(workId, studentId, cellsRef.current[key]);
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      markOffline(key, isOffline);
      if (!isOffline) setError(cause instanceof Error ? cause.message : "The mark could not be saved. It remains queued on this device.");
    } finally {
      inFlight.current.delete(key);
      markSaving(key, false);
    }
  }

  function toggleStudent(studentId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleRows.forEach((row) => next.delete(row.student.id));
      else visibleRows.forEach((row) => next.add(row.student.id));
      return next;
    });
  }

  function applyBulkMark() {
    if (locked || !activeWork || !selected.size || !bulkMark.trim()) return;
    const cell = parseInput(bulkMark);
    const value = Number(cell.value);
    if (cell.status === "present" && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cell.value.trim()) || !Number.isFinite(value) || value < 0 || value > activeWork.maxScore)) {
      setError(`Enter a mark from 0 to ${activeWork.maxScore} for Work ${activeWork.workNumber}.`);
      return;
    }

    const targetRows = rows.filter((row) => selected.has(row.student.id));
    const next = { ...cellsRef.current };
    for (const row of targetRows) {
      const key = cellKey(activeWork.id, row.student.id);
      next[key] = cell;
      writePending(activeWork.id, row.student.id, cell);
    }
    cellsRef.current = next;
    setCells(next);
    targetRows.forEach((row, index) => scheduleSave(activeWork.id, row.student.id, 60 + index * 25));
    setBulkMark("");
    setError("");
    setMessage(`${targetRows.length} learner${targetRows.length === 1 ? "" : "s"} received the same mark in Work ${activeWork.workNumber}. Saving automatically…`);
  }

  async function createWork() {
    if (locked || creatingWork || !newWorkDate || !Number.isFinite(newWorkMax) || newWorkMax <= 0) return;
    setCreatingWork(true);
    setError("");
    try {
      const response = await fetch("/api/school/teacher-academic-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createMarkSheet", termId, classId, subjectId, weekNumber, workDate: newWorkDate, maxScore: newWorkMax }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string; error?: string; result?: { assessmentId?: string } };
      if (!response.ok) throw new Error(data.message || data.error || "Work could not be created.");
      if (!data.result?.assessmentId) throw new Error("Work was created but the markbook could not be refreshed safely.");
      setShowNewWork(false);
      setNewWorkDate("");
      setNewWorkMax(10);
      router.replace(`${pathname}?week=${weekNumber}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Work could not be created.");
    } finally {
      setCreatingWork(false);
    }
  }

  useEffect(() => {
    if (locked || typeof window === "undefined") return;
    let recovered = 0;
    const next = { ...cellsRef.current };
    for (const work of works) {
      const pending = readPending(work.id);
      for (const row of rows) {
        const cell = pending[row.student.id];
        if (!cell) continue;
        next[cellKey(work.id, row.student.id)] = cell;
        recovered += 1;
      }
    }
    if (!recovered) return;
    cellsRef.current = next;
    setCells(next);
    setMessage(`${recovered} unsaved mark${recovered === 1 ? " was" : "s were"} recovered from this device and will sync automatically.`);
    for (const work of works) {
      for (const row of rows) {
        const key = cellKey(work.id, row.student.id);
        if (!sameCell(next[key], fromSnapshot(snapshotsRef.current[key] ?? null))) scheduleSave(work.id, row.student.id, 450);
      }
    }
    // Recovery is intentionally scoped to the open weekly markbook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, weekNumber]);

  useEffect(() => {
    if (locked) return;
    const retry = () => {
      setMessage("Connection restored. SukuuNova is syncing marks that were waiting on this device…");
      for (const work of works) {
        for (const row of rows) {
          const key = cellKey(work.id, row.student.id);
          if (!sameCell(cellsRef.current[key], fromSnapshot(snapshotsRef.current[key] ?? null))) scheduleSave(work.id, row.student.id, 80);
        }
      }
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, weekNumber]);

  useEffect(() => () => {
    for (const timer of Object.values(timers.current)) window.clearTimeout(timer);
  }, []);

  const saveLabel = offlineKeys.size
    ? `${offlineKeys.size} waiting for connection`
    : savingKeys.size || dirtyKeys.length
      ? "Saving automatically…"
      : "All changes saved";

  return (
    <div className="markbook-shell">
      <div className="markbook-toolbar">
        <div className="markbook-toolbar-left">
          <label className="markbook-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner" aria-label="Search learner" />
          </label>
          <div className={`markbook-save-state ${offlineKeys.size ? "is-offline" : savingKeys.size || dirtyKeys.length ? "is-saving" : ""}`} role="status">
            {offlineKeys.size ? <CloudOff size={15} aria-hidden="true" /> : savingKeys.size || dirtyKeys.length ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
            {saveLabel}
          </div>
        </div>
        {!locked ? <button type="button" className="markbook-add-work-button" onClick={() => setShowNewWork((value) => !value)}><Plus size={16} aria-hidden="true" /> Add work</button> : null}
      </div>

      {showNewWork && !locked ? <div className="markbook-new-work">
        <div className="markbook-new-work-heading">
          <div><span>NEW COLUMN</span><strong>Set up Work {nextWorkNumber}</strong><small>Choose its date and total marks. It becomes another column in Week {weekNumber}.</small></div>
          <button type="button" aria-label="Close new work setup" onClick={() => setShowNewWork(false)}><X size={17} /></button>
        </div>
        <div className="markbook-new-work-fields">
          <label><span>Date</span><input type="date" min={termStart} max={termEnd} value={newWorkDate} onChange={(event) => setNewWorkDate(event.target.value)} disabled={creatingWork} /></label>
          <label><span>Marks out of</span><input type="number" min={1} max={100000} inputMode="decimal" value={newWorkMax} onChange={(event) => setNewWorkMax(Number(event.target.value))} disabled={creatingWork} /></label>
          <button type="button" onClick={() => void createWork()} disabled={creatingWork || !newWorkDate || !Number.isFinite(newWorkMax) || newWorkMax <= 0}>{creatingWork ? <><Loader2 size={16} className="spin" /> Creating…</> : <><Plus size={16} /> Add Work {nextWorkNumber}</>}</button>
        </div>
      </div> : null}

      {selected.size > 0 && activeWork ? <div className="markbook-bulk-bar">
        <div className="markbook-bulk-count"><Users size={16} aria-hidden="true" /><strong>{selected.size}</strong><span>selected</span></div>
        <label><span>Apply to</span><select value={activeWork.id} onChange={(event) => setActiveWorkId(event.target.value)}>{works.map((work) => <option key={work.id} value={work.id}>Work {work.workNumber} · out of {work.maxScore}</option>)}</select></label>
        <label className="markbook-bulk-mark"><span>Same mark</span><input value={bulkMark} onChange={(event) => setBulkMark(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyBulkMark(); } }} placeholder={`0–${activeWork.maxScore}`} inputMode="decimal" /></label>
        <button type="button" onClick={applyBulkMark} disabled={!bulkMark.trim()}>Apply mark</button>
        <button type="button" className="markbook-clear-selection" onClick={() => setSelected(new Set())}>Clear</button>
      </div> : null}

      {(error || message) ? <div className={`markbook-message ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>{error || message}</div> : null}

      {!works.length ? <div className="markbook-empty">
        <div className="markbook-empty-icon"><Plus size={22} /></div>
        <strong>Week {weekNumber} has no work yet.</strong>
        <span>Create Work 1 above. The class list is already ready for you.</span>
      </div> : <div className="markbook-grid-wrap">
        <table className="markbook-grid" aria-label={`Week ${weekNumber} marks`}>
          <thead><tr>
            <th className="markbook-select-col"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label={allVisibleSelected ? "Clear visible learners" : "Select all visible learners"} /></th>
            <th className="markbook-learner-col"><div><span>Learner</span><small>{visibleRows.length} shown · {rows.length} total</small></div></th>
            {works.map((work) => <th key={work.id} className={activeWork?.id === work.id ? "is-active-work" : ""} onClick={() => setActiveWorkId(work.id)}><div className="markbook-work-head"><div><strong>Work {work.workNumber}</strong><span>{prettyDate(work.workDate)}</span></div><small>Out of <b>{work.maxScore}</b></small></div></th>)}
          </tr></thead>
          <tbody>{visibleRows.map((row, rowIndex) => <tr key={row.student.id} className={selected.has(row.student.id) ? "is-selected" : ""}>
            <td className="markbook-select-col"><input type="checkbox" checked={selected.has(row.student.id)} onChange={() => toggleStudent(row.student.id)} aria-label={`Select ${row.student.name}`} /></td>
            <td className="markbook-learner-col"><div className="markbook-learner"><strong>{row.student.name}</strong><small>{row.student.admissionNo}</small></div></td>
            {works.map((work) => {
              const key = cellKey(work.id, row.student.id);
              const cell = cells[key] ?? { value: "", status: "present" };
              const isSaving = savingKeys.has(key);
              const isOffline = offlineKeys.has(key);
              const isDirty = dirtySet.has(key);
              const inputKey = `${work.id}:${row.student.id}`;
              return <td key={work.id} className={`${activeWork?.id === work.id ? "is-active-work" : ""} ${isDirty ? "is-dirty" : ""}`}>
                <div className="markbook-cell">
                  <input
                    ref={(element) => { inputs.current[inputKey] = element; }}
                    value={inputValue(cell)}
                    disabled={locked}
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={`${row.student.name}, Work ${work.workNumber}, out of ${work.maxScore}`}
                    onFocus={() => setActiveWorkId(work.id)}
                    onChange={(event) => updateCell(work.id, row.student.id, parseInput(event.target.value))}
                    onBlur={() => scheduleSave(work.id, row.student.id, 0)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                      event.preventDefault();
                      scheduleSave(work.id, row.student.id, 0);
                      const direction = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1;
                      const target = visibleRows[rowIndex + direction];
                      if (target) inputs.current[`${work.id}:${target.student.id}`]?.focus();
                    }}
                  />
                  <span className={`markbook-cell-state ${isOffline ? "is-offline" : isSaving ? "is-saving" : ""}`}>{isOffline ? "offline" : isSaving ? "saving" : snapshots[key] ? "saved" : ""}</span>
                </div>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>}

      {works.length ? <div className="markbook-hints"><span><b>Enter</b> moves down the same work column.</span><span>Type <b>A</b> for absent or <b>E</b> for excused.</span><span>Select several learners to give them the same mark at once.</span></div> : null}
    </div>
  );
}
