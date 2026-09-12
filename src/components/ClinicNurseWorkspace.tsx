"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, ClipboardPlus, FileDown, HeartPulse, History, Package2, Plus, Search, Stethoscope, Thermometer, UserRound, X } from "lucide-react";

type Patient = { id: string; type: "student" | "staff"; name: string; identifier: string; secondary: string | null; photoUrl: string | null };
type Medicine = { id: string; name: string; strength: string | null; form: string | null; unit: string; quantity: string; minimumStock: string; batchNo: string | null; expiryDate: string | null; isLow: boolean; isExpiring: boolean };
type Visit = { id: string; patientType: "student" | "staff"; patientId: string; patientName: string; patientMeta: string | null; complaint: string; assessment: string | null; disposition: string; status: string; startedAt: string; followUpAt: string | null; nurseName: string };
type PatientRecord = {
  identity: Patient;
  profile: null | { id: string; bloodGroup: string | null; allergies: string[] | null; conditions: string[] | null; currentMedications: string[] | null; emergencyNotes: string | null; updatedAt: string };
  visits: Array<{ id: string; complaint: string; vitals: Record<string, unknown> | null; tests: Array<Record<string, unknown>> | null; assessment: string | null; treatment: string | null; prescriptions: Array<Record<string, unknown>> | null; notes: string | null; parentAdvice: string | null; disposition: string; referralFacility: string | null; referralReason: string | null; followUpAt: string | null; startedAt: string; nurseName: string }>;
};
type NurseSnapshot = {
  profile: null | { id: string; status: string; title: string; photoUrl: string | null };
  metrics: { visitsToday: number; followUpsToday: number; restingNow: number; lowStock: number };
  recent: Visit[];
  medicines: Medicine[];
};
type Tab = "today" | "consult" | "records" | "store";

type Dispensed = { medicationId: string; quantity: number; instruction: string };

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "today", label: "Today", icon: <Activity size={16} /> },
  { id: "consult", label: "New consultation", icon: <ClipboardPlus size={16} /> },
  { id: "records", label: "Health records", icon: <History size={16} /> },
  { id: "store", label: "Drug store", icon: <Package2 size={16} /> },
];

const dispositionLabel: Record<string, string> = {
  returned_to_class: "Returned to class",
  resting_in_clinic: "Resting in clinic",
  sent_home: "Sent home",
  referred: "Referred",
  emergency_transfer: "Emergency transfer",
};

