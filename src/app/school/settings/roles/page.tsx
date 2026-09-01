import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export default async function RolesPage() {
  const session = await requireSchoolSession();

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "settings:manage_roles");

    const [school, roles, permissions] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.role.findMany({
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          key: true,
          isSystem: true,
          _count: { select: { rolePermissions: true, userRoles: true } },
        },
      }),
      tx.permission.findMany({ orderBy: { key: "asc" }, select: { id: true, key: true, description: true } }),
    ]);

    return { school, roles, permissions };
  });

  if (!data.school) return null;

  return (
    <AppShell
      universe="school"
      title="Roles & Permissions"
      subtitle="Review the real school roles and permission assignments. Account-level access is managed separately under Sub-accounts & Access."
      active="Roles & Permissions"
      schoolName={data.school.name}
      schoolCode={data.school.uniqueCode}
      userName={session.name}
    >
      <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,.14)]">
          <span className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300">Access governance</span>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Real role inventory</h2>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-300">
                These counts come directly from this school&apos;s tenant-scoped role and permission records. No role is reported as configured unless the database contains its assignments.
              </p>
            </div>
            <Link href="/school/settings/access" className="rounded-xl bg-white px-4 py-2.5 text-[10px] font-black text-slate-950 hover:bg-slate-100">
              Open Sub-accounts & Access
            </Link>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Roles</span>
            <strong className="mt-2 block text-2xl font-black text-slate-950">{data.roles.length}</strong>
            <span className="mt-1 block text-[10px] text-slate-500">System and custom roles in this school.</span>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Permissions</span>
            <strong className="mt-2 block text-2xl font-black text-slate-950">{data.permissions.length}</strong>
            <span className="mt-1 block text-[10px] text-slate-500">Available permission definitions.</span>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Assigned accounts</span>
            <strong className="mt-2 block text-2xl font-black text-slate-950">{data.roles.reduce((sum, role) => sum + role._count.userRoles, 0)}</strong>
            <span className="mt-1 block text-[10px] text-slate-500">Role assignments across school users.</span>
          </article>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-[9px] font-black uppercase tracking-[.12em] text-emerald-700">Role catalogue</span>
              <h3 className="mt-1 text-base font-black text-slate-950">Configured roles</h3>
            </div>
            <span className="text-[10px] text-slate-500">Permission totals are database-backed.</span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Permissions</th>
                  <th className="px-3 py-2">Assigned users</th>
                </tr>
              </thead>
              <tbody>
                {data.roles.map((role) => (
                  <tr key={role.id}>
                    <td className="rounded-l-xl border-y border-l border-slate-200 bg-slate-50 px-3 py-3">
                      <strong className="block text-xs font-black text-slate-900">{role.name}</strong>
                      {role.key ? <span className="mt-1 block text-[9px] text-slate-500">{role.key}</span> : null}
                    </td>
                    <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-[10px] font-bold text-slate-600">
                      {role.isSystem ? "System" : "Custom"}
                    </td>
                    <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-[10px] font-bold text-slate-700">
                      {role._count.rolePermissions}
                    </td>
                    <td className="rounded-r-xl border-y border-r border-slate-200 bg-slate-50 px-3 py-3 text-[10px] font-bold text-slate-700">
                      {role._count.userRoles}
                    </td>
                  </tr>
                ))}
                {data.roles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500">
                      No roles are configured for this school.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="text-sm font-black text-emerald-950">How access is changed</h3>
          <p className="mt-1 text-[10px] leading-5 text-emerald-900">
            Role membership and delegated user access are controlled by the existing school access workflow. This page is intentionally an inventory view so it never presents unsaved local checkboxes as if they changed production permissions.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/school/settings/access" className="rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white hover:bg-slate-800">Manage users & access</Link>
            <Link href="/school/staff" className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-[10px] font-black text-emerald-900 hover:bg-emerald-100">Open staff directory</Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
