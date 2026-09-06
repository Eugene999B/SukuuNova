import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import TimetableWorkspace from "./TimetableWorkspace";
import "./timetable.css";

export default async function TimetablePage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    return tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
  });
  return <AppShell universe="school" title="Timetable" subtitle="Intelligent weekly scheduling." active="Timetable" schoolName={school?.name ?? "School Workspace"} schoolCode={school?.uniqueCode ?? ""} userName={session.name}><main className="timetable-page"><TimetableWorkspace /></main></AppShell>;
}
