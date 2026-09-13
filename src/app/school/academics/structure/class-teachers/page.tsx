import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import ClassTeacherAssignments from "./ClassTeacherAssignments";

export default async function ClassTeacherAssignmentsPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    return tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
  });
  if (!school) return null;
  return <AppShell universe="school" title="Class Teacher Assignments" subtitle="Assign class responsibility by academic year and class section." active="Academic Settings" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name} role="Academic leadership"><ClassTeacherAssignments /></AppShell>;
}
