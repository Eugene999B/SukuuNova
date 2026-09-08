"use client";

import { useMemo, useState } from "react";
import { previewSubjectTotal, type PreviewRules } from "./gradebook-math";

type Assessment = { id: string; name: string; type: string; maxScore: number; weight: number };
type ScoreDetail = { assessmentId: string; rawScore: number | null; maxScore: number; status?: string | null };
type Row = { student: { id: string; name: string; admissionNo: string }; total: number | null; scores: ScoreDetail[] };
type ScoreStatus = "present" | "absent" | "excused";
type Props = { assessments: Assessment[]; rows: Row[]; rules: PreviewRules };

export default function GradebookEntryGrid({ assessments, rows, rules }: Props) {
  const initial = useMemo(() => Object.fromEntries(rows.flatMap((row) => row.scores.map((score) => [`${row.student.id}:${score.assessmentId}`, score.rawScore == null && score.status !== "excused" ? "" : String(score.rawScore ?? "")]))), [rows]);
  const initialStatuses = useMemo(() => Object.fromEntries(rows.flatMap((row) => row.scores.map((score) => [`${row.student.id}:${score.assessmentId}`, (score.status as ScoreStatus | undefined) ?? "present"]))), [rows]);
  const initialTotals = useMemo(() => Object.fromEntries(rows.map((row) => [row.student.id, row.total])), [rows]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [statuses, setStatuses] = useState<Record<string, ScoreStatus>>(initialStatuses);
  const [totals, setTotals] = useState<Record<string, number | null>>(initialTotals);
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  function calculateOptimisticTotal(studentId: string, nextValue: string, assessmentId: string, nextStatus?: ScoreStatus) {
    const items = assessments.map((assessment) => {
      const key = `${studentId}:${assessment.id}`;
      const isEdited = assessment.id === assessmentId;
      const raw = isEdited ? nextValue : values[key] ?? "";
      const status = isEdited ? nextStatus ?? statuses[key] ?? "present" : statuses[key] ?? "present";
      const numeric = raw.trim() === "" ? null : Number(raw);
      return { id: assessment.id, type: assessment.type, maxScore: assessment.maxScore, weight: assessment.weight, percentage: status === "excused" || numeric == null || !Number.isFinite(numeric) ? null : (numeric / assessment.maxScore) * 100 };
    });
    return previewSubjectTotal(items, rules);
  }

  async function save(studentId: string, assessmentId: string, maxScore: number, key: string) {
    const raw = values[key]?.trim() ?? "";
    const status = statuses[key] ?? "present";
    if (raw === "" && status !== "excused") { setError("A blank mark stays blank. Enter 0 when the learner earned zero, or use Excused when appropriate."); return; }
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > maxScore) { setError(`Enter a mark from 0 to ${maxScore}.`); return; }
    const previousValue = values[key] ?? initial[key] ?? "";
    const previousStatus = statuses[key] ?? initialStatuses[key] ?? "present";
    const previousTotal = totals[studentId] ?? initialTotals[studentId] ?? null;
    setTotals((current) => ({ ...current, [studentId]: calculateOptimisticTotal(studentId, raw, assessmentId, status) }));
    setSaving(key); setError(""); setSaved("");
    try {
      const response = await fetch("/api/mvp/gradebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "score", studentId, assessmentId, value, status }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The mark could not be saved.");
      setSaved(key);
    } catch (err) {
      setValues((current) => ({ ...current, [key]: previousValue })); setStatuses((current) => ({ ...current, [key]: previousStatus })); setTotals((current) => ({ ...current, [studentId]: previousTotal })); setError(err instanceof Error ? err.message : "The mark could not be saved.");
    } finally { setSaving(""); }
  }

  async function clear(studentId: string, assessmentId: string, key: string) {
    const previousValue = values[key] ?? initial[key] ?? "";
    const previousStatus = statuses[key] ?? initialStatuses[key] ?? "present";
    const previousTotal = totals[studentId] ?? initialTotals[studentId] ?? null;
    setSaving(key); setError(""); setSaved("");
    try {
      const response = await fetch("/api/mvp/gradebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clearScore", studentId, assessmentId }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The mark could not be cleared.");
      setValues((current) => ({ ...current, [key]: "" })); setStatuses((current) => ({ ...current, [key]: "present" })); setTotals((current) => ({ ...current, [studentId]: calculateOptimisticTotal(studentId, "", assessmentId, "present") })); setSaved(key);
    } catch (err) {
      setValues((current) => ({ ...current, [key]: previousValue })); setStatuses((current) => ({ ...current, [key]: previousStatus })); setTotals((current) => ({ ...current, [studentId]: previousTotal })); setError(err instanceof Error ? err.message : "The mark could not be cleared.");
    } finally { setSaving(""); }
  }

  return <div className="gradebook-entry">
    {(error || saved) ? <div role="status" className={`gradebook-entry-status ${error ? "is-error" : ""}`}><span>{error || "Saved successfully."}</span>{!error && saved ? <strong>Server confirmed</strong> : null}</div> : null}
    <div className="gradebook-table-wrap">
      <table className="gradebook-table" aria-labelledby="gradebook-entry-heading"><thead><tr><th>Student</th>{assessments.map((assessment) => <th key={assessment.id}><div className="gradebook-assessment-head"><strong>{assessment.name}</strong><small>{assessment.type} · max {assessment.maxScore} · {assessment.weight}%</small></div></th>)}<th>Weighted result</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.student.id}>
          <td><div className="gradebook-student"><strong>{row.student.name}</strong><small>{row.student.admissionNo}</small></div></td>
          {assessments.map((assessment) => { const key = `${row.student.id}:${assessment.id}`; const existing = values[key] ?? ""; const status = statuses[key] ?? "present"; return <td key={assessment.id}><div className="gradebook-input-row"><input className="gradebook-input" aria-label={`${assessment.name} mark for ${row.student.name}`} inputMode="decimal" value={existing} onChange={(event) => { const next = event.target.value; setValues((current) => ({ ...current, [key]: next })); setTotals((current) => ({ ...current, [row.student.id]: calculateOptimisticTotal(row.student.id, next, assessment.id) })); setSaved(""); }} onBlur={() => void save(row.student.id, assessment.id, assessment.maxScore, key)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="—"/><span className="gradebook-score-max">/{assessment.maxScore}</span><select className="gradebook-status-select" aria-label={`Attendance status for ${assessment.name}, ${row.student.name}`} value={status} onChange={(event) => { const next = event.target.value as ScoreStatus; setStatuses((current) => ({ ...current, [key]: next })); setTotals((current) => ({ ...current, [row.student.id]: calculateOptimisticTotal(row.student.id, existing, assessment.id, next) })); setSaved(""); }}><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></div><div className="gradebook-save-state">{saving === key && <span className="saving" role="status">Saving…</span>}{saved === key && <span className="ok">Saved</span>}{existing !== "" && <button type="button" onClick={() => void clear(row.student.id, assessment.id, key)}>Clear</button>}</div></td>; })}
          <td><span className={`gradebook-total ${totals[row.student.id] == null ? "is-incomplete" : ""}`}>{totals[row.student.id] == null ? "Incomplete" : `${totals[row.student.id]!.toFixed(2)}%`}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
    <p id="gradebook-entry-heading" className="gradebook-tip">Enter a mark, then move to the next cell. SukuuNova previews the weighted result immediately and confirms the server save.</p>
  </div>;
}
