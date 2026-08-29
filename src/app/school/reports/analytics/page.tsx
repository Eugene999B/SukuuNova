import { AppShell } from "@/components/AppShell";
import ReportsAdminStudioPro from "@/components/ReportsAdminStudioPro";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "../reports-light.css";

export default async function AnalyticsPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) return null;
  return <AppShell universe="school" title="School Analytics" subtitle="See the school clearly through performance, attendance, finance and operational intelligence." active="School Analytics" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><div className="reports-light"><ReportsAdminStudioPro mode="analytics" schoolName={school.name} /></div></AppShell>;
}
