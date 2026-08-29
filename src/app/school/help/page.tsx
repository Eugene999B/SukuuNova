import { AppShell } from "@/components/AppShell";
import ReportsAdminStudioPro from "@/components/ReportsAdminStudioPro";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function HelpPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) return null;
  return <AppShell universe="school" title="Help & Support" subtitle="Guides, troubleshooting and support for every part of your SukuuNova school workspace." active="Help & Support" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><ReportsAdminStudioPro mode="help" schoolName={school.name} /></AppShell>;
}
