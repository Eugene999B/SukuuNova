"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Loader2, Plus } from "lucide-react";

type Props = {
  classId: string;
  subjectId: string;
  termId: string;
  weekNumber: number;
  nextWorkNumber: number;
  termStart: string;
  termEnd: string;
};

export default function TeacherWeeklyWorkSetup({ classId, subjectId, termId, weekNumber, nextWorkNumber, termStart, termEnd }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [workDate, setWorkDate] = useState("");
  const [maxScore, setMaxScore] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createWork() {
    if (busy || !workDate || !Number.isFinite(maxScore) || maxScore <= 0) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/school/teacher-academic-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "createMarkSheet",
          termId,
          classId,
          subjectId,
          weekNumber,
          workDate,
          maxScore,
        }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string; error?: string; result?: { assessmentId?: string } };
      if (!response.ok) throw new Error(data.message || data.error || "Work could not be created.");
      if (!data.result?.assessmentId) throw new Error("Work was created but the mark sheet could not be opened safely. Refresh the worksheet before trying again.");
      const query = new URLSearchParams({ week: String(weekNumber), assessment: data.result.assessmentId });
      router.replace(`${pathname}?${query.toString()}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Work could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="weekly-work-setup">
      <div className="weekly-work-setup-title">
        <div className="weekly-work-number">{nextWorkNumber}</div>
        <div>
          <span>NEW WORK</span>
          <h3>Work {nextWorkNumber}</h3>
          <p>Set the date and total marks first. The student mark sheet opens immediately after this.</p>
        </div>
      </div>

      <div className="weekly-work-setup-fields">
        <label>
          <span><CalendarDays size={14} aria-hidden="true" /> Date</span>
          <input type="date" min={termStart} max={termEnd} value={workDate} disabled={busy} onChange={(event) => setWorkDate(event.target.value)} />
        </label>
        <label>
          <span>Marks out of</span>
          <input type="number" min={1} max={100000} inputMode="decimal" value={maxScore} disabled={busy} onChange={(event) => setMaxScore(Number(event.target.value))} />
        </label>
        <button type="button" disabled={busy || !workDate || !Number.isFinite(maxScore) || maxScore <= 0} onClick={() => void createWork()}>
          {busy ? <><Loader2 size={16} className="spin" /> Creating…</> : <><Plus size={16} /> Create Work {nextWorkNumber} & enter marks</>}
        </button>
      </div>
      {error ? <div className="weekly-inline-error" role="alert">{error}</div> : null}
    </div>
  );
}
