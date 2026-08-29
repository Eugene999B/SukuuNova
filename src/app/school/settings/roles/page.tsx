import { AppShell } from "@/components/AppShell";
import ReportsAdminStudio from "@/components/ReportsAdminStudio";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function RolesPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) return null;
  return <AppShell universe="school" title="Roles & Permissions" subtitle="Control exactly who can view, create, approve, export and administer each part of the school." active="Roles & Permissions" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><ReportsAdminStudio mode="roles" schoolName={school.name} /></AppShell>;
}
