"use client";

import { useMemo, useState } from "react";

type Assessment = { id: string; name: string; type: string; maxScore: number; weight: number };
type ScoreDetail = { assessmentId: string; rawScore: number | null; maxScore: number };
type Row = { student: { id: string; name: string; admissionNo: string }; total: number | null; scores: ScoreDetail[] };

export default function GradebookEntryGrid({ assessments, rows }: { assessments: Assessment[]; rows: Row[] }) {
  const initial = useMemo(() => Object.fromEntries(rows.flatMap((row) => row.scores.map((score) => [`${row.student.id}:${score.assessmentId}`, score.rawScore == null ? "" : String(score.rawScore)]))), [rows]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState<string>("");
  const [saved, setSaved] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function save(studentId: string, assessmentId: string, maxScore: number, key: string) {
    const raw = values[key]?.trim() ?? "";
    if (raw === "") {
      setError("A blank mark is left blank. It is not treated as zero.");
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > maxScore) {
      setError(`Enter a mark from 0 to ${maxScore}.`);
      return;
    }
    setSaving(key); setError(""); setSaved("");
    try {
      const response = await fetch("/api/mvp/gradebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "score", studentId, assessmentId, value }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The mark could not be saved.");
      setSaved(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The mark could not be saved.");
    } finally { setSaving(""); }
  }

  return <div>
    {(error || saved) && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: error ? "rgba(220,92,92,.08)" : "rgba(111,224,188,.07)", color: error ? "#f0a7a7" : "#79dfbd" }}>{error || "Saved."}</div>}
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
        <thead><tr><th style={{ textAlign: "left", padding: 10, position: "sticky", left: 0, background: "#0b1720" }}>Student</th>{assessments.map((assessment) => <th key={assessment.id} style={{ textAlign: "left", padding: 10 }}>{assessment.name}<small style={{ display: "block", opacity: .65 }}>{assessment.type} · max {assessment.maxScore}</small></th>)}<th style={{ padding: 10 }}>Weighted</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.student.id}>
          <td style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,.06)", position: "sticky", left: 0, background: "#0b1720" }}><b>{row.student.name}</b><small style={{ display: "block", opacity: .65 }}>{row.student.admissionNo}</small></td>
          {assessments.map((assessment) => { const key = `${row.student.id}:${assessment.id}`; const existing = values[key] ?? ""; return <td key={assessment.id} style={{ padding: 8, borderTop: "1px solid rgba(255,255,255,.06)" }}><div style={{ display: "flex", gap: 6, alignItems: "center" }}><input aria-label={`${assessment.name} mark for ${row.student.name}`} inputMode="decimal" value={existing} onChange={(event) => { setValues((current) => ({ ...current, [key]: event.target.value })); setSaved(""); }} onBlur={() => void save(row.student.id, assessment.id, assessment.maxScore, key)} onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); } }} style={{ width: 78 }} placeholder="—"/><span style={{ opacity: .5 }}>/{assessment.maxScore}</span></div>{saving === key && <small style={{ color: "#f0bd7a" }}>Saving…</small>}{saved === key && <small style={{ color: "#73e2c0" }}>Saved</small>}</td>; })}
          <td style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,.06)" }}>{row.total == null ? <span style={{ color: "#e9a36a" }}>Incomplete</span> : `${row.total.toFixed(2)}%`}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p style={{ margin: "12px 0 0", color: "#71888c", fontSize: 12 }}>Tip: enter a mark and move to the next cell. SukuuNova validates the range before saving it.</p>
  </div>;
}
