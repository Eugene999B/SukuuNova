"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, School as SchoolIcon, Search, UserRound, UsersRound } from "lucide-react";

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
    } catch (reason) {
      setResults([]);
      setError(reason instanceof Error ? reason.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="platform-search-v3">
    <section className="platform-search-v3-hero">
      <div className="platform-search-v3-hero-head"><div><span className="platform-search-v3-eyebrow">Find · investigate · verify</span><h2>Search the school network from one place.</h2><p>Find a school, learner or school user across the tenants your Platform account is allowed to see, then jump directly into School 360 for the full operational context.</p></div><Link href="/platform/schools" className="platform-search-v3-browse">Browse all schools <ArrowRight size={14}/></Link></div>
      <form className="platform-search-v3-form" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <div className="platform-search-v3-input-wrap"><Search size={18} aria-hidden="true"/><input className="platform-search-v3-input" aria-label="Search schools, students or staff" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="School name, school code, admission number or person name" autoComplete="off"/></div>
        <button type="submit" disabled={loading || !query.trim()} className="platform-search-v3-submit">{loading ? "Searching network…" : "Search network"}<ArrowRight size={15}/></button>
      </form>
      <div className="platform-search-v3-scope"><span><SchoolIcon size={14}/> Schools</span><span><UsersRound size={14}/> Learners</span><span><UserRound size={14}/> School users</span><span>Platform school scope enforced server-side</span></div>
    </section>

    {error ? <div className="platform-search-v3-notice" role="alert">{error} Check the search term or your Platform access.</div> : null}
    {searched && !loading && !error && !results.length ? <div className="platform-search-v3-empty"><Search size={24}/><b>No matches found.</b><span>No result was returned inside the schools available to this Platform worker account.</span></div> : null}

    {results.length ? <div className="platform-search-v3-results">{results.map((school) => <section key={school.schoolId} className="platform-search-v3-school">
      <div className="platform-search-v3-school-head"><div><span className="platform-search-v3-eyebrow">School</span><h3>{school.school?.name ?? "Unknown school"}</h3><p>{school.school?.uniqueCode ?? school.schoolId}</p></div><Link href={`/platform/schools/${school.schoolId}`} className="platform-search-v3-open">Open School 360 <ArrowRight size={14}/></Link></div>
      <div className="platform-search-v3-counts"><span><strong>{school.students.length}</strong> learner matches</span><span><strong>{school.users.length}</strong> school-user matches</span></div>
      {school.students.length ? <div className="platform-search-v3-group"><div className="platform-search-v3-group-title">Learners</div>{school.students.slice(0, 8).map((student) => <div className="platform-search-v3-row" key={student.id}><div><b>{student.name}</b><span>{student.admissionNo}</span></div><span className="platform-search-v3-state">{student.status}</span></div>)}</div> : null}
      {school.users.length ? <div className="platform-search-v3-group"><div className="platform-search-v3-group-title">Staff / users</div>{school.users.slice(0, 8).map((user) => <div className="platform-search-v3-row" key={user.id}><div><b>{user.name}</b><span>{user.email ?? user.phone ?? "No contact"}</span></div><span className="platform-search-v3-state">{user.status}</span></div>)}</div> : null}
    </section>)}</div> : null}
  </div>;
}
