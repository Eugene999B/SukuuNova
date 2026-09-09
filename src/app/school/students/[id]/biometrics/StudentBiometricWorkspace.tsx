/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Fingerprint, ScanFace, ShieldCheck, Trash2 } from "lucide-react";
import "./student-biometrics.css";

type Guardian = { id: string; name: string; relationship: string; isPrimary: boolean };
type FingerprintIdentity = { id: string; externalId: string; createdAt: string };
type Props = {
  student: { id: string; name: string; admissionNo: string; photoUrl: string | null; className: string | null };
  guardians: Guardian[];
  initialFaceEnrolledAt: string | null;
  initialFingerprints: FingerprintIdentity[];
  canEnrollFace: boolean;
  canManageFingerprint: boolean;
};

type ApiMessage = { message?: string; error?: string; result?: { enrollment?: { enrolledAt?: string } }; identity?: FingerprintIdentity };

async function body(response: Response): Promise<ApiMessage> {
  try { return await response.json() as ApiMessage; } catch { return {}; }
}

export default function StudentBiometricWorkspace({ student, guardians, initialFaceEnrolledAt, initialFingerprints, canEnrollFace, canManageFingerprint }: Props) {
  const primary = guardians.find((guardian) => guardian.isPrimary) ?? guardians[0];
  const [guardianId, setGuardianId] = useState(primary?.id ?? "");
  const [consent, setConsent] = useState(false);
  const [faceEnrolledAt, setFaceEnrolledAt] = useState(initialFaceEnrolledAt);
  const [fingerprints, setFingerprints] = useState(initialFingerprints);
  const [externalId, setExternalId] = useState("");
  const [busy, setBusy] = useState<"face" | "fingerprint" | "remove" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function enrollProfileFace() {
    if (!guardianId || !consent) return;
    setBusy("face"); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/school/students/${encodeURIComponent(student.id)}/biometrics`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "enrollFaceFromProfile", guardianId, consentConfirmed: true }),
      });
      const payload = await body(response);
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Face enrollment could not be completed.");
      setFaceEnrolledAt(payload.result?.enrollment?.enrolledAt ?? new Date().toISOString());
      setConsent(false);
      setMessage("Face recognition is ready. SukuuNova indexed the official learner portrait; a second enrollment photo was not required.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Face enrollment could not be completed.");
    } finally { setBusy(null); }
  }

  async function mapFingerprint() {
    const value = externalId.trim();
    if (!value) return;
    setBusy("fingerprint"); setMessage(""); setError("");
    try {
      const response = await fetch("/api/school/devices/identities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceKind: "fingerprint", externalId: value, targetType: "student", targetId: student.id }),
      });
      const payload = await body(response);
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Fingerprint identity could not be linked.");
      if (payload.identity) setFingerprints((current) => [payload.identity!, ...current]);
      setExternalId("");
      setMessage("Fingerprint enrollment ID linked. The fingerprint template remains on the physical terminal; SukuuNova stores only this mapping.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fingerprint identity could not be linked.");
    } finally { setBusy(null); }
  }

  async function removeFingerprint(id: string) {
    setBusy("remove"); setMessage(""); setError("");
    try {
      const response = await fetch("/api/school/devices/identities", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await body(response);
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Fingerprint mapping could not be removed.");
      setFingerprints((current) => current.filter((entry) => entry.id !== id));
      setMessage("Fingerprint mapping removed. Remove the learner from the physical terminal too if the vendor device keeps its own template.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fingerprint mapping could not be removed.");
    } finally { setBusy(null); }
  }

  const faceReady = Boolean(faceEnrolledAt);
  const fingerprintReady = fingerprints.length > 0;

  return <div className="student-biometric-workspace">
    <section className="student-biometric-hero">
      <div className="student-biometric-photo">{student.photoUrl ? <img src={student.photoUrl} alt={`${student.name} official portrait`} /> : <span>{student.name.slice(0, 2).toUpperCase()}</span>}</div>
      <div><span className="student-biometric-kicker">Learner biometric identity</span><h2>{student.name}</h2><p>{student.admissionNo}{student.className ? ` · ${student.className}` : ""}</p><small>The accepted profile portrait is the canonical face source for this learner.</small></div>
      <Link className="student-biometric-back" href={`/school/students/${student.id}`}>Back to learner profile</Link>
    </section>

    <div className="student-biometric-status-grid">
      <StatusCard icon={ScanFace} label="Face recognition" ready={faceReady} detail={faceReady ? `Enrolled ${new Date(faceEnrolledAt!).toLocaleDateString("en-GB")}` : student.photoUrl ? "Professional portrait available; enrollment pending" : "Capture a professional profile portrait first"} />
      <StatusCard icon={Fingerprint} label="Fingerprint" ready={fingerprintReady} detail={fingerprintReady ? `${fingerprints.length} terminal mapping${fingerprints.length === 1 ? "" : "s"}` : "No fingerprint terminal ID linked"} />
    </div>

    {message ? <div className="student-biometric-message success" role="status"><CheckCircle2 size={16} />{message}</div> : null}
    {error ? <div className="student-biometric-message error" role="alert"><ShieldCheck size={16} />{error}</div> : null}

    <section className="student-biometric-panel">
      <header><div><span>Face</span><h3>Use the official learner portrait</h3><p>SukuuNova does not ask staff to upload a different biometric photo. Recapture the learner profile portrait first if the current image is missing or unsuitable.</p></div><ScanFace size={26} /></header>
      {!student.photoUrl ? <div className="student-biometric-note">No official portrait is stored. Return to the learner profile, edit the learner and capture a professional portrait before face enrollment.</div> : !guardians.length ? <div className="student-biometric-note">A linked guardian is required before a learner&apos;s face can be enrolled. Link the guardian first.</div> : <>
        <div className="student-biometric-form-grid">
          <label>Guardian providing consent<select value={guardianId} onChange={(event) => setGuardianId(event.target.value)}>{guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name} · {guardian.relationship}{guardian.isPrimary ? " · Primary" : ""}</option>)}</select></label>
        </div>
        <label className="student-biometric-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>Guardian consent confirmed</strong><small>I confirm the selected linked guardian has authorised use of this official learner portrait for biometric attendance verification.</small></span></label>
        <div className="student-biometric-actions"><button type="button" className="primary" disabled={!canEnrollFace || !consent || busy !== null} onClick={() => void enrollProfileFace()}>{busy === "face" ? "Enrolling…" : faceReady ? "Refresh face enrollment from profile portrait" : "Enroll face from profile portrait"}</button>{!canEnrollFace ? <small>Your account does not have permission to enroll biometric attendance.</small> : null}</div>
      </>}
    </section>

    <section className="student-biometric-panel">
      <header><div><span>Fingerprint</span><h3>Link the terminal enrollment ID</h3><p>First enroll the learner&apos;s finger on the physical terminal. Then enter the user/enrollment ID shown by that terminal. SukuuNova never stores the raw fingerprint image or template.</p></div><Fingerprint size={26} /></header>
      <div className="student-biometric-form-grid"><label>Terminal user / enrollment ID<input value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="e.g. 1042 or STU-1042" /></label></div>
      <div className="student-biometric-actions"><button type="button" className="primary" disabled={!canManageFingerprint || !externalId.trim() || busy !== null} onClick={() => void mapFingerprint()}>{busy === "fingerprint" ? "Linking…" : "Link fingerprint enrollment"}</button>{!canManageFingerprint ? <small>Fingerprint mappings require school device-management permission.</small> : null}</div>
      <div className="student-biometric-mappings">{fingerprints.map((identity) => <div key={identity.id}><span><Fingerprint size={15} /></span><div><strong>{identity.externalId}</strong><small>Linked {new Date(identity.createdAt).toLocaleDateString("en-GB")}</small></div>{canManageFingerprint ? <button type="button" aria-label={`Remove fingerprint mapping ${identity.externalId}`} disabled={busy !== null} onClick={() => void removeFingerprint(identity.id)}><Trash2 size={15} /></button> : null}</div>)}{!fingerprints.length ? <p>No fingerprint enrollment ID is linked yet.</p> : null}</div>
    </section>

    <div className="student-biometric-footer"><Link href="/school/devices/biometrics">View school biometric readiness</Link><Link href="/school/devices">Attendance Control &amp; device fleet</Link></div>
  </div>;
}

function StatusCard({ icon: Icon, label, ready, detail }: { icon: typeof ScanFace; label: string; ready: boolean; detail: string }) {
  return <article className={ready ? "ready" : "pending"}><span><Icon size={20} /></span><div><small>{label}</small><strong>{ready ? "Ready" : "Not ready"}</strong><p>{detail}</p></div></article>;
}
