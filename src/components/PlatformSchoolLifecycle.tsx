"use client";

import { useState } from "react";
import { Archive, CheckCircle2, LockKeyhole, Play, Power, ShieldAlert, Trash2 } from "lucide-react";

export default function PlatformSchoolLifecycle({ schoolId, status }: { schoolId: string; status: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const run = async (lifecycle: "lock" | "suspend" | "reactivate" | "archive" | "delete") => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/platform/control-plane", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "lifecycle", schoolId, lifecycle }) });
      const data = await response.json() as { message?: string; error?: string };
      setMessage(response.ok ? `${lifecycle === "reactivate" ? "School reactivated" : `School ${lifecycle}ed`}.` : (data.message ?? data.error ?? "Unable to change school state."));
      if (response.ok) { setConfirm(null); window.setTimeout(() => window.location.reload(), 350); }
    } finally { setBusy(false); }
  };
  const normal = String(status).toLowerCase() === "active";
  return <section className="app-card app-panel lifecycle-command-bar">
    <div><span className="app-eyebrow">LIFECYCLE CONTROL</span><h2>School access & state</h2><p>These actions change tenant availability; they do not erase the school’s operational history.</p></div>
    <div className="lifecycle-status"><span className={`platform-status ${normal ? "platform-status-healthy" : "platform-status-critical"}`}>{status}</span><small>Current state</small></div>
    <div className="lifecycle-actions">
      {normal ? <><button type="button" onClick={() => void run("lock")} disabled={busy}><LockKeyhole size={15}/><strong>Lock access</strong><span>Freeze sign-in</span></button><button type="button" onClick={() => void run("suspend")} disabled={busy}><ShieldAlert size={15}/><strong>Suspend</strong><span>Stop operations</span></button></> : <button type="button" onClick={() => void run("reactivate")} disabled={busy}><Play size={15}/><strong>Reactivate</strong><span>Restore access</span></button>}
      <button type="button" onClick={() => setConfirm("archive")} disabled={busy}><Archive size={15}/><strong>Archive</strong><span>Keep history</span></button>
      <button type="button" className="is-danger" onClick={() => setConfirm("delete")} disabled={busy}><Trash2 size={15}/><strong>Decommission</strong><span>Disable permanently</span></button>
    </div>
    {message && <div className="lifecycle-message" role="status"><CheckCircle2 size={15}/>{message}</div>}
    {confirm && <div className="lifecycle-confirm" role="dialog" aria-modal="true"><div><h3>{confirm === "delete" ? "Decommission this school?" : "Archive this school?"}</h3><p>{confirm === "delete" ? "This marks the tenant as deleted and removes it from active access. Historical records remain preserved by the current retention model; permanent physical erasure is deliberately not performed by this workflow." : "The tenant will leave normal operations while its history remains available for investigation and reporting."}</p></div><div><button type="button" className="app-pill" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button><button type="button" className={confirm === "delete" ? "app-action is-danger" : "app-action"} onClick={() => void run(confirm)} disabled={busy}>{confirm === "delete" ? "Decommission school" : "Archive school"}</button></div></div>}
    <div className="lifecycle-note"><Power size={14}/><span>Use <b>Lock</b> for temporary access freezes, <b>Suspend</b> for account-level service stops, and <b>Archive</b> when the school should leave the active network.</span></div>
  </section>;
}
