"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CameraCapture } from "./CameraCapture";

type Named = { id: string; name: string };
type Guardian = Named & { phone: string };
type Context = {
  capabilities: Record<string, boolean>;
  students: Named[];
  guardians: Guardian[];
  staff: Named[];
  classes: Named[];
  subjects: Named[];
};
type PickupData = {
  pending: Array<{
    id: string;
    student: { name: string };
    collectingGuardian: { name: string };
    requester: { name: string };
  }>;
  events: Array<{ id: string; timestamp: string; student: { name: string }; collectingGuardian: { name: string } }>;
};
type TimetableData = {
  slots: Array<{
    id: string; dayOfWeek: number; period: number;
    class: { name: string }; subject: { name: string }; teacher: { name: string };
  }>;
  assignments: Array<{ id: string; substituteTeacher: { name: string } }>;
};
type PayrollData = {
  canManage: boolean;
  payslips: Array<{ id: string; net: string; payrollRun: { period: string }; staff?: { name: string } }>;
  runs: Array<{ id: string; period: string; status: string }>;
};
type TemplateData = {
  templates: Array<{ id: string; name: string; layoutConfig: unknown }>;
  settings: { reportCardTemplateId: string | null } | null;
};
type VisitorData = {
  visitors: Array<{ id: string; name: string; purpose: string; timeIn: string; timeOut: string | null }>;
};
type StaffTrend = {
  totals: { present: number; late: number; absent: number };
  trends: Array<{ date: string; present: number; late: number; absent: number }>;
};
type FaceData = {
  reviews: Array<{
    id: string; status: string; confidenceScore: string | null;
    candidateStudent: { name: string } | null;
    candidateStaff: { name: string } | null;
  }>;
};
type Suggestion = { id: string; name: string };

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}