export default function ClinicNurseWorkspace() {
  const [tab, setTab] = useState<Tab>("today");
  const [snapshot, setSnapshot] = useState<NurseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [record, setRecord] = useState<PatientRecord | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/school/clinic?mode=nurse", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to open the clinic workspace.");
      setSnapshot(result);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to open the clinic workspace."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function openPatient(patient: Patient, nextTab: Tab) {
    setSelected(patient); setTab(nextTab); setRecord(null);
    try {
      const response = await fetch(`/api/school/clinic?mode=patient&type=${patient.type}&id=${encodeURIComponent(patient.id)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not load the health record.");
      setRecord(result.record);
    } catch (recordError) { setError(recordError instanceof Error ? recordError.message : "Could not load the health record."); }
  }

  if (loading && !snapshot) return <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><div className="flex items-center gap-3 text-slate-600"><HeartPulse className="animate-pulse" size={20} /> Opening clinic workspace…</div></div>;
  if (error && !snapshot) return <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><strong>Clinic workspace unavailable.</strong><p className="mt-1 text-sm">{error}</p><button onClick={() => void refresh()} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">Try again</button></div>;
  if (!snapshot) return null;

  return <div className="space-y-5">
    <section className="rounded-[28px] border border-emerald-200 bg-gradient-to-r from-emerald-950 to-teal-800 p-5 text-white shadow-lg md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><span className="text-xs font-bold uppercase tracking-[.18em] text-emerald-200">Clinical workspace</span><h1 className="mt-1 text-3xl font-black tracking-tight">School Health Centre</h1><p className="mt-2 text-sm text-emerald-100">Treat, record, follow up and keep medicines ready—without leaving this workspace.</p></div>
        <button onClick={() => { setSelected(null); setRecord(null); setTab("consult"); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-emerald-950"><Plus size={17} /> New consultation</button>
      </div>
    </section>

    <nav className="clinic-tab-strip clinic-no-print flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Clinic workspace sections">
      {tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === item.id ? "bg-emerald-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>{item.icon}{item.label}</button>)}
    </nav>

    {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}<button className="ml-3 underline" onClick={() => setError("")}>Dismiss</button></div> : null}

    {tab === "today" ? <TodayPanel snapshot={snapshot} onNew={() => setTab("consult")} onPatient={(visit) => void openPatient({ id: visit.patientId, type: visit.patientType, name: visit.patientName, identifier: visit.patientMeta || visit.patientType, secondary: visit.patientMeta, photoUrl: null }, "records")} /> : null}
    {tab === "consult" ? <ConsultationPanel selected={selected} record={record} medicines={snapshot.medicines} onSelect={(patient) => void openPatient(patient, "consult")} onSaved={async () => { await refresh(); if (selected) await openPatient(selected, "records"); else setTab("today"); }} /> : null}
    {tab === "records" ? <RecordsPanel selected={selected} record={record} onSelect={(patient) => void openPatient(patient, "records")} onUpdated={async () => { if (selected) await openPatient(selected, "records"); }} /> : null}
    {tab === "store" ? <DrugStorePanel medicines={snapshot.medicines} onChanged={refresh} /> : null}
  </div>;
}

function TodayPanel({ snapshot, onNew, onPatient }: { snapshot: NurseSnapshot; onNew: () => void; onPatient: (visit: Visit) => void }) {
  return <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniMetric icon={<Stethoscope size={18} />} value={snapshot.metrics.visitsToday} label="Seen today" />
        <MiniMetric icon={<HeartPulse size={18} />} value={snapshot.metrics.restingNow} label="Resting now" />
        <MiniMetric icon={<History size={18} />} value={snapshot.metrics.followUpsToday} label="Follow-ups" />
        <MiniMetric icon={<Package2 size={18} />} value={snapshot.metrics.lowStock} label="Low stock" alert={snapshot.metrics.lowStock > 0} />
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-center justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Recent care</span><h2 className="mt-1 text-xl font-black text-slate-950">Today’s clinic activity</h2></div><button onClick={onNew} className="rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-black text-white">New consultation</button></div>
        <div className="mt-5 divide-y divide-slate-100">
          {snapshot.recent.length === 0 ? <div className="py-8 text-center"><Stethoscope className="mx-auto text-slate-300" size={30} /><p className="mt-2 text-sm text-slate-500">No visits have been recorded yet.</p></div> : snapshot.recent.map((visit) => <button key={visit.id} onClick={() => onPatient(visit)} className="flex w-full items-center justify-between gap-4 py-3.5 text-left hover:bg-slate-50"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{visit.patientName}</strong><span className="block truncate text-xs text-slate-500">{visit.patientMeta || visit.patientType} · {visit.complaint}</span></div><div className="shrink-0 text-right"><span className="block text-[11px] font-bold text-emerald-700">{dispositionLabel[visit.disposition] || visit.disposition}</span><span className="text-[11px] text-slate-400">{new Date(visit.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div></button>)}
        </div>
      </div>
    </section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Medicine watch</span><h2 className="mt-1 text-xl font-black text-slate-950">Stock needing attention</h2></div>
      <div className="mt-5 space-y-3">
        {snapshot.medicines.filter((item) => item.isLow || item.isExpiring).slice(0, 10).map((medicine) => <div key={medicine.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{medicine.name}{medicine.strength ? ` ${medicine.strength}` : ""}</strong><span className="text-xs text-slate-500">{medicine.isExpiring ? "Expiry needs review" : medicine.form || "Medicine"}</span></div><strong className={medicine.isLow ? "text-sm text-rose-700" : "text-sm text-amber-700"}>{medicine.quantity} {medicine.unit}</strong></div>)}
        {snapshot.medicines.every((item) => !item.isLow && !item.isExpiring) ? <div className="flex gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800"><HeartPulse className="shrink-0" size={18} /><span>Medicine stock has no low-stock or near-expiry alerts right now.</span></div> : null}
      </div>
    </section>
  </div>;
}

function MiniMetric({ icon, value, label, alert = false }: { icon: React.ReactNode; value: number; label: string; alert?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-4 shadow-sm ${alert ? "border-rose-200" : "border-slate-200"}`}><div className={alert ? "text-rose-700" : "text-emerald-700"}>{icon}</div><strong className="mt-3 block text-2xl font-black text-slate-950">{value}</strong><span className="text-xs text-slate-500">{label}</span></div>;
}

