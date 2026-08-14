import { redirect } from "next/navigation";
import { getPlatformSession, getSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { LogoutButton } from "@/components/LogoutButton";

export default async function DashboardPage() {
  const schoolSession = await getSchoolSession();
  if (schoolSession) {
    const account = await withTenant(schoolSession.schoolId, (tx) =>
      tx.user.findUnique({
        where: { id: schoolSession.userId },
        select: {
          name: true,
          school: { select: { name: true, uniqueCode: true } },
          userRoles: { include: { role: { select: { name: true } } } }
        }
      })
    );
    if (!account) redirect("/login/school");
    return (
      <DashboardShell
        title={"Welcome, " + account.name}
        rows={[
          ["Universe", "School user"],
          ["School", account.school.name],
          ["School code", account.school.uniqueCode],
          ["Role", account.userRoles.map((row) => row.role.name).join(", ") || "No role assigned"]
        ]}
        universe="school"
        href="/phase2"
        cta="Open Phase 2 operations"
      />
    );
  }

  const platformSession = await getPlatformSession();
  if (platformSession) {
    return (
      <DashboardShell
        title={"Welcome, " + platformSession.name}
        rows={[
          ["Universe", "Platform admin"],
          ["School", "Platform-wide"],
          ["Role", platformSession.role]
        ]}
        universe="platform"
        href="/platform/schools/new"
        cta="Onboard a school"
      />
    );
  }
  redirect("/");
}

function DashboardShell({
  title, rows, universe, href, cta
}: {
  title: string;
  rows: Array<[string, string]>;
  universe: "school" | "platform";
  href: string;
  cta: string;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 md:p-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-nova">SukuuNova</p>
            <h1 className="mt-2 text-3xl font-bold">{title}</h1>
          </div>
          <LogoutButton universe={universe} />
        </div>
        <dl className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {rows.map(([label, value]) => (
            <div className="grid gap-1 px-5 py-4 sm:grid-cols-3" key={label}>
              <dt className="font-medium text-slate-500">{label}</dt>
              <dd className="sm:col-span-2">{value}</dd>
            </div>
          ))}
        </dl>
        <a className="mt-8 inline-flex rounded-xl bg-nova px-5 py-3 font-semibold text-white" href={href}>{cta}</a>
      </section>
    </main>
  );
}
