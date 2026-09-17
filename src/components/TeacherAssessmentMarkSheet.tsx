"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CloudOff, Loader2, Search } from "lucide-react";
import { parseMarkSheetPaste, type MarkStatus } from "@/lib/mark-sheet-input";
import type { GradebookChange } from "@/lib/gradebook-input";

type Snapshot = { id: string; value: number; status: string; enteredAt: string } | null;
type Cell = { value: string; status: MarkStatus };
type Row = { student: { id: string; name: string; admissionNo: string }; expected: Snapshot };
type Props = {
  assessment: { id: string; name: string; type: string; maxScore: number };
  rows: Row[];
  locked?: boolean;
};

function fromSnapshot(snapshot: Snapshot): Cell {
  return snapshot ? { value: String(snapshot.value), status: snapshot.status as MarkStatus } : { value: "", status: "present" };
}

function sameCell(a: Cell, b: Cell) {
  if (a.status !== b.status) return false;
  if (a.value.trim() === "" || b.value.trim() === "") return a.value.trim() === b.value.trim();
  return Number(a.value) === Number(b.value);
}

function validStoredCell(value: unknown): value is Cell {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { value?: unknown; status?: unknown };
  return typeof candidate.value === "string" && (candidate.status === "present" || candidate.status === "absent" || candidate.status === "excused");
}

