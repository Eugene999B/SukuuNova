"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Camera, CheckCircle2, HeartPulse, Package2, Plus, RefreshCw, Stethoscope, UserRoundPlus, UsersRound, X } from "lucide-react";

type ManagementData = {
  metrics: {
    visitsToday: number;
    restingNow: number;
    sentHomeToday: number;
    referredToday: number;
    followUpsToday: number;
    medicinesAvailable: number;
    lowStock: number;
    expiringSoon: number;
    outOfStock: number;
    visitsSevenDays: number;
    visitsPreviousSevenDays: number;
  };
  insights: string[];
  nurses: Array<{
    id: string;
    userId: string;
    name: string;
    email: string | null;
    phone: string | null;
    accountStatus: string;
    profileStatus: string;
    title: string;
    qualification: string | null;
    licenseNo: string | null;
    photoUrl: string | null;
  }>;
  recent: Array<{
    id: string;
    patientType: "student" | "staff";
    patientId: string;
    patientName: string;
    patientMeta: string | null;
    disposition: string;
    status: string;
    startedAt: string;
    followUpAt: string | null;
    nurseName: string;
  }>;
  medicines: Array<{
    id: string;
    name: string;
    strength: string | null;
    form: string | null;
    unit: string;
    quantity: string;
    minimumStock: string;
    batchNo: string | null;
    expiryDate: string | null;
    isLow: boolean;
    isExpiring: boolean;
  }>;
  settings: null | { clinicName: string | null; phone: string | null; room: string | null; emergencyContact: string | null; referralHospital: string | null };
};

const dispositionLabel: Record<string, string> = {
  returned_to_class: "Returned to class",
  resting_in_clinic: "Resting in clinic",
  sent_home: "Sent home",
  referred: "Referred",
  emergency_transfer: "Emergency transfer",
};

