"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Loader2, Plus } from "lucide-react";

export type QuickMarkKind = "Classwork" | "Homework" | "Exercise" | "Participation" | "Quiz" | "Exam";

type Props = {
  classId: string;
  subjectId: string;
  termId: string;
  teachingWeeks: number;
  termStart: string;
  termEnd: string;
  allowedKinds: QuickMarkKind[];
};

function boundedToday(start: string, end: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

function suggestedWeek(date: string, start: string, teachingWeeks: number) {
  const startMs = Date.parse(start + "T00:00:00.000Z");
  const dateMs = Date.parse(date + "T00:00:00.000Z");
  if (!Number.isFinite(startMs) || !Number.isFinite(dateMs)) return 1;
  return Math.max(1, Math.min(teachingWeeks, Math.floor((dateMs - startMs) / 604800000) + 1));
}

export default function TeacherQuickMarkSheet({ classId, subjectId, termId, teachingWeeks, termStart, termEnd, allowedKinds }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const initialDate = boundedToday(termStart, termEnd);
  const kinds = allowedKinds.length ? allowedKinds : (["Classwork", "Homework", "Exercise", "Participation", "Quiz", "Exam"] as QuickMarkKind[]);
  const [kind, setKind] = useState<QuickMarkKind>(kinds[0]);
  const [title, setTitle] = useState("");
  const [workDate, setWorkDate] = useState(initialDate);
  const [maxScore, setMaxScore] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const weekNumber = suggestedWeek(workDate, termStart, teachingWeeks);

  async function createSheet() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/school/teacher-academic-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createMarkSheet", termId, classId, subjectId, kind, title: title.trim() || undefined, workDate, maxScore }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string; error?: string; result?: { assessmentId?: string } };
      if (!response.ok) throw new Error(data.message || data.error || "The mark sheet could not be created.");
      if (!data.result?.assessmentId) throw new Error("The mark sheet was created but SukuuNova could not open it safely. Refresh the page before entering marks.");
      const query = new URLSearchParams({ term: termId, view: "assessments", assessment: data.result.assessmentId });
      router.push(`${pathname}?${query.toString()}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The mark sheet could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gradebook-create-work">
      <div className="gradebook-create-work-heading">
        <div>
          <span>New assessment</span>
          <strong>Create the work, then enter only these marks</strong>
          <small>Choose what you gave the class. SukuuNova handles the teaching week and final weighting automatically.</small>
        </div>
        <CalendarDays size={20} aria-hidden="true" />
      </div>
      <div className="gradebook-create-work-fields">
        <label><span>Work type</span><select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as QuickMarkKind)}>{kinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="is-wide"><span>Work name <small>optional</small></span><input value={title} maxLength={160} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder={`e.g. ${kind} on fractions`} /></label>
        <label><span>Date given</span><input type="date" min={termStart} max={termEnd} value={workDate} disabled={busy} onChange={(event) => setWorkDate(event.target.value)} /></label>
        <label><span>Out of</span><input type="number" min={1} max={100000} inputMode="decimal" value={maxScore} disabled={busy} onChange={(event) => setMaxScore(Number(event.target.value))} /></label>
      </div>
      <div className="gradebook-create-work-footer">
        <p>Falls in <strong>Week {weekNumber}</strong>. You can create another {kind.toLowerCase()} in the same week at any time.</p>
        <button type="button" className="gradebook-primary-action" disabled={busy || !Number.isFinite(maxScore) || maxScore <= 0 || !workDate} onClick={() => void createSheet()}>{busy ? <><Loader2 size={16} className="spin" /> Creating…</> : <><Plus size={16} /> Create & enter marks</>}</button>
      </div>
      {error ? <div role="alert" className="gradebook-entry-status is-error">{error}</div> : null}
    </div>
  );
}
