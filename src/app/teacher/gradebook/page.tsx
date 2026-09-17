import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import TeacherGradebookLauncher from "@/components/TeacherGradebookLauncher";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";
import { DEFAULT_TEACHING_WEEKS, getTeachingWeekMap } from "@/lib/term-teaching-weeks";
import "./weekly-gradebook.css";

export default async function TeacherGradebookPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher") redirect("/dashboard");
    if (!(await access.can("scores:write:assigned")) && !(await access.can("scores:write:all"))) throw new Error("You do not have gradebook access.");

    const [school, assignments, terms, settings, weekMap] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.classSubjectTeacher.findMany({
        where: { schoolId: session.schoolId, teacherId: session.userId },
        orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
        select: {
          classId: true,
          subjectId: true,
          class: { select: { name: true, level: true, _count: { select: { students: true } } } },
          subject: { select: { name: true } },
        },
      }),
      tx.term.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true, academicYear: { select: { name: true } } } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      getTeachingWeekMap(tx, session.schoolId),
    ]);

    const timezone = settings?.timezone || "Africa/Accra";
    const activeTerm = selectAcademicTerm(terms, undefined, new Date(), timezone);
    const endedOpenTerms = terms.filter((term) => termLifecycle(term, new Date(), timezone).state === "ended");
    const teachingWeeks = activeTerm ? (weekMap.get(activeTerm.id) ?? DEFAULT_TEACHING_WEEKS) : DEFAULT_TEACHING_WEEKS;

    return { school, assignments, terms, activeTerm, endedOpenTerms, teachingWeeks, role: access.roles.map((role) => role.name).join(" · ") };
  });

  const launcherAssignments = data.assignments.map((assignment) => ({
    classId: assignment.classId,
    subjectId: assignment.subjectId,
    className: assignment.class.name,
    classLevel: assignment.class.level,
    subjectName: assignment.subject.name,
    learnerCount: assignment.class._count.students,
  }));

  return (
    <AppShell universe="teacher" title="My Gradebook" subtitle="Choose your assigned class, subject and week, then open the worksheet." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
      <div className="teacher-workspace weekly-gradebook-home">
        <section className="weekly-gradebook-hero">
          <div><span className="teacher-eyebrow">TEACHER · GRADEBOOK</span><h2>Enter marks without setting up a complicated assessment.</h2><p>SukuuNova already knows the active term. Choose only a class assigned to you, its assigned subject, and the teaching week.</p></div>
          <div className="weekly-active-term"><span>ACTIVE TERM</span><strong>{data.activeTerm?.name ?? "No active term"}</strong><small>{data.activeTerm?.academicYear.name ?? "School calendar controls the working term"}</small></div>
        </section>

        {!data.activeTerm ? <section className="teacher-surface"><strong>No writable academic term is active today.</strong><p>School leadership must configure the academic calendar before teachers can enter new marks.</p></section> : null}
        {!data.assignments.length ? <section className="teacher-surface"><strong>No teaching assignment is available.</strong><p>Only class-subject combinations assigned to this teacher account can appear in the gradebook.</p></section> : null}

        <section className="teacher-surface weekly-launcher-surface"><TeacherGradebookLauncher assignments={launcherAssignments} teachingWeeks={data.teachingWeeks} disabled={!data.activeTerm || !data.assignments.length} /></section>

        {data.endedOpenTerms.length ? <section className="teacher-surface weekly-history-note"><div><span className="teacher-eyebrow">LEADERSHIP ACTION NEEDED</span><h3>{data.endedOpenTerms.length} ended term{data.endedOpenTerms.length === 1 ? " is" : "s are"} still unlocked.</h3><p>Teachers stay on the current term automatically. Leadership can review and close older terms from Academic Terms.</p></div></section> : null}

        <section className="teacher-surface weekly-history-note">
          <div><span className="teacher-eyebrow">OTHER TOOLS</span><h3>Online assessments remain separate from everyday weekly marks.</h3><p>Use the weekly worksheet for ordinary teacher-entered marks. Use Online Assessments when learners should answer digitally.</p></div>
          <Link className="teacher-primary-action" href="/teacher/studio#activities">Online assessments →</Link>
        </section>
      </div>
    </AppShell>
  );
}
