"use client";

import { useMemo, useState } from "react";
import { previewSubjectTotal, type PreviewRules } from "./gradebook-math";

type Assessment = { id: string; name: string; type: string; maxScore: number; weight: number };
type ScoreDetail = { assessmentId: string; rawScore: number | null; maxScore: number; status?: string | null };
type Row = { student: { id: string; name: string; admissionNo: string }; total: number | null; scores: ScoreDetail[] };
type ScoreStatus = "present" | "absent" | "excused";
type GradeBand = { min: number; max: number; grade: string; label?: string };
type Props = { assessments: Assessment[]; rows: Row[]; rules: PreviewRules; gradeScale?: GradeBand[] };

function gradeFor(total: number | null, scale: GradeBand[]) {
  if (total == null) return null;
  return scale.find((band) => total >= band.min && total <= band.max) ?? null;
}

export default function GradebookEntryGrid({ assessments, rows, rules, gradeScale = [] }: Props) {
  const initial = useMemo(() => Object.fromEntries(rows.flatMap((row) => row.scores.map((score) => [`${row.student.id}:${score.assessmentId}`, score.rawScore == null && score.status !== "excused" ? "" : String(score.rawScore ?? "")]))), [rows]);
  const initialStatuses = useMemo(() => Object.fromEntries(rows.flatMap((row) => row.scores.map((score) => [`${row.student.id}:${score.assessmentId}`, (score.status as ScoreStatus | undefined) ?? "present"]))), [rows]);
  const initialTotals = useMemo(() => Object.fromEntries(rows.map((row) => [row.student.id, row.total])), [rows]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [statuses, setStatuses] = useState<Record<string, ScoreStatus>>(initialStatuses);
  const [totals, setTotals] = useState<Record<string, number | null>>(initialTotals);
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.student.name} ${row.student.admissionNo}`.toLowerCase().includes(needle));
  }, [query, rows]);

  const completion = useMemo(() => {
    const possible = rows.length * assessments.length;
    if (!possible) return { recorded: 0, possible: 0, percent: 0 };
    let recorded = 0;
    for (const row of rows) {
      for (const assessment of assessments) {
        const key = `${row.student.id}:${assessment.id}`;
        const status = statuses[key] ?? "present";
        if (status === "excused" || (values[key] ?? "").trim() !== "") recorded += 1;
      }
    }
    return { recorded, possible, percent: Math.round(recorded / possible * 100) };
  }, [assessments, rows, statuses, values]);

  function rowCompletion(studentId: string) {
    if (!assessments.length) return 0;
    let recorded = 0;
    for (const assessment of assessments) {
      const key = `${studentId}:${assessment.id}`;
      if ((statuses[key] ?? "present") === "excused" || (values[key] ?? "").trim() !== "") recorded += 1;
    }
    return Math.round(recorded / assessments.length * 100);
  }

  function calculateOptimisticTotal(studentId: string, nextValue: string, assessmentId: string, nextStatus?: ScoreStatus) {
    const items = assessments.map((assessment) => {
      const key = `${studentId}:${assessment.id}`;
      const isEdited = assessment.id === assessmentId;
      const raw = isEdited ? nextValue : values[key] ?? "";
      const status = isEdited ? nextStatus ?? statuses[key] ?? "present" : statuses[key] ?? "present";
      const numeric = raw.trim() === "" ? null : Number(raw);
      return { id: assessment.id, type: assessment.type, maxScore: assessment.maxScore, weight: assessment.weight, percentage: status === "excused" || numeric == null || !Number.isFinite(numeric) ? null : numeric / assessment.maxScore * 100 };
    });
    return previewSubjectTotal(items, rules);
  }

  async function save(studentId: string, assessmentId: string, maxScore: number, key: string) {
    const raw = values[key]?.trim() ?? "";
    const status = statuses[key] ?? "present";
    if (raw === "" && status !== "excused") {
      setError("A blank mark stays incomplete. Enter 0 when the learner earned zero, or choose Excused where appropriate.");
      return;
    }
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > maxScore) {
      setError(`Enter a mark from 0 to ${maxScore}.`);
      return;
    }
    const previousValue = values[key] ?? initial[key] ?? "";
    const previousStatus = statuses[key] ?? initialStatuses[key] ?? "present";
    const previousTotal = totals[studentId] ?? initialTotals[studentId] ?? null;
    setTotals((current) => ({ ...current, [studentId]: calculateOptimisticTotal(studentId, raw, assessmentId, status) }));
    setSaving(key);
    setError("");
    setSaved("");
    try {
      const response = await fetch("/api/mvp/gradebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "score", studentId, assessmentId, value, status }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The mark could not be saved.");
      setSaved(key);
    } catch (err) {
      setValues((current) => ({ ...current, [key]: previousValue }));
      setStatuses((current) => ({ ...current, [key]: previousStatus }));
      setTotals((current) => ({ ...current, [studentId]: previousTotal }));
      setError(err instanceof Error ? err.message : "The mark could not be saved.");
    } finally {
      setSaving("");
    }
  }

  async function clear(studentId: string, assessmentId: string, key: string) {
    const previousValue = values[key] ?? initial[key] ?? "";
    const previousStatus = statuses[key] ?? initialStatuses[key] ?? "present";
    const previousTotal = totals[studentId] ?? initialTotals[studentId] ?? null;
    setSaving(key);
    setError("");
    setSaved("");
    try {
      const response = await fetch("/api/mvp/gradebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clearScore", studentId, assessmentId }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The mark could not be cleared.");
      setValues((current) => ({ ...current, [key]: "" }));
      setStatuses((current) => ({ ...current, [key]: "present" }));
      setTotals((current) => ({ ...current, [studentId]: calculateOptimisticTotal(studentId, "", assessmentId, "present") }));
      setSaved(key);
    } catch (err) {
      setValues((current) => ({ ...current, [key]: previousValue }));
      setStatuses((current) => ({ ...current, [key]: previousStatus }));
      setTotals((current) => ({ ...current, [studentId]: previousTotal }));
      setError(err instanceof Error ? err.message : "The mark could not be cleared.");
    } finally {
      setSaving("");
    }
  }

  return <div className="gradebook-entry">
    <div className="gradebook-entry-toolbar">
      <div className="gradebook-entry-progress"><div><span>MARK ENTRY COMPLETION</span><strong>{completion.percent}%</strong></div><div className="gradebook-progress-track" aria-label={`${completion.percent}% mark entry complete`}><i style={{ width: `${completion.percent}%` }} /></div><small>{completion.recorded} of {completion.possible} assessment cells recorded</small></div>
      <label className="gradebook-search"><span>Find learner</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or admission number" /></label>
    </div>

    {(error || saved) ? <div role="status" className={`gradebook-entry-status ${error ? "is-error" : "is-success"}`}><span>{error || "Mark saved successfully."}</span>{!error && saved ? <strong>Server confirmed</strong> : null}</div> : null}

    <div className="gradebook-table-wrap">
      <table className="gradebook-table" aria-label="Gradebook mark entry">
        <thead><tr><th className="gradebook-sticky-student">Learner</th>{assessments.map((assessment) => <th key={assessment.id}><div className="gradebook-assessment-head"><strong>{assessment.name}</strong><small>{assessment.type}</small><span>Raw mark / {assessment.maxScore}</span></div></th>)}<th className="gradebook-sticky-result">Subject result</th></tr></thead>
        <tbody>{visibleRows.map((row) => {
          const completionPercent = rowCompletion(row.student.id);
          const total = totals[row.student.id] ?? null;
          const grade = gradeFor(total, gradeScale);
          return <tr key={row.student.id}>
            <td className="gradebook-sticky-student"><div className="gradebook-student"><strong>{row.student.name}</strong><small>{row.student.admissionNo}</small><div className="gradebook-row-progress"><i style={{ width: `${completionPercent}%` }} /><span>{completionPercent}% entered</span></div></div></td>
            {assessments.map((assessment) => {
              const key = `${row.student.id}:${assessment.id}`;
              const existing = values[key] ?? "";
              const status = statuses[key] ?? "present";
              const percentage = status === "excused" || existing.trim() === "" || !Number.isFinite(Number(existing)) ? null : Number(existing) / assessment.maxScore * 100;
              return <td key={assessment.id}><div className="gradebook-cell"><div className="gradebook-input-row"><input className="gradebook-input" aria-label={`${assessment.name} mark for ${row.student.name}`} inputMode="decimal" value={existing} disabled={status === "excused"} onChange={(event) => { const next = event.target.value; setValues((current) => ({ ...current, [key]: next })); setTotals((current) => ({ ...current, [row.student.id]: calculateOptimisticTotal(row.student.id, next, assessment.id) })); setSaved(""); }} onBlur={() => void save(row.student.id, assessment.id, assessment.maxScore, key)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="—" /><span className="gradebook-score-max">/{assessment.maxScore}</span></div><div className="gradebook-normalized">{percentage == null ? "Not scored" : `${percentage.toFixed(1)}% normalized`}</div><select className="gradebook-status-select" aria-label={`Assessment status for ${assessment.name}, ${row.student.name}`} value={status} onChange={(event) => { const next = event.target.value as ScoreStatus; setStatuses((current) => ({ ...current, [key]: next })); setTotals((current) => ({ ...current, [row.student.id]: calculateOptimisticTotal(row.student.id, existing, assessment.id, next) })); setSaved(""); }}><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select><div className="gradebook-save-state">{saving === key ? <span className="saving" role="status">Saving…</span> : null}{saved === key ? <span className="ok">Saved</span> : null}{existing !== "" || status === "excused" ? <button type="button" onClick={() => void clear(row.student.id, assessment.id, key)}>Clear</button> : null}</div></div></td>;
            })}
            <td className="gradebook-sticky-result"><div className={`gradebook-total-card ${total == null ? "is-incomplete" : ""}`}><span>Weighted result</span><strong>{total == null ? "—" : `${total.toFixed(2)}%`}</strong><b>{total == null ? "Incomplete" : grade ? `${grade.grade}${grade.label ? ` · ${grade.label}` : ""}` : "Ungraded"}</b><small>{completionPercent}% of marks entered</small></div></td>
          </tr>;
        })}</tbody>
      </table>
      {!visibleRows.length ? <div className="gradebook-no-results">No learner matches “{query}”.</div> : null}
    </div>
    <p className="gradebook-tip"><strong>How the number reaches the report:</strong> each raw mark is normalized against its actual maximum, then the school’s configured assessment weighting is applied. The grade shown here uses the same grading scale as the official report card.</p>
  </div>;
}
