import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

const guides = [
  ["Take today's class register", "/teacher/attendance"],
  ["Create homework, quizzes or classwork", "/teacher/studio"],
  ["Enter or review marks", "/teacher/studio#marks"],
  ["Plan and publish lesson notes", "/teacher/studio#notes"],
  ["See your students", "/teacher/students"],
  ["See your timetable", "/teacher/timetable"],
] as const;

export default async function TeacherHelpPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    return { school, role: access.roles.map((role) => role.name).join(" · ") };
  });

  return (
    <AppShell universe="teacher" title="Teacher Help" subtitle="Help for your teaching workspace only." active="Help & Support" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
      <div className="teacher-workspace">
        <section className="teacher-page-head">
          <div><span className="teacher-eyebrow">TEACHER · SUPPORT</span><h2>Stay inside your teaching workspace</h2><p>These guides never send a teacher into school-owner administration.</p></div>
          <Link className="teacher-primary-action" href="/teacher">Teacher home →</Link>
        </section>
        <section className="teacher-module-grid">
          <article className="teacher-surface">
            <span className="teacher-eyebrow">Common tasks</span>
            <h3>Teaching workflow</h3>
            <div className="teacher-action-list">{guides.map(([label, href]) => <Link href={href} key={href}>{label}<span>→</span></Link>)}</div>
          </article>
          <article className="teacher-surface">
            <span className="teacher-eyebrow">Access boundary</span>
            <h3>Your account is deliberately separated</h3>
            <p>School-wide settings, finance administration, user access, role management and owner controls belong to authorised school-administration accounts. Your teacher session stays in the Teacher Workspace even if an old administrative link is opened.</p>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
