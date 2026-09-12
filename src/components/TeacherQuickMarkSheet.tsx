"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2, Plus } from "lucide-react";

type Kind = "Classwork" | "Homework" | "Exercise" | "Participation" | "Quiz" | "Exam";

type Props = {
  classId: string;
  subjectId: string;
  termId: string;
  teachingWeeks: number;
  termStart: string;
  termEnd: string;
};

const kinds: Kind[] = ["Classwork", "Homework", "Exercise", "Participation", "Quiz", "Exam"];

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

export default function TeacherQuickMarkSheet({ classId, subjectId, termId, teachingWeeks, termStart, termEnd }: Props) {
  const router = useRouter();
  const initialDate = boundedToday(termStart, termEnd);
  const [kind, setKind] = useState<Kind>("Classwork");
  const [weekNumber, setWeekNumber] = useState(() => suggestedWeek(initialDate, termStart, teachingWeeks));
  const [workDate, setWorkDate] = useState(initialDate);
  const [maxScore, setMaxScore] = useState(10);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const weekOptions = useMemo(() => Array.from({ length: teachingWeeks }, (_, index) => index + 1), [teachingWeeks]);

  async function createSheet() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/school/teacher-academic-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createMarkSheet", termId, classId, subjectId, kind, weekNumber, workDate, maxScore }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string; error?: string; result?: { assessmentId?: string } };
      if (!response.ok) throw new Error(data.message || data.error || "The mark sheet could not be created.");
      setMessage(`${kind} mark sheet created. Enter marks in the grid below.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The mark sheet could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gradebook-quick-sheet">
      <div className="gradebook-quick-sheet-head">
        <div><span>Record marks</span><strong>Open a fresh mark sheet in seconds</strong><small>No question builder, percentage setup or publishing step is required.</small></div>
        <ClipboardCheck size={19} />
      </div>
      <div className="gradebook-quick-sheet-fields">
        <label><span>Type</span><select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as Kind)}>{kinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Week</span><select value={weekNumber} disabled={busy} onChange={(event) => setWeekNumber(Number(event.target.value))}>{weekOptions.map((week) => <option key={week} value={week}>Week {week}</option>)}</select></label>
        <label><span>Date</span><input type="date" min={termStart} max={termEnd} value={workDate} disabled={busy} onChange={(event) => setWorkDate(event.target.value)} /></label>
        <label><span>Out of</span><input type="number" min={1} max={100000} inputMode="decimal" value={maxScore} disabled={busy} onChange={(event) => setMaxScore(Number(event.target.value))} /></label>
        <button type="button" className="academic-btn-primary gradebook-quick-sheet-button" disabled={busy || !Number.isFinite(maxScore) || maxScore <= 0} onClick={() => void createSheet()}>{busy ? <><Loader2 size={15} className="spin" /> Creating…</> : <><Plus size={15} /> Create mark sheet</>}</button>
      </div>
      <p className="gradebook-quick-sheet-note">This term has {teachingWeeks} teaching week{teachingWeeks === 1 ? "" : "s"}. Work number and gradebook category are handled automatically by SukuuNova.</p>
      {(error || message) ? <div role={error ? "alert" : "status"} className={`gradebook-entry-status ${error ? "is-error" : "is-success"}`}>{error || message}</div> : null}
    </div>
  );
}
