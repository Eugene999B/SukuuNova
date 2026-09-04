"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, School as SchoolIcon, UserRound, UsersRound } from "lucide-react";
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
    setLoading(true); setError(""); setSearched(true);
    try {
      const response = await fetch("/api/platform/phase4", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"search", q }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Search failed.");
      setResults(Array.isArray(payload.results) ? payload.results : []);
    } catch (err) { setResults([]); setError(err instanceof Error ? err.message : "Search failed."); }
    finally { setLoading(false); }
  }

  return <AppShell universe="platform" active="Global Search" title="Global Search" subtitle="Find the school, student or staff member first. Every result remains restricted to your authorised platform scope.">
    <div className="app-dashboard-grid">
      <section className="app-card app-panel" style={{gridColumn:"1/-1"}}>
        <div className="app-card-head"><div><span className="app-eyebrow">FIND · INVESTIGATE · VERIFY</span><h2>Search the network</h2><p>Search school names or codes, student names or admission numbers, and staff names, email addresses or phone numbers. Access is enforced again by the platform API.</p></div><Link href="/platform/schools" className="app-pill">Browse schools</Link></div>
        <form onSubmit={event=>{event.preventDefault();void search()}} style={{display:"flex",gap:10,alignItems:"stretch",marginTop:16}}>
          <div style={{position:"relative",flex:1}}><Search size={17} aria-hidden="true" style={{position:"absolute",left:14,top:15,color:"#64748b"}}/><input aria-label="Search schools, students or staff" value={query} onChange={event=>setQuery(event.target.value)} style={{width:"100%",paddingLeft:42}} placeholder="e.g. Accra Academy, STU-2026-014, Ama Mensah" autoComplete="off" /></div>
          <button type="submit" disabled={loading||!query.trim()} className="app-action"><strong>{loading?"Searching…":"Search"}</strong>Network-wide lookup</button>
        </form>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}><span className="app-pill"><SchoolIcon size={13}/> Schools</span><span className="app-pill"><UsersRound size={13}/> Students</span><span className="app-pill"><UserRound size={13}/> Staff</span><span className="app-pill">Scope enforced server-side</span></div>
      </section>

      {error&&<div className="app-banner" style={{gridColumn:"1/-1"}}><div><h3>{error}</h3><p>Check the search term or your platform access.</p></div></div>}
      {searched&&!loading&&!error&&!results.length&&<div className="app-empty" style={{gridColumn:"1/-1"}}><b>No matches found</b><span>No result was returned within the schools available to your worker account.</span></div>}
      {results.map(school=><section key={school.schoolId} className="app-card app-panel">
        <div className="app-card-head"><div><span className="app-eyebrow">SCHOOL</span><h3>{school.school?.name??"Unknown school"}</h3><p>{school.school?.uniqueCode??school.schoolId}</p></div><Link href={`/platform/schools/${school.schoolId}`} className="app-pill">Open School 360 <ArrowRight size={13}/></Link></div>
        <div className="platform-search-counts"><span><strong>{school.students.length}</strong> students</span><span><strong>{school.users.length}</strong> staff</span></div>
        {school.students.length>0&&<div className="platform-search-group"><div className="platform-search-group-title">Students</div>{school.students.slice(0,8).map(student=><div className="app-list-row" key={student.id}><div><b>{student.name}</b><span>{student.admissionNo}</span></div><span className="app-pill">{student.status}</span></div>)}</div>}
        {school.users.length>0&&<div className="platform-search-group"><div className="platform-search-group-title">Staff / users</div>{school.users.slice(0,8).map(user=><div className="app-list-row" key={user.id}><div><b>{user.name}</b><span>{user.email??user.phone??"No contact"}</span></div><span className="app-pill">{user.status}</span></div>)}</div>}
      </section>)}
    </div>
  </AppShell>;
}
