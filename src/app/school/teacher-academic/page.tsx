import Link from "next/link";
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
    <div className="taw-context-banner"><div><strong>Class teacher/headteacher too?</strong><span>My Class gives you whole-class attendance, report readiness and final-session promotion recommendations without changing other teachers' marks.</span></div><Link className="taw-btn ghost" href="/school/class-teacher">Open My Class</Link></div>
    <TeacherAcademicWorkspace />
  </AppShell>;
}
