import { AppShell } from "@/components/AppShell";
import SchoolStoreWorkspace from "@/components/SchoolStoreWorkspace";
import SchoolStoreDeepLinkController from "@/components/SchoolStoreDeepLinkController";
import { requireSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export default async function SchoolStorePage() {
  const session = await requireSchoolSession();
  const context = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "store:view");
    const [school, access] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getSchoolAuthorization(tx, session.userId),
    ]);
    return { school, role: access.roles.map((role) => role.name).join(" · ") || "School account" };
  });
  if (!context.school) return null;
  return <AppShell universe="school" title="School Store" subtitle="Products, stock, sales and receipts." active="School Store" schoolName={context.school.name} schoolCode={context.school.uniqueCode} userName={session.name} role={context.role}>
    <SchoolStoreDeepLinkController />
    <SchoolStoreWorkspace />
  </AppShell>;
}
