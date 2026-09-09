"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Dialog } from "@/components/ui/Dialog";
import "@/app/school/module-workspace.css";

type Assignment = { classId: string; subjectId: string; class: { name: string; level: string | null }; subject: { name: string } };
type Term = { id: string; name: string; academicYear: { name: string } | null };
type HomeworkRow = { id: string; classId: string; className: string; subjectId: string; subjectName: string; termName: string | null; title: string; instructions: string; dueDate: string; points: number | null; assignmentStatus: string; reviewStatus: string; academicWorkId: string | null };
type HomeworkResponse = { rows: HomeworkRow[]; assignments: Assignment[]; terms: Term[]; manage: boolean };

export default function TeacherHomeworkPage() {
  const [data, setData] = useState<HomeworkResponse | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function load() {
    setError("");
    const response = await fetch("/api/school/homework", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "Unable to load homework."); return; }
    setData(result);
  }

  useEffect(() => { void load(); }, []);
  const chosen = useMemo(() => data?.assignments.find((item) => `${item.classId}:${item.subjectId}` === selectedAssignment), [data, selectedAssignment]);

  async function createHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    if (!chosen) { setError("Choose one of your assigned class and subject combinations first."); return; }
    const response = await fetch("/api/school/homework", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ classId: chosen.classId, subjectId: chosen.subjectId, termId: String(form.get("termId") || ""), title: String(form.get("title") || ""), instructions: String(form.get("instructions") || ""), dueDate: String(form.get("dueDate") || ""), points: Number(form.get("points")), assignmentStatus: "draft" }) });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "Homework could not be created."); return; }
    setMessage("Homework draft saved. Publish it when learners should receive it.");
    event.currentTarget.reset(); setSelectedAssignment(""); setCreateOpen(false); await load();
  }

  async function changeDelivery(id: string, assignmentStatus: "assigned" | "closed") {
    setBusyId(id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/school/homework", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, assignmentStatus }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Homework status could not be changed.");
      setMessage(assignmentStatus === "assigned" ? "Homework published to learners." : "Homework closed. Existing submission history remains available.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Homework status could not be changed."); }
    finally { setBusyId(""); }
  }

  return (
    <AppShell universe="teacher" title="My Homework" subtitle="Create and manage learner work." active="My Homework">
      <main className="module-workspace">
        <section className="module-setup-card module-card"><div><span className="module-overline">My teaching work</span><h3>Homework</h3><p>Draft, publish and close work for your assigned classes.</p></div><div className="module-actions">{data?.manage ? <button type="button" className="button primary" onClick={() => setCreateOpen(true)}>+ New homework</button> : null}<Link href="/school/teacher-academic" className="button secondary">Advanced activities</Link></div></section>
        {error ? <div className="module-notice" role="alert">{error}</div> : null}
        {message ? <div className="module-notice" role="status">{message}</div> : null}
        {!data ? <div className="module-card">Loading homework…</div> : <>
          <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New homework" description="Choose your class, subject and term. Save as draft first." size="md">
            <form className="grid gap-4" onSubmit={createHomework}>
              <label className="grid gap-1 text-sm font-semibold">Class & subject<select className="rounded-xl border px-3 py-2 font-normal" value={selectedAssignment} onChange={(event) => setSelectedAssignment(event.target.value)} required><option value="">Choose assignment</option>{data.assignments.map((assignment) => <option key={`${assignment.classId}:${assignment.subjectId}`} value={`${assignment.classId}:${assignment.subjectId}`}>{assignment.class.level ? `${assignment.class.level} · ` : ""}{assignment.class.name} · {assignment.subject.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Term<select name="termId" className="rounded-xl border px-3 py-2 font-normal" required><option value="">Choose term</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.academicYear?.name ? `${term.academicYear.name} · ` : ""}{term.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Title<input name="title" className="rounded-xl border px-3 py-2 font-normal" minLength={3} maxLength={160} required placeholder="e.g. Fractions practice" /></label>
              <label className="grid gap-1 text-sm font-semibold">Instructions<textarea name="instructions" className="min-h-28 rounded-xl border px-3 py-2 font-normal" minLength={5} maxLength={12000} required placeholder="What should learners complete?" /></label>
              <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Due date<input name="dueDate" type="date" className="rounded-xl border px-3 py-2 font-normal" required /></label><label className="grid gap-1 text-sm font-semibold">Points<input name="points" type="number" min="1" max="10000" step="0.01" className="rounded-xl border px-3 py-2 font-normal" required /></label></div>
              <div className="flex justify-end gap-3"><button type="button" className="button secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button className="button primary">Save draft</button></div>
            </form>
          </Dialog>

          <section className="module-card"><div className="module-section-title"><div><span>Assignments</span><h3>{data.rows.length} homework item{data.rows.length === 1 ? "" : "s"}</h3></div><Link className="module-button secondary" href="/school/homework">Full review workspace</Link></div>
            {data.rows.length ? <div className="module-list">{data.rows.map((row) => <article key={row.id} className="module-list-row"><span className="module-list-no">{row.assignmentStatus === "assigned" ? "✓" : row.assignmentStatus === "closed" ? "×" : "•"}</span><div style={{flex:1,minWidth:0}}><b>{row.title}</b><span>{row.className} · {row.subjectName}{row.termName ? ` · ${row.termName}` : ""} · Due {new Date(row.dueDate).toLocaleDateString()}</span><span>{row.points != null ? `${row.points} points · ` : ""}{row.reviewStatus} · {row.academicWorkId ? "Learner delivery linked" : "Review-only"}</span></div>{data.manage ? <div className="module-actions">{row.assignmentStatus === "draft" ? <button type="button" className="module-button secondary" disabled={busyId === row.id} onClick={() => void changeDelivery(row.id, "assigned")}>{busyId === row.id ? "Publishing…" : "Publish"}</button> : null}{row.assignmentStatus === "assigned" ? <button type="button" className="module-button secondary" disabled={busyId === row.id} onClick={() => void changeDelivery(row.id, "closed")}>{busyId === row.id ? "Closing…" : "Close"}</button> : null}</div> : null}</article>)}</div> : <div className="module-empty"><strong>No homework yet.</strong><span>Create a draft for one of your assigned classes.</span></div>}
          </section>
        </>}
      </main>
    </AppShell>
  );
}