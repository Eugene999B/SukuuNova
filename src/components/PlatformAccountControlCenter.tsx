"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";

type SchoolOption = { id: string; name: string; uniqueCode: string | null; status: string };
type Account = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  needsPasswordChange: boolean;
  isGuardian: boolean;
  roles: string[];
};
type Snapshot = {
  school: { id: string; name: string; uniqueCode: string; status: string };
  accounts: { total: number; active: number; inactive: number; roleless: number; pendingPasswordChange: number; missingContact: number; leadership: number; guardians: number };
  users: Account[];
};
type SupportState = {
  userId: string;
  status: string;
  needsPasswordChange: boolean;
  roles: string[];
  isGuardian: boolean;
  hasRecoveryContact: boolean;
  loginLock: { locked: boolean; blockedUntil: string | null; failedAttempts: number };
};

type Props = { schools: SchoolOption[]; canSecurity: boolean; canSupport: boolean };

function contact(account: Account) {
  return account.email ?? account.phone ?? "No recovery contact";
}

export default function PlatformAccountControlCenter({ schools, canSecurity, canSupport }: Props) {
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? "");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [supportState, setSupportState] = useState<SupportState | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selected = snapshot?.users.find((user) => user.id === selectedUserId) ?? null;
  const roles = useMemo(() => [...new Set((snapshot?.users ?? []).flatMap((user) => user.roles))].sort(), [snapshot]);
  const visibleAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (snapshot?.users ?? []).filter((user) => {
      const matchesText = !needle || [user.name, user.email ?? "", user.phone ?? "", ...user.roles].join(" ").toLowerCase().includes(needle);
      const matchesRole = roleFilter === "all" || (roleFilter === "guardian" ? user.isGuardian : user.roles.includes(roleFilter));
      return matchesText && matchesRole;
    });
  }, [snapshot, query, roleFilter]);

  async function loadSchool(targetSchoolId = schoolId) {
    if (!targetSchoolId) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/schools/${encodeURIComponent(targetSchoolId)}/control`, { cache: "no-store" });
      const data = await response.json() as Snapshot & { message?: string; error?: string };
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Unable to load school accounts.");
      setSnapshot(data);
      setSelectedUserId((current) => data.users.some((user) => user.id === current) ? current : data.users[0]?.id ?? "");
    } catch (error) {
      setSnapshot(null);
      setSelectedUserId("");
      setMessage(error instanceof Error ? error.message : "Unable to load school accounts.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSupportState(targetUserId = selectedUserId) {
    if (!canSecurity || !schoolId || !targetUserId) { setSupportState(null); return; }
    try {
      const response = await fetch(`/api/platform/schools/${encodeURIComponent(schoolId)}/account-support?userId=${encodeURIComponent(targetUserId)}`, { cache: "no-store" });
      const data = await response.json() as SupportState & { message?: string; error?: string };
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Unable to inspect login security.");
      setSupportState(data);
    } catch {
      setSupportState(null);
    }
  }

  useEffect(() => { void loadSchool(schoolId); }, [schoolId]);
  useEffect(() => { void loadSupportState(selectedUserId); }, [selectedUserId, schoolId, canSecurity]);

  async function runAction(endpoint: "control" | "account-support", payload: Record<string, unknown>, success: string) {
    if (!schoolId || !selectedUserId || busy) return;
    if (reason.trim().length < 8) { setMessage("Add a support reason of at least 8 characters before changing an account."); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/schools/${encodeURIComponent(schoolId)}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, userId: selectedUserId, reason: reason.trim() }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.message ?? data.error ?? "The account action could not be completed.");
      setMessage(success);
      setReason("");
      await loadSchool(schoolId);
      await loadSupportState(selectedUserId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The account action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="account-control-shell">
    <section className="account-control-hero">
      <div><span className="app-eyebrow">PLATFORM SUPPORT · ACCOUNT COMMAND CENTER</span><h2>Resolve user access problems without blocking the whole school.</h2><p>School codes can serve the entire institution. Failed-login protection now follows the individual phone/email account, while every platform intervention is permission-checked and audited.</p></div>
      <div className="account-control-hero-badge"><ShieldCheck size={20}/><strong>Audited controls</strong><span>No shared school-code login lock</span></div>
    </section>

    <div className="account-control-layout">
      <aside className="app-card app-panel account-control-schools">
        <div className="account-control-panel-title"><Building2 size={18}/><div><span>School</span><strong>Choose workspace</strong></div></div>
        <label className="account-control-field"><span>School account base</span><select value={schoolId} onChange={(event) => { setSchoolId(event.target.value); setSelectedUserId(""); setSupportState(null); }}><option value="">Choose school…</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}{school.uniqueCode ? ` · ${school.uniqueCode}` : ""}</option>)}</select></label>
        {snapshot ? <div className="account-control-school-summary"><strong>{snapshot.school.name}</strong><span>{snapshot.school.uniqueCode} · {snapshot.school.status}</span><div><b>{snapshot.accounts.active}</b> active <b>{snapshot.accounts.inactive}</b> inactive</div><div><b>{snapshot.accounts.guardians}</b> guardians <b>{snapshot.accounts.pendingPasswordChange}</b> password actions</div></div> : null}
        <button type="button" className="account-control-refresh" disabled={!schoolId || loading} onClick={() => void loadSchool()}><RefreshCw size={14}/>{loading ? "Loading…" : "Refresh accounts"}</button>
      </aside>

      <section className="app-card app-panel account-control-directory">
        <div className="account-control-panel-title"><UsersRound size={18}/><div><span>Accounts</span><strong>{visibleAccounts.length} visible</strong></div></div>
        <div className="account-control-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email or role"/></div>
        <select className="account-control-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All account types</option><option value="guardian">Guardians</option>{roles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select>
        <div className="account-control-list">{visibleAccounts.map((account) => <button type="button" key={account.id} className={account.id === selectedUserId ? "is-selected" : ""} onClick={() => setSelectedUserId(account.id)}><span className={`account-dot account-dot-${account.status}`}/><div><strong>{account.name}</strong><small>{contact(account)}</small><em>{account.isGuardian ? "guardian" : account.roles.length ? account.roles.join(" · ") : "no role"}</em></div>{account.needsPasswordChange ? <KeyRound size={14}/> : null}</button>)}{!loading && !visibleAccounts.length ? <div className="platform-empty"><strong>No accounts match this view.</strong><span>Change the search or account-type filter.</span></div> : null}</div>
      </section>

      <main className="app-card app-panel account-control-detail">
        {!selected ? <div className="account-control-empty"><ShieldAlert size={28}/><strong>Select an account</strong><span>Choose a person from the school directory to inspect and support that account.</span></div> : <>
          <div className="account-control-profile"><div className="account-control-avatar">{selected.name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0,2).join("").toUpperCase()}</div><div><span className="app-eyebrow">SELECTED ACCOUNT</span><h2>{selected.name}</h2><p>{selected.email ?? "No email"} · {selected.phone ?? "No phone"}</p><div className="account-control-tags"><b className={`status-${selected.status}`}>{selected.status}</b>{selected.isGuardian ? <b>guardian</b> : null}{selected.roles.map((role) => <b key={role}>{role.replaceAll("_", " ")}</b>)}</div></div></div>

          <div className="account-control-security-grid"><div><span>Login protection</span><strong>{supportState?.loginLock.locked ? "Temporarily locked" : "Available"}</strong><small>{supportState?.loginLock.locked ? `Until ${supportState.loginLock.blockedUntil ? new Date(supportState.loginLock.blockedUntil).toLocaleString() : "lock expires"}` : `${supportState?.loginLock.failedAttempts ?? 0} recent failed attempt(s)`}</small></div><div><span>Password posture</span><strong>{selected.needsPasswordChange ? "Change required" : "Current"}</strong><small>Reset link revokes existing sessions.</small></div><div><span>Recovery</span><strong>{selected.email || selected.phone ? "Ready" : "Missing contact"}</strong><small>{selected.email ? "Email preferred" : selected.phone ? "SMS available" : "Add email or phone first"}</small></div><div><span>Portal identity</span><strong>{selected.isGuardian ? "Guardian" : "School / staff"}</strong><small>{selected.roles.length ? selected.roles.join(" · ") : "No role assigned"}</small></div></div>

          <label className="account-control-reason"><span>Support reason · required for changes</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} placeholder="Example: User reported a forgotten password and verified identity with school administrator."/></label>

          {canSecurity ? <div className="account-control-actions">
            <div><span><LockKeyhole size={16}/></span><div><strong>Login recovery</strong><small>Only this account is affected.</small></div><button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void runAction("account-support", { action: "clear_login_lock" }, "Failed-login lock cleared for this account.")}>Clear login lock</button></div>
            <div><span><Mail size={16}/></span><div><strong>Send password reset</strong><small>Email is preferred; SMS is used when email is unavailable.</small></div><button type="button" disabled={busy || reason.trim().length < 8 || !(selected.email || selected.phone)} onClick={() => void runAction("account-support", { action: "send_password_reset" }, "Password recovery instructions were issued for this account.")}>Send reset</button></div>
            <div><span><LogOut size={16}/></span><div><strong>Force sign-in again</strong><small>Revokes this user’s current school/guardian sessions.</small></div><button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void runAction("control", { action: "force_user_signout" }, "Current sessions revoked for this account.")}>Sign out account</button></div>
            <div><span><KeyRound size={16}/></span><div><strong>Require password change</strong><small>Forces a security update on the next authenticated flow.</small></div><button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void runAction("control", { action: "require_password_change" }, "Password change is now required for this account.")}>Require change</button></div>
            {selected.status === "active" ? <div className="is-danger"><span><UserRoundX size={16}/></span><div><strong>Suspend account</strong><small>Blocks future login and revokes current sessions.</small></div><button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void runAction("control", { action: "set_user_status", status: "suspended" }, "Account suspended and sessions revoked.")}>Suspend</button></div> : <div><span><UserRoundCheck size={16}/></span><div><strong>Reactivate account</strong><small>Restores login eligibility; password rules still apply.</small></div><button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void runAction("control", { action: "set_user_status", status: "active" }, "Account reactivated.")}>Reactivate</button></div>}
          </div> : <div className="account-control-readonly"><ShieldCheck size={18}/><div><strong>Read-only account view</strong><span>Your platform role can inspect accounts but does not have security.manage permission.</span></div></div>}

          <div className="account-control-links"><Link href={`/platform/schools/${encodeURIComponent(schoolId)}`}><BadgeCheck size={15}/>Open full School 360</Link>{canSupport ? <Link href="/platform/support"><LifeBuoy size={15}/>Open support desk</Link> : null}<span><Smartphone size={15}/>Phone and email are both valid login identities.</span></div>
        </>}
        {message ? <div className="account-control-message" role="status">{message}</div> : null}
      </main>
    </div>

    <style jsx global>{`
      .account-control-shell{display:grid;gap:16px}.account-control-hero{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:20px;border:1px solid var(--color-border);border-radius:18px;background:linear-gradient(135deg,var(--color-brand-soft),var(--color-surface))}.account-control-hero h2{margin:5px 0;color:var(--color-text-primary);font-size:22px;letter-spacing:-.035em}.account-control-hero p{max-width:780px;margin:0;color:var(--color-text-muted);font-size:11px;line-height:1.6}.account-control-hero-badge{display:grid;gap:3px;min-width:185px;padding:13px 15px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface)}.account-control-hero-badge svg{color:var(--color-brand)}.account-control-hero-badge strong{font-size:12px}.account-control-hero-badge span{font-size:9px;color:var(--color-text-muted)}.account-control-layout{display:grid;grid-template-columns:220px minmax(260px,340px) minmax(0,1fr);gap:14px;align-items:start}.account-control-schools,.account-control-directory,.account-control-detail{min-height:610px}.account-control-panel-title{display:flex;align-items:center;gap:9px;padding-bottom:12px;border-bottom:1px solid var(--color-border)}.account-control-panel-title>div{display:grid}.account-control-panel-title span{font-size:9px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.08em}.account-control-panel-title strong{font-size:13px}.account-control-field,.account-control-reason{display:grid;gap:6px;margin-top:14px}.account-control-field span,.account-control-reason span{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)}.account-control-field select,.account-control-role-filter,.account-control-search,.account-control-reason textarea{width:100%;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);color:var(--color-text-primary)}.account-control-field select,.account-control-role-filter{padding:10px}.account-control-school-summary{display:grid;gap:6px;margin-top:12px;padding:12px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface-subtle)}.account-control-school-summary>strong{font-size:13px}.account-control-school-summary>span,.account-control-school-summary>div{font-size:9px;color:var(--color-text-muted)}.account-control-school-summary b{color:var(--color-text-primary)}.account-control-refresh{display:flex;gap:6px;align-items:center;justify-content:center;width:100%;margin-top:12px;padding:9px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);color:var(--color-text-primary);font-size:10px;font-weight:800}.account-control-search{display:flex;align-items:center;gap:7px;margin-top:12px;padding:0 10px}.account-control-search input{width:100%;padding:9px 0;border:0;outline:0;background:transparent;color:var(--color-text-primary);font-size:10px}.account-control-role-filter{margin:8px 0;font-size:10px}.account-control-list{display:grid;gap:5px;max-height:480px;overflow:auto;padding-right:3px}.account-control-list button{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:start;width:100%;padding:9px;text-align:left;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--color-text-primary)}.account-control-list button:hover,.account-control-list button.is-selected{border-color:var(--color-border);background:var(--color-brand-soft)}.account-control-list button>div{display:grid;min-width:0}.account-control-list strong{font-size:10px}.account-control-list small,.account-control-list em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px;color:var(--color-text-muted);font-style:normal}.account-dot{width:7px;height:7px;margin-top:4px;border-radius:999px;background:var(--color-text-subtle)}.account-dot-active{background:var(--color-success)}.account-dot-suspended{background:var(--color-danger)}.account-control-empty{display:grid;place-items:center;align-content:center;gap:7px;min-height:500px;text-align:center;color:var(--color-text-muted)}.account-control-empty strong{color:var(--color-text-primary)}.account-control-profile{display:flex;gap:12px;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--color-border)}.account-control-avatar{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:var(--color-brand);color:var(--color-text-on-brand);font-size:16px;font-weight:900}.account-control-profile h2{margin:2px 0;font-size:19px}.account-control-profile p{margin:0;font-size:9px;color:var(--color-text-muted)}.account-control-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.account-control-tags b{padding:4px 7px;border-radius:999px;background:var(--color-surface-subtle);font-size:8px;text-transform:uppercase}.account-control-tags .status-active{background:var(--color-success-soft);color:var(--color-success-hover)}.account-control-tags .status-suspended{background:var(--color-danger-soft);color:var(--color-danger-hover)}.account-control-security-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.account-control-security-grid>div{display:grid;gap:3px;padding:10px;border:1px solid var(--color-border);border-radius:11px}.account-control-security-grid span{font-size:8px;text-transform:uppercase;color:var(--color-text-muted)}.account-control-security-grid strong{font-size:11px}.account-control-security-grid small{font-size:8px;color:var(--color-text-muted);line-height:1.4}.account-control-reason textarea{padding:10px;resize:vertical;font-size:10px}.account-control-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.account-control-actions>div{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:11px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface)}.account-control-actions>div>span{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--color-brand-soft);color:var(--color-brand)}.account-control-actions>div>div{display:grid}.account-control-actions strong{font-size:10px}.account-control-actions small{font-size:8px;line-height:1.45;color:var(--color-text-muted)}.account-control-actions button{grid-column:1/-1;padding:8px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface-subtle);color:var(--color-text-primary);font-size:9px;font-weight:900}.account-control-actions .is-danger{border-color:var(--color-danger-border)}.account-control-actions .is-danger button{background:var(--color-danger-soft);color:var(--color-danger)}.account-control-readonly{display:flex;gap:9px;margin-top:14px;padding:12px;border:1px solid var(--color-border);border-radius:12px}.account-control-readonly div{display:grid}.account-control-readonly span{font-size:9px;color:var(--color-text-muted)}.account-control-links{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--color-border)}.account-control-links a,.account-control-links>span{display:flex;align-items:center;gap:5px;padding:7px 9px;border-radius:8px;background:var(--color-surface-subtle);font-size:9px;color:var(--color-text-primary);text-decoration:none}.account-control-message{margin-top:12px;padding:10px;border-radius:10px;background:var(--color-brand-soft);font-size:10px;font-weight:700;color:var(--color-text-primary)}@media(max-width:1100px){.account-control-layout{grid-template-columns:210px 1fr}.account-control-detail{grid-column:1/-1}.account-control-schools,.account-control-directory{min-height:480px}}@media(max-width:720px){.account-control-hero{align-items:flex-start;flex-direction:column}.account-control-hero-badge{min-width:0;width:100%}.account-control-layout{grid-template-columns:1fr}.account-control-detail{grid-column:auto}.account-control-schools,.account-control-directory,.account-control-detail{min-height:0}.account-control-security-grid,.account-control-actions{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
