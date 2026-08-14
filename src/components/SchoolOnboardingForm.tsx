"use client";

import { FormEvent, useState } from "react";

export function SchoolOnboardingForm() {
  const [notice, setNotice] = useState("Create a tenant with all default Phase 1 roles and permissions.");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form).entries());
    setNotice("Creating school…");
    const response = await fetch("/api/platform/schools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.message ?? "Onboarding failed.");
      return;
    }
    setNotice("School created. Tenant ID: " + result.result.school.id);
    form.reset();
  }
  const field = "rounded-xl border border-slate-300 px-4 py-3";
  return (
    <form className="mt-8 grid gap-4" onSubmit={submit}>
      <div className="rounded-xl bg-slate-100 p-4 text-sm" role="status">{notice}</div>
      <input className={field} name="uniqueCode" placeholder="School login code" required />
      <input className={field} name="schoolName" placeholder="School name" required />
      <input className={field} name="ownerName" placeholder="Owner name" required />
      <input className={field} name="ownerEmail" type="email" placeholder="Owner email" required />
      <input className={field} name="ownerPassword" type="password" minLength={12} placeholder="Temporary password (12+ characters)" required />
      <button className="rounded-xl bg-nova px-5 py-3 font-semibold text-white">Create school securely</button>
    </form>
  );
}