export default function TeacherAssessmentMarkSheet({ assessment, rows, locked = false }: Props) {
  const initialSnapshots = useMemo(() => Object.fromEntries(rows.map((row) => [row.student.id, row.expected])) as Record<string, Snapshot>, [rows]);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>(initialSnapshots);
  const [cells, setCells] = useState<Record<string, Cell>>(() => Object.fromEntries(rows.map((row) => [row.student.id, fromSnapshot(row.expected)])));
  const [query, setQuery] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [offlineIds, setOfflineIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const timers = useRef<Record<string, number>>({});
  const inFlight = useRef(new Set<string>());
  const cellsRef = useRef(cells);
  const snapshotsRef = useRef(snapshots);
  const storageKey = `sukuunova:mark-sheet:${assessment.id}`;

  const dirty = useMemo(() => rows.map((row) => row.student.id).filter((studentId) => !sameCell(cells[studentId], fromSnapshot(snapshots[studentId] ?? null))), [cells, rows, snapshots]);
  const dirtySet = useMemo(() => new Set(dirty), [dirty]);
  const visibleRows = useMemo(() => rows.filter((row) => `${row.student.name} ${row.student.admissionNo}`.toLowerCase().includes(query.trim().toLowerCase())), [query, rows]);
  const recorded = Object.values(snapshots).filter(Boolean).length;

  function setSaving(studentId: string, active: boolean) {
    setSavingIds((current) => {
      const next = new Set(current);
      if (active) next.add(studentId); else next.delete(studentId);
      return next;
    });
  }

  function setOffline(studentId: string, active: boolean) {
    setOfflineIds((current) => {
      const next = new Set(current);
      if (active) next.add(studentId); else next.delete(studentId);
      return next;
    });
  }

  function readPending(): Record<string, Cell> {
    if (typeof window === "undefined") return {};
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}") as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => validStoredCell(value))) as Record<string, Cell>;
    } catch {
      return {};
    }
  }

  function writePending(studentId: string, cell: Cell | null) {
    if (typeof window === "undefined") return;
    try {
      const pending = readPending();
      if (cell) pending[studentId] = cell; else delete pending[studentId];
      if (Object.keys(pending).length) window.localStorage.setItem(storageKey, JSON.stringify(pending));
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Autosave still works when storage is unavailable; only crash recovery is reduced.
    }
  }

  function buildChange(row: Row, cell: Cell, snapshot: Snapshot): GradebookChange | null {
    const expected = snapshot ? { ...snapshot, status: snapshot.status as MarkStatus } : null;
    if (cell.value.trim() === "" && cell.status === "present") {
      return snapshot ? { action: "clearScore", studentId: row.student.id, assessmentId: assessment.id, expected } : null;
    }
    const value = Number(cell.value);
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cell.value.trim()) || !Number.isFinite(value) || value < 0 || value > assessment.maxScore || (cell.status !== "present" && value !== 0)) {
      throw new Error(`${row.student.name}: enter a mark from 0 to ${assessment.maxScore}, or choose Absent/Excused.`);
    }
    return { action: "score", studentId: row.student.id, assessmentId: assessment.id, value, status: cell.status, expected };
  }

  function scheduleSave(studentId: string, delay = 550) {
    if (locked || typeof window === "undefined") return;
    if (timers.current[studentId]) window.clearTimeout(timers.current[studentId]);
    timers.current[studentId] = window.setTimeout(() => void saveStudent(studentId), delay);
  }

  function update(studentId: string, cell: Cell, delay = 550) {
    if (locked) return;
    const next = { ...cellsRef.current, [studentId]: cell };
    cellsRef.current = next;
    setCells(next);
    writePending(studentId, cell);
    setOffline(studentId, false);
    setError("");
    setMessage("");
    scheduleSave(studentId, delay);
  }

  async function saveStudent(studentId: string) {
    if (locked) return;
    if (inFlight.current.has(studentId)) {
      scheduleSave(studentId, 350);
      return;
    }
    const row = rows.find((candidate) => candidate.student.id === studentId);
    if (!row) return;
    const cell = cellsRef.current[studentId];
    const snapshot = snapshotsRef.current[studentId] ?? null;
    if (!cell || sameCell(cell, fromSnapshot(snapshot))) {
      writePending(studentId, null);
      setOffline(studentId, false);
      return;
    }

    let change: GradebookChange | null;
    try {
      change = buildChange(row, cell, snapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This mark cannot be saved.");
      return;
    }
    if (!change) {
      writePending(studentId, null);
      return;
    }

    const submittedCell = { ...cell };
    inFlight.current.add(studentId);
    setSaving(studentId, true);
    setOffline(studentId, false);
    try {
      const response = await fetch("/api/mvp/gradebook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "batch", changes: [change] }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string; error?: string; result?: { studentId: string; assessmentId: string; expected: Snapshot }[] };
      if (!response.ok) throw new Error(data.message || data.error || "The mark could not be saved.");
      const result = data.result?.[0];
      if (!result || result.studentId !== studentId || result.assessmentId !== assessment.id) throw new Error("SukuuNova did not receive a complete save confirmation. The mark remains queued safely on this device.");

      const nextSnapshots = { ...snapshotsRef.current, [studentId]: result.expected };
      snapshotsRef.current = nextSnapshots;
      setSnapshots(nextSnapshots);

      if (sameCell(cellsRef.current[studentId], submittedCell)) {
        const confirmedCell = fromSnapshot(result.expected);
        const nextCells = { ...cellsRef.current, [studentId]: confirmedCell };
        cellsRef.current = nextCells;
        setCells(nextCells);
        writePending(studentId, null);
      } else {
        scheduleSave(studentId, 250);
      }
      setError("");
      setOffline(studentId, false);
    } catch (cause) {
      writePending(studentId, cellsRef.current[studentId]);
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setOffline(studentId, offline);
      if (!offline) setError(cause instanceof Error ? cause.message : "The mark could not be saved. SukuuNova will keep the pending value on this device.");
    } finally {
      inFlight.current.delete(studentId);
      setSaving(studentId, false);
    }
  }

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    if (locked) return;
    const pending = readPending();
    const validIds = new Set(rows.map((row) => row.student.id));
    const recovered = Object.entries(pending).filter(([studentId]) => validIds.has(studentId));
    if (!recovered.length) return;
    const next = { ...cellsRef.current };
    for (const [studentId, cell] of recovered) next[studentId] = cell;
    cellsRef.current = next;
    setCells(next);
    setMessage(`${recovered.length} unsaved mark${recovered.length === 1 ? " was" : "s were"} recovered from this device and will sync automatically.`);
    for (const [studentId] of recovered) scheduleSave(studentId, 800);
    // Recovery intentionally runs once for this assessment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, locked]);

  useEffect(() => {
    if (locked) return;
    const retry = () => {
      setMessage("Connection restored. Syncing any marks that were waiting on this device…");
      for (const row of rows) {
        const studentId = row.student.id;
        if (!sameCell(cellsRef.current[studentId], fromSnapshot(snapshotsRef.current[studentId] ?? null))) scheduleSave(studentId, 100);
      }
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
    // Rows are fixed for the open mark sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, assessment.id]);

  useEffect(() => {
    if (!dirty.length && !savingIds.size) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty.length, savingIds.size]);

  useEffect(() => () => {
    for (const timer of Object.values(timers.current)) window.clearTimeout(timer);
  }, []);

  const saveState = error
    ? { text: "Check mark", className: "is-offline" }
    : offlineIds.size
      ? { text: `${offlineIds.size} queued offline`, className: "is-offline" }
      : savingIds.size || dirty.length
        ? { text: "Saving automatically…", className: "is-saving" }
        : { text: "All changes saved", className: "" };

  return <div className="focused-mark-sheet">
    <div className="focused-mark-sheet-toolbar">
      <div className="focused-mark-progress">
        <span>{assessment.type}</span>
        <strong>{recorded} of {rows.length} learners recorded</strong>
        <small>{locked ? "Term locked · review only" : "Each mark saves automatically as you enter it"}</small>
      </div>
      <label className="focused-mark-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner" aria-label="Find learner by name or admission number" /></label>
      <div className={`autosave-indicator ${saveState.className}`} role="status">
        {offlineIds.size ? <CloudOff size={14} aria-hidden="true" /> : savingIds.size || dirty.length ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
        {saveState.text}
      </div>
    </div>

    {(error || message) ? <div role={error ? "alert" : "status"} className={`gradebook-entry-status ${error ? "is-error" : "is-success"}`}>{error || message}</div> : null}

    <div className="focused-mark-table-wrap">
      <table className="focused-mark-table" aria-label={`Enter marks for ${assessment.name}`} aria-busy={savingIds.size > 0}>
        <thead><tr><th>Learner</th><th>Mark / {assessment.maxScore}</th><th>Status</th><th>Save state</th></tr></thead>
        <tbody>{visibleRows.map((row, rowIndex) => {
          const studentId = row.student.id;
          const cell = cells[studentId];
          const changed = dirtySet.has(studentId);
          const saving = savingIds.has(studentId);
          const offline = offlineIds.has(studentId);
          return <tr key={studentId} className={changed ? "is-dirty" : ""}>
            <td><div className="focused-mark-learner"><strong>{row.student.name}</strong><small>{row.student.admissionNo}</small></div></td>
            <td><input ref={(element) => { inputs.current[studentId] = element; }} className="focused-mark-input" inputMode="decimal" value={cell.status === "present" ? cell.value : ""} disabled={locked} readOnly={cell.status !== "present"} placeholder={cell.status === "absent" ? "Absent" : cell.status === "excused" ? "Excused" : "—"} aria-label={`Mark for ${row.student.name}, out of ${assessment.maxScore}`}
              onChange={(event) => update(studentId, { ...cell, value: event.target.value })}
              onBlur={() => scheduleSave(studentId, 0)}
              onPaste={(event) => {
                event.preventDefault();
                if (locked) return;
                try {
                  const pasted = parseMarkSheetPaste(event.clipboardData.getData("text"), rowIndex, visibleRows.length, assessment.maxScore);
                  const next = { ...cellsRef.current };
                  for (const item of pasted) {
                    const target = visibleRows[item.row];
                    if (!target) continue;
                    next[target.student.id] = { value: item.value, status: item.status };
                    writePending(target.student.id, next[target.student.id]);
                  }
                  cellsRef.current = next;
                  setCells(next);
                  setError("");
                  setMessage(`${pasted.length} mark${pasted.length === 1 ? "" : "s"} pasted. SukuuNova is saving them automatically.`);
                  pasted.forEach((item, index) => {
                    const target = visibleRows[item.row];
                    if (target) scheduleSave(target.student.id, 300 + index * 35);
                  });
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Paste could not be read.");
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                if (event.key === "Enter") scheduleSave(studentId, 0);
                const nextIndex = rowIndex + (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1);
                const target = visibleRows[nextIndex];
                if (target) inputs.current[target.student.id]?.focus();
              }} /></td>
            <td><select value={cell.status} disabled={locked} aria-label={`Status for ${row.student.name}`} onChange={(event) => {
              const status = event.target.value as MarkStatus;
              update(studentId, status === "present" ? { value: cell.status === "present" ? cell.value : "", status } : { value: "0", status }, 150);
            }}><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></td>
            <td><span className={`focused-mark-state ${offline ? "is-offline" : saving ? "is-saving" : changed ? "is-unsaved" : snapshots[studentId] ? "is-recorded" : ""}`}>{offline ? "Queued offline" : saving ? "Saving…" : changed ? "Waiting to save" : snapshots[studentId] ? "Saved" : "Not marked"}</span></td>
          </tr>;
        })}</tbody>
      </table>
      {!visibleRows.length ? <div className="gradebook-no-results">No learners match this search.</div> : null}
    </div>
    <p className="focused-mark-help">Marks save automatically. Press Enter to save now and move to the next learner. If the connection drops, pending marks stay on this device and retry when the connection returns.</p>
  </div>;
}
