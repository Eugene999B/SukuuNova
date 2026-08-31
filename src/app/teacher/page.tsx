import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import TeacherTeachingWorkspace from "@/components/TeacherTeachingWorkspace";
import "@/app/globals.css";
import "../school/staff/staff-workspace.css";

type Props = { searchParams?: Promise<{ view?: string }> };

function initialTab(view?: string): "gradebook" | "homework" | "timetable" {
  if (view === "My Homework") return "homework";
  if (view === "My Timetable") return "timetable";
  return "gradebook";
}

export default async function TeacherPortalPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [access, messageCount, user, school, led, assignments, timetable, terms] = await Promise.all([
      getSchoolAuthorization(tx, session.userId),
      tx.message.count({ where: { schoolId: session.schoolId, recipientType: "user", recipientId: session.userId } }),
      tx.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true, phone: true } }),
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId, classTeacherId: session.userId }, select: { id: true, name: true, level: true, _count: { select: { students: true } } }, orderBy: { name: "asc" } }),
      tx.classSubjectTeacher.findMany({ where: { schoolId: session.schoolId, teacherId: session.userId }, select: { classId: true, subjectId: true, class: { select: { id: true, name: true, level: true, _count: { select: { students: true } } } }, subject: { select: { id: true, name: true } } }, orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }] }),
      tx.timetableSlot.findMany({ where: { schoolId: session.schoolId, teacherId: session.userId }, select: { id: true, dayOfWeek: true, period: true, class: { select: { name: true, level: true } }, subject: { select: { name: true } } }, orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }] }),
      tx.term.findMany({ orderBy: { startDate: "desc" }, take: 12, select: { id: true, name: true, academicYear: { select: { name: true } } } }),
    ]);
    return user ? { ...user, messageCount, access, school, led, assignments, timetable, terms } : null;
  });

  if (!data) redirect("/login/school");
  if (data.access.workspace !== "teacher") redirect("/dashboard");

  const assignments = data.assignments;
  const led = data.led;
  const classIds = new Set([...led.map((c) => c.id), ...assignments.map((a) => a.class.id)]);
  const scopedStudentCount = new Map<string, number>();
  for (const classItem of led) scopedStudentCount.set(classItem.id, classItem._count.students);
  for (const assignment of assignments) scopedStudentCount.set(assignment.class.id, assignment.class._count.students);
  const totalStudents = [...scopedStudentCount.values()].reduce((sum, count) => sum + count, 0);
  const roleLabel = data.access.roles.map((role) => role.name).join(" · ") || "Teacher";

  return <AppShell universe="teacher" title="Teacher workspace" subtitle="Your classes, subjects, attendance, marks, homework, planning and school conversations." active="Teacher Home" userName={data.name} schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} role={roleLabel}>
    <div className="staff-workspace">
      <section className="staff-hero"><div><span className="staff-eyebrow">TEACHER PORTAL · {roleLabel}</span><h2>Good morning, {data.name.split(/\s+/)[0]}.</h2><p>This workspace is separate from school administration. Your teaching scope comes from the classes and subjects assigned to your staff profile.</p><div className="staff-hero-points"><span>✓ {classIds.size} classes in scope</span><span>✓ {assignments.length} subject assignments</span><span>✓ Mark attendance</span><span>✓ Enter marks</span></div></div><Link className="staff-primary-cta" href="/teacher/attendance">Take attendance →</Link></section>
      <section className="staff-metrics"><article><span>Classes</span><strong>{classIds.size}</strong><small>Only your assigned groups</small></article><article><span>Subjects</span><strong>{new Set(assignments.map((a) => a.subject.id)).size}</strong><small>Teaching areas</small></article><article><span>Students in scope</span><strong>{totalStudents}</strong><small>Across assigned groups</small></article><article><span>My messages</span><strong>{data.messageCount}</strong><small>Messages addressed to you</small></article></section>
      <section className="staff-command-grid">
        <article className="staff-card"><div className="staff-card-head"><div><span>My teaching load</span><h3>Classes & subjects</h3><p>These relationships control what you can teach, mark and monitor.</p></div></div><div className="staff-capability-grid">{led.map((c)=><div key={c.id}><b>{c.level ? `${c.level} · ` : ""}{c.name}</b><small>Class teacher · {c._count.students} learners</small></div>)}{assignments.map((a)=><div key={`${a.class.id}-${a.subject.id}`}><b>{a.subject.name}</b><small>{a.class.level ? `${a.class.level} · ` : ""}{a.class.name} · {a.class._count.students} learners</small></div>)}{led.length===0 && assignments.length===0 ? <div><b>No teaching assignments yet</b><small>Ask the school owner to connect your staff profile to classes and subjects.</small></div> : null}</div></article>
        <article className="staff-card"><div className="staff-card-head"><div><span>Teaching actions</span><h3>Open your work areas</h3><p>Every link stays inside your teacher scope.</p></div></div><div className="staff-role-stack"><Link href="/teacher/attendance" className="staff-link-grid"><span>Take attendance</span><span>→</span></Link><Link href="/teacher?view=My%20Gradebook" className="staff-link-grid"><span>Enter marks</span><span>→</span></Link><Link href="/teacher?view=My%20Homework" className="staff-link-grid"><span>Homework & exercises</span><span>→</span></Link><Link href="/teacher?view=My%20Timetable" className="staff-link-grid"><span>My timetable</span><span>→</span></Link><Link href="/teacher?view=My%20Messages" className="staff-link-grid"><span>My messages</span><span>→</span></Link><Link href="/account/security" className="staff-link-grid"><span>Account security</span><span>→</span></Link></div></article>
      </section>
      <TeacherTeachingWorkspace assignments={assignments.map((a) => ({ classId: a.classId, subjectId: a.subjectId, class: { name: a.class.name, level: a.class.level }, subject: { name: a.subject.name } }))} terms={data.terms} timetable={data.timetable} initialTab={initialTab(params.view)} />
    </div>
  </AppShell>;
}