function Select({ name, rows, label, required = true }: { name: string; rows: Named[]; label: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium">{label}
      <select name={name} required={required} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
        <option value="">Select…</option>
        {rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select>
    </label>
  );
}

function Card({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{note}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export function Phase2Console({ name, canManageRoles }: { name: string; canManageRoles: boolean }) {
  const [context, setContext] = useState<Context | null>(null);
  const [face, setFace] = useState<FaceData | null>(null);
  const [pickups, setPickups] = useState<PickupData | null>(null);
  const [timetable, setTimetable] = useState<TimetableData | null>(null);
  const [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [templates, setTemplates] = useState<TemplateData | null>(null);
  const [visitors, setVisitors] = useState<VisitorData | null>(null);
  const [attendance, setAttendance] = useState<StaffTrend | null>(null);
  const [capture, setCapture] = useState("");
  const [faceKind, setFaceKind] = useState<"student" | "staff">("student");
  const [logo, setLogo] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestedSlot, setSuggestedSlot] = useState("");
  const [notice, setNotice] = useState("Ready.");

  const refresh = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [ctx, faceRows, pickupRows, timetableRows, payrollRows, templateRows, visitorRows, staffRows] =
      await Promise.all([
        getJson<Context>("/api/phase2/context"),
        getJson<FaceData>("/api/phase2/face"),
        getJson<PickupData>("/api/phase2/pickups"),
        getJson<TimetableData>("/api/phase2/timetable"),
        getJson<PayrollData>("/api/phase2/payroll"),
        getJson<TemplateData>("/api/phase2/templates"),
        getJson<VisitorData>("/api/phase2/visitors"),
        getJson<StaffTrend>("/api/phase2/staff-attendance?start=" + today + "&end=" + today)
      ]);
    setContext(ctx);
    setFace(faceRows);
    setPickups(pickupRows);
    setTimetable(timetableRows);
    setPayroll(payrollRows);
    setTemplates(templateRows);
    setVisitors(visitorRows);
    setAttendance(staffRows);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function act(endpoint: string, body: Record<string, unknown>) {
    setNotice("Working…");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ?? "Request failed.";
      setNotice(message);
      throw new Error(message);
    }
    setNotice("Saved successfully.");
    await refresh();
    return payload.result as Record<string, unknown> | undefined;
  }

  async function onFaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capture) { setNotice("Capture a camera frame first."); return; }
    const form = new FormData(event.currentTarget);
    const kind = value(form, "kind");
    if (kind === "student") {
      await act("/api/phase2/face", {
        action: "enrollStudent",
        studentId: value(form, "studentId"),
        consentByGuardianId: value(form, "guardianId"),
        image: capture
      });
    } else {
      await act("/api/phase2/face", {
        action: "enrollStaff",
        staffId: value(form, "staffId"),
        image: capture
      });
    }
  }

  async function onPickup(event: FormEvent<HTMLFormElement>, action: "approveGuardian" | "attempt") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act("/api/phase2/pickups", {
      action,
      studentId: value(form, "studentId"),
      guardianId: value(form, "guardianId")
    });
  }

  async function onSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act("/api/phase2/timetable", {
      action: "saveSlot",
      classId: value(form, "classId"),
      subjectId: value(form, "subjectId"),
      teacherId: value(form, "teacherId"),
      dayOfWeek: Number(value(form, "dayOfWeek")),
      period: Number(value(form, "period"))
    });
  }

  async function onSuggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await act("/api/phase2/timetable", {
      action: "suggest",
      absentTeacherId: value(form, "teacherId"),
      day: value(form, "day"),
      period: Number(value(form, "period")),
      asOf: new Date().toISOString()
    });
    const rows = Array.isArray(result?.suggestions) ? result.suggestions as Suggestion[] : [];
    const slots = Array.isArray(result?.slots) ? result.slots as Array<{ id: string }> : [];
    setSuggestions(rows);
    setSuggestedSlot(slots[0]?.id ?? "");
    setNotice(rows.length ? "Suggestions generated. Choose one to confirm." : "No eligible substitute suggestion.");
  }

  async function onSalary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const deductionValue = Number(value(form, "deductionValue") || 0);
    await act("/api/phase2/payroll", {
      action: "salaryStructure",
      staffId: value(form, "staffId"),
      grossSalary: Number(value(form, "grossSalary")),
      deductions: deductionValue > 0 ? [{
        label: value(form, "deductionLabel") || "Deduction",
        type: value(form, "deductionType"),
        value: deductionValue
      }] : []
    });
  }

  async function onVisitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act("/api/phase2/visitors", {
      action: "signIn",
      name: value(form, "name"),
      phone: value(form, "phone") || undefined,
      purpose: value(form, "purpose"),
      hostStaffId: value(form, "hostStaffId") || undefined
    });
    event.currentTarget.reset();
  }

  async function onTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act("/api/phase2/templates", {
      templateId: value(form, "templateId"),
      primaryColor: value(form, "primaryColor"),
      accentColor: value(form, "accentColor"),
      watermark: value(form, "watermark"),
      logoDataUrl: logo || undefined
    });
  }

  async function onSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const channels = ["sms", "whatsapp"].filter((channel) => form.get(channel));
    await act("/api/phase2/settings", {
      faceMatchThreshold: Number(value(form, "threshold")),
      substituteLateMinutes: Number(value(form, "lateMinutes")),
      notificationChannels: channels,
      whatsappTemplateConfig: Object.fromEntries(
        ["student_absence", "staff_late", "invoice_created", "payment_received", "report_card_ready"]
          .map((key) => [key, value(form, key)] as const)
          .filter(([, contentSid]) => contentSid.length > 0)
      )
    });
  }

  if (!context) {
    return <main className="mx-auto max-w-6xl px-5 py-16"><p>Loading the secure Phase 2 console…</p></main>;
  }

  const can = context.capabilities;
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";
  const primaryButton = "rounded-lg bg-nova px-4 py-2 font-semibold text-white";
  const softButton = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold";

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8">
      <header className="rounded-3xl bg-slate-950 p-7 text-white md:flex md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">SukuuNova Phase 2</p>
          <h1 className="mt-2 text-3xl font-bold">Differentiators console</h1>
          <p className="mt-2 text-slate-300">Welcome, {name}. Safety gates always require a human decision.</p>
        </div>
        <nav className="mt-5 flex flex-wrap gap-2 md:mt-0">
          <a href="/mvp" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold">Phase 1</a>
          {canManageRoles && <a href="/phase2/roles" className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">Custom roles</a>}
          <a href="/dashboard" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold">Dashboard</a>
        </nav>
      </header>

      <div role="status" className="sticky top-3 z-20 mx-auto mt-4 max-w-xl rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-900 shadow">
        {notice}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {can["attendance:record"] && (
          <Card title="Face attendance" note="AWS Rekognition stores face vectors; SukuuNova discards every raw capture after the request.">
            <CameraCapture onCapture={setCapture} />
            <form onSubmit={onFaceSubmit} className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">Enrollment type
                <select name="kind" value={faceKind} onChange={(event) => setFaceKind(event.target.value as "student" | "staff")} className={inputClass}>
                  <option value="student">Student</option><option value="staff">Staff</option>
                </select>
              </label>
              {faceKind === "student" ? <>
                <Select name="studentId" rows={context.students} label="Student" />
                <Select name="guardianId" rows={context.guardians} label="Consenting linked guardian" />
              </> : <Select name="staffId" rows={context.staff} label="Staff" />}
              <button className={primaryButton}>Enroll captured face</button>
              <button type="button" onClick={() => {
                if (!capture) { setNotice("Capture a camera frame first."); return; }
                void act("/api/phase2/face", { action: "match", image: capture, type: "in", deviceId: "web-console" });
              }} className={softButton}>Match and check in</button>
            </form>
            <div className="space-y-2">
              {face?.reviews.filter((row) => row.status === "pending").map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <span>{row.candidateStudent?.name ?? row.candidateStaff?.name ?? "Unknown face"} · {row.confidenceScore ?? "no score"}%</span>
                  <span className="flex gap-2">
                    <button onClick={() => void act("/api/phase2/face", { action: "review", reviewId: row.id, decision: "confirmed", type: "in" })} className={softButton}>Confirm</button>
                    <button onClick={() => void act("/api/phase2/face", { action: "review", reviewId: row.id, decision: "rejected" })} className={softButton}>Reject</button>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {can["attendance:record"] && (
          <Card title="Guardian pickup gate" note="Unapproved collectors create a pending request; they never create a pickup event.">
            <form onSubmit={(event) => void onPickup(event, "attempt")} className="grid gap-3 sm:grid-cols-2">
              <Select name="studentId" rows={context.students} label="Student" />
              <Select name="guardianId" rows={context.guardians} label="Collecting guardian" />
              <button className={primaryButton}>Attempt pickup</button>
              {can["attendance:pickup_approve"] && (
                <button type="button" onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (!form) return;
                  const values = new FormData(form);
                  void act("/api/phase2/pickups", {
                    action: "approveGuardian",
                    studentId: value(values, "studentId"),
                    guardianId: value(values, "guardianId")
                  });
                }} className={softButton}>Add to approved list</button>
              )}
            </form>
            {pickups?.pending.map((row) => (
              <div key={row.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <strong>{row.student.name}</strong> with {row.collectingGuardian.name}; requested by {row.requester.name}
                {can["attendance:pickup_approve"] && <div className="mt-2 flex gap-2">
                  <button onClick={() => void act("/api/phase2/pickups", { action: "review", requestId: row.id, decision: "approved" })} className={softButton}>Approve release</button>
                  <button onClick={() => void act("/api/phase2/pickups", { action: "review", requestId: row.id, decision: "rejected" })} className={softButton}>Reject</button>
                </div>}
              </div>
            ))}
          </Card>
        )}

        {can["classes:manage"] && (
          <Card title="Minimal timetable & substitutes" note="Suggestions never auto-assign; an authorized user must confirm.">
            <form onSubmit={onSlot} className="grid gap-3 sm:grid-cols-2">
              <Select name="classId" rows={context.classes} label="Class" />
              <Select name="subjectId" rows={context.subjects} label="Subject" />
              <Select name="teacherId" rows={context.staff} label="Teacher" />
              <label className="text-sm font-medium">Day
                <select name="dayOfWeek" className={inputClass}>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Period<input name="period" type="number" min="1" defaultValue="1" className={inputClass} /></label>
              <button className={primaryButton}>Save slot</button>
            </form>
            <form onSubmit={onSuggest} className="grid gap-3 sm:grid-cols-2">
              <Select name="teacherId" rows={context.staff} label="Absent/late teacher" />
              <label className="text-sm font-medium">Date<input name="day" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} /></label>
              <label className="text-sm font-medium">Period<input name="period" type="number" min="1" defaultValue="1" className={inputClass} /></label>
              <button className={softButton}>Suggest free teachers</button>
            </form>
            {suggestions.map((row) => (
              <button key={row.id} onClick={() => void act("/api/phase2/timetable", {
                action: "confirm", timetableSlotId: suggestedSlot,
                substituteTeacherId: row.id, assignmentDate: new Date().toISOString()
              })} className="mr-2 rounded-full bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900">
                Confirm {row.name}
              </button>
            ))}
            <div className="max-h-40 overflow-auto text-sm">
              {timetable?.slots.map((slot) => <p key={slot.id} className="border-b border-slate-100 py-2">Day {slot.dayOfWeek}, P{slot.period}: {slot.class.name} · {slot.subject.name} · {slot.teacher.name}</p>)}
            </div>
          </Card>
        )}

        {(can["payroll:manage"] || can["payroll:view_own"]) && (
          <Card title="Payroll & self-service payslips" note="Staff see only their own immutable PDF payslips.">
            {payroll?.canManage && <form onSubmit={onSalary} className="grid gap-3 sm:grid-cols-2">
              <Select name="staffId" rows={context.staff} label="Staff" />
              <label className="text-sm font-medium">Gross salary (GHS)<input name="grossSalary" type="number" min="0.01" step="0.01" required className={inputClass} /></label>
              <label className="text-sm font-medium">Deduction label<input name="deductionLabel" placeholder="SSNIT" className={inputClass} /></label>
              <label className="text-sm font-medium">Deduction type<select name="deductionType" className={inputClass}><option value="percent">Percent</option><option value="fixed">Fixed</option></select></label>
              <label className="text-sm font-medium">Deduction value<input name="deductionValue" type="number" min="0" step="0.01" defaultValue="0" className={inputClass} /></label>
              <button className={primaryButton}>Save salary structure</button>
            </form>}
            {payroll?.canManage && <form onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void act("/api/phase2/payroll", { action: "createRun", period: value(form, "period") });
            }} className="flex gap-2">
              <input name="period" type="month" required className={inputClass} />
              <button className={primaryButton}>Create run</button>
            </form>}
            {payroll?.runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
                <span>{run.period} · {run.status}</span>
                {run.status === "draft"
                  ? <button onClick={() => void act("/api/phase2/payroll", { action: "processRun", payrollRunId: run.id })} className={softButton}>Process</button>
                  : run.status === "processed"
                    ? <button onClick={() => void act("/api/phase2/payroll", { action: "markPaid", payrollRunId: run.id })} className={softButton}>Mark paid</button>
                    : null}
              </div>
            ))}
            {payroll?.payslips.map((row) => (
              <a key={row.id} target="_blank" href={"/api/phase2/payroll/payslips/" + row.id + "/pdf"} className="block rounded-lg bg-slate-100 p-3 text-sm font-semibold">
                {row.staff?.name ?? "My payslip"} · {row.payrollRun.period} · GHS {row.net}
              </a>
            ))}
          </Card>
        )}

        {can["templates:manage"] && (
          <Card title="Report-card gallery & branding" note="Choose one of three presets; add school logo, colours, and watermark.">
            <form onSubmit={onTemplate} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Template
                <select name="templateId" defaultValue={templates?.settings?.reportCardTemplateId ?? ""} required className={inputClass}>
                  <option value="">Select…</option>
                  {templates?.templates.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Logo
                <input type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setLogo(String(reader.result ?? ""));
                  reader.readAsDataURL(file);
                }} />
              </label>
              <label className="text-sm font-medium">Primary colour<input name="primaryColor" type="color" defaultValue="#1d4ed8" className={inputClass} /></label>
              <label className="text-sm font-medium">Accent colour<input name="accentColor" type="color" defaultValue="#dbeafe" className={inputClass} /></label>
              <label className="text-sm font-medium">Watermark<input name="watermark" defaultValue="SUKUUNOVA" maxLength={36} className={inputClass} /></label>
              <button className={primaryButton}>Apply brand</button>
            </form>
            <div className="grid grid-cols-3 gap-2">
              {templates?.templates.map((row) => <div key={row.id} className="rounded-xl border border-slate-200 p-3 text-center text-xs font-bold">{row.name}</div>)}
            </div>
          </Card>
        )}

        {can["visitors:log"] && (
          <Card title="Visitor log" note="Front desk sign-in, host, purpose, and sign-out timestamps.">
            <form onSubmit={onVisitor} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Visitor name<input name="name" required className={inputClass} /></label>
              <label className="text-sm font-medium">Phone<input name="phone" className={inputClass} /></label>
              <label className="text-sm font-medium">Purpose<input name="purpose" required className={inputClass} /></label>
              <Select name="hostStaffId" rows={context.staff} label="Host (optional)" />
              <button className={primaryButton}>Sign in visitor</button>
            </form>
            {visitors?.visitors.slice(0, 8).map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
                <span><strong>{row.name}</strong> · {row.purpose} · {row.timeOut ? "signed out" : "on site"}</span>
                {!row.timeOut && <button onClick={() => void act("/api/phase2/visitors", { action: "signOut", visitorId: row.id })} className={softButton}>Sign out</button>}
              </div>
            ))}
          </Card>
        )}

        {can["attendance:record"] && attendance && (
          <Card title="Staff attendance dashboard" note="Filterable attendance trend endpoint with present, late, and absent totals.">
            <div className="grid grid-cols-3 gap-3 text-center">
              {(["present", "late", "absent"] as const).map((key) => (
                <div key={key} className="rounded-xl bg-slate-100 p-4">
                  <strong className="block text-2xl">{attendance.totals[key]}</strong>
                  <span className="text-xs uppercase text-slate-500">{key}</span>
                </div>
              ))}
            </div>
            {attendance.trends.map((row) => (
              <div key={row.date} className="grid grid-cols-4 gap-2 border-b border-slate-100 py-2 text-sm">
                <span>{row.date}</span><span>{row.present} present</span><span>{row.late} late</span><span>{row.absent} absent</span>
              </div>
            ))}
          </Card>
        )}

        {can["settings:manage_school"] && (
          <Card title="Phase 2 safety & channels" note="Thresholds and approved Twilio template ContentSids are tenant settings.">
            <form onSubmit={onSettings} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Face threshold %<input name="threshold" type="number" min="80" max="100" defaultValue="95" className={inputClass} /></label>
              <label className="text-sm font-medium">Substitute late minutes<input name="lateMinutes" type="number" min="0" max="180" defaultValue="20" className={inputClass} /></label>
              <label className="flex items-center gap-2 text-sm"><input name="sms" type="checkbox" defaultChecked /> SMS</label>
              <label className="flex items-center gap-2 text-sm"><input name="whatsapp" type="checkbox" /> WhatsApp</label>
              {["student_absence", "staff_late", "invoice_created", "payment_received", "report_card_ready"].map((key) => (
                <label key={key} className="text-sm font-medium">{key} ContentSid<input name={key} placeholder="HX…" className={inputClass} /></label>
              ))}
              <button className={primaryButton}>Save Phase 2 settings</button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
