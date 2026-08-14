import { redirect } from "next/navigation";
import {
  getPlatformSession,
  getSchoolSession
} from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { LogoutButton } from "@/components/LogoutButton";

export default async function DashboardPage() {
  const schoolSession = await getSchoolSession();

  if (schoolSession) {
    const account = await withTenant(schoolSession.schoolId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: schoolSession.userId },
        select: {
          id: true,
          name: true,
          school: { select: { name: true, uniqueCode: true } },
          userRoles: {
            include: { role: { select: { name: true } } }
          }
        }
      });
      return user;
    });

    if (!account) redirect("/login/school");

    return (
      <DashboardShell
        title={"Logged in as " + account.name}
        rows={[
          ["Universe", "School user"],
          ["School", account.school.name],
          ["School code", account.school.uniqueCode],
          [
            "Role",
            account.userRoles.map((membership) => membership.role.name).join(", ") ||
              "No role assigned"
          ]
        ]}
        universe="school"
      />
    );
  }

  const platformSession = await getPlatformSession();
  if (platformSession) {
    return (
      <DashboardShell
        title={"Logged in as " + platformSession.name}
        rows={[
          ["Universe", "Platform admin"],
          ["School", "Platform-wide"],
          ["Role", platformSession.role]
        ]}
        universe="platform"
      />
    );
  }

  redirect("/");
}

function DashboardShell({
  title,
  rows,
  universe
}: {
  title: string;
  rows: Array<[string, string]>;
  universe: "school" | "platform";
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 md:p-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-nova">
              SukuuNova Phase 0
            </p>
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
        <p className="mt-8 text-sm text-slate-500">
          This page proves the authentication, tenant, and role chain only.
          Product feature modules begin after Phase 0 review.
        </p>
      </section>
    </main>
  );
}
