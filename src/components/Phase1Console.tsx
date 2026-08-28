"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Snapshot = Record<string, unknown>;

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Request failed.");
  return result;
}

function fromForm(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}

export function Phase1Console() {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [notice, setNotice] = useState("Loading school workspace…");

  const refresh = useCallback(async () => {
    try {
      const [setup, gradebook, reports, settings] = await Promise.all([
        api("/api/mvp/setup"),
        api("/api/mvp/gradebook").catch(() => ({})),
        api("/api/mvp/report-cards").catch(() => ({})),
        api("/api/mvp/settings")
      ]);
      setSnapshot({ ...setup, ...gradebook, ...reports, ...settings });
      setNotice("Workspace is current.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load workspace.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    transform: (raw: Record<string, FormDataEntryValue>) => unknown,
    method = "POST"
  ) {
    event.preventDefault();
    setNotice("Saving…");
    try {
      const result = await api(path, method, transform(fromForm(event.currentTarget)));
      setNotice("Saved successfully: " + (result.result?.id ?? "done"));
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed.");
    }
  }

  const field = "rounded-xl border border-slate-300 px-3 py-2 text-sm";
  const button = "rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-nova";
  const section = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10">
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-nova">SukuuNova Phase 1</p>
          <h1 className="mt-2 text-4xl font-bold">School operations console</h1>
          <p className="mt-2 max-w-2xl text-slate-600">Academic setup, SIS, attendance, gradebook, fees, report cards, and SMS outbox in one tenant-safe workspace.</p>
        </div>
        <a className="text-sm font-semibold text-nova" href="/dashboard">Back to dashboard</a>
      </header>
      <div className="mb-7 rounded-2xl bg-slate-900 px-5 py-4 text-sm text-white" role="status">{notice}</div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={section}>
          <h2 className="text-xl font-bold">School configuration</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/settings", (r) => ({
            expectedResumptionTime: r.expectedResumptionTime,
            attendanceGraceMinutes: Number(r.attendanceGraceMinutes),
            timezone: r.timezone,
            gradeCaWeight: Number(r.gradeCaWeight),
            gradeExamWeight: Number(r.gradeExamWeight),
            allowPartialReportCards: r.allowPartialReportCards === "on",
            smsSenderId: r.smsSenderId || undefined
          }), "PATCH")}>
            <input className={field} name="expectedResumptionTime" type="time" required defaultValue="08:00" />
            <input className={field} name="attendanceGraceMinutes" type="number" min="0" placeholder="Grace minutes" required defaultValue="10" />
            <input className={field} name="timezone" required defaultValue="Africa/Accra" />
            <input className={field} name="smsSenderId" placeholder="SMS sender ID" />
            <input className={field} name="gradeCaWeight" type="number" min="0" max="100" required defaultValue="40" />
            <input className={field} name="gradeExamWeight" type="number" min="0" max="100" required defaultValue="60" />
            <label className="flex items-center gap-2 text-sm"><input name="allowPartialReportCards" type="checkbox" /> Allow partial report cards</label>
            <button className={button}>Save settings</button>
          </form>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Academic calendar</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/setup", (r) => ({ action: "academicYear", name: r.name, startDate: r.startDate, endDate: r.endDate }))}>
            <input className={field} name="name" placeholder="2026/2027" required />
            <input className={field} name="startDate" type="date" required />
            <input className={field} name="endDate" type="date" required />
            <button className={button}>Create academic year</button>
          </form>
          <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/setup", (r) => ({ action: "term", academicYearId: r.academicYearId, name: r.name, startDate: r.startDate, endDate: r.endDate }))}>
            <input className={field} name="academicYearId" placeholder="Academic year ID" required />
            <input className={field} name="name" placeholder="Term 1" required />
            <input className={field} name="startDate" type="date" required />
            <input className={field} name="endDate" type="date" required />
            <button className={button}>Create term</button>
          </form>
          <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/setup", (r) => ({ action: "event", academicYearId: r.academicYearId, type: r.type, name: r.name, startDate: r.startDate, endDate: r.endDate, affectsAttendance: true }))}>
            <input className={field} name="academicYearId" placeholder="Academic year ID" required />
            <select className={field} name="type"><option value="holiday">Holiday</option><option value="vacation">Vacation</option><option value="exam_week">Exam week</option><option value="closure">Closure</option></select>
            <input className={field} name="name" placeholder="Event name" required />
            <input className={field} name="startDate" type="date" required />
            <input className={field} name="endDate" type="date" required />
            <button className={button}>Add calendar event</button>
          </form>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Classes, subjects, and students</h2>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => submit(e, "/api/mvp/setup", (r) => ({ action: "class", name: r.name, level: r.level || undefined, classTeacherId: r.classTeacherId || undefined }))}>
            <input className={field} name="name" placeholder="Class name" required />
            <input className={field} name="level" placeholder="Level" />
            <input className={field} name="classTeacherId" placeholder="Class teacher user ID" />
            <button className={button}>Create class</button>
          </form>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => submit(e, "/api/mvp/setup", (r) => ({ action: "subject", name: r.name }))}>
            <input className={field} name="name" placeholder="Subject name" required />
            <button className={button}>Create subject</button>
          </form>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/setup", (r) => ({ action: "assignment", classId: r.classId, subjectId: r.subjectId, teacherId: r.teacherId }))}>
            <input className={field} name="classId" placeholder="Class ID" required />
            <input className={field} name="subjectId" placeholder="Subject ID" required />
            <input className={field} name="teacherId" placeholder="Teacher user ID" required />
            <button className={button}>Assign teacher</button>
          </form>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/setup", (r) => ({
            action: "student", admissionNo: r.admissionNo, name: r.name, classId: r.classId || undefined,
            guardian: r.guardianPhone ? { name: r.guardianName, phone: r.guardianPhone, relationship: r.relationship || "Guardian", isPrimary: true } : undefined
          }))}>
            <input className={field} name="admissionNo" placeholder="Admission number" required />
            <input className={field} name="name" placeholder="Student name" required />
            <input className={field} name="classId" placeholder="Class ID" />
            <input className={field} name="guardianName" placeholder="Guardian name" />
            <input className={field} name="guardianPhone" placeholder="Guardian phone" />
            <input className={field} name="relationship" placeholder="Relationship" />
            <button className={button}>Register student</button>
          </form>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Attendance</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/attendance", (r) => ({ action: "record", target: { studentId: r.studentId }, type: r.type }))}>
            <input className={field} name="studentId" placeholder="Student ID" required />
            <select className={field} name="type"><option value="in">Check in</option><option value="out">Check out</option></select>
            <button className={button}>Record manually</button>
          </form>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => submit(e, "/api/mvp/attendance", (r) => ({ action: "qrScan", token: r.token, type: "in" }))}>
            <input className={field + " flex-1"} name="token" placeholder="Signed QR token" required />
            <button className={button}>Scan check-in</button>
          </form>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => submit(e, "/api/mvp/attendance", (r) => ({ action: "finalize", day: r.day, classId: r.classId || undefined }))}>
            <input className={field} name="day" type="date" required />
            <input className={field} name="classId" placeholder="Class ID (optional)" />
            <button className={button}>Finalize absences</button>
          </form>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Gradebook</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/gradebook", (r) => ({
            action: "assessment", termId: r.termId, classId: r.classId, subjectId: r.subjectId,
            name: r.name, type: r.type, weight: Number(r.weight), maxScore: Number(r.maxScore)
          }))}>
            <input className={field} name="termId" placeholder="Term ID" required />
            <input className={field} name="classId" placeholder="Class ID" required />
            <input className={field} name="subjectId" placeholder="Subject ID" required />
            <input className={field} name="name" placeholder="Assessment name" required />
            <select className={field} name="type"><option value="ca">Continuous assessment</option><option value="exam">Exam</option></select>
            <input className={field} name="weight" type="number" min="1" defaultValue="100" required />
            <input className={field} name="maxScore" type="number" min="1" defaultValue="100" required />
            <button className={button}>Create assessment</button>
          </form>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => submit(e, "/api/mvp/gradebook", (r) => ({ action: "score", studentId: r.studentId, assessmentId: r.assessmentId, value: Number(r.value) }))}>
            <input className={field} name="studentId" placeholder="Student ID" required />
            <input className={field} name="assessmentId" placeholder="Assessment ID" required />
            <input className={field} name="value" type="number" min="0" step="0.01" placeholder="Score" required />
            <button className={button}>Save score</button>
          </form>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Fees and payments</h2>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => submit(e, "/api/mvp/finance", (r) => ({ action: "feeItem", termId: r.termId, classId: r.classId || undefined, name: r.name, amount: Number(r.amount) }))}>
            <input className={field} name="termId" placeholder="Term ID" required />
            <input className={field} name="classId" placeholder="Class ID (optional)" />
            <input className={field} name="name" placeholder="Fee name" required />
            <input className={field} name="amount" type="number" min="0.01" step="0.01" placeholder="GHS" required />
            <button className={button}>Add fee</button>
          </form>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => submit(e, "/api/mvp/finance", (r) => ({ action: "invoice", studentId: r.studentId, termId: r.termId }))}>
            <input className={field} name="studentId" placeholder="Student ID" required />
            <input className={field} name="termId" placeholder="Term ID" required />
            <button className={button}>Generate invoice</button>
          </form>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/finance", (r) => ({ action: "payment", invoiceId: r.invoiceId, amount: Number(r.amount), method: r.method, reference: r.reference || undefined }))}>
            <input className={field} name="invoiceId" placeholder="Invoice ID" required />
            <input className={field} name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" required />
            <select className={field} name="method"><option value="momo">Manual MoMo reconciliation</option><option value="cash">Cash</option><option value="card">Card</option></select>
            <input className={field} name="reference" placeholder="MoMo/reference" />
            <button className={button}>Record payment</button>
          </form>
        </section>

        <section className={section + " lg:col-span-2"}>
          <h2 className="text-xl font-bold">Report-card workflow</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/report-cards", (r) => ({ action: "generate", studentId: r.studentId, termId: r.termId, remarks: r.remarks || undefined }))}>
              <input className={field} name="studentId" placeholder="Student ID" required />
              <input className={field} name="termId" placeholder="Term ID" required />
              <input className={field} name="remarks" placeholder="Remarks" />
              <button className={button}>Generate one PDF</button>
            </form>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => submit(e, "/api/mvp/report-cards", (r) => ({ action: r.action, reportCardId: r.reportCardId }))}>
              <input className={field} name="reportCardId" placeholder="Report card ID" required />
              <select className={field} name="action"><option value="submit">Class teacher submits</option><option value="approve">Principal/Owner approves</option><option value="send">Send to parent</option></select>
              <button className={button}>Advance workflow</button>
            </form>
          </div>
        </section>
      </div>

      <section className={section + " mt-6"}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Current tenant snapshot</h2>
          <button className={button} onClick={() => void refresh()}>Refresh</button>
        </div>
        <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-slate-950 p-5 text-xs text-emerald-300">{JSON.stringify(snapshot, null, 2)}</pre>
      </section>
    </main>
  );
}
