"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { previewSubjectTotal, type PreviewRules } from "./gradebook-math";
import { parseMarkSheetPaste, type MarkStatus } from "@/lib/mark-sheet-input";
import type { GradebookChange } from "@/lib/gradebook-input";

type Assessment = { id: string; name: string; type: string; maxScore: number; weight: number };
type Snapshot = { id: string; value: number; status: string; enteredAt: string } | null;
type Row = { student: { id: string; name: string; admissionNo: string }; total: number | null; scores: { assessmentId: string; rawScore: number | null; maxScore: number; status?: string | null; expected: Snapshot }[] };
type Cell = { value: string; status: MarkStatus };
type Props = { assessments: Assessment[]; rows: Row[]; rules: PreviewRules; gradeScale?: { min: number; max: number; grade: string; label?: string }[]; locked?: boolean };
type CellDialog = { key: string; studentName: string; assessmentName: string } | null;

const cellKey = (studentId: string, assessmentId: string) => studentId + ":" + assessmentId;
function fromSnapshot(snapshot: Snapshot): Cell {
  return snapshot ? { value: String(snapshot.value), status: snapshot.status as MarkStatus } : { value: "", status: "present" };
}
function sameCell(a: Cell, b: Cell) {
  return a.status === b.status && (a.value.trim() === "" || b.value.trim() === "" ? a.value.trim() === b.value.trim() : Number(a.value) === Number(b.value));
}

