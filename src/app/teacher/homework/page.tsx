"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Assignment = { classId: string; subjectId: string; class: { name: string; level: string | null }; subject: { name: string } };
type Term = { id: string; name: string; academicYear: { name: string } | null };
type HomeworkRow = { id: string; classId: string; className: string; subjectId: string; subjectName: string; termName: string | null; title: string; instructions: string; dueDate: string; points: number | null; assignmentStatus: string; reviewStatus: string };
type HomeworkResponse = { rows: HomeworkRow[]; assignments: Assignment[]; terms: Term[]; manage: boolean };

export default function TeacherHomeworkPage() {
  const [data, setData] = useState<HomeworkResponse | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState("");

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
    const response = await fetch("/api/school/homework", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: chosen.classId,
        subjectId: chosen.subjectId,
        termId: String(form.get("termId") || "") || undefined,
        title: String(form.get("title") || ""),
        instructions: String(form.get("instructions") || ""),
        dueDate: String(form.get("dueDate") || ""),
        points: String(form.get("points") || "") || undefined,
        assignmentStatus: "draft",
      }),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "Homework could not be created."); return; }
    setMessage("Homework saved as a draft.");
    event.currentTarget.reset();
    await load();
  }

  return <main className="mx-auto max-w-6xl px-6 py-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><span className="text-xs font-bold uppercase tracking-widest">Teacher · Homework</span><h1 className="mt-1 text-3xl font-bold">My homework</h1><p className="mt-2 max-w-3xl text-slate-600">Create and review homework only for the classes and subjects assigned to your teacher account.</p></div>
      <Link href="/teacher" className="rounded-xl border px-4 py-2 font-semibold">Teacher home →</Link>
    </div>
    {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{error}</div> : null}
    {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800" role="status">{message}</div> : null}
    {!data ? <div className="rounded-2xl border p-6">Loading your homework workspace…</div> : <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-2xl border bg-white p-6 shadow-sm"><span className="text-xs font-bold uppercase tracking-widest">Create assignment</span><h2 className="mt-1 text-xl font-bold">New homework</h2><p className="mt-1 text-sm text-slate-600">The API checks the class-subject assignment again on the server before saving.</p>
        <form className="mt-5 grid gap-4" onSubmit={createHomework}>
          <label className="grid gap-1 text-sm font-semibold">Class & subject<select className="rounded-xl border px-3 py-2 font-normal" value={selectedAssignment} onChange={(e) => setSelectedAssignment(e.target.value)} required><option value="">Choose assignment</option>{data.assignments.map((a) => <option key={`${a.classId}:${a.subjectId}`} value={`${a.classId}:${a.subjectId}`}>{a.class.level ? `${a.class.level} · ` : ""}{a.class.name} · {a.subject.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Term<select name="termId" className="rounded-xl border px-3 py-2 font-normal"><option value="">No term selected</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.academicYear?.name ? `${term.academicYear.name} · ` : ""}{term.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Title<input name="title" className="rounded-xl border px-3 py-2 font-normal" minLength={3} maxLength={160} required placeholder="e.g. Fractions practice" /></label>
          <label className="grid gap-1 text-sm font-semibold">Instructions<textarea name="instructions" className="min-h-32 rounded-xl border px-3 py-2 font-normal" minLength={5} maxLength={12000} required placeholder="Explain what learners should complete." /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Due date<input name="dueDate" type="date" className="rounded-xl border px-3 py-2 font-normal" required /></label><label className="grid gap-1 text-sm font-semibold">Points<input name="points" type="number" min="0" max="10000" step="0.01" className="rounded-xl border px-3 py-2 font-normal" placeholder="Optional" /></label></div>
          <button className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white" disabled={!data.manage}>Save draft →</button>
          {!data.manage ? <p className="text-sm text-slate-500">Your account can view homework but does not have the assigned-homework management permission.</p> : null}
        </form>
      </section>
      <section className="rounded-2xl border bg-white p-6 shadow-sm"><span className="text-xs font-bold uppercase tracking-widest">My assignments</span><h2 className="mt-1 text-xl font-bold">Homework already created</h2><div className="mt-5 grid gap-3">{data.rows.map((row) => <article key={row.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{row.title}</strong><p className="text-sm text-slate-600">{row.className} · {row.subjectName}{row.termName ? ` · ${row.termName}` : ""}</p></div><span className="rounded-full border px-2 py-1 text-xs font-semibold">{row.assignmentStatus}</span></div><p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{row.instructions}</p><small className="mt-3 block text-slate-500">Due {new Date(row.dueDate).toLocaleDateString()} · Review: {row.reviewStatus}{row.points != null ? ` · ${row.points} points` : ""}</small></article>)}{data.rows.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-sm text-slate-600"><strong>No homework yet.</strong><p className="mt-1">Choose one of your assigned class-subjects and create your first draft.</p></div> : null}</div></section>
    </div>}
  </main>;
}
