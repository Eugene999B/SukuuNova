"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, CalendarRange, LockKeyhole, Plus, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import styles from "./AcademicTermsHub.module.css";

type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isLocked: boolean;
  teachingWeeks: number;
  needsFinalization: boolean;
  status: "upcoming" | "active" | "ended" | "locked";
  academicYear: { id: string; name: string; startDate: string; endDate: string };
};
type Summary = {
  term: Term;
  students: number;
  assessments: number;
  scores: number;
  scorePct: number | null;
  reportCards: number;
  reportCardReadiness: { generated: number; approved: number; released: number; expected: number };
  lessonPlans: { total: number; submitted: number; approved: number; changesRequested: number; expected: number };
  attendance: { records: number; present: number; late: number; absent: number };
  finance: { invoiceCount: number; invoiced: number; collected: number; outstanding: number };
};

type FormState = {
  academicYearName: string;
  academicYearStart: string;
  academicYearEnd: string;
  name: string;
  startDate: string;
  endDate: string;
  teachingWeeks: number;
};

const dateOnly = (value: string) => value.slice(0, 10);
const humanDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const pct = (value: number, expected: number) => expected > 0 ? Math.min(100, Math.round(value / expected * 100)) : 0;

const blankForm: FormState = { academicYearName: "", academicYearStart: "", academicYearEnd: "", name: "", startDate: "", endDate: "", teachingWeeks: 13 };

