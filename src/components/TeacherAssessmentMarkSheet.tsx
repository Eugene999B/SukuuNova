"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
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

export default function TeacherAssessmentMarkSheet({ assessment, rows, locked = false }: Props) {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>(() => Object.fromEntries(rows.map((row) => [row.student.id, row.expected])));
  const [cells, setCells] = useState<Record<string, Cell>>(() => Object.fromEntries(rows.map((row) => [row.student.id, fromSnapshot(row.expected)])));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const dirty = useMemo(() => rows.map((row) => row.student.id).filter((studentId) => !sameCell(cells[studentId], fromSnapshot(snapshots[studentId] ?? null))), [cells, rows, snapshots]);
  const dirtySet = useMemo(() => new Set(dirty), [dirty]);
  const visibleRows = useMemo(() => rows.filter((row) => `${row.student.name} ${row.student.admissionNo}`.toLowerCase().includes(query.trim().toLowerCase())), [query, rows]);
  const recorded = Object.values(snapshots).filter(Boolean).length;

  useEffect(() => {
    if (!dirty.length && !saving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigation = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = event.type === "click" ? target?.closest("a[href]") : null;
      if (event.type === "click" && (!link || link.getAttribute("target") === "_blank" || link.hasAttribute("download"))) return;
      if (busy.current || !window.confirm("Leave this mark sheet and discard unsaved marks?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigation, true);
    };
  }, [dirty.length, saving]);

  function update(studentId: string, cell: Cell) {
    if (busy.current || locked) return;
    setCells((current) => ({ ...current, [studentId]: cell }));
    setError("");
    setMessage("");
  }

  async function save() {
    if (busy.current || locked || !dirty.length) return;
    const changes: GradebookChange[] = [];
    try {
      if (dirty.length > 500) throw new Error("Save at most 500 changed learners at once.");
      for (const row of rows) {
        const studentId = row.student.id;
        if (!dirtySet.has(studentId)) continue;
        const cell = cells[studentId];
        const snapshot = snapshots[studentId] ?? null;
        const expected = snapshot ? { ...snapshot, status: snapshot.status as MarkStatus } : null;
        if (cell.value.trim() === "" && cell.status === "present") {
          changes.push({ action: "clearScore", studentId, assessmentId: assessment.id, expected });
          continue;
        }
        const value = Number(cell.value);
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cell.value.trim()) || !Number.isFinite(value) || value < 0 || value > assessment.maxScore || (cell.status !== "present" && value !== 0)) {
          throw new Error(`${row.student.name}: enter a mark from 0 to ${assessment.maxScore}, or choose Absent/Excused.`);
        }
        changes.push({ action: "score", studentId, assessmentId: assessment.id, value, status: cell.status, expected });
      }
      if (changes.some((change) => change.action === "clearScore" && change.expected !== null) && !window.confirm("This save clears one or more previously recorded marks. Continue?")) return;
      busy.current = true;
      setSaving(true);
      setError("");
      setMessage("");
      const response = await fetch("/api/mvp/gradebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "batch", changes }) });
      const data = await response.json() as { message?: string; error?: string; result?: { studentId: string; assessmentId: string; expected: Snapshot }[] };
      if (!response.ok) throw new Error(data.message || data.error || "The marks could not be saved.");
      if (!Array.isArray(data.result) || data.result.length !== changes.length) throw new Error("Save confirmation was incomplete. Reload before retrying so no mark is overwritten.");
      const nextSnapshots = { ...snapshots };
      for (const result of data.result) nextSnapshots[result.studentId] = result.expected;
      setSnapshots(nextSnapshots);
      setCells((current) => {
        const next = { ...current };
        for (const result of data.result ?? []) next[result.studentId] = fromSnapshot(result.expected);
        return next;
      });
      setMessage(`${changes.length} changed mark${changes.length === 1 ? "" : "s"} saved and confirmed by the server.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The marks could not be saved.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return <div className="focused-mark-sheet">
    <div className="focused-mark-sheet-toolbar">
      <div className="focused-mark-progress">
        <span>{assessment.type}</span>
        <strong>{recorded} of {rows.length} learners recorded</strong>
        <small>{dirty.length ? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"}` : "All saved changes are confirmed"}{locked ? " · Term locked" : ""}</small>
      </div>
      <label className="focused-mark-search"><Search size={15} aria-hidden="true" /><input value={query} disabled={saving} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner" aria-label="Find learner by name or admission number" /></label>
      <button type="button" className="gradebook-primary-action" disabled={locked || saving || !dirty.length} onClick={() => void save()}>{saving ? "Saving…" : dirty.length ? `Save ${dirty.length} change${dirty.length === 1 ? "" : "s"}` : <><CheckCircle2 size={16} /> Saved</>}</button>
    </div>

    {(error || message) ? <div role={error ? "alert" : "status"} className={`gradebook-entry-status ${error ? "is-error" : "is-success"}`}>{error || message}</div> : null}

    <div className="focused-mark-table-wrap">
      <table className="focused-mark-table" aria-label={`Enter marks for ${assessment.name}`} aria-busy={saving}>
        <thead><tr><th>Learner</th><th>Mark / {assessment.maxScore}</th><th>Status</th><th>Save state</th></tr></thead>
        <tbody>{visibleRows.map((row, rowIndex) => {
          const studentId = row.student.id;
          const cell = cells[studentId];
          const changed = dirtySet.has(studentId);
          return <tr key={studentId} className={changed ? "is-dirty" : ""}>
            <td><div className="focused-mark-learner"><strong>{row.student.name}</strong><small>{row.student.admissionNo}</small></div></td>
            <td><input ref={(element) => { inputs.current[studentId] = element; }} className="focused-mark-input" inputMode="decimal" value={cell.status === "present" ? cell.value : ""} disabled={saving || locked} readOnly={cell.status !== "present"} placeholder={cell.status === "absent" ? "Absent" : cell.status === "excused" ? "Excused" : "—"} aria-label={`Mark for ${row.student.name}, out of ${assessment.maxScore}`}
              onChange={(event) => update(studentId, { ...cell, value: event.target.value })}
              onPaste={(event) => {
                event.preventDefault();
                if (busy.current || locked) return;
                try {
                  const pasted = parseMarkSheetPaste(event.clipboardData.getData("text"), rowIndex, visibleRows.length, assessment.maxScore);
                  setCells((current) => {
                    const next = { ...current };
                    for (const item of pasted) {
                      const target = visibleRows[item.row];
                      if (target) next[target.student.id] = { value: item.value, status: item.status };
                    }
                    return next;
                  });
                  setError("");
                  setMessage(`${pasted.length} mark${pasted.length === 1 ? "" : "s"} pasted. Review them, then save.`);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Paste could not be read.");
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                const nextIndex = rowIndex + (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1);
                const target = visibleRows[nextIndex];
                if (target) inputs.current[target.student.id]?.focus();
              }} /></td>
            <td><select value={cell.status} disabled={saving || locked} aria-label={`Status for ${row.student.name}`} onChange={(event) => {
              const status = event.target.value as MarkStatus;
              update(studentId, status === "present" ? { value: cell.status === "present" ? cell.value : "", status } : { value: "0", status });
            }}><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></td>
            <td><span className={`focused-mark-state ${changed ? "is-unsaved" : snapshots[studentId] ? "is-recorded" : ""}`}>{changed ? "Unsaved" : snapshots[studentId] ? "Recorded" : "Not marked"}</span></td>
          </tr>;
        })}</tbody>
      </table>
      {!visibleRows.length ? <div className="gradebook-no-results">No learners match this search.</div> : null}
    </div>
    <p className="focused-mark-help">Press Enter to move to the next learner. You can paste a column of marks from Excel. Blank is never silently treated as zero; use Absent when a zero should count, or Excused when the work must be excluded.</p>
  </div>;
}
