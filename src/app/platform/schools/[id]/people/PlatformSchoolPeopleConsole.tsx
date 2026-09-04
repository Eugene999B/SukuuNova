"use client";

import { useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, UserRound } from "lucide-react";

type Person = { id: string; name: string; email: string | null; phone: string | null; status: string; role: string };

export default function PlatformSchoolPeopleConsole({ schoolId, people, canImpersonate }: { schoolId: string; people: Person[]; canImpersonate: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => [person.name, person.email ?? "", person.phone ?? "", person.role, person.status].some((value) => value.toLowerCase().includes(needle)));
  }, [people, query]);

  async function startImpersonation() {
    if (!selected || selected.status !== "active" || reason.trim().length < 5) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/platform/phase4", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "impersonate", schoolId, userId: selected.id, reason: reason.trim() }) });
      const payload = await response.json() as { message?: string; error?: string; result?: { userName: string }; expiresInSeconds?: number };
      if (!response.ok) { setMessage(payload.message ?? payload.error ?? "Unable to start support session."); return; }
      window.location.href = "/school/students";
    } catch {
      setMessage("Unable to start support session.");
    } finally { setBusy(false); }
  }

  return <div className="school-people-console">
    <section className="app-card app-panel">
      <div className="app-card-head"><div><span className="app-eyebrow">PEOPLE & ACCESS</span><h2>School user directory</h2><p>Inspect active staff and school operators before entering a scoped support session. No credentials are exposed.</p></div><UserRound size={21}/></div>
      <div className="people-toolbar"><label><span className="sr-only">Search school people</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone or role"/></label><span className="app-pill">{filtered.length.toLocaleString()} visible</span></div>
      <div className="people-table">{filtered.map((person) => <button type="button" key={person.id} className={`people-row ${selected?.id === person.id ? "is-selected" : ""}`} onClick={() => { setSelected(person); setReason(""); setMessage(""); }}><span className="people-avatar">{person.name.trim().slice(0,2).toUpperCase()}</span><span className="people-primary"><strong>{person.name}</strong><small>{person.email ?? person.phone ?? "No contact on file"}</small></span><span className="people-role">{person.role}</span><span className={`people-status people-status-${person.status}`}>{person.status}</span><ExternalLink size={15} aria-hidden="true"/></button>)}{filtered.length === 0 ? <div className="platform-empty"><strong>No school users match this search.</strong><span>Try the full name, email, phone or school role.</span></div> : null}</div>
    </section>

    <aside className="app-card app-panel people-support-panel">
      <div className="app-card-head"><div><span className="app-eyebrow">CONTROLLED SUPPORT</span><h2>{selected ? selected.name : "Select a person"}</h2><p>{selected ? `${selected.role} · ${selected.status}` : "Choose a school user to inspect support-session options."}</p></div><ShieldCheck size={20}/></div>
      {selected ? <>
        <div className="people-detail-grid"><div><span>Email</span><strong>{selected.email ?? "—"}</strong></div><div><span>Phone</span><strong>{selected.phone ?? "—"}</strong></div><div><span>Status</span><strong>{selected.status}</strong></div><div><span>User ID</span><strong>{selected.id}</strong></div></div>
        {canImpersonate && selected.status === "active" ? <div className="people-impersonation"><div><span className="app-eyebrow">BREAK-GLASS ACCESS</span><h3>Enter this user’s school workspace</h3><p>The support session is reason-gated, time-limited, visibly marked to the school and written to both platform and school audit logs.</p></div><label><span>Support reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} placeholder="Example: Reproduce a reported grading workflow issue for the school administrator."/></label><button type="button" className="app-action" disabled={busy || reason.trim().length < 5} onClick={() => void startImpersonation()}><ExternalLink size={14}/><strong>{busy ? "Starting support session…" : "Enter school workspace"}</strong></button></div> : <div className="platform-empty"><strong>{selected.status !== "active" ? "Inactive user cannot be entered." : "This operator does not have impersonation permission."}</strong><span>Use ordinary platform inspection and audit workflows instead.</span></div>}
      </> : <div className="platform-empty large"><strong>No user selected.</strong><span>The People directory gives platform operators a safe bridge from School 360 into tenant-scoped support.</span></div>}
      {message ? <div className="app-banner" role="status"><div><h3>{message}</h3><p>Support access was not started.</p></div></div> : null}
    </aside>
  </div>;
}
