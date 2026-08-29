import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "@/app/globals.css";
import "../school/staff/staff-workspace.css";

export default async function TeacherPortalPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [user, messageCount] = await Promise.all([
      tx.user.findUnique({
        where: { id: session.userId },
        select: {
          name: true,
          email: true,
          phone: true,
          userRoles: { select: { role: { select: { name: true } } } },
          classTeacherFor: { select: { id: true, name: true, level: true, _count: { select: { students: true } } } },
          subjectAssignments: { select: { class: { select: { id: true, name: true, level: true, _count: { select: { students: true } } } }, subject: { select: { id: true, name: true } } } },
        }
      }),
      tx.message.count({ where: { schoolId: session.schoolId } }),
    ]);
    return user ? { ...user, messageCount } : null;
  });
  if (!data) redirect("/login/school");

  const roles = data.userRoles.map((r) => r.role.name);
  const assignments = data.subjectAssignments;
  const led = data.classTeacherFor;
  const classIds = new Set([...led.map((c) => c.id), ...assignments.map((a) => a.class.id)]);
  const scopedStudentCount = [...new Map([...led.map((c) => [c.id, c._count.students] as const), ...assignments.map((a) => [a.class.id, a.class._count.students] as const)]).values()].reduce((n, v) => n + v, 0);

  const canUseTeacherPortal = roles.some((role) => /teacher|class teacher|subject teacher|academic lead|head of department/i.test(role));
  if (!canUseTeacherPortal) redirect("/dashboard");

  return <AppShell universe="teacher" title="Teacher workspace" subtitle="Your classes, subjects, attendance, marks, homework, planning and school conversations." active="Teacher Home" userName={data.name} schoolName="School Workspace" schoolCode="" role={roles[0] ?? "Teacher"}>
    <div className="staff-workspace">
      <section className="staff-hero">
        <div><span className="staff-eyebrow">TEACHER PORTAL · {roles.join(" · ") || "Teacher"}</span><h2>Good morning, {data.name.split(/\s+/)[0]}.</h2><p>This workspace is separate from school administration. Your teaching scope comes from the classes and subjects assigned to your staff profile.</p><div className="staff-hero-points"><span>✓ {classIds.size} classes in scope</span><span>✓ {assignments.length} subject assignments</span><span>✓ Mark attendance</span><span>✓ Enter marks</span></div></div>
        <Link className="staff-primary-cta" href="/school/homework">＋ Create homework</Link>
      </section>
      <section className="staff-metrics"><article><span>Classes</span><strong>{classIds.size}</strong><small>Only your assigned groups</small></article><article><span>Subjects</span><strong>{new Set(assignments.map((a) => a.subject.id)).size}</strong><small>Teaching areas</small></article><article><span>Students in scope</span><strong>{scopedStudentCount}</strong><small>Across assigned groups</small></article><article><span>School messages</span><strong>{data.messageCount}</strong><small>School conversations</small></article></section>
      <section className="staff-command-grid">
        <article className="staff-card"><div className="staff-card-head"><div><span>My teaching load</span><h3>Classes & subjects</h3><p>These relationships control what you can teach, mark and monitor.</p></div></div><div className="staff-capability-grid">{led.map((c)=><div key={c.id}><b>{c.level ? `${c.level} · ` : ""}{c.name}</b><small>Class teacher · {c._count.students} learners</small></div>)}{assignments.map((a)=><div key={`${a.class.id}-${a.subject.id}`}><b>{a.subject.name}</b><small>{a.class.level ? `${a.class.level} · ` : ""}{a.class.name} · {a.class._count.students} learners</small></div>)}{led.length===0 && assignments.length===0 ? <div><b>No teaching assignments yet</b><small>Ask the school owner to connect your staff profile to classes and subjects.</small></div> : null}</div></article>
        <article className="staff-card"><div className="staff-card-head"><div><span>Today</span><h3>Teaching actions</h3><p>Fast links for the work you do most.</p></div></div><div className="staff-role-stack"><Link href="/school/attendance" className="staff-link-grid"><span>Take attendance</span><span>→</span></Link><Link href="/school/gradebook" className="staff-link-grid"><span>Enter marks</span><span>→</span></Link><Link href="/school/homework" className="staff-link-grid"><span>Homework & exercises</span><span>→</span></Link><Link href="/school/timetable" className="staff-link-grid"><span>My timetable</span><span>→</span></Link><Link href="/school/communications/messages" className="staff-link-grid"><span>School messages</span><span>→</span></Link><Link href="/account/security" className="staff-link-grid"><span>Account security</span><span>→</span></Link></div></article>
      </section>
      <section className="staff-card"><div className="staff-card-head"><div><span>Classroom workflow</span><h3>Assignment → submission → marking</h3><p>Homework can be tied to an assigned class and subject. Future family submissions can return through the same class-scoped workflow for marking and feedback.</p></div></div><div className="staff-link-grid"><Link href="/school/homework">Create assignment <span>→</span></Link><Link href="/school/communications/messages">Student / family conversation <span>→</span></Link><Link href="/school/report-cards">Report-card connection <span>→</span></Link></div></section>
    </div>
  </AppShell>;
}
