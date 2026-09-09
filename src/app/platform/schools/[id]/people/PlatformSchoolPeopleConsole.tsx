"use client";

import { useMemo, useState } from "react";
import { ExternalLink, KeyRound, LogOut, ShieldCheck, UserRound, UserRoundCheck, UserRoundX } from "lucide-react";
import PlatformWorkflowDialog from "@/components/PlatformWorkflowDialog";

type Person = { id: string; name: string; email: string | null; phone: string | null; status: string; role: string; needsPasswordChange: boolean; isGuardian: boolean };
type AccountAction = "signout" | "password" | "suspend" | "reactivate" | null;

export default function PlatformSchoolPeopleConsole({ schoolId, people, canImpersonate, canSecurity }: { schoolId: string; people: Person[]; canImpersonate: boolean; canSecurity: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accessOpen, setAccessOpen] = useState(false);
  const [accountAction, setAccountAction] = useState<AccountAction>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => [person.name, person.email ?? "", person.phone ?? "", person.role, person.status, person.isGuardian ? "guardian" : "staff"].some((value) => value.toLowerCase().includes(needle)));
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

  function openAccountAction(action: AccountAction) {
    setReason("");
    setMessage("");
    setAccountAction(action);
  }

  async function runAccountAction() {
    if (!selected || !accountAction || reason.trim().length < 8) return;
    setBusy(true); setMessage("");
    try {
      const payload = accountAction === "signout"
        ? { action: "force_user_signout", userId: selected.id, reason: reason.trim() }
        : accountAction === "password"
          ? { action: "require_password_change", userId: selected.id, reason: reason.trim() }
          : { action: "set_user_status", userId: selected.id, status: accountAction === "suspend" ? "suspended" : "active", reason: reason.trim() };
      const response = await fetch(`/api/platform/schools/${encodeURIComponent(schoolId)}/control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) { setMessage(data.message ?? data.error ?? "Unable to change this account."); return; }
      const success = accountAction === "signout" ? "Account sessions invalidated. The user must sign in again."
        : accountAction === "password" ? "Password change is now required at the user's next sign-in."
          : accountAction === "suspend" ? "Account suspended and active sessions ended."
            : "Account reactivated. The user can sign in again.";
      setMessage(success);
      setAccountAction(null);
      setReason("");
      window.setTimeout(() => window.location.reload(), 650);
    } catch {
      setMessage("Unable to change this account.");
    } finally { setBusy(false); }
  }

  const actionTitle = accountAction === "signout" ? "Force this account to sign in again"
    : accountAction === "password" ? "Require a password change"
      : accountAction === "suspend" ? "Suspend this school account"
        : "Reactivate this school account";
  const actionDescription = accountAction === "signout" ? "Existing school and guardian sessions for this user are invalidated without changing their password or roles."
    : accountAction === "password" ? "Existing sessions are ended and the account is marked to require a password change on the next sign-in."
      : accountAction === "suspend" ? "The account becomes unable to sign in and its active sessions and support access are ended."
        : "The account becomes active again. Existing revoked sessions remain invalid, so the user must sign in normally.";

  return <div className="school-people-console">
    <section className="app-card app-panel">
      <div className="app-card-head"><div><span className="app-eyebrow">PEOPLE & ACCESS</span><h2>School user directory</h2></div><UserRound size={21}/></div>
      <div className="people-toolbar"><label><span className="sr-only">Search school people</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, role or account type"/></label><span className="app-pill">{filtered.length.toLocaleString()} visible</span></div>
      <div className="people-table">{filtered.map((person) => <button type="button" key={person.id} className={`people-row ${selected?.id === person.id ? "is-selected" : ""}`} onClick={() => { setSelected(person); setReason(""); setMessage(""); }}><span className="people-avatar">{person.name.trim().slice(0,2).toUpperCase()}</span><span className="people-primary"><strong>{person.name}</strong><small>{person.email ?? person.phone ?? "No contact on file"}{person.needsPasswordChange ? " · password change pending" : ""}</small></span><span className="people-role">{person.role}</span><span className={`people-status people-status-${person.status}`}>{person.status}</span><ExternalLink size={15} aria-hidden="true"/></button>)}{filtered.length === 0 ? <div className="platform-empty"><strong>No school users match this search.</strong><span>Try the full name, email, phone, role or account type.</span></div> : null}</div>
    </section>

    <aside className="app-card app-panel people-support-panel">
      <div className="app-card-head"><div><span className="app-eyebrow">ACCOUNT CONTROL</span><h2>{selected ? selected.name : "Select a person"}</h2>{selected ? <p>{`${selected.role} · ${selected.status}`}</p> : null}</div><ShieldCheck size={20}/></div>
      {selected ? <>
        <div className="people-detail-grid"><div><span>Email</span><strong>{selected.email ?? "—"}</strong></div><div><span>Phone</span><strong>{selected.phone ?? "—"}</strong></div><div><span>Account type</span><strong>{selected.isGuardian ? "Guardian-linked" : "School/staff"}</strong></div><div><span>Password state</span><strong>{selected.needsPasswordChange ? "Change required" : "Normal"}</strong></div></div>
        {canSecurity ? <div className="people-control-stack">
          <button type="button" className="people-control-button" onClick={() => openAccountAction("signout")}><LogOut size={15}/><span><strong>Force sign-in again</strong><small>End this account's current sessions.</small></span></button>
          <button type="button" className="people-control-button" onClick={() => openAccountAction("password")}><KeyRound size={15}/><span><strong>Require password change</strong><small>Invalidate sessions and enforce the next-login security step.</small></span></button>
          {selected.status === "active" ? <button type="button" className="people-control-button is-danger" onClick={() => openAccountAction("suspend")}><UserRoundX size={15}/><span><strong>Suspend account</strong><small>Block login until a platform or school administrator reactivates it.</small></span></button> : <button type="button" className="people-control-button" onClick={() => openAccountAction("reactivate")}><UserRoundCheck size={15}/><span><strong>Reactivate account</strong><small>Restore normal login access.</small></span></button>}
        </div> : null}
        {canImpersonate && selected.status === "active" && !selected.isGuardian ? <><button type="button" className="app-action" onClick={() => { setReason(""); setAccessOpen(true); }}><ExternalLink size={14}/><strong>Enter school workspace</strong>Break-glass access</button><PlatformWorkflowDialog open={accessOpen} onClose={() => setAccessOpen(false)} eyebrow="BREAK-GLASS ACCESS" title={`Enter ${selected.name}’s workspace`} description="The session is reason-gated, time-limited, visibly marked to the school and written to both platform and school audit logs."><div className="people-impersonation"><label><span>Support reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} placeholder="Example: Reproduce a reported grading workflow issue for the school administrator."/></label><button type="button" className="app-action" disabled={busy || reason.trim().length < 5} onClick={() => void startImpersonation()}><ExternalLink size={14}/><strong>{busy ? "Starting support session…" : "Enter school workspace"}</strong></button></div></PlatformWorkflowDialog></> : null}
        {!canSecurity && !(canImpersonate && selected.status === "active" && !selected.isGuardian) ? <div className="platform-empty"><strong>No control permission assigned for this account.</strong><span>You can inspect its identity, role and state but cannot change it.</span></div> : null}
      </> : <div className="platform-empty large"><strong>No user selected.</strong><span>Choose any account to inspect its login state and available controls.</span></div>}
      {message ? <div className="app-banner" role="status"><div><h3>{message}</h3><p>Every platform account action is recorded in the audit trail.</p></div></div> : null}
    </aside>

    <PlatformWorkflowDialog open={Boolean(accountAction)} onClose={() => { setAccountAction(null); setReason(""); }} eyebrow="ACCOUNT SECURITY" title={actionTitle} description={actionDescription}><div className="people-impersonation"><label><span>Reason for this change</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} placeholder="Record why this account control action is necessary."/></label><button type="button" className={`app-action ${accountAction === "suspend" ? "is-danger" : ""}`} disabled={busy || reason.trim().length < 8} onClick={() => void runAccountAction()}><ShieldCheck size={14}/><strong>{busy ? "Applying…" : actionTitle}</strong></button></div></PlatformWorkflowDialog>

    <style jsx global>{`
      .school-people-console{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:16px;margin-top:18px;align-items:start}
      .school-people-console section,.people-support-panel{min-width:0}
      .people-toolbar{display:flex;gap:10px;align-items:center;padding:0 22px 14px}
      .people-toolbar label{display:block;flex:1}.people-toolbar input{width:100%;min-height:42px;border:1px solid var(--sn-line);border-radius:11px;padding:9px 11px;font:inherit;font-size:12px;color:var(--sn-ink);background:var(--sn-surface);outline:none}.people-toolbar input:focus{border-color:var(--sn-line);box-shadow:0 0 0 3px var(--sn-shadow-sm)}
      .people-table{border-top:1px solid var(--sn-line)}
      .people-row{display:grid;grid-template-columns:36px minmax(0,1fr) minmax(100px,.5fr) auto 16px;gap:11px;align-items:center;width:100%;padding:13px 22px;border:0;border-bottom:1px solid var(--sn-line);background:var(--sn-surface);text-align:left;cursor:pointer;color:var(--sn-ink)}
      .people-row:hover{background:var(--sn-surface)}.people-row.is-selected{background:var(--sn-surface);box-shadow:inset 3px 0 0 var(--sn-shadow-sm)}.people-avatar{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--sn-surface);color:var(--sn-ink);font-weight:900;font-size:10px}.people-primary{min-width:0;display:grid;gap:3px}.people-primary strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.people-primary small,.people-role{font-size:10px;color:var(--sn-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.people-status{padding:4px 8px;border-radius:999px;font-size:9px;font-weight:900;text-transform:capitalize;background:var(--sn-surface);color:var(--sn-ink)}.people-status-active{background:var(--color-success-soft);color:var(--color-success)}.people-status-suspended,.people-status-inactive{background:var(--color-warning-soft);color:var(--color-warning)}
      .people-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 14px}.people-detail-grid>div{display:grid;gap:4px;padding:11px 12px;border:1px solid var(--sn-line);border-radius:11px;background:var(--sn-surface);min-width:0}.people-detail-grid span{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:var(--sn-muted);font-weight:900}.people-detail-grid strong{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .people-control-stack{display:grid;gap:7px;margin-bottom:14px}.people-control-button{display:flex;align-items:flex-start;gap:10px;width:100%;padding:11px 12px;border:1px solid var(--sn-line);border-radius:11px;background:var(--sn-surface);color:var(--sn-ink);text-align:left;cursor:pointer}.people-control-button:hover{box-shadow:var(--sn-shadow-sm)}.people-control-button>span{display:grid;gap:3px}.people-control-button strong{font-size:10px}.people-control-button small{font-size:9px;line-height:1.4;color:var(--sn-muted)}.people-control-button.is-danger{border-color:var(--color-danger-border);background:var(--color-danger-soft);color:var(--color-danger)}
      .people-impersonation{display:grid;gap:12px;padding:15px;border:1px solid var(--sn-line);border-radius:13px;background:var(--color-warning-soft)}.people-impersonation h3{margin:4px 0;font-size:13px}.people-impersonation p{margin:0;font-size:10px;line-height:1.5;color:var(--sn-muted)}.people-impersonation label{display:grid;gap:6px;font-size:9px;font-weight:900;color:var(--sn-ink)}.people-impersonation textarea{min-height:92px;resize:vertical;border:1px solid var(--sn-line);border-radius:10px;padding:10px;font:inherit;font-size:11px;outline:none;background:var(--sn-surface)}.people-impersonation textarea:focus{border-color:var(--sn-line);box-shadow:0 0 0 3px var(--sn-shadow-sm)}
      @media(max-width:900px){.school-people-console{grid-template-columns:1fr}.people-row{grid-template-columns:36px minmax(0,1fr) auto 16px}.people-role{display:none}}
      @media(max-width:600px){.people-toolbar{padding:0 17px 14px}.people-row{padding:12px 17px}.people-detail-grid{grid-template-columns:1fr}.people-support-panel{padding:17px!important}}
    `}</style>
  </div>;
}
