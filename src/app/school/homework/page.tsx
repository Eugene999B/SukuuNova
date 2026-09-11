"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import "./homework-workspace.css";

type Assignment = { classId: string; subjectId: string; class: { name: string; level: string | null }; subject: { name: string } };
type Row = { id: string; updatedAt: string; termId: string | null; teacherId: string; classId: string; subjectId: string; teacherName: string; className: string; subjectName: string; termName: string | null; title: string; instructions: string; dueDate: string; points: number | null; assignmentStatus: string; reviewStatus: string; reviewNote: string | null };
type Term = { id: string; name: string; academicYear: { name: string } };
type Data = { rows: Row[]; assignments: Assignment[]; terms: Term[]; review: boolean; manage: boolean; me: string };
type FormState = { classId: string; subjectId: string; termId: string; title: string; instructions: string; dueDate: string; points: string; assignmentStatus: "draft" | "assigned" };

const initialForm = (): FormState => ({
  classId: "",
  subjectId: "",
  termId: "",
  title: "",
  instructions: "",
  dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  points: "",
  assignmentStatus: "draft",
});

export default function HomeworkPage() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);

  const load = () => fetch("/api/school/homework")
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || body.error || "Unable to load homework.");
      return body as Data;
    })
    .then(setData)
    .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load homework."));

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    if (tab === "all") return rows;
    return rows.filter((row) => row.assignmentStatus === tab);
  }, [data, tab]);

  const counts = {
    all: data?.rows.length ?? 0,
    draft: data?.rows.filter((row) => row.assignmentStatus === "draft").length ?? 0,
    assigned: data?.rows.filter((row) => row.assignmentStatus === "assigned").length ?? 0,
    closed: data?.rows.filter((row) => row.assignmentStatus === "closed").length ?? 0,
  };

  async function save(nextForm: FormState = form) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/school/homework", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...nextForm,
          termId: nextForm.termId || undefined,
          points: nextForm.points ? Number(nextForm.points) : undefined,
          ...(editing ? { id: editing.id, expectedUpdatedAt: editing.updatedAt } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || body.error || "Could not save homework.");
      setMessage(nextForm.assignmentStatus === "assigned"
        ? "Homework assigned directly to the selected class. No leadership approval is required."
        : "Homework saved as a private draft.");
      setOpen(false);
      setEditing(null);
      setForm({ ...nextForm, title: "", instructions: "", assignmentStatus: "draft" });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save homework.");
    } finally {
      setSaving(false);
    }
  }

  function edit(row: Row) {
    setEditing(row);
    setForm({
      classId: row.classId,
      subjectId: row.subjectId,
      termId: row.termId ?? "",
      title: row.title,
      instructions: row.instructions,
      dueDate: row.dueDate.slice(0, 10),
      points: row.points == null ? "" : String(row.points),
      assignmentStatus: "draft",
    });
    setOpen(true);
  }

  return (
    <AppShell universe="school" title="Homework & Exercises" subtitle="Create, assign and monitor learner work." active="Homework & Exercises">
      <div className="homework-shell">
        <section className="homework-hero">
          <div>
            <span className="homework-kicker">CLASSROOM WORK</span>
            <h2>{data?.manage ? "Create purposeful work and send it directly to learners" : "Monitor homework already released by teachers"}</h2>
            <p>Assigned teachers control their homework. Saving as Assigned releases the work to the selected class immediately; leadership approval is not a publishing requirement.</p>
          </div>
          {data?.manage ? <button className="homework-primary" onClick={() => { setEditing(null); setForm(initialForm()); setOpen(true); }}>＋ New exercise</button> : null}
        </section>

        <section className="homework-kpis">
          <article><span>Total</span><strong>{counts.all}</strong><small>Visible homework</small></article>
          <article><span>Drafts</span><strong>{counts.draft}</strong><small>Teacher working copies</small></article>
          <article><span>Assigned</span><strong>{counts.assigned}</strong><small>Already released to learners</small></article>
          <article><span>Teacher authority</span><strong>Direct</strong><small>No leadership approval gate</small></article>
        </section>

        <section className="homework-card">
          <div className="homework-tabs">
            <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All <b>{counts.all}</b></button>
            <button className={tab === "draft" ? "active" : ""} onClick={() => setTab("draft")}>Draft <b>{counts.draft}</b></button>
            <button className={tab === "assigned" ? "active" : ""} onClick={() => setTab("assigned")}>Assigned <b>{counts.assigned}</b></button>
            <button className={tab === "closed" ? "active" : ""} onClick={() => setTab("closed")}>Closed <b>{counts.closed}</b></button>
          </div>
          <div className="homework-list">
            {filtered.length === 0 ? <div className="homework-empty"><h3>No homework in this view</h3></div> : filtered.map((row) => (
              <article className="homework-row" key={row.id}>
                <div>
                  <span>{row.className} · {row.subjectName}</span>
                  <h3>{row.title}</h3>
                  <p>{row.instructions}</p>
                  <small>{row.teacherName} · due {new Date(row.dueDate).toLocaleDateString("en-GB")}{row.points != null ? ` · ${row.points} points` : ""}</small>
                </div>
                <div className="homework-side">
                  <span className={`homework-status ${row.assignmentStatus}`}>{row.assignmentStatus}</span>
                  {row.reviewNote ? <p><strong>Leadership note:</strong> {row.reviewNote}</p> : null}
                  {data?.manage && row.teacherId === data.me && row.assignmentStatus === "draft" ? <button className="homework-secondary" onClick={() => edit(row)} disabled={saving}>Edit draft</button> : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="homework-card homework-chain">
          <div><span className="homework-kicker">CONNECTED ACADEMIC FLOW</span><h3>Lesson plan → exercise → learner work → gradebook</h3><p>A lesson-plan review never blocks a teacher from assigning homework to an authorised class.</p></div>
          <div className="homework-links">
            <Link href="/school/lessons">Lessons & planning <span>→</span></Link>
            <Link href="/school/gradebook/studio">Gradebook Studio <span>→</span></Link>
            <Link href="/school/academics/performance">Performance Studio <span>→</span></Link>
            <Link href="/school/report-cards">Report cards <span>→</span></Link>
          </div>
        </section>

        {open ? <div className="homework-modal-backdrop">
          <section className="homework-modal">
            <div className="homework-modal-head">
              <div><span className="homework-kicker">{editing ? "EDIT EXERCISE" : "NEW EXERCISE"}</span><h3>Create work for an assigned class</h3><p>Choose Assign exercise when it is ready. That action sends the work directly to learners.</p></div>
              <button onClick={() => setOpen(false)} aria-label="Close editor" disabled={saving}>×</button>
            </div>
            <div className="homework-form-grid">
              <label>Class<select disabled={Boolean(editing)} value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value, subjectId: "" })}><option value="">Choose class…</option>{data?.assignments.filter((assignment, index, self) => self.findIndex((item) => item.classId === assignment.classId) === index).map((assignment) => <option key={assignment.classId} value={assignment.classId}>{assignment.class.level ? `${assignment.class.level} · ` : ""}{assignment.class.name}</option>)}</select></label>
              <label>Subject<select disabled={Boolean(editing)} value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })}><option value="">Choose subject…</option>{data?.assignments.filter((assignment) => !form.classId || assignment.classId === form.classId).map((assignment) => <option key={`${assignment.classId}:${assignment.subjectId}`} value={assignment.subjectId}>{assignment.subject.name}</option>)}</select></label>
              <label>Term<select disabled={Boolean(editing)} value={form.termId} onChange={(event) => setForm({ ...form, termId: event.target.value })}><option value="">No term</option>{data?.terms.map((term) => <option key={term.id} value={term.id}>{term.name} · {term.academicYear.name}</option>)}</select></label>
              <label>Due date<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}/></label>
              <label>Points<input type="number" min="1" max="10000" value={form.points} onChange={(event) => setForm({ ...form, points: event.target.value })} placeholder="Optional"/></label>
              <label className="wide">Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Practice set: equivalent fractions"/></label>
              <label className="wide">Instructions<textarea rows={8} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} placeholder="What learners should complete, submit or discuss…"/></label>
            </div>
            <div className="homework-modal-actions">
              <button className="homework-secondary" onClick={() => void save({ ...form, assignmentStatus: "draft" })} disabled={saving}>Save draft</button>
              <button className="homework-primary" onClick={() => void save({ ...form, assignmentStatus: "assigned" })} disabled={saving}>Assign directly to learners</button>
            </div>
          </section>
        </div> : null}

        {message ? <div className="homework-message">{message}</div> : null}
      </div>
    </AppShell>
  );
}
