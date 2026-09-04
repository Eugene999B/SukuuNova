"use client";

import { useState } from "react";
import { Archive, CheckCircle2, LockKeyhole, Play, Power, ShieldAlert, Trash2 } from "lucide-react";
import PlatformWorkflowDialog from "@/components/PlatformWorkflowDialog";

export default function PlatformSchoolLifecycle({ schoolId, status }: { schoolId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [phrase, setPhrase] = useState("");
  const run = async (lifecycle: "lock" | "suspend" | "reactivate" | "archive" | "delete") => {
    if (lifecycle === "delete" && phrase.trim() !== "DELETE SCHOOL") return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/control-plane", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "lifecycle", schoolId, lifecycle, confirmationPhrase: lifecycle === "delete" ? phrase : undefined }),
      });
      const data = await response.json() as { message?: string; error?: string };
      setMessage(response.ok ? `${lifecycle === "reactivate" ? "School reactivated" : `School ${lifecycle}ed`}.` : (data.message ?? data.error ?? "Unable to change school state."));
      if (response.ok) {
        setConfirm(null);
        setPhrase("");
        window.setTimeout(() => window.location.reload(), 350);
      }
    } finally {
      setBusy(false);
    }
  };
  const normal = String(status).toLowerCase() === "active";

  return <section className="app-card app-panel lifecycle-command-bar">
    <div className="lifecycle-command-copy"><span className="app-eyebrow">CONTROL & SAFETY</span><h2>Manage school access</h2><p>Routine work is separate from lifecycle actions. These controls affect tenant availability and preserve operational history.</p></div>
    <div className="lifecycle-status"><span className={`platform-status ${normal ? "platform-status-healthy" : "platform-status-critical"}`}>{status}</span><small>Current state</small></div>
    <div className="lifecycle-actions">
      {normal ? <><button type="button" onClick={() => void run("lock")} disabled={busy}><LockKeyhole size={15}/><strong>Lock access</strong><span>Temporary sign-in freeze</span></button><button type="button" onClick={() => void run("suspend")} disabled={busy}><ShieldAlert size={15}/><strong>Suspend</strong><span>Stop school operations</span></button></> : <button type="button" onClick={() => void run("reactivate")} disabled={busy}><Play size={15}/><strong>Reactivate</strong><span>Restore school access</span></button>}
      <button type="button" onClick={() => setConfirm("archive")} disabled={busy}><Archive size={15}/><strong>Archive</strong><span>Leave the active network</span></button>
      <button type="button" className="is-danger" onClick={() => setConfirm("delete")} disabled={busy}><Trash2 size={15}/><strong>Decommission</strong><span>Disable permanently</span></button>
    </div>
    {message ? <div className="lifecycle-message" role="status"><CheckCircle2 size={15}/>{message}</div> : null}
    <div className="lifecycle-note"><Power size={14}/><span><b>Lock</b> is temporary, <b>Suspend</b> stops service, <b>Archive</b> removes the school from normal operations, and <b>Decommission</b> requires an explicit confirmation phrase.</span></div>

    <PlatformWorkflowDialog
      open={Boolean(confirm)}
      eyebrow={confirm === "delete" ? "HIGH-RISK CHANGE" : "LIFECYCLE CHANGE"}
      title={confirm === "delete" ? "Decommission this school?" : "Archive this school?"}
      description={confirm === "delete" ? "This removes the tenant from active access. Historical records remain preserved by the current retention model; this workflow does not perform physical data erasure." : "The school will leave normal operations while its history remains available for investigation and reporting."}
      onClose={() => { setConfirm(null); setPhrase(""); }}
      size="medium"
    >
      <div className="platform-dialog-form">
        {confirm === "delete" ? <label><span>Type DELETE SCHOOL to confirm</span><input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="DELETE SCHOOL" autoComplete="off" /></label> : <div className="platform-dialog-summary"><strong>Archive {schoolId ? "this school" : "the school"}</strong><span>Access will leave the active network. Historical records remain available.</span></div>}
        <div className="platform-dialog-actions"><button type="button" className="app-pill" onClick={() => { setConfirm(null); setPhrase(""); }} disabled={busy}>Cancel</button><button type="button" className={confirm === "delete" ? "app-action is-danger" : "app-action"} onClick={() => confirm ? void run(confirm) : undefined} disabled={busy || (confirm === "delete" && phrase.trim() !== "DELETE SCHOOL")}>{confirm === "delete" ? "Decommission school" : "Archive school"}</button></div>
      </div>
    </PlatformWorkflowDialog>
  </section>;
}
