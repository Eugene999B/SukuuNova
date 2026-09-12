"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileSearch, RefreshCw, RotateCcw } from "lucide-react";
import styles from "./AcademicLessonFiles.module.css";

type ActiveTerm = { id: string; name: string; academicYear: string; teachingWeeks: number; lifecycle: { state: string } };
type Row = {
  id: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  weekNumber: number;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewerName: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};
type Data = { activeTerm: ActiveTerm | null; rows: Row[] };

const reasonOptions = [
  ["curriculum_alignment", "Curriculum alignment"],
  ["learning_outcomes", "Learning outcomes"],
  ["assessment", "Assessment"],
  ["differentiation", "Differentiation"],
  ["resources", "Resources"],
  ["clarity", "Clarity"],
  ["timing", "Timing"],
  ["other", "Other"],
] as const;

function isInline(row: Row) {
  return row.mimeType === "application/pdf" || Boolean(row.mimeType?.startsWith("image/"));
}

export function SchoolLessonPlanClassReview() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [weekNumber, setWeekNumber] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [reasonCode, setReasonCode] = useState<(typeof reasonOptions)[number][0]>("clarity");
  const [reviewing, setReviewing] = useState(false);

  async function load(preserve = true) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/lesson-files", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || body?.message || "Could not load lesson plans.");
      const next = body as Data;
      setData(next);
      const first = next.rows[0];
      if (!preserve || !classId) setClassId(first?.classId || "");
      if (!preserve || !subjectId) setSubjectId(first?.subjectId || "");
      if (!preserve || !weekNumber) setWeekNumber(first?.weekNumber || 1);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load lesson plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(false); }, []);

  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.rows || []) map.set(row.classId, row.className);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [data]);
  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.rows || []) if (row.classId === classId) map.set(row.subjectId, row.subjectName);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [data, classId]);

  useEffect(() => {
    if (!subjects.some((item) => item.id === subjectId)) setSubjectId(subjects[0]?.id || "");
  }, [subjects, subjectId]);

  const filtered = useMemo(() => (data?.rows || []).filter((row) => row.classId === classId && row.subjectId === subjectId && row.weekNumber === weekNumber), [data, classId, subjectId, weekNumber]);
  useEffect(() => {
    if (!filtered.some((row) => row.id === selectedId)) setSelectedId(filtered[0]?.id || "");
  }, [filtered, selectedId]);
  const selected = filtered.find((row) => row.id === selectedId) || null;

  const counts = useMemo(() => ({
    waiting: (data?.rows || []).filter((row) => row.status === "submitted").length,
    accepted: (data?.rows || []).filter((row) => row.status === "approved" || row.status === "completed").length,
    returned: (data?.rows || []).filter((row) => row.status === "changes_requested").length,
  }), [data]);

  async function review(decision: "approved" | "changes_requested") {
    if (!selected) return;
    if (decision === "changes_requested" && note.trim().length < 5) {
      setMessage("Add a clear correction note for the teacher.");
      return;
    }
    setReviewing(true);
    setMessage("");
    try {
      const response = await fetch("/api/school/lesson-review-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, decision, reasonCode: decision === "changes_requested" ? reasonCode : undefined, note: note.trim() || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Could not save the review.");
      setMessage(decision === "approved" ? "Lesson plan accepted." : "Lesson plan returned to the teacher for correction.");
      setNote("");
      await load();
    } catch (value) {
      setMessage(value instanceof Error ? value.message : "Could not save the review.");
    } finally {
      setReviewing(false);
    }
  }

  if (loading && !data) return <div className={styles.empty}>Loading current-term lesson plans…</div>;
  if (error && !data) return <div className={styles.empty}>{error}<div><button className={styles.secondaryButton} onClick={() => void load()}><RefreshCw size={15}/> Retry</button></div></div>;

  const term = data?.activeTerm;
  return <div className={styles.workspace}>
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>Lesson plan review</span>
        <h2>Review by class, subject and week.</h2>
        <p>Open exactly what a teacher sent for the current term, view or download the file, then accept it or request a correction.</p>
      </div>
      <div className={styles.termBadge}>
        <span>Current academic period</span>
        <strong>{term ? `${term.name} · ${term.academicYear}` : "No active term"}</strong>
        <p>{term ? `${term.teachingWeeks} teaching weeks` : "Correct Terms & Calendar before reviewing current work."}</p>
      </div>
    </section>

    <section className={styles.card}>
      <div className={styles.metrics}>
        <div className={styles.metric}><span>Awaiting review</span><strong>{counts.waiting}</strong></div>
        <div className={styles.metric}><span>Accepted</span><strong>{counts.accepted}</strong></div>
        <div className={styles.metric}><span>Returned</span><strong>{counts.returned}</strong></div>
      </div>
      <div className={styles.filters}>
        <select aria-label="Class" value={classId} onChange={(event) => setClassId(event.target.value)}>
          {classes.length ? classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">No submitted classes</option>}
        </select>
        <select aria-label="Subject" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          {subjects.length ? subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">No submitted subjects</option>}
        </select>
        <select aria-label="Teaching week" value={weekNumber} onChange={(event) => setWeekNumber(Number(event.target.value))} disabled={!term}>
          {Array.from({ length: term?.teachingWeeks || 1 }, (_, index) => index + 1).map((week) => <option key={week} value={week}>Week {week}</option>)}
        </select>
      </div>
    </section>

    <div className={styles.grid}>
      <section className={styles.card}>
        <h3>{classId && subjectId ? `Week ${weekNumber} submissions` : "Submissions"}</h3>
        <p>Select a teacher submission to inspect its file.</p>
        <div className={styles.list}>
          {filtered.length === 0 ? <div className={styles.empty}>No lesson plan has been submitted for this class, subject and week.</div> : filtered.map((row) => <button type="button" className={styles.row} key={row.id} onClick={() => { setSelectedId(row.id); setMessage(""); setNote(""); }}>
            <div>
              <div className={styles.rowTitle}>{row.teacherName}</div>
              <div className={styles.rowMeta}>{row.fileName || "No file"} · Week {row.weekNumber}</div>
            </div>
            <span className={styles.status}>{row.status.replaceAll("_", " ")}</span>
            <span className={styles.link}><FileSearch size={15}/> Open</span>
          </button>)}
        </div>
      </section>

      <section className={styles.card}>
        <h3>{selected ? `${selected.teacherName} · ${selected.subjectName}` : "Lesson-plan viewer"}</h3>
        <p>{selected ? `${selected.className} · Week ${selected.weekNumber} · ${selected.fileName || "No file attached"}` : "Choose a submitted plan from the list."}</p>
        {!selected ? <div className={styles.empty}>Nothing selected.</div> : <>
          {selected.fileName && isInline(selected) ? <div className={styles.viewer}>
            {selected.mimeType?.startsWith("image/") ? <img src={`/api/lesson-plans/${selected.id}/file`} alt={`Lesson plan from ${selected.teacherName}`} /> : <iframe title={`Lesson plan from ${selected.teacherName}`} src={`/api/lesson-plans/${selected.id}/file`} />}
          </div> : selected.fileName ? <div className={styles.empty}>
            <Download size={24}/>
            <strong>{selected.fileName}</strong>
            <span>Office documents are downloaded securely for review.</span>
            <a className={styles.link} href={`/api/lesson-plans/${selected.id}/file`}><Download size={15}/> Download file</a>
          </div> : <div className={styles.empty}>This legacy lesson plan has no uploaded file. Use the existing historical record if needed.</div>}

          <div className={styles.reviewPanel}>
            {selected.status === "submitted" ? <>
              <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as (typeof reasonOptions)[number][0])} aria-label="Correction area">
                {reasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <textarea className={styles.noteArea} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional approval note, or explain exactly what needs correction." />
              <div className={styles.reviewActions}>
                <button className={styles.reviewButton} disabled={reviewing} onClick={() => void review("approved")}><CheckCircle2 size={16}/> Accept lesson plan</button>
                <button className={styles.returnButton} disabled={reviewing} onClick={() => void review("changes_requested")}><RotateCcw size={16}/> Request correction</button>
              </div>
            </> : <div className={styles.message}>{selected.status === "approved" ? "Accepted. This lesson plan is kept as approved." : selected.status === "changes_requested" ? `Returned for correction${selected.reviewNote ? `: ${selected.reviewNote}` : "."}` : `Status: ${selected.status.replaceAll("_", " ")}`}</div>}
            {message ? <div className={styles.message}>{message}</div> : null}
          </div>
        </>}
      </section>
    </div>
  </div>;
}