export function AcademicTermsHub() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selected, setSelected] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);

  async function loadTerms(preferredId?: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/terms", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Unable to load Academic Terms.");
      const nextTerms = body.terms as Term[];
      setTerms(nextTerms);
      const next = nextTerms.find((term) => term.id === (preferredId || selected))
        || nextTerms.find((term) => term.status === "active")
        || nextTerms.find((term) => term.needsFinalization)
        || nextTerms[0];
      setSelected(next?.id || "");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load Academic Terms.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTerms(); }, []);
  useEffect(() => {
    if (!selected) { setSummary(null); return; }
    setSummary(null);
    fetch(`/api/school/terms/${selected}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || body?.error || "Unable to load term readiness.");
        setSummary(body as Summary);
      })
      .catch((value) => setError(value instanceof Error ? value.message : "Unable to load term readiness."));
  }, [selected]);

  const active = terms.find((term) => term.id === selected) || null;
  const currentTerm = useMemo(() => terms.find((term) => term.status === "active") || null, [terms]);
  const nextTerm = useMemo(() => terms.filter((term) => term.status === "upcoming").sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))[0] || null, [terms]);
  const closedCount = terms.filter((term) => term.status === "locked").length;
  const endedCount = terms.filter((term) => term.needsFinalization).length;

  function beginCreate() {
    const latest = currentTerm?.academicYear || terms[0]?.academicYear;
    setForm({
      academicYearName: latest?.name || "",
      academicYearStart: latest ? dateOnly(latest.startDate) : "",
      academicYearEnd: latest ? dateOnly(latest.endDate) : "",
      name: "",
      startDate: "",
      endDate: "",
      teachingWeeks: 13,
    });
    setEditor("create");
    setNotice("");
  }

  function beginEdit() {
    if (!active || active.isLocked) return;
    setForm({
      academicYearName: active.academicYear.name,
      academicYearStart: dateOnly(active.academicYear.startDate),
      academicYearEnd: dateOnly(active.academicYear.endDate),
      name: active.name,
      startDate: dateOnly(active.startDate),
      endDate: dateOnly(active.endDate),
      teachingWeeks: active.teachingWeeks || 13,
    });
    setEditor("edit");
    setNotice("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const url = editor === "edit" ? `/api/school/terms/${active?.id}` : "/api/school/terms";
      const payload = editor === "edit"
        ? { name: form.name, startDate: form.startDate, endDate: form.endDate, teachingWeeks: form.teachingWeeks }
        : form;
      const response = await fetch(url, { method: editor === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Could not save the academic term.");
      setEditor(null);
      setNotice(editor === "edit" ? "Academic term updated." : "Academic term created. SukuuNova will activate it automatically on its dates.");
      await loadTerms(body?.term?.id || active?.id);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not save the academic term.");
    } finally {
      setBusy(false);
    }
  }

  async function setLocked(lock: boolean) {
    if (!active) return;
    const prompt = lock
      ? `Close and lock ${active.name}? Approved report cards will be released to the parent portal and current-term academic writing will become read-only.`
      : `Reopen ${active.name}? This is only allowed where finalized report cards do not already protect the term.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/school/terms/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: active.name, startDate: dateOnly(active.startDate), endDate: dateOnly(active.endDate), teachingWeeks: active.teachingWeeks, isLocked: lock }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Could not update the term.");
      setNotice(lock ? `${active.name} is locked. ${body.releasedReportCards || 0} approved report card(s) were released to the parent portal.` : `${active.name} was reopened for authorised correction.`);
      await loadTerms(active.id);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not update the term.");
    } finally {
      setBusy(false);
    }
  }

  const lessonProgress = summary ? pct(summary.lessonPlans.approved, summary.lessonPlans.expected) : 0;
  const reportProgress = summary ? pct(summary.reportCardReadiness.generated, summary.reportCardReadiness.expected) : 0;

  return <AppShell universe="school" title="Academic Terms" subtitle="The academic clock for marks, lesson plans, reports and term history." active="Terms & Calendar">
    <div className={styles.workspace}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Academic term control</span>
          <h2>{currentTerm ? `${currentTerm.name} is the working term.` : endedCount ? "A finished term needs to be closed." : "Set the school’s academic calendar."}</h2>
          <p>{currentTerm ? `${currentTerm.academicYear.name} · ${humanDate(currentTerm.startDate)} to ${humanDate(currentTerm.endDate)}. Marks and lesson plans use this term automatically.` : "SukuuNova should know the working term so teachers never have to guess it."}</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondary} href="/school/academics/setup">Academic Setup</Link>
          <button className={styles.primary} onClick={beginCreate}><Plus size={16}/> Add term</button>
        </div>
      </section>

      {error ? <div className={styles.alert}>{error} <button className={styles.secondary} onClick={() => void loadTerms()}><RefreshCw size={14}/> Retry</button></div> : null}
      {notice ? <div className={styles.alert}>{notice}</div> : null}

      <section className={styles.metrics}>
        <div className={styles.metric}><span>Working term</span><strong>{currentTerm?.name || "None"}</strong></div>
        <div className={styles.metric}><span>Teaching weeks</span><strong>{currentTerm?.teachingWeeks || "—"}</strong></div>
        <div className={styles.metric}><span>Next term</span><strong>{nextTerm?.name || "Not scheduled"}</strong></div>
        <div className={styles.metric}><span>Locked history</span><strong>{closedCount}</strong></div>
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.detailHead}><div><span className={styles.eyebrow}>Academic timeline</span><h3>Terms</h3><p className={styles.muted}>Current, upcoming and locked terms stay in one history.</p></div></div>
          {loading ? <div className={styles.empty}>Loading academic terms…</div> : <div className={styles.termList}>
            {terms.length ? terms.map((term) => <button key={term.id} type="button" className={`${styles.termButton} ${selected === term.id ? styles.selected : ""}`} onClick={() => setSelected(term.id)}>
              <div><strong>{term.name}</strong><small>{term.academicYear.name} · {humanDate(term.startDate)} → {humanDate(term.endDate)} · {term.teachingWeeks} weeks</small></div>
              <span className={styles.status}>{term.status}</span>
            </button>) : <div className={styles.empty}>No terms have been created yet.</div>}
          </div>}
        </section>

        <section className={styles.card}>
          {!active ? <div className={styles.empty}><CalendarRange size={26}/><div>Choose or create an academic term.</div></div> : <>
            <div className={styles.detailHead}>
              <div><span className={styles.eyebrow}>Selected term</span><h3>{active.name}</h3><p>{active.academicYear.name} · {humanDate(active.startDate)} → {humanDate(active.endDate)} · {active.teachingWeeks} teaching weeks</p></div>
              <div className={styles.actions}>
                {!active.isLocked ? <button className={styles.secondary} onClick={beginEdit}>Edit term</button> : null}
                {active.isLocked ? <button className={styles.secondary} disabled={busy} onClick={() => void setLocked(false)}><Archive size={15}/> Reopen</button> : <button className={styles.primary} disabled={busy} onClick={() => void setLocked(true)}><LockKeyhole size={15}/> {active.needsFinalization ? "Close & lock term" : "Lock term"}</button>}
              </div>
            </div>

            {!summary ? <div className={styles.empty}>Loading term readiness…</div> : <>
              <div className={styles.readiness}>
                <div className={styles.readinessCard}><span>Academic results</span><strong>{summary.scores} scores · {summary.scorePct == null ? "—" : `${summary.scorePct.toFixed(1)}% avg`}</strong><small>{summary.assessments} assessments are connected to this term.</small></div>
                <div className={styles.readinessCard}><span>Lesson plans</span><strong>{summary.lessonPlans.approved} accepted / {summary.lessonPlans.expected} expected</strong><small>{summary.lessonPlans.submitted} awaiting review · {summary.lessonPlans.changesRequested} returned for correction.</small><div className={styles.progress}><i style={{ width: `${lessonProgress}%` }}/></div></div>
                <div className={styles.readinessCard}><span>Report cards</span><strong>{summary.reportCardReadiness.generated} generated / {summary.reportCardReadiness.expected} students</strong><small>{summary.reportCardReadiness.approved} approved · {summary.reportCardReadiness.released} already released.</small><div className={styles.progress}><i style={{ width: `${reportProgress}%` }}/></div></div>
                <div className={styles.readinessCard}><span>Attendance</span><strong>{summary.attendance.records} records</strong><small>{summary.attendance.present} present events · {summary.attendance.late} late · {summary.attendance.absent} absent.</small></div>
                <div className={styles.readinessCard}><span>Finance</span><strong>₵{summary.finance.collected.toFixed(2)} collected</strong><small>₵{summary.finance.outstanding.toFixed(2)} outstanding across {summary.finance.invoiceCount} invoices.</small></div>
                <div className={styles.readinessCard}><span>Term state</span><strong>{active.status === "active" ? "System working term" : active.status === "locked" ? "Read-only history" : active.status === "ended" ? "Ready for finalisation" : "Upcoming"}</strong><small>{active.status === "active" ? "Teachers do not choose this term manually; SukuuNova attaches it automatically." : active.status === "locked" ? "Historical marks, plans and reports remain preserved." : active.status === "ended" ? "Review unfinished work before closing and locking." : "This term will become the working term automatically on its start date."}</small></div>
              </div>

              <div className={styles.links}>
                <Link href="/school/lessons">Lesson plans →</Link>
                <Link href="/school/gradebook">Gradebook →</Link>
                <Link href="/school/report-cards">Report cards →</Link>
                <Link href="/school/attendance">Attendance →</Link>
              </div>
              <div className={styles.exports}>
                <a href={`/api/school/terms/${active.id}/export?category=academic&format=pdf`}>Academic PDF</a>
                <a href={`/api/school/terms/${active.id}/export?category=lesson_plans&format=csv`}>Lesson plans · Excel/CSV</a>
                <a href={`/api/school/terms/${active.id}/export?category=attendance&format=csv`}>Attendance · Excel/CSV</a>
                <a href={`/api/school/terms/${active.id}/export?category=finance&format=csv`}>Finance · Excel/CSV</a>
              </div>
            </>}
          </>}
        </section>
      </div>

      {editor ? <section className={styles.card}>
        <div className={styles.detailHead}><div><span className={styles.eyebrow}>{editor === "edit" ? "Edit academic term" : "Create academic term"}</span><h3>{editor === "edit" ? active?.name : "New term"}</h3><p>The dates determine when SukuuNova automatically starts and stops current-term work.</p></div></div>
        <form className={styles.form} onSubmit={submit}>
          {editor === "create" ? <>
            <div className={`${styles.field} ${styles.full}`}><label>Academic year name</label><input required value={form.academicYearName} onChange={(event) => setForm({ ...form, academicYearName: event.target.value })} placeholder="2026/2027"/></div>
            <div className={styles.field}><label>Academic year starts</label><input required type="date" value={form.academicYearStart} onChange={(event) => setForm({ ...form, academicYearStart: event.target.value })}/></div>
            <div className={styles.field}><label>Academic year ends</label><input required type="date" value={form.academicYearEnd} onChange={(event) => setForm({ ...form, academicYearEnd: event.target.value })}/></div>
          </> : null}
          <div className={`${styles.field} ${styles.full}`}><label>Term name</label><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Term 1"/></div>
          <div className={styles.field}><label>Term starts</label><input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })}/></div>
          <div className={styles.field}><label>Term ends</label><input required type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })}/></div>
          <div className={styles.field}><label>Teaching weeks</label><input required type="number" min={1} max={30} value={form.teachingWeeks} onChange={(event) => setForm({ ...form, teachingWeeks: Number(event.target.value) })}/></div>
          <div className={styles.formActions}><button className={styles.primary} disabled={busy} type="submit">{busy ? "Saving…" : "Save academic term"}</button><button className={styles.secondary} disabled={busy} type="button" onClick={() => setEditor(null)}>Cancel</button></div>
        </form>
      </section> : null}
    </div>
  </AppShell>;
}
