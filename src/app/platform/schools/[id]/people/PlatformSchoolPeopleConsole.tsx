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
      const payload = await response.json() as { message?: string; error?: string };
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
    <style jsx global>{`
      .school-people-console{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:16px;margin-top:18px;align-items:start}
      .school-people-console section,.people-support-panel{min-width:0}
      .people-toolbar{display:flex;gap:10px;align-items:center;padding:0 22px 14px}
      .people-toolbar label{display:block;flex:1}.people-toolbar input{width:100%;min-height:42px;border:1px solid var(--sn-line);border-radius:11px;padding:9px 11px;font:inherit;font-size:12px;color:var(--sn-ink);background:#fff;outline:none}.people-toolbar input:focus{border-color:#9bbbd8;box-shadow:0 0 0 3px rgba(68,120,166,.1)}
      .people-table{border-top:1px solid var(--sn-line)}
      .people-row{display:grid;grid-template-columns:36px minmax(0,1fr) minmax(100px,.5fr) auto 16px;gap:11px;align-items:center;width:100%;padding:13px 22px;border:0;border-bottom:1px solid var(--sn-line);background:#fff;text-align:left;cursor:pointer;color:var(--sn-ink)}
      .people-row:hover{background:#fafcfe}.people-row.is-selected{background:#eff5fa;box-shadow:inset 3px 0 0 #547e9f}.people-avatar{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#eef4f8;color:#54708a;font-weight:900;font-size:10px}.people-primary{min-width:0;display:grid;gap:3px}.people-primary strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.people-primary small,.people-role{font-size:10px;color:var(--sn-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.people-status{padding:4px 8px;border-radius:999px;font-size:9px;font-weight:900;text-transform:capitalize;background:#f1f4f7;color:#657382}.people-status-active{background:#edf7f2;color:#167047}.people-status-suspended,.people-status-inactive{background:#fff5e8;color:#8c5a14}
      .people-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 18px}.people-detail-grid>div{display:grid;gap:4px;padding:11px 12px;border:1px solid var(--sn-line);border-radius:11px;background:#f8fafc;min-width:0}.people-detail-grid span{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:var(--sn-muted);font-weight:900}.people-detail-grid strong{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .people-impersonation{display:grid;gap:12px;padding:15px;border:1px solid #edd7a0;border-radius:13px;background:#fffaf0}.people-impersonation h3{margin:4px 0;font-size:13px}.people-impersonation p{margin:0;font-size:10px;line-height:1.5;color:var(--sn-muted)}.people-impersonation label{display:grid;gap:6px;font-size:9px;font-weight:900;color:#506174}.people-impersonation textarea{min-height:92px;resize:vertical;border:1px solid #e1d7c2;border-radius:10px;padding:10px;font:inherit;font-size:11px;outline:none;background:#fff}.people-impersonation textarea:focus{border-color:#c9ae70;box-shadow:0 0 0 3px rgba(194,161,90,.1)}
      @media(max-width:900px){.school-people-console{grid-template-columns:1fr}.people-row{grid-template-columns:36px minmax(0,1fr) auto 16px}.people-role{display:none}}
      @media(max-width:600px){.people-toolbar{padding:0 17px 14px}.people-row{padding:12px 17px}.people-detail-grid{grid-template-columns:1fr}.people-support-panel{padding:17px!important}}
    `}</style>
  </div>;
}