import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function TeacherGradebookPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher") redirect("/dashboard");
    const [school, assignments] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.classSubjectTeacher.findMany({
        where: { teacherId: session.userId },
        orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
        select: {
          classId: true,
          subjectId: true,
          class: { select: { name: true, level: true, _count: { select: { students: true } } } },
          subject: { select: { name: true } },
        },
      }),
    ]);
    return { school, assignments };
  });

  return (
    <AppShell universe="teacher" title="My gradebook" subtitle="Marks for your classes." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
      <div className="teacher-workspace">
        <section className="teacher-page-head">
          <div><span className="teacher-eyebrow">TEACHER · GRADEBOOK</span><h2>My gradebook</h2></div>
          <Link className="teacher-primary-action" href="/teacher">Teacher home →</Link>
        </section>
        <section className="teacher-scope-strip"><div><span>Assigned class-subjects</span><strong>{data.assignments.length}</strong></div></section>
        <section className="teacher-surface">
          <span className="teacher-eyebrow">Mark entry</span><h3>Select your teaching context</h3>
          
          {data.assignments.length ? <div className="teacher-assignment-list">{data.assignments.map((assignment) => <Link key={`${assignment.classId}:${assignment.subjectId}`} href={`/teacher/gradebook/${encodeURIComponent(assignment.classId)}__${encodeURIComponent(assignment.subjectId)}`}><strong>{assignment.class.level ? `${assignment.class.level} · ` : ""}{assignment.class.name}</strong><span>{assignment.subject.name} · {assignment.class._count.students} learners →</span></Link>)}</div> : <div className="teacher-empty-state"><strong>No gradebook assignment yet.</strong><p>An authorised school administrator must assign a class and subject to your staff profile before you can enter marks.</p></div>}
        </section>
      </div>
    </AppShell>
  );
}
