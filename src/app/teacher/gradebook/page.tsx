import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import TeacherGradebookLauncher from "@/components/TeacherGradebookLauncher";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { selectAcademicTerm } from "@/lib/term-date";
import { DEFAULT_TEACHING_WEEKS, getTeachingWeekMap } from "@/lib/term-teaching-weeks";
import "./markbook-v3.css";
import "./markbook-v5.css";

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
    const teachingWeeks = activeTerm ? (weekMap.get(activeTerm.id) ?? DEFAULT_TEACHING_WEEKS) : DEFAULT_TEACHING_WEEKS;
    return { school, assignments, activeTerm, teachingWeeks, role: access.roles.map((role) => role.name).join(" · ") };
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
    <AppShell universe="teacher" title="My Gradebook" subtitle="Open a class markbook and enter marks quickly." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
      <div className="gradebook-start-page">
        <section className="gradebook-start-heading">
          <div><span>TEACHER MARKBOOK</span><h1>Ready to enter marks?</h1><p>Choose your assigned class, subject and week. SukuuNova already knows the active term.</p></div>
          <div className="gradebook-active-term"><span>ACTIVE TERM</span><strong>{data.activeTerm?.name ?? "Not active"}</strong><small>{data.activeTerm?.academicYear.name ?? "School calendar"}</small></div>
        </section>

        {!data.activeTerm ? <div className="gradebook-start-alert"><strong>No active academic term.</strong><span>School leadership must activate the working term before marks can be entered.</span></div> : null}
        {!data.assignments.length ? <div className="gradebook-start-alert"><strong>No assigned classes or subjects.</strong><span>Your gradebook only shows teaching assignments linked to your teacher account.</span></div> : null}

        <section className="gradebook-launch-card">
          <TeacherGradebookLauncher assignments={launcherAssignments} teachingWeeks={data.teachingWeeks} disabled={!data.activeTerm || !data.assignments.length} />
        </section>
      </div>
    </AppShell>
  );
}
