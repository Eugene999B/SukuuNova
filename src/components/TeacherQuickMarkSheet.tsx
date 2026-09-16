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

const DAY_MS = 86400000;

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
  return Math.max(1, Math.min(teachingWeeks, Math.floor((dateMs - startMs) / (7 * DAY_MS)) + 1));
}

function workDateForWeek(weekNumber: number, start: string, end: string) {
  const startMs = Date.parse(start + "T00:00:00.000Z");
  const endMs = Date.parse(end + "T00:00:00.000Z");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return start;
  const weekStartMs = startMs + (weekNumber - 1) * 7 * DAY_MS;
  const weekEndMs = Math.min(endMs, weekStartMs + 6 * DAY_MS);
  const today = new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(today + "T00:00:00.000Z");
  if (todayMs >= weekStartMs && todayMs <= weekEndMs) return today;
  return new Date(Math.min(weekStartMs, endMs)).toISOString().slice(0, 10);
}

export default function TeacherQuickMarkSheet({ classId, subjectId, termId, teachingWeeks, termStart, termEnd, allowedKinds }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const initialDate = boundedToday(termStart, termEnd);
  const availableKinds = allowedKinds.length ? allowedKinds : (["Classwork", "Homework", "Exercise", "Quiz", "Exam"] as QuickMarkKind[]);
  const kinds = availableKinds.filter((item) => item !== "Participation");
  const [kind, setKind] = useState<QuickMarkKind>(kinds[0] ?? "Classwork");
  const [weekNumber, setWeekNumber] = useState(() => suggestedWeek(initialDate, termStart, teachingWeeks));
  const [workDate, setWorkDate] = useState(() => workDateForWeek(suggestedWeek(initialDate, termStart, teachingWeeks), termStart, termEnd));
  const [maxScore, setMaxScore] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createSheet() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/school/teacher-academic-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createMarkSheet", termId, classId, subjectId, kind, workDate, maxScore }),
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

  function chooseWeek(nextWeek: number) {
    setWeekNumber(nextWeek);
    setWorkDate(workDateForWeek(nextWeek, termStart, termEnd));
  }

  return (
    <div className="gradebook-create-work">
      <div className="gradebook-create-work-heading">
        <div>
          <span>Add marks</span>
          <strong>Choose the type of work and the week</strong>
          <small>SukuuNova numbers each one automatically: Homework 1, Homework 2, Classwork 1, and so on.</small>
        </div>
        <CalendarDays size={20} aria-hidden="true" />
      </div>
      <div className="gradebook-create-work-fields">
        <label><span>Type of work</span><select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as QuickMarkKind)}>{kinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Week</span><select value={weekNumber} disabled={busy} onChange={(event) => chooseWeek(Number(event.target.value))}>{Array.from({ length: teachingWeeks }, (_, index) => index + 1).map((week) => <option key={week} value={week}>Week {week}</option>)}</select></label>
        <label><span>Marks out of</span><input type="number" min={1} max={100000} inputMode="decimal" value={maxScore} disabled={busy} onChange={(event) => setMaxScore(Number(event.target.value))} /></label>
      </div>
      <div className="gradebook-create-work-footer">
        <p><strong>Week {weekNumber}</strong> · The system will create the next <strong>{kind}</strong> number automatically.</p>
        <button type="button" className="gradebook-primary-action" disabled={busy || !Number.isFinite(maxScore) || maxScore <= 0 || !workDate} onClick={() => void createSheet()}>{busy ? <><Loader2 size={16} className="spin" /> Creating…</> : <><Plus size={16} /> Create next {kind} & enter marks</>}</button>
      </div>
      {error ? <div role="alert" className="gradebook-entry-status is-error">{error}</div> : null}
    </div>
  );
}
