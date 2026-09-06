"use client";

import { useMemo, useState } from "react";
import { previewSubjectTotal, type PreviewRules } from "./gradebook-math";

type Assessment = { id: string; name: string; type: string; maxScore: number; weight: number };
type ScoreDetail = { assessmentId: string; rawScore: number | null; maxScore: number; status?: string | null };
type Row = { student: { id: string; name: string; admissionNo: string }; total: number | null; scores: ScoreDetail[] };
type ScoreStatus = "present" | "absent" | "excused";

export default function GradebookEntryGrid({ assessments, rows, rules }: { assessments: Assessment[]; rows: Row[]; rules: PreviewRules }) {
  const initial = useMemo(() => Object.fromEntries(rows.flatMap((row) => row.scores.map((score) => [`${row.student.id}:${score.assessmentId}`, score.rawScore == null && score.status !== "excused" ? "" : String(score.rawScore ?? "")]))), [rows]);
  const initialStatuses = useMemo(() => Object.fromEntries(rows.flatMap((row) => row.scores.map((score) => [`${row.student.id}:${score.assessmentId}`, (score.status as ScoreStatus | undefined) ?? "present"]))), [rows]);
  const initialTotals = useMemo(() => Object.fromEntries(rows.map((row) => [row.student.id, row.total])), [rows]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [statuses, setStatuses] = useState<Record<string, ScoreStatus>>(initialStatuses);
  const [totals, setTotals] = useState<Record<string, number | null>>(initialTotals);
  const [saving, setSaving] = useState<string>("");
  const [saved, setSaved] = useState<string>("");
  const [error, setError] = useState<string>("");

  function calculateOptimisticTotal(studentId: string, nextValue: string, assessmentId: string, nextStatus?: ScoreStatus) {
    const items = assessments.map((assessment) => {
      const key = `${studentId}:${assessment.id}`;
      const isEdited = assessment.id === assessmentId;
      const raw = isEdited ? nextValue : values[key] ?? "";
      const status = isEdited ? nextStatus ?? statuses[key] ?? "present" : statuses[key] ?? "present";
      const numeric = raw.trim() === "" ? null : Number(raw);
      return {
        id: assessment.id,
        type: assessment.type,
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        percentage: status === "excused" || numeric == null || !Number.isFinite(numeric) ? null : (numeric / assessment.maxScore) * 100,
      };
    });
    return previewSubjectTotal(items, rules);
  }

  async function save(studentId: string, assessmentId: string, maxScore: number, key: string) {
    const raw = values[key]?.trim() ?? "";
    const status = statuses[key] ?? "present";
    if (raw === "" && status !== "excused") {
      setError("A blank mark is left blank. It is not treated as zero. Mark excused instead, or enter 0.");
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
    const optimisticTotal = calculateOptimisticTotal(studentId, raw, assessmentId, status);
    setTotals((current) => ({ ...current, [studentId]: optimisticTotal }));
    setSaving(key); setError(""); setSaved("");
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
    } finally { setSaving(""); }
  }

  async function clear(studentId: string, assessmentId: string, key: string) {
    const previousValue = values[key] ?? initial[key] ?? "";
    const previousTotal = totals[studentId] ?? initialTotals[studentId] ?? null;
    setSaving(key); setError(""); setSaved("");
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
      setTotals((current) => ({ ...current, [studentId]: previousTotal }));
      setError(err instanceof Error ? err.message : "The mark could not be cleared.");
    } finally { setSaving(""); }
  }

  return <div>
    {(error || saved) && <div role="status" style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: error ? "rgba(220,92,92,.08)" : "rgba(111,224,188,.07)", color: error ? "#f0a7a7" : "#79dfbd" }>{error || "Saved."}</div>}
    <div style={{ overflowX: "auto" }>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }>
        <thead><tr><th style={{ textAlign: "left", padding: 10, position: "sticky", left: 0, background: "var(--sn-surface)" }>Student</th>{assessments.map((assessment) => <th key={assessment.id} style={{ textAlign: "left", padding: 10 }>{assessment.name}<small style={{ display: "block", opacity: .65 }>{assessment.type} · max {assessment.maxScore}</small></th>)}<th style={{ padding: 10 }>Weighted</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.student.id}>
          <td style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,.06)", position: "sticky", left: 0, background: "var(--sn-surface)" }><b>{row.student.name}</b><small style={{ display: "block", opacity: .65 }>{row.student.admissionNo}</small></td>
          {assessments.map((assessment) => { const key = `${row.student.id}:${assessment.id}`; const existing = values[key] ?? ""; const status = statuses[key] ?? "present"; return <td key={assessment.id} style={{ padding: 8, borderTop: "1px solid rgba(255,255,255,.06)" }><div style={{ display: "flex", gap: 6, alignItems: "center" }><input aria-label={`${assessment.name} mark for ${row.student.name}`} inputMode="decimal" value={existing} onChange={(event) => { const next = event.target.value; setValues((current) => ({ ...current, [key]: next })); setTotals((current) => ({ ...current, [row.student.id]: calculateOptimisticTotal(row.student.id, next, assessment.id) })); setSaved(""); }} onBlur={() => void save(row.student.id, assessment.id, assessment.maxScore, key)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} style={{ width: 62 } placeholder="—"/><span style={{ opacity: .5 }>/{assessment.maxScore}</span><select aria-label={`Attendance status for ${assessment.name}, ${row.student.name}`} value={status} onChange={(event) => { const next = event.target.value as "present" | "absent" | "excused"; setStatuses((current) => ({ ...current, [key]: next })); setTotals((current) => ({ ...current, [row.student.id]: calculateOptimisticTotal(row.student.id, existing, assessment.id, next) })); setSaved(""); }} style={{ maxWidth: 92 }><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></div><div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }>{saving === key && <small role="status" style={{ color: "var(--sn-ink)" }>Saving…</small>}{saved === key && <small style={{ color: "var(--sn-ink)" }>Saved</small>}{existing !== "" && <button type="button" onClick={() => void clear(row.student.id, assessment.id, key)} style={{ background: "none", border: "none", color: "var(--sn-ink)", cursor: "pointer", fontSize: 11 }>Clear</button>}</div></td>; })}
          <td style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,.06)" }>{totals[row.student.id] == null ? <span style={{ color: "var(--sn-ink)" }>Incomplete</span> : `${totals[row.student.id]!.toFixed(2)}%`}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p style={{ margin: "12px 0 0", color: "var(--sn-ink)", fontSize: 12 }>Tip: enter a mark and move to the next cell. SukuuNova updates the weighted result immediately, then confirms the server save.</p>
  </div>;
}
