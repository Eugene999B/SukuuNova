import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";

export default async function TeacherGradebookPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher") redirect("/dashboard");
    if (!(await access.can("scores:write:assigned")) && !(await access.can("scores:write:all"))) throw new Error("You do not have gradebook access.");
    const [school, assignments, terms, settings] = await Promise.all([
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
    ]);
    const timezone = settings?.timezone || "Africa/Accra";
    const activeTerm = selectAcademicTerm(terms, undefined, new Date(), timezone);
    const endedOpenTerms = terms.filter((term) => termLifecycle(term, new Date(), timezone).state === "ended");
    return { school, assignments, terms, activeTerm, endedOpenTerms, timezone, role: access.roles.map((role) => role.name).join(" · ") };
  });

  return (
    <AppShell universe="teacher" title="My Gradebook" subtitle="Fast marks for the classes and subjects assigned to you." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
      <div className="teacher-workspace">
        <section className="teacher-page-head">
          <div><span className="teacher-eyebrow">TEACHER · GRADEBOOK</span><h2>Your active-term markbooks</h2><p>The school calendar chooses the term. Choose your class and subject, then record ordinary marks directly inside the markbook.</p></div>
          <Link className="teacher-primary-action" href="/teacher/studio#activities">Create online assessment →</Link>
        </section>
        <section className="teacher-scope-strip">
          <div><span>Teaching assignments</span><strong>{data.assignments.length}</strong></div>
          <div><span>Current term</span><strong>{data.activeTerm?.name ?? "—"}</strong></div>
          <div><span>Academic year</span><strong>{data.activeTerm?.academicYear.name ?? "—"}</strong></div>
        </section>
        {!data.activeTerm ? <section className="teacher-surface"><span className="teacher-eyebrow">TERM CONTROL</span><h3>No writable academic term is active today.</h3><p>Teachers cannot choose a future or expired term for new marks. School leadership must configure the calendar and finalize any ended term.</p></section> : null}
        {data.endedOpenTerms.length ? <section className="teacher-surface"><span className="teacher-eyebrow">LEADERSHIP ACTION NEEDED</span><h3>{data.endedOpenTerms.length} ended term{data.endedOpenTerms.length===1?" is":"s are"} still unlocked.</h3><p>Those terms remain historical for teachers. Leadership should review reports and lock them from Academic Terms so records are formally closed.</p></section> : null}
        <section className="teacher-surface">
          <span className="teacher-eyebrow">ASSIGNED MARKBOOKS</span><h3>Choose a class and subject</h3>
          {data.assignments.length && data.activeTerm ? <div className="teacher-assignment-list">{data.assignments.map((assignment) => <Link key={`${assignment.classId}:${assignment.subjectId}`} href={`/teacher/gradebook/${encodeURIComponent(assignment.classId)}__${encodeURIComponent(assignment.subjectId)}?term=${encodeURIComponent(data.activeTerm!.id)}`}><strong>{assignment.class.level ? `${assignment.class.level} · ` : ""}{assignment.class.name}</strong><span>{assignment.subject.name} · {assignment.class._count.students} learners · Record marks →</span></Link>)}</div> : <div className="teacher-empty-state"><strong>{data.assignments.length ? "Waiting for an active term." : "No subject teaching assignment yet."}</strong><p>{data.assignments.length ? "Your markbooks will become writable automatically when the configured term starts." : "School leadership must assign one or more class-subject responsibilities to this teacher account."}</p></div>}
        </section>
        <section className="teacher-surface"><span className="teacher-eyebrow">HISTORY</span><h3>Previous terms stay available without becoming the working term</h3><div className="teacher-assignment-list">{data.terms.filter((term)=>term.id!==data.activeTerm?.id).slice(0,6).map((term)=><div key={term.id}><strong>{term.academicYear.name} · {term.name}</strong><span>{term.isLocked?"Locked archive":"Ended / upcoming"} · leadership controls reopening</span></div>)}</div></section>
      </div>
    </AppShell>
  );
}
