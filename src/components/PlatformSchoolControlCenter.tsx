"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, KeyRound, LogOut, ShieldAlert, ShieldCheck, UserRoundX, Users } from "lucide-react";
import PlatformWorkflowDialog from "@/components/PlatformWorkflowDialog";
import type { PlatformSchoolIntelligence } from "@/lib/platform-owner-intelligence";

type ControlSnapshot = {
  sessionEpoch: number;
  sessionEpochUpdatedAt: string | Date | null;
  activeImpersonations: Array<{ id: string; platformAdminId: string; impersonatedUserId: string; reason: string; startedAt: string | Date }>;
  accounts: { total: number; active: number; inactive: number; roleless: number; pendingPasswordChange: number; missingContact: number; leadership: number; guardians: number };
  rolelessUsers: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
  pendingPasswordUsers: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
  leadershipUsers: Array<{ id: string; name: string; email: string | null; phone: string | null; roles: string[] }>;
};

type Props = {
  schoolId: string;
  intelligence: PlatformSchoolIntelligence | null;
  control: ControlSnapshot;
  canSecurity: boolean;
  canImpersonate: boolean;
  canNotify: boolean;
};

type Dialog = "notice" | "signout_school" | "end_support" | "signout_user" | null;

export default function PlatformSchoolControlCenter({ schoolId, intelligence, control, canSecurity, canImpersonate, canNotify }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeAudience, setNoticeAudience] = useState<"leadership" | "staff" | "all_users">("leadership");
  const [noticeSeverity, setNoticeSeverity] = useState<"info" | "warning" | "critical">("info");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const issueGroups = useMemo(() => {
    const rows = intelligence?.issues ?? [];
    return { critical: rows.filter((item) => item.severity === "critical"), warning: rows.filter((item) => item.severity === "warning"), info: rows.filter((item) => item.severity === "info") };
  }, [intelligence]);

  const userChoices = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string | null; phone: string | null }>();
    for (const user of [...control.rolelessUsers, ...control.pendingPasswordUsers, ...control.leadershipUsers]) map.set(user.id, user);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [control]);

  function closeDialog() {
    setDialog(null); setReason(""); setConfirmation(""); setSelectedUser("");
  }

  async function runControl(payload: Record<string, unknown>, success: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/platform/schools/${encodeURIComponent(schoolId)}/control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { message?: string; error?: string; result?: { recipients?: number; ended?: number; activeUsers?: number; userName?: string } };
      if (!response.ok) { setMessage(data.message ?? data.error ?? "The platform control action could not be completed."); return; }
      const suffix = data.result?.recipients != null ? ` Delivered to ${data.result.recipients} account${data.result.recipients === 1 ? "" : "s"}.` : data.result?.ended != null ? ` ${data.result.ended} support session${data.result.ended === 1 ? "" : "s"} ended.` : "";
      setMessage(success + suffix);
      closeDialog();
      window.setTimeout(() => window.location.reload(), 550);
    } catch {
      setMessage("The platform control action could not be completed.");
    } finally { setBusy(false); }
  }

  const health = intelligence?.health ?? "watch";
  const readiness = intelligence?.readinessScore ?? 0;
  const attention = intelligence?.attentionScore ?? 0;

  return <section className="school-control-center">
    <div className="school-control-heading">
      <div><span className="app-eyebrow">OWNER DIAGNOSTICS & CONTROL</span><h2>Understand the school before changing it.</h2><p>Every alert is tied to a measurable condition. High-risk controls require a reason and are written to both platform and school audit trails.</p></div>
      <div className={`school-control-health school-control-health-${health}`}><span>{health}</span><strong>{readiness}%</strong><small>readiness · attention {attention}</small></div>
    </div>

    <div className="school-control-kpis">
      <div><span><Users size={16}/></span><small>Active accounts</small><strong>{control.accounts.active}</strong><em>{control.accounts.inactive} inactive</em></div>
      <div className={control.accounts.roleless ? "has-risk" : ""}><span><KeyRound size={16}/></span><small>Roleless accounts</small><strong>{control.accounts.roleless}</strong><em>must have a clear responsibility</em></div>
      <div className={control.accounts.pendingPasswordChange ? "has-risk" : ""}><span><ShieldCheck size={16}/></span><small>First-login security</small><strong>{control.accounts.pendingPasswordChange}</strong><em>still require password change</em></div>
      <div className={control.activeImpersonations.length ? "has-risk" : ""}><span><ShieldAlert size={16}/></span><small>Support sessions</small><strong>{control.activeImpersonations.length}</strong><em>currently active</em></div>
      <div className={control.accounts.leadership ? "" : "has-risk"}><span><Users size={16}/></span><small>Leadership accounts</small><strong>{control.accounts.leadership}</strong><em>owner / admin / principal</em></div>
    </div>

    <div className="school-control-grid">
      <section className="app-card app-panel school-diagnostic-panel">
        <div className="app-card-head"><div><span className="app-eyebrow">DIAGNOSTIC FINDINGS</span><h2>{intelligence?.issues.length ? `${intelligence.issues.length} condition${intelligence.issues.length === 1 ? "" : "s"} detected` : "No current operational findings"}</h2></div><AlertTriangle size={20}/></div>
        <div className="school-findings">
          {(intelligence?.issues ?? []).map((issue) => <div className={`school-finding school-finding-${issue.severity}`} key={issue.code}><span className="school-finding-dot"/><div><div className="school-finding-title"><strong>{issue.title}</strong><em>{issue.category}</em></div><p>{issue.detail}</p><small><b>Recommended:</b> {issue.action}</small></div></div>)}
          {!intelligence?.issues.length ? <div className="platform-empty"><ShieldCheck size={22}/><strong>School connections currently look healthy.</strong><span>Continue monitoring rather than changing working configuration.</span></div> : null}
        </div>
        {intelligence?.recommendedAction ? <div className="school-next-action"><span>Highest-priority next action</span><strong>{intelligence.recommendedAction}</strong></div> : null}
      </section>

      <aside className="app-card app-panel school-control-actions">
        <div className="app-card-head"><div><span className="app-eyebrow">OWNER ACTIONS</span><h2>Audited controls</h2></div></div>
        {canNotify ? <button type="button" onClick={() => setDialog("notice")}><span><BellRing size={16}/></span><div><strong>Send platform notice</strong><small>Notify leadership, staff, or all active accounts in their SukuuNova inbox.</small></div></button> : null}
        {canImpersonate ? <button type="button" disabled={!control.activeImpersonations.length} onClick={() => setDialog("end_support")}><span><ShieldAlert size={16}/></span><div><strong>End support sessions</strong><small>Immediately terminate active platform impersonation sessions for this school.</small></div></button> : null}
        {canSecurity ? <button type="button" onClick={() => setDialog("signout_user")}><span><UserRoundX size={16}/></span><div><strong>Sign out one account</strong><small>Invalidate that user's school and guardian sessions without changing their password or role.</small></div></button> : null}
        {canSecurity ? <button type="button" className="is-danger" onClick={() => setDialog("signout_school")}><span><LogOut size={16}/></span><div><strong>Sign out the whole school</strong><small>Invalidate every current school/teacher/guardian session while keeping the school active.</small></div></button> : null}
        {!canNotify && !canImpersonate && !canSecurity ? <div className="platform-empty"><strong>No control permission assigned.</strong><span>You can inspect this school but cannot perform owner-control actions.</span></div> : null}
      </aside>
    </div>

    <div className="school-control-secondary-grid">
      <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">ACCOUNT INTEGRITY</span><h2>Login and role problems</h2></div></div><div className="school-account-issues">
        <div><strong>{control.accounts.roleless}</strong><span>active accounts without a role</span></div><div><strong>{control.accounts.pendingPasswordChange}</strong><span>accounts pending password change</span></div><div><strong>{control.accounts.missingContact}</strong><span>active accounts without email or phone</span></div><div><strong>{control.accounts.guardians}</strong><span>guardian-linked accounts</span></div>
      </div>{control.rolelessUsers.length ? <div className="school-user-list"><span>Roleless accounts</span>{control.rolelessUsers.slice(0,6).map((user) => <div key={user.id}><strong>{user.name}</strong><small>{user.email ?? user.phone ?? "No contact"}</small></div>)}</div> : null}</section>
      <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">SCHOOL LEADERSHIP</span><h2>Who receives owner notices?</h2></div></div><div className="school-user-list">{control.leadershipUsers.map((user) => <div key={user.id}><strong>{user.name}</strong><small>{user.roles.join(" · ")} · {user.email ?? user.phone ?? "No contact"}</small></div>)}{!control.leadershipUsers.length ? <div className="platform-empty"><strong>No active leadership account.</strong><span>Create or correctly role an Owner, Administrator, Principal or Vice Principal.</span></div> : null}</div></section>
    </div>

    {message ? <div className="school-control-message" role="status">{message}</div> : null}

    <PlatformWorkflowDialog open={dialog === "notice"} onClose={closeDialog} eyebrow="PLATFORM NOTICE" title="Notify this school" description="The message will appear in the selected school users' SukuuNova inbox and the delivery will be audited."><div className="platform-dialog-form"><label><span>Title</span><input value={noticeTitle} onChange={(e)=>setNoticeTitle(e.target.value)} maxLength={160}/></label><label><span>Audience</span><select value={noticeAudience} onChange={(e)=>setNoticeAudience(e.target.value as typeof noticeAudience)}><option value="leadership">Leadership</option><option value="staff">All staff accounts</option><option value="all_users">All active accounts</option></select></label><label><span>Severity</span><select value={noticeSeverity} onChange={(e)=>setNoticeSeverity(e.target.value as typeof noticeSeverity)}><option value="info">Information</option><option value="warning">Attention required</option><option value="critical">Critical</option></select></label><label><span>Message</span><textarea rows={6} value={noticeBody} onChange={(e)=>setNoticeBody(e.target.value)} maxLength={5000}/></label><button type="button" className="app-action" disabled={busy || noticeTitle.trim().length < 3 || noticeBody.trim().length < 3} onClick={()=>void runControl({action:"send_notice",title:noticeTitle,body:noticeBody,audience:noticeAudience,severity:noticeSeverity},"Platform notice delivered.")}><BellRing size={14}/><strong>{busy ? "Sending…" : "Send notice"}</strong></button></div></PlatformWorkflowDialog>

    <PlatformWorkflowDialog open={dialog === "end_support"} onClose={closeDialog} eyebrow="SUPPORT ACCESS" title="End all active support sessions?" description="Any platform operator currently inside this school through impersonation will be removed on their next request."><div className="platform-dialog-form"><label><span>Reason</span><textarea rows={4} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Why are you ending the sessions?"/></label><button type="button" className="app-action" disabled={busy || reason.trim().length < 8} onClick={()=>void runControl({action:"end_impersonations",reason},"Support access ended.")}><ShieldAlert size={14}/><strong>End support sessions</strong></button></div></PlatformWorkflowDialog>

    <PlatformWorkflowDialog open={dialog === "signout_user"} onClose={closeDialog} eyebrow="ACCOUNT SECURITY" title="Force one account to sign in again" description="This rotates only the selected user's session epoch. Passwords and roles are not changed."><div className="platform-dialog-form"><label><span>School account</span><select value={selectedUser} onChange={(e)=>setSelectedUser(e.target.value)}><option value="">Choose account…</option>{userChoices.map((user)=><option key={user.id} value={user.id}>{user.name} · {user.email ?? user.phone ?? user.id}</option>)}</select></label><label><span>Reason</span><textarea rows={4} value={reason} onChange={(e)=>setReason(e.target.value)}/></label><button type="button" className="app-action" disabled={busy || !selectedUser || reason.trim().length < 8} onClick={()=>void runControl({action:"force_user_signout",userId:selectedUser,reason},"The selected account was signed out.")}><UserRoundX size={14}/><strong>Force sign-in again</strong></button></div></PlatformWorkflowDialog>

    <PlatformWorkflowDialog open={dialog === "signout_school"} onClose={closeDialog} eyebrow="HIGH-RISK SECURITY ACTION" title="Sign out every account in this school?" description="This invalidates school, teacher and guardian sessions but does not suspend the school or change passwords. Active support sessions are also ended."><div className="platform-dialog-form"><label><span>Reason</span><textarea rows={4} value={reason} onChange={(e)=>setReason(e.target.value)}/></label><label><span>Type SIGN OUT SCHOOL to confirm</span><input value={confirmation} onChange={(e)=>setConfirmation(e.target.value)} autoComplete="off" placeholder="SIGN OUT SCHOOL"/></label><button type="button" className="app-action is-danger" disabled={busy || reason.trim().length < 8 || confirmation.trim() !== "SIGN OUT SCHOOL"} onClick={()=>void runControl({action:"force_school_signout",reason,confirmation},"All current school sessions were invalidated.")}><LogOut size={14}/><strong>Sign out whole school</strong></button></div></PlatformWorkflowDialog>

    <style jsx global>{`
      .school-control-center{display:grid;gap:14px;margin:18px 0}.school-control-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:18px 20px;border:1px solid var(--color-border);border-radius:16px;background:linear-gradient(135deg,var(--color-brand-soft),var(--color-surface))}.school-control-heading h2{margin:5px 0 5px;color:var(--color-text-primary);font-size:20px;letter-spacing:-.03em}.school-control-heading p{margin:0;max-width:760px;color:var(--color-text-muted);font-size:10px;line-height:1.55}.school-control-health{min-width:125px;padding:10px 12px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface);text-align:right}.school-control-health span{display:block;font-size:8px;text-transform:uppercase;font-weight:900}.school-control-health strong{display:block;margin-top:2px;font-size:25px}.school-control-health small{font-size:8px;color:var(--color-text-muted)}.school-control-health-critical{color:var(--color-danger)}.school-control-health-watch{color:var(--color-warning)}.school-control-health-healthy{color:var(--color-success)}.school-control-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.school-control-kpis>div{padding:12px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface);display:grid;grid-template-columns:28px 1fr;column-gap:9px}.school-control-kpis>div>span{grid-row:1/4;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--color-surface-soft);color:var(--color-text-secondary)}.school-control-kpis small{font-size:8px;color:var(--color-text-muted);font-weight:850;text-transform:uppercase}.school-control-kpis strong{font-size:18px;color:var(--color-text-primary)}.school-control-kpis em{font-style:normal;font-size:8px;color:var(--color-text-muted)}.school-control-kpis .has-risk{border-color:var(--color-warning-border);background:var(--color-warning-soft)}.school-control-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.65fr);gap:14px;align-items:start}.school-findings{display:grid}.school-finding{display:grid;grid-template-columns:9px 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--color-border)}.school-finding:last-child{border-bottom:0}.school-finding-dot{width:8px;height:8px;border-radius:50%;margin-top:4px;background:var(--color-info)}.school-finding-critical .school-finding-dot{background:var(--color-danger)}.school-finding-warning .school-finding-dot{background:var(--color-warning)}.school-finding-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.school-finding-title strong{font-size:10.5px;color:var(--color-text-primary)}.school-finding-title em{font-style:normal;text-transform:uppercase;font-size:7.5px;font-weight:850;color:var(--color-text-muted)}.school-finding p{margin:4px 0;font-size:9px;line-height:1.5;color:var(--color-text-muted)}.school-finding small{font-size:8.5px;color:var(--color-text-secondary)}.school-next-action{margin-top:12px;padding:11px 12px;border-radius:10px;background:var(--color-brand-soft);border:1px solid var(--color-brand-border)}.school-next-action span{display:block;font-size:8px;text-transform:uppercase;font-weight:900;color:var(--color-brand)}.school-next-action strong{display:block;margin-top:4px;font-size:10px;color:var(--color-text-primary)}.school-control-actions{display:grid}.school-control-actions>.app-card-head{margin-bottom:2px}.school-control-actions>button{display:grid;grid-template-columns:34px 1fr;gap:10px;width:100%;padding:11px 0;border:0;border-top:1px solid var(--color-border);background:transparent;text-align:left;color:var(--color-text-primary);cursor:pointer}.school-control-actions>button>span{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--color-surface-soft);color:var(--color-text-secondary)}.school-control-actions>button div{display:grid;gap:3px}.school-control-actions>button strong{font-size:10.5px}.school-control-actions>button small{font-size:8.5px;line-height:1.4;color:var(--color-text-muted)}.school-control-actions>button:hover strong{color:var(--color-brand)}.school-control-actions>button.is-danger>span{background:var(--color-danger-soft);color:var(--color-danger)}.school-control-actions>button:disabled{opacity:.45;cursor:not-allowed}.school-control-secondary-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.school-account-issues{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.school-account-issues>div{padding:10px;border-radius:9px;background:var(--color-surface-soft);border:1px solid var(--color-border)}.school-account-issues strong{display:block;font-size:16px;color:var(--color-text-primary)}.school-account-issues span{font-size:8px;color:var(--color-text-muted)}.school-user-list{display:grid;margin-top:10px}.school-user-list>span{font-size:8px;text-transform:uppercase;color:var(--color-text-muted);font-weight:900;margin-bottom:4px}.school-user-list>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--color-border)}.school-user-list>div:last-child{border-bottom:0}.school-user-list strong{font-size:9.5px}.school-user-list small{font-size:8.5px;color:var(--color-text-muted);text-align:right}.school-control-message{padding:10px 12px;border:1px solid var(--color-brand-border);border-radius:10px;background:var(--color-brand-soft);font-size:10px;color:var(--color-text-primary)}@media(max-width:1050px){.school-control-kpis{grid-template-columns:repeat(3,1fr)}.school-control-grid{grid-template-columns:1fr}.school-control-secondary-grid{grid-template-columns:1fr}}@media(max-width:650px){.school-control-heading{display:grid}.school-control-health{text-align:left}.school-control-kpis{grid-template-columns:1fr 1fr}.school-account-issues{grid-template-columns:1fr 1fr}}@media(max-width:430px){.school-control-kpis{grid-template-columns:1fr}.school-user-list>div{display:grid}.school-user-list small{text-align:left}}
    `}</style>
  </section>;
}
