import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "@/app/globals.css";
import "../staff/teacher-workspace.css";

type Props = { searchParams: Promise<{ view?: string }> };

const moduleCopy: Record<string, { kicker: string; title: string; description: string; actions: [string, string][] }> = {
  "My Timetable": { kicker: "TEACHER · TIMETABLE", title: "My timetable", description: "Your assigned teaching periods, classes and subjects in one focused workspace.", actions: [["Review assigned periods", "/school/timetable"], ["Open my classes", "/teacher/students"]] },
  "My Lessons & Planning": { kicker: "TEACHER · LESSONS", title: "My lessons & planning", description: "Plan lessons around the classes and subjects assigned to your teaching profile.", actions: [["Open lesson planning", "/school/lessons"], ["View my students", "/teacher/students"]] },
  "My Homework": { kicker: "TEACHER · HOMEWORK", title: "My homework", description: "Create and review class work for the teaching groups in your scope.", actions: [["Create homework", "/school/homework"], ["View class roster", "/teacher/students"]] },
  "My Gradebook": { kicker: "TEACHER · GRADEBOOK", title: "My gradebook", description: "Enter and review marks for your assigned classes and subjects without opening school administration.", actions: [["Open gradebook", "/school/gradebook"], ["View student scope", "/teacher/students"]] },
  "My Assessments": { kicker: "TEACHER · ASSESSMENTS", title: "My assessments", description: "Manage assessment work connected to the classes and subjects assigned to you.", actions: [["Open assessments", "/school/exams"], ["View student scope", "/teacher/students"]] },
  "My Attendance": { kicker: "TEACHER · ATTENDANCE", title: "My attendance", description: "Take attendance for the teaching groups assigned to your staff profile.", actions: [["Open attendance", "/school/attendance"], ["View student scope", "/teacher/students"]] },
  "My Classes": { kicker: "TEACHER · CLASSES", title: "My classes", description: "See the classes connected to your class-teacher and subject-teacher assignments.", actions: [["Open my students", "/teacher/students"], ["Return home", "/teacher"]] },
  "My Messages": { kicker: "TEACHER · MESSAGES", title: "My messages", description: "Keep school conversations separate from administration and focus on messages relevant to your teaching role.", actions: [["Open messages", "/school/communications/messages"], ["Return home", "/teacher"]] },
  "Class Announcements": { kicker: "TEACHER · ANNOUNCEMENTS", title: "Class announcements", description: "Review announcements relevant to your school and teaching work.", actions: [["Open announcements", "/school/communications/announcements"], ["Return home", "/teacher"]] },
};

export default async function TeacherModulePage({ searchParams }: Props) {
  const params = await searchParams;
  const view = params.view || "My Classes";
  const copy = moduleCopy[view] ?? moduleCopy["My Classes"];
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => tx.user.findUnique({
    where: { id: session.userId },
    select: {
      name: true,
      userRoles: { select: { role: { select: { name: true } } } },
      classTeacherFor: { select: { id: true, name: true, level: true } },
      subjectAssignments: { select: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } } } },
    },
  }));
  if (!data) redirect("/login/school");
  const roles = data.userRoles.map((entry) => entry.role.name);
  const teacher = roles.some((role) => /teacher|academic lead|head of department/i.test(role));
  const elevated = roles.some((role) => /owner|administrator|principal|vice principal/i.test(role));
  if (!teacher || elevated) redirect("/dashboard");
  const classes = new Map<string, string>();
  data.classTeacherFor.forEach((item) => classes.set(item.id, `${item.level ? `${item.level} · ` : ""}${item.name}`));
  data.subjectAssignments.forEach((item) => classes.set(item.class.id, `${item.class.level ? `${item.class.level} · ` : ""}${item.class.name}`));

  return <AppShell universe="teacher" title={copy.title} subtitle={copy.description} active={view} userName={data.name} schoolName="School Workspace" role={roles[0] ?? "Teacher"}>
    <div className="teacher-workspace">
      <section className="teacher-page-head"><div><span className="teacher-eyebrow">{copy.kicker}</span><h2>{copy.title}</h2><p>{copy.description}</p></div><Link className="teacher-primary-action" href="/teacher">Teacher home →</Link></section>
      <section className="teacher-scope-strip"><div><span>Teaching scope</span><strong>{classes.size} classes</strong></div><div><span>Subject assignments</span><strong>{data.subjectAssignments.length}</strong></div><div><span>Role</span><strong>{roles[0] ?? "Teacher"}</strong></div></section>
      <section className="teacher-module-grid">
        <article className="teacher-surface"><span className="teacher-eyebrow">Available action</span><h3>Continue your work</h3><p>Use the action below to enter the existing school workflow. Your teacher-role permissions and assigned scope remain the security boundary.</p><div className="teacher-action-list">{copy.actions.map(([label, href]) => <Link key={label} href={href}>{label}<span>→</span></Link>)}</div></article>
        <article className="teacher-surface"><span className="teacher-eyebrow">Assigned classes</span><h3>Only your teaching groups</h3>{classes.size ? <div className="teacher-assignment-list">{[...classes.entries()].map(([id, name]) => <div key={id}><strong>{name}</strong><span>Teaching scope</span></div>)}</div> : <p>No classes are assigned yet. Ask an authorised school administrator to connect your staff profile to a class and subject.</p>}</article>
      </section>
    </div>
  </AppShell>;
}