export default function ClinicManagementWorkspace() {
  const [data, setData] = useState<ManagementData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/clinic?mode=management", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load clinic intelligence.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load clinic intelligence.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading && !data) return <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><div className="flex items-center gap-3 text-slate-600"><RefreshCw className="animate-spin" size={18} /> Loading clinic intelligence…</div></div>;
  if (error && !data) return <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><strong>Clinic overview unavailable.</strong><p className="mt-1 text-sm">{error}</p><button onClick={() => void refresh()} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Try again</button></div>;
  if (!data) return null;

  const m = data.metrics;
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-6 text-white shadow-lg md:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200"><HeartPulse size={16} /> Clinic intelligence</div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{data.settings?.clinicName || "School Health Centre"}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-100 md:text-base">A management view of student wellbeing and clinic readiness. Detailed clinical notes remain in the nurse workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSettingsOpen(true)} className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold backdrop-blur hover:bg-white/15">Clinic profile</button>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-emerald-950 shadow"><UserRoundPlus size={17} /> Add nurse</button>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={<Stethoscope size={18} />} label="Seen today" value={m.visitsToday} detail="clinic visits" />
      <Metric icon={<Activity size={18} />} label="Resting now" value={m.restingNow} detail="in clinic" />
      <Metric icon={<UsersRound size={18} />} label="Sent home" value={m.sentHomeToday} detail="today" />
      <Metric icon={<AlertTriangle size={18} />} label="Referrals" value={m.referredToday} detail="today" />
      <Metric icon={<Package2 size={18} />} label="Low stock" value={m.lowStock} detail={`${m.expiringSoon} expiring soon`} />
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Health signals</span><h2 className="mt-1 text-xl font-black text-slate-950">What needs attention</h2></div>
          <button onClick={() => void refresh()} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Refresh clinic intelligence"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>
        </div>
        <div className="mt-5 grid gap-3">
          {data.insights.map((insight, index) => <div key={index} className="flex gap-3 rounded-2xl bg-slate-50 p-4"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Activity size={14} /></span><p className="text-sm font-medium leading-6 text-slate-700">{insight}</p></div>)}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-5 text-center">
          <div><strong className="block text-xl text-slate-950">{m.visitsSevenDays}</strong><span className="text-xs text-slate-500">last 7 days</span></div>
          <div><strong className="block text-xl text-slate-950">{m.followUpsToday}</strong><span className="text-xs text-slate-500">follow-ups today</span></div>
          <div><strong className="block text-xl text-slate-950">{m.outOfStock}</strong><span className="text-xs text-slate-500">out of stock</span></div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-center justify-between"><div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Clinic team</span><h2 className="mt-1 text-xl font-black text-slate-950">Nurse access</h2></div><button onClick={() => setAddOpen(true)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-800"><Plus size={18} /></button></div>
        <div className="mt-5 space-y-3">
          {data.nurses.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">No nurse profile yet. Add the school nurse to activate the clinical workspace.</div> : data.nurses.map((nurse) => <NurseRow key={nurse.id} nurse={nurse} onChanged={refresh} />)}
        </div>
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Today</span><h2 className="mt-1 text-xl font-black text-slate-950">Students & staff in clinic flow</h2><p className="mt-1 text-sm text-slate-500">Operational status only. Clinical details stay private to the clinic team.</p></div>
        <div className="mt-5 divide-y divide-slate-100">
          {data.recent.length === 0 ? <p className="py-6 text-sm text-slate-500">No clinic visits recorded today.</p> : data.recent.map((visit) => <div key={visit.id} className="flex items-center justify-between gap-4 py-3.5"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{visit.patientName}</strong><span className="text-xs text-slate-500">{visit.patientMeta || visit.patientType} · {new Date(visit.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${visit.disposition === "emergency_transfer" || visit.disposition === "referred" ? "bg-rose-100 text-rose-700" : visit.disposition === "resting_in_clinic" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{dispositionLabel[visit.disposition] || visit.disposition}</span></div>)}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Medicine readiness</span><h2 className="mt-1 text-xl font-black text-slate-950">Drug store health</h2></div>
        <div className="mt-5 space-y-3">
          {data.medicines.length === 0 ? <p className="text-sm text-slate-500">No medicines have been entered yet.</p> : data.medicines.map((medicine) => <div key={medicine.id} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{medicine.name}{medicine.strength ? ` ${medicine.strength}` : ""}</strong><span className="text-xs text-slate-500">{medicine.batchNo ? `Batch ${medicine.batchNo}` : medicine.form || "Clinic stock"}</span></div><div className="text-right"><strong className={medicine.isLow ? "text-sm text-rose-700" : "text-sm text-slate-900"}>{medicine.quantity} {medicine.unit}</strong><span className="block text-[11px] text-slate-500">{medicine.isLow ? "Low stock" : medicine.isExpiring ? "Expiring soon" : "Available"}</span></div></div>)}
        </div>
      </div>
    </section>

    {addOpen ? <AddNurseModal onClose={() => setAddOpen(false)} onCreated={async () => { setAddOpen(false); await refresh(); }} /> : null}
    {settingsOpen ? <ClinicSettingsModal initial={data.settings} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await refresh(); }} /> : null}
  </div>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span><span className="text-emerald-700">{icon}</span></div><strong className="mt-3 block text-3xl font-black tracking-tight text-slate-950">{value}</strong><span className="text-xs text-slate-500">{detail}</span></div>;
}

function NurseRow({ nurse, onChanged }: { nurse: ManagementData["nurses"][number]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await fetch("/api/school/clinic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_nurse_status", nurseProfileId: nurse.id, status: nurse.profileStatus === "active" ? "suspended" : "active" }) });
      await onChanged();
    } finally { setBusy(false); }
  }
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
    {nurse.photoUrl ? <img src={nurse.photoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 font-black text-emerald-800">{nurse.name.slice(0, 1).toUpperCase()}</div>}
    <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{nurse.name}</strong><span className="block truncate text-xs text-slate-500">{nurse.title}{nurse.qualification ? ` · ${nurse.qualification}` : ""}</span></div>
    <button disabled={busy} onClick={toggle} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${nurse.profileStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{busy ? "…" : nurse.profileStatus === "active" ? "Active" : "Suspended"}</button>
  </div>;
}

function AddNurseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [photoMessage, setPhotoMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function startCamera() {
    setPhotoMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } });
    } catch { setPhotoMessage("Camera could not be opened. You can create the nurse now and add a photo later."); }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function capturePhoto() {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    const size = 480;
    canvas.width = size; canvas.height = size;
    const video = videoRef.current;
    const sourceSize = Math.min(video.videoWidth, video.videoHeight);
    const sx = Math.max(0, (video.videoWidth - sourceSize) / 2);
    const sy = Math.max(0, (video.videoHeight - sourceSize) / 2);
    canvas.getContext("2d")?.drawImage(video, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
    const image = canvas.toDataURL("image/jpeg", 0.76);
    setPhotoMessage("Checking the portrait…");
    try {
      const response = await fetch("/api/school/portrait/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "staff", image, mode: "manual" }) });
      const result = await response.json();
      if (!response.ok || !result.captureReady) throw new Error(result.message || "Face photo was not accepted.");
      setPhotoUrl(image);
      setVerificationToken(result.verificationToken || "");
      setPhotoMessage(result.message || "Portrait ready.");
      stopCamera();
    } catch (captureError) { setPhotoMessage(captureError instanceof Error ? captureError.message : "Portrait could not be verified."); }
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      action: "create_nurse",
      name: String(form.get("name") || ""), phone: String(form.get("phone") || ""), email: String(form.get("email") || ""),
      title: String(form.get("title") || "School Nurse"), qualification: String(form.get("qualification") || ""), licenseNo: String(form.get("licenseNo") || ""),
      photoUrl, verificationToken,
    };
    try {
      const response = await fetch("/api/school/clinic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not create the nurse profile.");
      setMessage(result.message || "Nurse profile created.");
      setTimeout(() => void onCreated(), 650);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not create the nurse profile."); }
    finally { setPending(false); }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-100 p-5 md:p-6"><div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Clinic access</span><h2 className="mt-1 text-2xl font-black text-slate-950">Add school nurse</h2><p className="mt-1 text-sm text-slate-500">One profile creates the nurse login and dedicated clinic workspace.</p></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-600"><X size={18} /></button></div>
      <form onSubmit={submit} className="p-5 md:p-6">
        <div className="grid gap-5 md:grid-cols-[190px_1fr]">
          <div>
            <div className="aspect-square overflow-hidden rounded-3xl border-2 border-dashed border-emerald-200 bg-emerald-50">
              {photoUrl ? <img src={photoUrl} alt="Captured nurse portrait" className="h-full w-full object-cover" /> : cameraOpen ? <video ref={videoRef} muted playsInline className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-emerald-800"><Camera size={30} /><span className="text-xs font-bold">Nurse portrait</span></div>}
            </div>
            <div className="mt-2 flex gap-2">{cameraOpen ? <><button type="button" onClick={() => void capturePhoto()} className="flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Capture</button><button type="button" onClick={stopCamera} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button></> : <button type="button" onClick={() => void startCamera()} className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{photoUrl ? "Retake photo" : "Open camera"}</button>}</div>
            {photoMessage ? <p className="mt-2 text-[11px] leading-4 text-slate-500">{photoMessage}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><input name="name" required placeholder="Ama Mensah" className="clinic-input" /></Field>
            <Field label="Phone number"><input name="phone" required placeholder="0241234567" className="clinic-input" /></Field>
            <Field label="Email"><input name="email" type="email" placeholder="nurse@school.com" className="clinic-input" /></Field>
            <Field label="Title"><input name="title" defaultValue="School Nurse" className="clinic-input" /></Field>
            <Field label="Qualification"><input name="qualification" placeholder="e.g. Registered General Nurse" className="clinic-input" /></Field>
            <Field label="Professional / licence no."><input name="licenseNo" placeholder="Optional" className="clinic-input" /></Field>
          </div>
        </div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><strong className="text-slate-900">Login is ready immediately.</strong> The nurse signs in under <b>Staff</b> with phone or email. The phone number is the first password, then SukuuNova requires a password change.</div>
        {error ? <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div> : null}
        {message ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17} />{message}</div> : null}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button><button disabled={pending} className="rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-black text-white disabled:opacity-60">{pending ? "Creating nurse…" : "Create nurse & login"}</button></div>
      </form>
    </div>
  </div>;
}

function ClinicSettingsModal({ initial, onClose, onSaved }: { initial: ManagementData["settings"]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = { action: "save_settings", clinicName: String(form.get("clinicName") || ""), phone: String(form.get("phone") || ""), room: String(form.get("room") || ""), emergencyContact: String(form.get("emergencyContact") || ""), referralHospital: String(form.get("referralHospital") || "") };
    try { const response = await fetch("/api/school/clinic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Could not save clinic profile."); await onSaved(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save clinic profile."); }
    finally { setPending(false); }
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form onSubmit={submit} className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Clinic identity</span><h2 className="mt-1 text-2xl font-black text-slate-950">Clinic profile</h2></div><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2"><X size={18} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Clinic name"><input name="clinicName" defaultValue={initial?.clinicName || ""} placeholder="School Health Centre" className="clinic-input" /></Field><Field label="Clinic phone"><input name="phone" defaultValue={initial?.phone || ""} className="clinic-input" /></Field><Field label="Room / location"><input name="room" defaultValue={initial?.room || ""} placeholder="Sick bay · Block A" className="clinic-input" /></Field><Field label="Emergency contact"><input name="emergencyContact" defaultValue={initial?.emergencyContact || ""} className="clinic-input" /></Field><div className="sm:col-span-2"><Field label="Preferred referral hospital"><input name="referralHospital" defaultValue={initial?.referralHospital || ""} className="clinic-input" /></Field></div></div>{error ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">Cancel</button><button disabled={pending} className="rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-black text-white">{pending ? "Saving…" : "Save clinic profile"}</button></div></form></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}
