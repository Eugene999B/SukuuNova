"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type SearchSchool = {
  schoolId: string;
  school?: { name: string; uniqueCode: string } | null;
  students: Array<{ id: string; name: string; admissionNo: string; status: string }>;
  users: Array<{ id: string; name: string; email: string | null; phone: string | null; status: string }>;
};

export default function PlatformSearchWorkspace() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchSchool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const response = await fetch("/api/platform/phase4", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "search", q }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Search failed.");
      setResults(Array.isArray(payload.results) ? payload.results : []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell universe="platform" title="Global Search" subtitle="Search the schools you are authorised to support. Results stay limited to your platform-worker scope." active="Global Search">
      <main className="mx-auto max-w-6xl px-6 py-8">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest">Platform operations</span>
              <h2 className="mt-1 text-2xl font-bold">Find a school, student or staff member</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">Search by school, student name or admission number, or staff name, email or phone. Access is enforced again by the platform API.</p>
            </div>
            <Link href="/platform/schools" className="rounded-xl border px-4 py-2 text-sm font-semibold">Back to schools</Link>
          </div>
          <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void search(); }}>
            <input aria-label="Search schools, students or staff" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-12 flex-1 rounded-xl border px-4" placeholder="e.g. Ama Mensah or STU-2026-014" />
            <button type="submit" disabled={loading || !query.trim()} className="min-h-12 rounded-xl bg-slate-900 px-6 font-semibold text-white disabled:opacity-50">{loading ? "Searching…" : "Search →"}</button>
          </form>
        </section>

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div> : null}
        {searched && !loading && !error && results.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed p-8 text-center text-slate-600">No matches were found in the schools within your platform scope.</div> : null}
        <div className="mt-6 grid gap-5">
          {results.map((school) => (
            <section className="rounded-2xl border bg-white p-6 shadow-sm" key={school.schoolId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><span className="text-xs font-bold uppercase tracking-widest">School</span><h3 className="mt-1 text-xl font-bold">{school.school?.name ?? "Unknown school"}</h3><p className="text-sm text-slate-500">{school.school?.uniqueCode ?? school.schoolId}</p></div>
                <span className="rounded-full border px-3 py-1 text-xs font-semibold">{school.students.length + school.users.length} matches</span>
              </div>
              {school.students.length ? <div className="mt-5"><h4 className="text-sm font-bold">Students</h4><div className="mt-2 divide-y rounded-xl border">{school.students.map((student) => <div className="grid gap-1 p-3 sm:grid-cols-[1fr_auto]" key={student.id}><div><strong>{student.name}</strong><p className="text-xs text-slate-500">Admission No: {student.admissionNo}</p></div><span className="text-xs text-slate-500">{student.status}</span></div>)}</div></div> : null}
              {school.users.length ? <div className="mt-5"><h4 className="text-sm font-bold">Staff / users</h4><div className="mt-2 divide-y rounded-xl border">{school.users.map((user) => <div className="grid gap-1 p-3 sm:grid-cols-[1fr_auto]" key={user.id}><div><strong>{user.name}</strong><p className="text-xs text-slate-500">{user.email ?? user.phone ?? "No contact"}</p></div><span className="text-xs text-slate-500">{user.status}</span></div>)}</div></div> : null}
            </section>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
