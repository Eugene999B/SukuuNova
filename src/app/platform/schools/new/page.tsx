import { redirect } from "next/navigation";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { SchoolOnboardingForm } from "@/components/SchoolOnboardingForm";

export default async function NewSchoolPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.manage");
  if (session.role !== "super_admin") redirect("/platform/schools");
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <a className="text-sm font-semibold text-nova" href="/platform">← Platform</a>
      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 md:p-12">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-nova">SukuuNova Platform Admin</p>
        <h1 className="mt-2 text-3xl font-bold">Onboard a school</h1>
        <p className="mt-3 text-slate-600">Creates the isolated tenant, settings, baseline roles, permissions, owner account, and immutable audit records.</p>
        <SchoolOnboardingForm />
      </section>
    </main>
  );
}