function PatientSearch({ onSelect, placeholder = "Search student or staff…" }: { onSelect: (patient: Patient) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try { const response = await fetch(`/api/school/clinic?mode=search&q=${encodeURIComponent(query)}`); const result = await response.json(); if (response.ok) setHits(result.patients || []); }
      finally { setLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  return <div className="relative"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="clinic-input pl-10" placeholder={placeholder} /></div>{query.trim().length >= 2 ? <div className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">{loading ? <p className="p-3 text-sm text-slate-500">Searching…</p> : hits.length ? hits.map((patient) => <button type="button" key={`${patient.type}-${patient.id}`} onClick={() => { onSelect(patient); setQuery(""); setHits([]); }} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50">{patient.photoUrl ? <img src={patient.photoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><UserRound size={18} /></span>}<span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{patient.name}</strong><small className="block truncate text-xs text-slate-500">{patient.secondary || patient.type} · {patient.identifier}</small></span><ArrowRight size={15} className="text-slate-400" /></button>) : <p className="p-3 text-sm text-slate-500">No matching student or staff member.</p>}</div> : null}</div>;
}

function PatientHeader({ patient, record, onClear }: { patient: Patient; record: PatientRecord | null; onClear?: () => void }) {
  const profile = record?.profile;
  const alerts = [...(Array.isArray(profile?.allergies) ? profile!.allergies! : []), ...(Array.isArray(profile?.conditions) ? profile!.conditions! : [])];
  return <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="flex items-start gap-4">{patient.photoUrl ? <img src={patient.photoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><UserRound size={23} /></div>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="truncate text-xl font-black text-slate-950">{patient.name}</h2><p className="text-sm text-slate-500">{patient.secondary || patient.type} · {patient.identifier}</p></div>{onClear ? <button onClick={onClear} className="rounded-lg border border-slate-200 p-1.5 text-slate-500"><X size={15} /></button> : null}</div>{alerts.length ? <div className="mt-3 flex flex-wrap gap-2">{alerts.slice(0, 8).map((alert) => <span key={alert} className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">⚠ {alert}</span>)}</div> : <p className="mt-2 text-xs font-medium text-emerald-700">No recorded allergy or chronic-condition alert.</p>}{profile?.emergencyNotes ? <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs font-semibold text-amber-900">Emergency note: {profile.emergencyNotes}</p> : null}</div></div></div>;
}

function ConsultationPanel({ selected, record, medicines, onSelect, onSaved }: { selected: Patient | null; record: PatientRecord | null; medicines: Medicine[]; onSelect: (patient: Patient) => void; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dispensed, setDispensed] = useState<Dispensed[]>([]);
  const [medicineId, setMedicineId] = useState("");
  const [medicineQty, setMedicineQty] = useState("1");
  const [medicineInstruction, setMedicineInstruction] = useState("");
  const activeMedicine = useMemo(() => medicines.find((item) => item.id === medicineId), [medicines, medicineId]);

  function addDispensed() {
    if (!activeMedicine) return;
    const quantity = Number(medicineQty);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(activeMedicine.quantity)) { setError("Enter a dispensing quantity that is available in stock."); return; }
    setDispensed((current) => [...current.filter((item) => item.medicationId !== activeMedicine.id), { medicationId: activeMedicine.id, quantity, instruction: medicineInstruction.trim() }]);
    setMedicineId(""); setMedicineQty("1"); setMedicineInstruction(""); setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setPending(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const testName = String(form.get("testName") || "").trim();
    const testResult = String(form.get("testResult") || "").trim();
    const followUpLocal = String(form.get("followUpAt") || "").trim();
    const payload = {
      action: "save_visit", patientType: selected.type, patientId: selected.id, complaint: String(form.get("complaint") || ""),
      vitals: { temperature: String(form.get("temperature") || "") || null, bloodPressure: String(form.get("bloodPressure") || "") || null, pulse: String(form.get("pulse") || "") || null, oxygenSaturation: String(form.get("oxygenSaturation") || "") || null, weight: String(form.get("weight") || "") || null },
      tests: testName || testResult ? [{ name: testName || "Test", result: testResult }] : [],
      assessment: String(form.get("assessment") || "") || null, treatment: String(form.get("treatment") || "") || null,
      prescriptions: dispensed.map((item) => { const med = medicines.find((m) => m.id === item.medicationId); return { medicationId: item.medicationId, medicine: med?.name || "Medicine", quantity: item.quantity, instruction: item.instruction }; }),
      notes: String(form.get("notes") || "") || null, parentAdvice: String(form.get("parentAdvice") || "") || null,
      disposition: String(form.get("disposition") || "returned_to_class"), referralFacility: String(form.get("referralFacility") || "") || null, referralReason: String(form.get("referralReason") || "") || null,
      followUpAt: followUpLocal ? new Date(followUpLocal).toISOString() : null, dispensed,
    };
    try {
      const response = await fetch("/api/school/clinic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not save the consultation.");
      setMessage("Consultation saved and health history updated."); setDispensed([]); (event.currentTarget as HTMLFormElement).reset(); await onSaved();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save the consultation."); }
    finally { setPending(false); }
  }

  if (!selected) return <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8"><div className="mx-auto max-w-xl text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><Stethoscope size={25} /></span><h2 className="mt-4 text-2xl font-black text-slate-950">Who are you treating?</h2><p className="mt-2 text-sm text-slate-500">Search by student name, admission number, staff name, email or phone. SukuuNova will pull the existing school record.</p><div className="mt-6 text-left"><PatientSearch onSelect={onSelect} /></div></div></section>;

  return <div className="space-y-4"><PatientHeader patient={selected} record={record} /><form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
    <div className="space-y-5">
      <SectionTitle icon={<Thermometer size={17} />} title="Vitals" subtitle="Record only what was checked." />
      <div className="grid grid-cols-2 gap-3"><Field label="Temperature °C"><input name="temperature" inputMode="decimal" className="clinic-input" placeholder="36.8" /></Field><Field label="Blood pressure"><input name="bloodPressure" className="clinic-input" placeholder="120/80" /></Field><Field label="Pulse bpm"><input name="pulse" inputMode="numeric" className="clinic-input" placeholder="78" /></Field><Field label="SpO₂ %"><input name="oxygenSaturation" inputMode="decimal" className="clinic-input" placeholder="98" /></Field><Field label="Weight kg"><input name="weight" inputMode="decimal" className="clinic-input" placeholder="42.5" /></Field></div>
      <div className="border-t border-slate-100 pt-5"><SectionTitle icon={<Activity size={17} />} title="Test" subtitle="Optional quick test/result." /><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Test"><input name="testName" className="clinic-input" placeholder="e.g. Malaria RDT" /></Field><Field label="Result"><input name="testResult" className="clinic-input" placeholder="e.g. Negative" /></Field></div></div>
    </div>
    <div className="space-y-4"><Field label="Main complaint / reason for visit"><textarea name="complaint" required className="clinic-input" placeholder="What brought the student or staff member to the clinic?" /></Field><div className="grid gap-4 md:grid-cols-2"><Field label="Assessment / finding"><textarea name="assessment" className="clinic-input min-h-24" placeholder="What was identified or suspected?" /></Field><Field label="Treatment given"><textarea name="treatment" className="clinic-input min-h-24" placeholder="First aid, observation, oral fluids…" /></Field></div>
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><div className="flex items-center justify-between"><div><strong className="text-sm text-slate-900">Medicine dispensing</strong><p className="text-xs text-slate-500">Stock reduces automatically when the visit is saved.</p></div><Package2 size={18} className="text-emerald-700" /></div><div className="mt-3 grid gap-2 md:grid-cols-[1fr_90px_1fr_auto]"><select value={medicineId} onChange={(e) => setMedicineId(e.target.value)} className="clinic-input"><option value="">Choose medicine</option>{medicines.filter((m) => Number(m.quantity) > 0).map((m) => <option key={m.id} value={m.id}>{m.name}{m.strength ? ` ${m.strength}` : ""} · {m.quantity} {m.unit}</option>)}</select><input value={medicineQty} onChange={(e) => setMedicineQty(e.target.value)} className="clinic-input" inputMode="decimal" placeholder="Qty" /><input value={medicineInstruction} onChange={(e) => setMedicineInstruction(e.target.value)} className="clinic-input" placeholder="Dosage / instruction" /><button type="button" onClick={addDispensed} className="rounded-xl bg-emerald-800 px-3 py-2 text-xs font-bold text-white">Add</button></div>{dispensed.length ? <div className="mt-3 flex flex-wrap gap-2">{dispensed.map((item) => { const med = medicines.find((m) => m.id === item.medicationId); return <button type="button" key={item.medicationId} onClick={() => setDispensed((current) => current.filter((entry) => entry.medicationId !== item.medicationId))} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm">{med?.name} · {item.quantity} {med?.unit} ×</button>; })}</div> : null}</div>
      <Field label="Clinical notes"><textarea name="notes" className="clinic-input" placeholder="Extra observations or instructions…" /></Field><Field label="Parent / guardian advice"><textarea name="parentAdvice" className="clinic-input min-h-24" placeholder="Optional message suitable for a parent or guardian health note." /></Field>
      <div className="grid gap-3 md:grid-cols-2"><Field label="Disposition"><select name="disposition" className="clinic-input" defaultValue="returned_to_class"><option value="returned_to_class">Returned to class</option><option value="resting_in_clinic">Resting in clinic</option><option value="sent_home">Sent home</option><option value="referred">Referred</option><option value="emergency_transfer">Emergency transfer</option></select></Field><Field label="Follow-up"><input name="followUpAt" type="datetime-local" className="clinic-input" /></Field><Field label="Referral facility"><input name="referralFacility" className="clinic-input" placeholder="If referred" /></Field><Field label="Referral reason"><input name="referralReason" className="clinic-input" placeholder="If referred" /></Field></div>
    </div>
  </div>{error ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p> : null}{message ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p> : null}<div className="mt-6 flex justify-end"><button disabled={pending} className="rounded-xl bg-emerald-900 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{pending ? "Saving consultation…" : "Complete & save visit"}</button></div></form></div>;
}

function RecordsPanel({ selected, record, onSelect, onUpdated }: { selected: Patient | null; record: PatientRecord | null; onSelect: (patient: Patient) => void; onUpdated: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  if (!selected) return <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8"><div className="text-center"><History className="mx-auto text-emerald-700" size={30} /><h2 className="mt-3 text-2xl font-black text-slate-950">Find a health record</h2><p className="mt-1 text-sm text-slate-500">Search a student or staff member to see their complete clinic timeline.</p></div><div className="mx-auto mt-6 max-w-xl"><PatientSearch onSelect={onSelect} /></div></section>;
  return <div className="space-y-4"><PatientHeader patient={selected} record={record} /><div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Health profile</span><h2 className="mt-1 text-xl font-black text-slate-950">Alerts & history</h2></div><button onClick={() => setEditing((v) => !v)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">{editing ? "Close" : "Edit profile"}</button></div>{editing ? <HealthProfileForm patient={selected} record={record} onSaved={async () => { setEditing(false); await onUpdated(); }} /> : <HealthProfileSummary record={record} />}<a href={`/api/school/clinic/export?kind=history&type=${selected.type}&id=${encodeURIComponent(selected.id)}`} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800"><FileDown size={16} /> Download health history</a></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Timeline</span><h2 className="mt-1 text-xl font-black text-slate-950">Clinic visits</h2><div className="mt-5 space-y-3">{record?.visits.length ? record.visits.map((visit) => <VisitCard key={visit.id} visit={visit} patient={selected} />) : <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No previous clinic visits recorded.</p>}</div></section>
  </div></div>;
}

function HealthProfileSummary({ record }: { record: PatientRecord | null }) {
  const p = record?.profile;
  if (!p) return <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No background health profile has been recorded yet.</p>;
  return <div className="mt-4 space-y-4 text-sm"><InfoList label="Blood group" values={p.bloodGroup ? [p.bloodGroup] : []} /><InfoList label="Allergies" values={Array.isArray(p.allergies) ? p.allergies : []} alert /><InfoList label="Conditions" values={Array.isArray(p.conditions) ? p.conditions : []} /><InfoList label="Current medication" values={Array.isArray(p.currentMedications) ? p.currentMedications : []} />{p.emergencyNotes ? <div><span className="text-xs font-bold uppercase text-slate-400">Emergency note</span><p className="mt-1 rounded-xl bg-amber-50 p-3 font-medium text-amber-900">{p.emergencyNotes}</p></div> : null}</div>;
}

function InfoList({ label, values, alert = false }: { label: string; values: string[]; alert?: boolean }) { return <div><span className="text-xs font-bold uppercase text-slate-400">{label}</span>{values.length ? <div className="mt-1.5 flex flex-wrap gap-1.5">{values.map((value) => <span key={value} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alert ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{value}</span>)}</div> : <p className="mt-1 text-slate-400">Not recorded</p>}</div>; }

function HealthProfileForm({ patient, record, onSaved }: { patient: Patient; record: PatientRecord | null; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const p = record?.profile;
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(""); const form = new FormData(event.currentTarget); const list = (name: string) => String(form.get(name) || "").split(",").map((v) => v.trim()).filter(Boolean); try { const response = await fetch("/api/school/clinic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_health_profile", patientType: patient.type, patientId: patient.id, bloodGroup: String(form.get("bloodGroup") || "") || null, allergies: list("allergies"), conditions: list("conditions"), currentMedications: list("currentMedications"), emergencyNotes: String(form.get("emergencyNotes") || "") || null }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Could not save health profile."); await onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save health profile."); } finally { setPending(false); } }
  return <form onSubmit={submit} className="mt-4 space-y-3"><Field label="Blood group"><input name="bloodGroup" defaultValue={p?.bloodGroup || ""} className="clinic-input" placeholder="e.g. O+" /></Field><Field label="Allergies (comma separated)"><input name="allergies" defaultValue={Array.isArray(p?.allergies) ? p!.allergies!.join(", ") : ""} className="clinic-input" /></Field><Field label="Chronic / important conditions"><input name="conditions" defaultValue={Array.isArray(p?.conditions) ? p!.conditions!.join(", ") : ""} className="clinic-input" /></Field><Field label="Current medication"><input name="currentMedications" defaultValue={Array.isArray(p?.currentMedications) ? p!.currentMedications!.join(", ") : ""} className="clinic-input" /></Field><Field label="Emergency note"><textarea name="emergencyNotes" defaultValue={p?.emergencyNotes || ""} className="clinic-input min-h-20" /></Field>{error ? <p className="text-xs font-semibold text-rose-700">{error}</p> : null}<button disabled={pending} className="w-full rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white">{pending ? "Saving…" : "Save health profile"}</button></form>;
}

function VisitCard({ visit, patient }: { visit: PatientRecord["visits"][number]; patient: Patient }) {
  return <details className="group rounded-2xl border border-slate-100 bg-slate-50 open:bg-white"><summary className="cursor-pointer list-none p-4"><div className="flex items-center justify-between gap-4"><div><strong className="text-sm text-slate-900">{visit.assessment || visit.complaint}</strong><p className="mt-1 text-xs text-slate-500">{new Date(visit.startedAt).toLocaleString()} · {visit.nurseName}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">{dispositionLabel[visit.disposition] || visit.disposition}</span></div></summary><div className="border-t border-slate-100 p-4 text-sm text-slate-700"><div className="grid gap-3 sm:grid-cols-2"><TextValue label="Complaint" value={visit.complaint} /><TextValue label="Assessment" value={visit.assessment} /><TextValue label="Treatment" value={visit.treatment} /><TextValue label="Notes" value={visit.notes} /></div>{visit.parentAdvice ? <div className="mt-3 rounded-xl bg-emerald-50 p-3"><span className="text-xs font-bold uppercase text-emerald-700">Parent advice</span><p className="mt-1">{visit.parentAdvice}</p></div> : null}<a href={`/api/school/clinic/export?kind=visit&type=${patient.type}&id=${encodeURIComponent(patient.id)}&visit=${encodeURIComponent(visit.id)}`} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-emerald-800"><FileDown size={14} /> Download visit / parent note</a></div></details>;
}

function TextValue({ label, value }: { label: string; value: string | null }) { return <div><span className="text-[11px] font-bold uppercase text-slate-400">{label}</span><p className="mt-1 whitespace-pre-wrap">{value || "—"}</p></div>; }

function DrugStorePanel({ medicines, onChanged }: { medicines: Medicine[]; onChanged: () => Promise<void> }) {
  const [addOpen, setAddOpen] = useState(false); const [adjusting, setAdjusting] = useState<Medicine | null>(null);
  return <div className="space-y-5"><div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Clinic inventory</span><h2 className="mt-1 text-2xl font-black text-slate-950">Drug store</h2><p className="mt-1 text-sm text-slate-500">Quantities reduce automatically when medicines are dispensed during a consultation.</p></div><button onClick={() => setAddOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-black text-white"><Plus size={16} /> Add medicine</button></div><div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Medicine</th><th className="px-4 py-3">Available</th><th className="px-4 py-3">Minimum</th><th className="px-4 py-3">Batch / expiry</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Stock</th></tr></thead><tbody className="divide-y divide-slate-100">{medicines.map((m) => <tr key={m.id}><td className="px-5 py-4"><strong className="text-slate-900">{m.name}{m.strength ? ` ${m.strength}` : ""}</strong><span className="block text-xs text-slate-500">{m.form || "Medicine"}</span></td><td className="px-4 py-4 font-bold text-slate-900">{m.quantity} {m.unit}</td><td className="px-4 py-4 text-slate-600">{m.minimumStock} {m.unit}</td><td className="px-4 py-4 text-xs text-slate-600">{m.batchNo || "—"}<span className="block">{m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : "No expiry entered"}</span></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${m.isLow ? "bg-rose-50 text-rose-700" : m.isExpiring ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{m.isLow ? "Low stock" : m.isExpiring ? "Expiring soon" : "Ready"}</span></td><td className="px-5 py-4 text-right"><button onClick={() => setAdjusting(m)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">Adjust</button></td></tr>)}{medicines.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">No medicines in the clinic store yet.</td></tr> : null}</tbody></table></div></div>{addOpen ? <AddMedicineModal onClose={() => setAddOpen(false)} onSaved={async () => { setAddOpen(false); await onChanged(); }} /> : null}{adjusting ? <StockAdjustModal medicine={adjusting} onClose={() => setAdjusting(null)} onSaved={async () => { setAdjusting(null); await onChanged(); }} /> : null}</div>;
}

function AddMedicineModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) { const [pending, setPending] = useState(false); const [error, setError] = useState(""); async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(""); const f = new FormData(event.currentTarget); try { const response = await fetch("/api/school/clinic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add_medication", name: String(f.get("name") || ""), strength: String(f.get("strength") || "") || null, form: String(f.get("form") || "") || null, unit: String(f.get("unit") || "units"), quantity: Number(f.get("quantity") || 0), minimumStock: Number(f.get("minimumStock") || 0), batchNo: String(f.get("batchNo") || "") || null, expiryDate: String(f.get("expiryDate") || "") || null }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Could not add medicine."); await onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "Could not add medicine."); } finally { setPending(false); } } return <Modal title="Add medicine" onClose={onClose}><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><Field label="Medicine name"><input name="name" required className="clinic-input" /></Field><Field label="Strength"><input name="strength" className="clinic-input" placeholder="500mg" /></Field><Field label="Form"><input name="form" className="clinic-input" placeholder="Tablet, syrup…" /></Field><Field label="Unit"><input name="unit" defaultValue="units" className="clinic-input" /></Field><Field label="Opening quantity"><input name="quantity" type="number" min="0" step="0.01" defaultValue="0" className="clinic-input" /></Field><Field label="Low-stock level"><input name="minimumStock" type="number" min="0" step="0.01" defaultValue="0" className="clinic-input" /></Field><Field label="Batch no."><input name="batchNo" className="clinic-input" /></Field><Field label="Expiry date"><input name="expiryDate" type="date" className="clinic-input" /></Field>{error ? <p className="sm:col-span-2 text-sm font-semibold text-rose-700">{error}</p> : null}<div className="sm:col-span-2 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">Cancel</button><button disabled={pending} className="rounded-xl bg-emerald-900 px-5 py-2.5 text-sm font-black text-white">{pending ? "Adding…" : "Add to store"}</button></div></form></Modal>; }

function StockAdjustModal({ medicine, onClose, onSaved }: { medicine: Medicine; onClose: () => void; onSaved: () => Promise<void> }) { const [pending, setPending] = useState(false); const [error, setError] = useState(""); async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(""); const f = new FormData(event.currentTarget); try { const response = await fetch("/api/school/clinic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adjust_stock", medicationId: medicine.id, type: String(f.get("type") || "received"), quantity: Number(f.get("quantity") || 0), note: String(f.get("note") || "") || null }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Could not adjust stock."); await onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "Could not adjust stock."); } finally { setPending(false); } } return <Modal title={`Stock · ${medicine.name}`} onClose={onClose}><form onSubmit={submit} className="space-y-4"><div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs text-slate-500">Available now</span><strong className="block text-2xl text-slate-950">{medicine.quantity} {medicine.unit}</strong></div><Field label="Movement"><select name="type" className="clinic-input"><option value="received">Stock received</option><option value="returned">Returned to store</option><option value="adjusted_in">Adjustment in</option><option value="adjusted_out">Adjustment out</option><option value="expired">Expired</option><option value="damaged">Damaged</option></select></Field><Field label="Quantity"><input name="quantity" required type="number" min="0.01" step="0.01" className="clinic-input" /></Field><Field label="Note"><input name="note" className="clinic-input" placeholder="Optional reason / supplier note" /></Field>{error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">Cancel</button><button disabled={pending} className="rounded-xl bg-emerald-900 px-5 py-2.5 text-sm font-black text-white">{pending ? "Saving…" : "Save stock movement"}</button></div></form></Modal>; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Clinic</span><h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2"><X size={18} /></button></div>{children}</section></div>; }

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) { return <div className="flex gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">{icon}</span><div><strong className="text-sm text-slate-900">{title}</strong><p className="text-xs text-slate-500">{subtitle}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
