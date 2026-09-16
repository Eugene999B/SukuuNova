"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Loader2, Plus } from "lucide-react";

export type QuickMarkKind = "Classwork" | "Homework" | "Exercise" | "Participation" | "Quiz" | "Exam";

type ExistingWork = {
  kind: string;
  weekNumber: number;
  workNumber: number;
};

type Props = {
  classId: string;
  subjectId: string;
  termId: string;
  teachingWeeks: number;
  termStart: string;
  termEnd: string;
  allowedKinds: QuickMarkKind[];
  existingWork?: ExistingWork[];
  initialWeek?: number;
  initialKind?: QuickMarkKind;
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

function weekBounds(weekNumber: number, start: string, end: string) {
  const startMs = Date.parse(start + "T00:00:00.000Z");
  const endMs = Date.parse(end + "T00:00:00.000Z");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return { min: start, max: end };
  const weekStartMs = Math.min(endMs, startMs + (weekNumber - 1) * 7 * DAY_MS);
  const weekEndMs = Math.min(endMs, weekStartMs + 6 * DAY_MS);
  return {
    min: new Date(weekStartMs).toISOString().slice(0, 10),
    max: new Date(weekEndMs).toISOString().slice(0, 10),
  };
}

function workDateForWeek(weekNumber: number, start: string, end: string) {
  const bounds = weekBounds(weekNumber, start, end);
  const today = new Date().toISOString().slice(0, 10);
  if (today >= bounds.min && today <= bounds.max) return today;
  return bounds.min;
}

export default function TeacherQuickMarkSheet({
  classId,
  subjectId,
  termId,
  teachingWeeks,
  termStart,
  termEnd,
  allowedKinds,
  existingWork = [],
  initialWeek,
  initialKind,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const initialDate = boundedToday(termStart, termEnd);
  const availableKinds = allowedKinds.length ? allowedKinds : (["Classwork", "Homework", "Exercise", "Quiz", "Exam"] as QuickMarkKind[]);
  const kinds: QuickMarkKind[] = availableKinds.filter((item) => item !== "Participation");
  const defaultWeek = initialWeek && initialWeek >= 1 && initialWeek <= teachingWeeks ? initialWeek : suggestedWeek(initialDate, termStart, teachingWeeks);
  const defaultKind = initialKind && kinds.includes(initialKind) ? initialKind : (kinds[0] ?? "Classwork");
  const [kind, setKind] = useState<QuickMarkKind>(defaultKind);
  const [weekNumber, setWeekNumber] = useState(defaultWeek);
  const [workDate, setWorkDate] = useState(() => workDateForWeek(defaultWeek, termStart, termEnd));
  const [maxScore, setMaxScore] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dateBounds = weekBounds(weekNumber, termStart, termEnd);
  const nextWorkNumber = existingWork
    .filter((work) => work.weekNumber === weekNumber && work.kind.toLowerCase() === kind.toLowerCase())
    .reduce((highest, work) => Math.max(highest, work.workNumber), 0) + 1;

  async function createSheet() {
    if (busy) return;
    setError("");
    if (!workDate || workDate < dateBounds.min || workDate > dateBounds.max) {
      setError(`Choose a date inside Week ${weekNumber}.`);
      return;
    }
    setBusy(true);
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
    setError("");
  }

  return (
    <div className="gradebook-create-work" id="add-work">
      <div className="gradebook-create-work-heading">
        <div>
          <span>Add work</span>
          <strong>Choose the week, then create the mark sheet</strong>
          <small>SukuuNova handles the numbering for you. If Week {weekNumber} already has {kind} work, the next one becomes {kind} {nextWorkNumber}.</small>
        </div>
        <CalendarDays size={20} aria-hidden="true" />
      </div>
      <div className="gradebook-create-work-fields">
        <label><span>Week</span><select value={weekNumber} disabled={busy} onChange={(event) => chooseWeek(Number(event.target.value))}>{Array.from({ length: teachingWeeks }, (_, index) => index + 1).map((week) => <option key={week} value={week}>Week {week}</option>)}</select></label>
        <label><span>Type of work</span><select value={kind} disabled={busy} onChange={(event) => { setKind(event.target.value as QuickMarkKind); setError(""); }}>{kinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Date</span><input type="date" min={dateBounds.min} max={dateBounds.max} value={workDate} disabled={busy} onChange={(event) => { setWorkDate(event.target.value); setError(""); }} /></label>
        <label><span>Marks out of</span><input type="number" min={1} max={100000} inputMode="decimal" value={maxScore} disabled={busy} onChange={(event) => setMaxScore(Number(event.target.value))} /></label>
      </div>
      <div className="gradebook-create-work-footer">
        <p>This will create <strong>{kind} {nextWorkNumber}</strong> in <strong>Week {weekNumber}</strong>, dated <strong>{workDate}</strong>.</p>
        <button type="button" className="gradebook-primary-action" disabled={busy || !Number.isFinite(maxScore) || maxScore <= 0 || !workDate} onClick={() => void createSheet()}>{busy ? <><Loader2 size={16} className="spin" /> Creating…</> : <><Plus size={16} /> Create {kind} {nextWorkNumber} & enter marks</>}</button>
      </div>
      {error ? <div role="alert" className="gradebook-entry-status is-error">{error}</div> : null}
    </div>
  );
}
