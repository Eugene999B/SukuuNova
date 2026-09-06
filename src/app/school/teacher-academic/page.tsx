import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { hasPermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import TeacherAcademicWorkspace from "@/components/TeacherAcademicWorkspace";
import "./teacher-academic.css";

export default async function TeacherAcademicPage() {
  const session = await requireSchoolSession();
  await withTenant(session.schoolId, async tx => {
    const assigned = await hasPermission(tx, session.userId, "scores:write:assigned");
    const all = await hasPermission(tx, session.userId, "scores:write:all");
    if (!assigned && !all) throw new Error("You do not have teacher academic access.");
  });
  return <AppShell universe="school" title="Teacher Academic Studio" subtitle="Work, marks, notes and learner evidence" active="Teacher Academic Studio" userName={session.name}>
    <TeacherAcademicWorkspace />
  </AppShell>;
}