export default function GradebookEntryGrid({ assessments, rows, rules, gradeScale = [], locked = false }: Props) {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>(() => Object.fromEntries(rows.flatMap(row => row.scores.map(score => [cellKey(row.student.id, score.assessmentId), score.expected]))));
  const [cells, setCells] = useState<Record<string, Cell>>(() => Object.fromEntries(rows.flatMap(row => assessments.map(assessment => {
    const key = cellKey(row.student.id, assessment.id);
    return [key, fromSnapshot(row.scores.find(score => score.assessmentId === assessment.id)?.expected ?? null)];
  }))));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cellDialog, setCellDialog] = useState<CellDialog>(null);
  const busy = useRef(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const dirty = useMemo(() => Object.keys(cells).filter(key => !sameCell(cells[key], fromSnapshot(snapshots[key] ?? null))), [cells, snapshots]);
  const dirtySet = useMemo(() => new Set(dirty), [dirty]);
  const visibleRows = useMemo(() => rows.filter(row => (row.student.name + " " + row.student.admissionNo).toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  const possible = rows.length * assessments.length;
  const recorded = Object.values(snapshots).filter(Boolean).length;

  useEffect(() => {
    if (!dirty.length && !saving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigation = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = event.type === "click" ? target?.closest("a[href]") : null;
      if (event.type === "click" && (!link || link.getAttribute("target") === "_blank" || link.hasAttribute("download"))) return;
      if (busy.current || !window.confirm("Leave this gradebook and discard unsaved marks?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigation, true);
    document.addEventListener("submit", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigation, true);
      document.removeEventListener("submit", navigation, true);
    };
  }, [dirty.length, saving]);

  function update(key: string, cell: Cell) {
    if (busy.current || locked) return;
    setCells(current => ({ ...current, [key]: cell }));
    setError(""); setMessage("");
  }

  function applyCellAction(action: "present" | "absent" | "excused" | "clear") {
    if (!cellDialog || busy.current || locked) return;
    const current = cells[cellDialog.key];
    if (action === "clear") update(cellDialog.key, { value: "", status: "present" });
    else if (action === "present") update(cellDialog.key, { value: current.status === "present" ? current.value : "", status: "present" });
    else update(cellDialog.key, { value: "0", status: action });
    setCellDialog(null);
  }

  async function save() {
    if (busy.current || locked || !dirty.length) return;
    const changes: GradebookChange[] = [];
    try {
      if (dirty.length > 500) throw new Error("Save at most 500 changed cells at once. Narrow the sheet or discard some edits.");
      for (const row of rows) for (const assessment of assessments) {
        const key = cellKey(row.student.id, assessment.id);
        if (!dirtySet.has(key)) continue;
        const cell = cells[key];
        const snapshot = snapshots[key] ?? null;
        const expected = snapshot ? { ...snapshot, status: snapshot.status as MarkStatus } : null;
        if (cell.value.trim() === "" && cell.status === "present") {
          changes.push({ action: "clearScore", studentId: row.student.id, assessmentId: assessment.id, expected });
          continue;
        }
        const value = Number(cell.value);
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cell.value.trim()) || !Number.isFinite(value) || value < 0 || value > assessment.maxScore || (cell.status !== "present" && value !== 0)) throw new Error(row.student.name + " · " + assessment.name + ": enter 0–" + assessment.maxScore + ", or choose Absent/Excused.");
        changes.push({ action: "score", studentId: row.student.id, assessmentId: assessment.id, value, status: cell.status, expected });
      }
      if (changes.some(change => change.action === "clearScore" && change.expected !== null) && !window.confirm("Save this batch, including clearing previously recorded marks?")) return;
      busy.current = true; setSaving(true); setError(""); setMessage("");
      const response = await fetch("/api/mvp/gradebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "batch", changes }) });
      const data = await response.json() as { message?: string; error?: string; result?: { studentId: string; assessmentId: string; expected: Snapshot }[] };
      if (!response.ok) throw new Error(data.message || data.error || "The sheet could not be saved.");
      if (!Array.isArray(data.result) || data.result.length !== changes.length) throw new Error("Save confirmation was incomplete. Reload to verify the latest marks before retrying.");
      const results = data.result;
      const next = { ...snapshots };
      for (const result of results) next[cellKey(result.studentId, result.assessmentId)] = result.expected;
      setSnapshots(next);
      setCells(current => {
        const updated = { ...current };
        for (const result of results) updated[cellKey(result.studentId, result.assessmentId)] = fromSnapshot(result.expected);
        return updated;
      });
      setMessage(changes.length + " changed marks saved together. Server confirmed.");
    } catch (err) { setError(err instanceof Error ? err.message : "The sheet could not be saved."); }
    finally { busy.current = false; setSaving(false); }
  }

  return <div className="gradebook-entry gradebook-entry-simple">
    <div className="gradebook-entry-toolbar">
      <div className="gradebook-entry-progress"><strong>{recorded} of {possible} recorded</strong><small>{dirty.length ? `${dirty.length} unsaved` : "All changes saved"}{locked ? " · Term locked" : ""}</small></div>
      <label className="gradebook-search"><span>Find learner</span><input value={query} disabled={saving} onChange={event => setQuery(event.target.value)} placeholder="Name or admission number" /></label>
      <button type="button" className="academic-btn-primary" disabled={locked || saving || !dirty.length} onClick={() => void save()}>{saving ? "Saving…" : dirty.length ? `Save ${dirty.length} change${dirty.length === 1 ? "" : "s"}` : "Saved"}</button>
      {dirty.length ? <button type="button" className="academic-btn-secondary" disabled={saving} onClick={() => {
        if (!window.confirm("Discard all unsaved marks on this sheet?")) return;
        setCells(Object.fromEntries(Object.keys(cells).map(key => [key, fromSnapshot(snapshots[key] ?? null)])));
        setError(""); setMessage("");
      }}>Discard</button> : null}
    </div>

    {(error || message) && <div role={error ? "alert" : "status"} className={"gradebook-entry-status " + (error ? "is-error" : "is-success")}>{error || message}</div>}

    <div className="gradebook-table-wrap"><table className="gradebook-table" aria-label="Gradebook mark entry" aria-busy={saving}>
      <thead><tr><th className="gradebook-sticky-student">Learner</th>{assessments.map(assessment => <th key={assessment.id}><div className="gradebook-assessment-head"><strong>{assessment.name}</strong><small>{assessment.type}</small><span>Out of {assessment.maxScore}</span></div></th>)}<th>Result</th></tr></thead>
      <tbody>{visibleRows.map((row, rowIndex) => {
        const total = previewSubjectTotal(assessments.map(assessment => {
          const cell = cells[cellKey(row.student.id, assessment.id)];
          const value = cell.value.trim() === "" ? null : Number(cell.value);
          return { ...assessment, percentage: cell.status === "excused" || value == null || !Number.isFinite(value) ? null : value / assessment.maxScore * 100 };
        }), rules);
        const grade = total == null ? null : gradeScale.find(band => total >= band.min && total <= band.max);
        return <tr key={row.student.id}>
          <td className="gradebook-sticky-student"><div className="gradebook-student"><strong>{row.student.name}</strong><small>{row.student.admissionNo}</small></div></td>
          {assessments.map((assessment, columnIndex) => {
            const key = cellKey(row.student.id, assessment.id);
            const cell = cells[key];
            const changed = dirtySet.has(key);
            const exceptional = cell.status !== "present";
            return <td key={assessment.id} data-label={assessment.name}><div className={`gradebook-cell ${changed ? "is-dirty" : ""} ${exceptional ? "is-exception" : ""}`}>
              <div className="gradebook-cell-entry">
                <input ref={element => { inputs.current[key] = element; }} className="gradebook-input" aria-label={assessment.name + " mark for " + row.student.name} inputMode="decimal" value={cell.status === "present" ? cell.value : ""} disabled={saving || locked} readOnly={cell.status !== "present"} placeholder={exceptional ? (cell.status === "absent" ? "Absent" : "Excused") : "—"}
                  onChange={event => update(key, { ...cell, value: event.target.value })}
                  onPaste={event => {
                    event.preventDefault();
                    if (busy.current || locked) return;
                    try {
                      const pasted = parseMarkSheetPaste(event.clipboardData.getData("text"), rowIndex, visibleRows.length, assessment.maxScore);
                      setCells(current => {
                        const next = { ...current };
                        for (const item of pasted) next[cellKey(visibleRows[item.row].student.id, assessment.id)] = { value: item.value, status: item.status };
                        return next;
                      });
                      setError(""); setMessage(pasted.length + " marks pasted. Review and save when ready.");
                    } catch (err) { setError(err instanceof Error ? err.message : "Paste could not be read."); }
                  }}
                  onKeyDown={event => {
                    let r = rowIndex, c = columnIndex;
                    if (event.key === "Enter" || event.key === "ArrowDown") r += event.shiftKey && event.key === "Enter" ? -1 : 1;
                    else if (event.key === "ArrowUp") r -= 1;
                    else if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0) c -= 1;
                    else if (event.key === "ArrowRight" && event.currentTarget.selectionStart === cell.value.length) c += 1;
                    else return;
                    event.preventDefault();
                    const student = visibleRows[r], target = assessments[c];
                    if (student && target) inputs.current[cellKey(student.student.id, target.id)]?.focus();
                  }} />
                <button type="button" className="gradebook-cell-more" disabled={saving || locked} aria-label={`More options for ${row.student.name}, ${assessment.name}`} onClick={() => setCellDialog({ key, studentName: row.student.name, assessmentName: assessment.name })}>•••</button>
              </div>
              {(exceptional || changed) ? <div className="gradebook-cell-state">{exceptional ? <span>{cell.status === "absent" ? "Absent" : "Excused"}</span> : null}{changed ? <span className="is-unsaved">Unsaved</span> : null}</div> : null}
            </div></td>;
          })}
          <td><div className="gradebook-total-card"><span>Weighted</span><strong>{total == null ? "—" : total.toFixed(2) + "%"}</strong><small>{total == null ? "Incomplete" : grade ? grade.grade + (grade.label ? " · " + grade.label : "") : "Ungraded"}</small></div></td>
        </tr>;
      })}</tbody>
    </table>{!visibleRows.length && <div className="gradebook-no-results">No learners match this search.</div>}</div>

    <details className="sn-progressive gradebook-entry-help">
      <summary>Keyboard, paste and saving tips</summary>
      <div className="sn-progressive-body"><p>Paste a mark column directly into a mark field. You can also paste Present, Absent or Excused (A/E shortcuts are accepted). Enter and arrow keys move through the sheet. Nothing is written until you choose Save.</p></div>
    </details>

    <Dialog open={Boolean(cellDialog)} onClose={() => setCellDialog(null)} title="Mark options" description={cellDialog ? `${cellDialog.studentName} · ${cellDialog.assessmentName}` : undefined} size="sm">
      <div className="gradebook-cell-dialog-actions">
        <button type="button" onClick={() => applyCellAction("present")}>Enter a mark</button>
        <button type="button" onClick={() => applyCellAction("absent")}>Mark absent</button>
        <button type="button" onClick={() => applyCellAction("excused")}>Mark excused</button>
        <button type="button" className="is-danger" onClick={() => applyCellAction("clear")}>Clear this mark</button>
      </div>
    </Dialog>
  </div>;
}
