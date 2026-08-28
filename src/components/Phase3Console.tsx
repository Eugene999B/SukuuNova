"use client";

import { FormEvent, useEffect, useState } from "react";

type Caps = Record<string, boolean>;
type Context = { capabilities: Caps };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message ?? "Request failed.");
  return body;
}

function Card({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{note}</p><div className="mt-4 space-y-3">{children}</div>
  </section>;
}

function Input({ name, label, type="text", required=true }: { name:string; label:string; type?:string; required?:boolean }) {
  return <label className="block text-sm font-medium">{label}<input name={name} type={type} required={required} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>;
}

export function Phase3Console({ name }: { name: string }) {
  const [caps, setCaps] = useState<Caps>({});
  const [notice, setNotice] = useState("Loading Phase 3…");
  const [moduleData, setModuleData] = useState<Record<string, unknown>>({});

  async function load(module: string) {
    try {
      const response = await json<{ result: unknown }>(`/api/phase3/${module}`);
      setModuleData((current) => ({ ...current, [module]: response.result }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load module."); }
  }

  useEffect(() => {
    void json<{ result: Context }>("/api/phase3/analytics")
      .then((body) => setCaps(body.result.capabilities ?? {}))
      .catch(() => setCaps({}));
    void Promise.all(["transport","feeding","cbt","library","assets","finance","recruitment","analytics","sync"].map(load));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>, module: string, action: string) {
    event.preventDefault(); setNotice("Saving…");
    const form = new FormData(event.currentTarget); const payload: Record<string, unknown> = { action };
    for (const [key, value] of form.entries()) payload[key] = value;
    if (payload.items) { try { payload.items = JSON.parse(String(payload.items)); } catch { throw new Error("Offline items must be valid JSON."); } }
    try { await json(`/api/phase3/${module}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); setNotice("Saved successfully."); await load(module); event.currentTarget.reset(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Save failed."); }
  }

  if (!Object.keys(caps).length) return <main className="mx-auto max-w-7xl px-5 py-10"><p>{notice}</p></main>;
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";
  const button = "rounded-lg bg-nova px-4 py-2 font-semibold text-white";
  const table = (rows: unknown[], keys: string[]) => <div className="overflow-auto rounded-lg border"><table className="min-w-full text-sm"><thead><tr className="border-b bg-slate-50">{keys.map(k=><th key={k} className="px-3 py-2 text-left">{k}</th>)}</tr></thead><tbody>{rows.slice(0,20).map((row, i)=><tr key={i} className="border-b last:border-0">{keys.map(k=><td key={k} className="px-3 py-2">{String((row as Record<string,unknown>)?.[k] ?? "")}</td>)}</tr>)}</tbody></table></div>;
  const data = (key:string) => (moduleData[key] as Record<string,unknown>|undefined) ?? {};

  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-8">
    <header className="rounded-3xl bg-slate-950 p-7 text-white md:flex md:items-end md:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">SukuuNova Phase 3</p><h1 className="mt-2 text-3xl font-bold">Operations console</h1><p className="mt-2 text-slate-300">Welcome, {name}. Sensitive actions remain server-authorized and audited.</p></div>
      <nav className="mt-5 flex gap-2 md:mt-0"><a href="/phase2" className="rounded-lg bg-white/10 px-3 py-2 text-sm">Phase 2</a><a href="/dashboard" className="rounded-lg bg-white/10 px-3 py-2 text-sm">Dashboard</a></nav>
    </header>
    <div role="status" className="sticky top-3 z-20 mx-auto mt-4 max-w-xl rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-900 shadow">{notice}</div>
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      {caps["transport:manage"] && <Card title="Transport" note="Vehicles, routes, stops, GPS, parent locations, boarding and compliance reminders.">
        <form onSubmit={e=>submit(e,"transport","createVehicle")} className="grid gap-3 sm:grid-cols-3"><Input name="registrationNumber" label="Registration"/><Input name="name" label="Vehicle name"/><Input name="capacity" label="Capacity" type="number"/><button className={button}>Add vehicle</button></form>
        <form onSubmit={e=>submit(e,"transport","createRoute")} className="grid gap-3 sm:grid-cols-3"><Input name="name" label="Route name"/><Input name="code" label="Route code"/><Input name="origin" label="Origin" required={false}/><Input name="destination" label="Destination" required={false}/><button className={button}>Add route</button></form>
        <form onSubmit={e=>submit(e,"transport","updateLocation")} className="grid gap-3 sm:grid-cols-3"><Input name="vehicleId" label="Vehicle ID"/><Input name="latitude" label="Latitude"/><Input name="longitude" label="Longitude"/><Input name="speedKph" label="Speed kph" type="number"/><button className={button}>Publish GPS</button></form>
        {Array.isArray(data("transport").vehicles) && table(data("transport").vehicles as unknown[], ["registrationNumber","name","capacity","status"])}
      </Card>}

      {caps["feeding:manage"] && <Card title="Feeding" note="Budgets, menus, actual logs, actual-vs-plan data and optional invoice items.">
        <form onSubmit={e=>submit(e,"feeding","createBudget")} className="grid gap-3 sm:grid-cols-3"><Input name="name" label="Budget name"/><Input name="periodStart" label="Start" type="date"/><Input name="periodEnd" label="End" type="date"/><Input name="plannedAmount" label="Planned amount" type="number"/><button className={button}>Create budget</button></form>
        <form onSubmit={e=>submit(e,"feeding","createMenu")} className="grid gap-3 sm:grid-cols-3"><Input name="menuDate" label="Menu date" type="date"/><Input name="meal" label="Meal"/><Input name="plannedCost" label="Planned cost" type="number"/><Input name="items" label="Items JSON" required={false}/><button className={button}>Save menu</button></form>
        {Array.isArray(data("feeding").logs) && table(data("feeding").logs as unknown[], ["logDate","meal","servedCount","actualCost"])}
      </Card>}

      {caps["exams:take"] && <Card title="Objective CBT" note="Server-side timed attempts, answer persistence and automatic grading. Correct answers are hidden from non-managers.">
        {caps["exams:manage"] && <form onSubmit={e=>submit(e,"cbt","createExam")} className="grid gap-3 sm:grid-cols-3"><Input name="title" label="Exam title"/><Input name="durationSeconds" label="Duration seconds" type="number"/><Input name="opensAt" label="Opens" type="datetime-local" required={false}/><Input name="closesAt" label="Closes" type="datetime-local" required={false}/><button className={button}>Create exam</button></form>}
        <form onSubmit={e=>submit(e,"cbt","startAttempt")} className="grid gap-3 sm:grid-cols-3"><Input name="examId" label="Exam ID"/><Input name="studentId" label="Student ID"/><button className={button}>Start timed attempt</button></form>
        <form onSubmit={e=>submit(e,"cbt","submit")} className="grid gap-3 sm:grid-cols-3"><Input name="attemptId" label="Attempt ID"/><button className={button}>Submit / enforce deadline</button></form>
        {Array.isArray(data("cbt").exams) && table(data("cbt").exams as unknown[], ["title","durationSeconds","status","opensAt","closesAt"])}
      </Card>}

      {caps["library:borrow"] && <Card title="Library" note="Book catalogue, borrowing, returns and overdue tracking.">
        {caps["library:manage"] && <form onSubmit={e=>submit(e,"library","createBook")} className="grid gap-3 sm:grid-cols-3"><Input name="title" label="Book title"/><Input name="author" label="Author" required={false}/><Input name="copies" label="Copies" type="number"/><button className={button}>Add book</button></form>}
        <form onSubmit={e=>submit(e,"library","borrow")} className="grid gap-3 sm:grid-cols-3"><Input name="bookId" label="Book ID"/><Input name="studentId" label="Student ID"/><Input name="dueAt" label="Due" type="date"/><button className={button}>Borrow</button></form>
        {Array.isArray(data("library").loans) && table(data("library").loans as unknown[], ["bookId","studentId","borrowedAt","dueAt","status"])}
      </Card>}

      {caps["assets:manage"] && <Card title="Asset inventory" note="Tag assets, record condition, location, assignment and status.">
        <form onSubmit={e=>submit(e,"assets","create")} className="grid gap-3 sm:grid-cols-3"><Input name="assetTag" label="Asset tag"/><Input name="name" label="Name"/><Input name="category" label="Category" required={false}/><Input name="serialNumber" label="Serial number" required={false}/><Input name="location" label="Location" required={false}/><button className={button}>Add asset</button></form>
        {Array.isArray(data("assets").assets) && table(data("assets").assets as unknown[], ["assetTag","name","location","condition","status"])}
      </Card>}

      {caps["fees:adjust"] && <Card title="Fee waivers, scholarships & sibling billing" note="Requests begin as pending; only approved adjustments affect effective billing calculations.">
        <form onSubmit={e=>submit(e,"finance","request")} className="grid gap-3 sm:grid-cols-3"><Input name="studentId" label="Student ID"/><Input name="invoiceId" label="Invoice ID" required={false}/><label className="block text-sm font-medium">Type<select name="kind" className={input}><option value="waiver">Waiver</option><option value="scholarship">Scholarship</option><option value="sibling_discount">Sibling discount</option></select></label><label className="block text-sm font-medium">Mode<select name="mode" className={input}><option value="amount">Amount</option><option value="percent">Percent</option></select></label><Input name="value" label="Value" type="number"/><Input name="reason" label="Reason"/><Input name="siblingGroupKey" label="Sibling group" required={false}/><button className={button}>Request adjustment</button></form>
        {caps["fees:approve"] && <div className="flex flex-wrap gap-2"><form onSubmit={e=>submit(e,"finance","approve")}><Input name="id" label="Adjustment ID"/><button className={button}>Approve</button></form><form onSubmit={e=>submit(e,"finance","reject")}><Input name="id" label="Adjustment ID"/><button className={button}>Reject</button></form></div>}
        {Array.isArray(data("finance").adjustments) && table(data("finance").adjustments as unknown[], ["id","studentId","kind","mode","value","status"])}
      </Card>}

      {caps["recruitment:manage"] && <Card title="Recruitment" note="Postings, applicants and governed applicant-to-staff conversion through the existing staff-user creation service.">
        <form onSubmit={e=>submit(e,"recruitment","createPosting")} className="grid gap-3 sm:grid-cols-3"><Input name="title" label="Posting title"/><Input name="department" label="Department" required={false}/><Input name="employmentType" label="Employment type" required={false}/><button className={button}>Create posting</button></form>
        <form onSubmit={e=>submit(e,"recruitment","createApplicant")} className="grid gap-3 sm:grid-cols-3"><Input name="postingId" label="Posting ID"/><Input name="name" label="Applicant"/><Input name="email" label="Email" required={false}/><Input name="phone" label="Phone" required={false}/><button className={button}>Add applicant</button></form>
        <form onSubmit={e=>submit(e,"recruitment","convertApplicant")} className="grid gap-3 sm:grid-cols-3"><Input name="applicantId" label="Applicant ID"/><Input name="initialPassword" label="Initial password" type="password"/><Input name="roleName" label="Staff role" required={false}/><button className={button}>Convert to staff</button></form>
        {Array.isArray(data("recruitment").applicants) && table(data("recruitment").applicants as unknown[], ["id","name","email","status","staffUserId"])}
      </Card>}

      {caps["analytics:view"] && <Card title="Role-scoped analytics" note="Only analytics permitted to the signed-in school role are returned.">{moduleData.analytics && <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-white">{JSON.stringify(moduleData.analytics,null,2)}</pre>}</Card>}

      {caps["offline:sync"] && <Card title="Offline sync" note="Only attendance and scores are accepted. The server re-checks permissions at sync time and de-duplicates clientGeneratedId.">
        <form onSubmit={e=>submit(e,"sync","batch")} className="space-y-3"><label className="block text-sm font-medium">Batch JSON<textarea name="items" rows={8} placeholder='[{"clientGeneratedId":"...","entityType":"attendance","studentId":"...","type":"in","timestamp":"..."}]' required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label><button className={button}>Synchronize queued records</button></form>
        {Array.isArray(data("sync").queue) && table(data("sync").queue as unknown[], ["clientGeneratedId","entityType","status","entityId","error"])}
      </Card>}
    </div>
  </main>;
}
