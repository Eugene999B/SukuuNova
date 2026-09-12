"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileCheck2, RefreshCw, Send, Upload } from "lucide-react";
import styles from "./AcademicLessonFiles.module.css";

type Assignment = { classId: string; className: string; subjectId: string; subjectName: string };
type ActiveTerm = { id: string; name: string; academicYear: string; teachingWeeks: number; lifecycle: { state: string; daysUntilEnd: number } };
type Row = {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  weekNumber: number;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};
type Data = { activeTerm: ActiveTerm | null; assignments: Assignment[]; rows: Row[] };

function fileSize(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function TeacherLessonPlanFileWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [weekNumber, setWeekNumber] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/teacher/lesson-files", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || body?.message || "Could not load lesson plans.");
      setData(body as Data);
      const first = (body as Data).assignments[0];
      setClassId((current) => current || first?.classId || "");
      setSubjectId((current) => current || first?.subjectId || "");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load lesson plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const assignment of data?.assignments || []) map.set(assignment.classId, assignment.className);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [data]);
  const subjects = useMemo(() => (data?.assignments || []).filter((item) => item.classId === classId), [data, classId]);

  useEffect(() => {
    if (!subjects.some((item) => item.subjectId === subjectId)) setSubjectId(subjects[0]?.subjectId || "");
  }, [subjects, subjectId]);

  const counts = useMemo(() => ({
    submitted: (data?.rows || []).filter((row) => row.status === "submitted").length,
    approved: (data?.rows || []).filter((row) => row.status === "approved" || row.status === "completed").length,
    corrections: (data?.rows || []).filter((row) => row.status === "changes_requested").length,
  }), [data]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setMessage("Choose the lesson-plan file first."); return; }
    if (!classId || !subjectId) { setMessage("Choose the class and subject."); return; }
    setSubmitting(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("classId", classId);
      form.set("subjectId", subjectId);
      form.set("weekNumber", String(weekNumber));
      form.set("file", file);
      const response = await fetch("/api/teacher/lesson-files", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || body?.message || "Could not submit lesson plan.");
      setMessage("Lesson plan sent for review.");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (value) {
      setMessage(value instanceof Error ? value.message : "Could not submit lesson plan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) return <div className={styles.empty}>Loading your current lesson-plan workspace…</div>;
  if (error && !data) return <div className={styles.empty}>{error}<div><button className={styles.secondaryButton} onClick={() => void load()}><RefreshCw size={15}/> Retry</button></div></div>;

  const term = data?.activeTerm;
  return <div className={styles.workspace}>
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>Lesson plans</span>
        <h2>Send the plan. SukuuNova files it correctly.</h2>
        <p>Choose only the class, subject and teaching week. The current academic term is attached automatically.</p>
      </div>
      <div className={styles.termBadge}>
        <span>Current academic period</span>
        <strong>{term ? `${term.name} · ${term.academicYear}` : "No active term"}</strong>
        <p>{term ? `${term.teachingWeeks} teaching weeks configured` : "Ask management to correct Terms & Calendar."}</p>
      </div>
    </section>

    <div className={styles.grid}>
      <section className={styles.card}>
        <h3>Submit this week’s lesson plan</h3>
        <p>No term selector is needed. New submissions always belong to the school’s active term.</p>
        {!term ? <div className={styles.empty}>There is no single active term, so lesson-plan submission is paused.</div> : <form className={styles.formGrid} onSubmit={submit}>
          <div className={styles.field}>
            <label htmlFor="lesson-class">Class</label>
            <select id="lesson-class" value={classId} onChange={(event) => setClassId(event.target.value)} required>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="lesson-subject">Subject</label>
            <select id="lesson-subject" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required>
              {subjects.map((item) => <option key={`${item.classId}:${item.subjectId}`} value={item.subjectId}>{item.subjectName}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="lesson-week">Teaching week</label>
            <select id="lesson-week" value={weekNumber} onChange={(event) => setWeekNumber(Number(event.target.value))}>
              {Array.from({ length: term.teachingWeeks }, (_, index) => index + 1).map((week) => <option key={week} value={week}>Week {week}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="lesson-file">Lesson-plan file</label>
            <input id="lesson-file" ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" required />
          </div>
          <div className={`${styles.fieldFull} ${styles.reviewActions}`}>
            <button className={styles.submitButton} disabled={submitting || !term} type="submit"><Send size={16}/>{submitting ? " Sending…" : " Submit for review"}</button>
            <span className={styles.muted}>Maximum 10 MB. PDF and images can be viewed inside SukuuNova; Office files remain securely downloadable.</span>
          </div>
        </form>}
        {message ? <div className={styles.message}>{message}</div> : null}
      </section>

      <section className={styles.card}>
        <h3>Current-term progress</h3>
        <p>Your submitted plans stay attached to their exact class, subject and week.</p>
        <div className={styles.metrics}>
          <div className={styles.metric}><span>Awaiting review</span><strong>{counts.submitted}</strong></div>
          <div className={styles.metric}><span>Accepted</span><strong>{counts.approved}</strong></div>
          <div className={styles.metric}><span>Corrections</span><strong>{counts.corrections}</strong></div>
        </div>
        <div className={styles.list}>
          {(data?.rows || []).length === 0 ? <div className={styles.empty}><Upload size={22}/><div>No lesson plans have been sent in this term yet.</div></div> : data?.rows.map((row) => <article className={styles.row} key={row.id}>
            <div>
              <div className={styles.rowTitle}>{row.className} · {row.subjectName}</div>
              <div className={styles.rowMeta}>Week {row.weekNumber} · {row.fileName || "No attachment"}{row.sizeBytes ? ` · ${fileSize(row.sizeBytes)}` : ""}</div>
              {row.reviewNote ? <div className={styles.message}>{row.reviewNote}</div> : null}
            </div>
            <span className={styles.status}>{row.status.replaceAll("_", " ")}</span>
            {row.fileName ? <a className={styles.link} href={`/api/lesson-plans/${row.id}/file`} target="_blank" rel="noreferrer">{row.mimeType === "application/pdf" || row.mimeType?.startsWith("image/") ? <FileCheck2 size={15}/> : <Download size={15}/>} {row.mimeType === "application/pdf" || row.mimeType?.startsWith("image/") ? "View" : "Download"}</a> : null}
          </article>)}
        </div>
      </section>
    </div>
  </div>;
}
