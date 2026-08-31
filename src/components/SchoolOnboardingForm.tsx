"use client";

import { FormEvent, useState } from "react";

type CreatedSchool = { name: string; uniqueCode: string };

export function SchoolOnboardingForm() {
  const [notice, setNotice] = useState("Create a tenant with all default Phase 1 roles and permissions.");
  const [created, setCreated] = useState<CreatedSchool | null>(null);
  const [ownerEmail, setOwnerEmail] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form).entries());
    setCreated(null);
    setOwnerEmail(String(input.ownerEmail || ""));
    setNotice("Creating school…");
    const response = await fetch("/api/platform/schools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) { setNotice(result.message ?? "Onboarding failed."); return; }
    const school = result.result?.school;
    setCreated({ name: school?.name ?? String(input.schoolName), uniqueCode: school?.uniqueCode ?? String(input.uniqueCode) });
    setNotice("School created successfully. The owner can now use the school login.");
    form.reset();
  }

  const field = "rounded-xl border border-slate-300 px-4 py-3";
  return (
    <div>
      {created ? (
        <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-slate-900" role="status" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">School ready</p>
          <h2 className="mt-1 text-xl font-bold">{created.name}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3"><span className="block text-xs text-slate-500">School code</span><strong>{created.uniqueCode}</strong></div>
            <div className="rounded-xl bg-white p-3"><span className="block text-xs text-slate-500">Owner email</span><strong className="break-all">{ownerEmail}</strong></div>
            <div className="rounded-xl bg-white p-3"><span className="block text-xs text-slate-500">School login</span><strong>/login/school</strong></div>
          </div>
          <p className="mt-3 text-sm text-slate-600">The owner signs in with the temporary password supplied during onboarding and is then required to secure the account.</p>
        </section>
      ) : (
        <div className="mt-8 rounded-xl bg-slate-100 p-4 text-sm" role="status">{notice}</div>
      )}

      <form className="mt-8 grid gap-4" onSubmit={submit}>
        <input className={field} name="uniqueCode" placeholder="School login code" required />
        <input className={field} name="schoolName" placeholder="School name" required />
        <input className={field} name="ownerName" placeholder="Owner name" required />
        <input className={field} name="ownerEmail" type="email" placeholder="Owner email" required />
        <input className={field} name="ownerPassword" type="password" minLength={12} placeholder="Temporary password (12+ characters)" required />
        <button className="rounded-xl bg-nova px-5 py-3 font-semibold text-white">Create school securely</button>
      </form>
    </div>
  );
}
