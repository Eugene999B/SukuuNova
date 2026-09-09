"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Dialog } from "@/components/ui/Dialog";

type Assignment = { classId: string; subjectId: string; class: { name: string; level: string | null }; subject: { name: string } };
type Term = { id: string; name: string; academicYear: { name: string } | null };
type HomeworkRow = {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  termName: string | null;
  title: string;
  instructions: string;
  dueDate: string;
  points: number | null;
  assignmentStatus: string;
  reviewStatus: string;
  academicWorkId: string | null;
};
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
    const response = await fetch("/api/school/homework", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: chosen.classId,
        subjectId: chosen.subjectId,
        termId: String(form.get("termId") || ""),
        title: String(form.get("title") || ""),
        instructions: String(form.get("instructions") || ""),
        dueDate: String(form.get("dueDate") || ""),
        points: Number(form.get("points")),
        assignmentStatus: "draft",
      }),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "Homework could not be created."); return; }
    setMessage("Homework draft saved with learner delivery ready. Assign it when you are ready for learners to respond.");
    event.currentTarget.reset();
    setSelectedAssignment("");
    setCreateOpen(false);
    await load();
  }

  async function changeDelivery(id: string, assignmentStatus: "assigned" | "closed") {
    setBusyId(id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/school/homework", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, assignmentStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Homework status could not be changed.");
      setMessage(assignmentStatus === "assigned" ? "Homework is now published to the linked learner academic flow." : "Homework is closed. Existing history is preserved, but new learner access is stopped.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Homework status could not be changed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <AppShell universe="teacher" title="My Homework" subtitle="Create, publish and close learner work from one connected workflow." active="My Homework">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest">Teacher · Homework</span>
            <h1 className="mt-1 text-3xl font-bold">Homework with real learner delivery</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">New term-based homework is linked to SukuuNova&apos;s academic submission engine. Draft first, then publish to learners; marks and reviews stay connected to the canonical gradebook.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/teacher" className="rounded-xl border px-4 py-2 font-semibold">Teacher home →</Link>
            <Link href="/school/teacher-academic" className="rounded-xl border px-4 py-2 font-semibold">Advanced activity studio →</Link>
            {data?.manage ? <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white" onClick={() => setCreateOpen(true)}>+ New homework</button> : null}
          </div>
        </div>
        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{error}</div> : null}
        {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800" role="status">{message}</div> : null}
        {!data ? <div className="rounded-2xl border p-6">Loading your homework workspace…</div> : <>
          <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New connected homework" description="A term and points are required so the draft can become a real learner submission activity." size="md">
            <form className="grid gap-4" onSubmit={createHomework}>
              <label className="grid gap-1 text-sm font-semibold">Class & subject<select className="rounded-xl border px-3 py-2 font-normal" value={selectedAssignment} onChange={(e) => setSelectedAssignment(e.target.value)} required><option value="">Choose assignment</option>{data.assignments.map((assignment) => <option key={`${assignment.classId}:${assignment.subjectId}`} value={`${assignment.classId}:${assignment.subjectId}`}>{assignment.class.level ? `${assignment.class.level} · ` : ""}{assignment.class.name} · {assignment.subject.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Term<select name="termId" className="rounded-xl border px-3 py-2 font-normal" required><option value="">Choose term</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.academicYear?.name ? `${term.academicYear.name} · ` : ""}{term.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Title<input name="title" className="rounded-xl border px-3 py-2 font-normal" minLength={3} maxLength={160} required placeholder="e.g. Fractions practice" /></label>
              <label className="grid gap-1 text-sm font-semibold">Instructions<textarea name="instructions" className="min-h-32 rounded-xl border px-3 py-2 font-normal" minLength={5} maxLength={12000} required placeholder="Explain what learners should complete." /></label>
              <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Due date<input name="dueDate" type="date" className="rounded-xl border px-3 py-2 font-normal" required /></label><label className="grid gap-1 text-sm font-semibold">Points<input name="points" type="number" min="1" max="10000" step="0.01" className="rounded-xl border px-3 py-2 font-normal" required placeholder="10" /></label></div>
              <p className="text-xs text-slate-500">SukuuNova creates a linked written-response activity from this draft. Use Advanced Activity Studio when you need multiple questions, automatic marking or richer assessment design.</p>
              <div className="flex justify-end gap-3"><button type="button" className="rounded-xl border px-4 py-3 font-semibold" onClick={() => setCreateOpen(false)}>Cancel</button><button className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">Save connected draft →</button></div>
            </form>
          </Dialog>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-widest">My assignments</span><h2 className="mt-1 text-xl font-bold">Homework already created</h2></div><Link href="/school/homework" className="text-sm font-semibold underline">Open full review workspace</Link></div>
            <div className="mt-5 grid gap-3">
              {data.rows.map((row) => <article key={row.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><strong>{row.title}</strong><p className="text-sm text-slate-600">{row.className} · {row.subjectName}{row.termName ? ` · ${row.termName}` : ""}</p></div>
                  <div className="flex flex-wrap gap-2"><span className="rounded-full border px-2 py-1 text-xs font-semibold">{row.assignmentStatus}</span><span className="rounded-full border px-2 py-1 text-xs font-semibold">{row.academicWorkId ? "Learner delivery linked" : "Legacy review-only"}</span></div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{row.instructions}</p>
                <small className="mt-3 block text-slate-500">Due {new Date(row.dueDate).toLocaleDateString()} · Review: {row.reviewStatus}{row.points != null ? ` · ${row.points} points` : ""}</small>
                {data.manage ? <div className="mt-4 flex flex-wrap gap-2">
                  {row.assignmentStatus === "draft" ? <button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold" disabled={busyId === row.id} onClick={() => void changeDelivery(row.id, "assigned")}>{busyId === row.id ? "Publishing…" : "Assign to learners"}</button> : null}
                  {row.assignmentStatus === "assigned" ? <button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold" disabled={busyId === row.id} onClick={() => void changeDelivery(row.id, "closed")}>{busyId === row.id ? "Closing…" : "Close homework"}</button> : null}
                  {!row.academicWorkId && row.assignmentStatus === "draft" ? <span className="self-center text-xs text-slate-500">Older/unscored drafts need a term and points in the full homework editor before they can be assigned.</span> : null}
                </div> : null}
              </article>)}
              {data.rows.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-sm text-slate-600"><strong>No homework yet.</strong><p className="mt-1">Choose one of your assigned class-subjects and create your first connected draft.</p></div> : null}
            </div>
          </section>
        </>}
      </main>
    </AppShell>
  );
}
