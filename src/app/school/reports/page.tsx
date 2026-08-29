import { AppShell } from "@/components/AppShell";
import ReportsAdminStudio from "@/components/ReportsAdminStudio";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function ReportsPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) return null;
  return <AppShell universe="school" title="Reports" subtitle="Run, schedule and organise official school reports." active="Reports" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><ReportsAdminStudio mode="reports" schoolName={school.name} /></AppShell>;
}
