import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "@/app/globals.css";

type Props = { searchParams: Promise<{ view?: string }> };
const teacherModule = (view: string) => `/teacher/module?view=${encodeURIComponent(view)}`;
const moduleCopy: Record<string, { kicker: string; title: string; description: string }> = {
  "My Timetable": { kicker: "TEACHER · TIMETABLE", title: "My timetable", description: "Your assigned teaching periods, classes and subjects in one focused workspace." },
  "My Lessons & Planning": { kicker: "TEACHER · LESSONS", title: "My lessons & planning", description: "Plan lessons around the classes and subjects assigned to your teaching profile." },
  "My Homework": { kicker: "TEACHER · HOMEWORK", title: "My homework", description: "Create and review class work for the teaching groups in your scope." },
  "My Gradebook": { kicker: "TEACHER · GRADEBOOK", title: "My gradebook", description: "Enter and review marks for your assigned classes and subjects." },
  "My Assessments": { kicker: "TEACHER · ASSESSMENTS", title: "My assessments", description: "Manage assessment work connected to your assigned classes and subjects." },
  "My Attendance": { kicker: "TEACHER · ATTENDANCE", title: "My attendance", description: "Take attendance for the teaching groups assigned to you." },
  "My Classes": { kicker: "TEACHER · CLASSES", title: "My classes", description: "See the classes connected to your class-teacher and subject-teacher assignments." },
  "My Messages": { kicker: "TEACHER · MESSAGES", title: "My messages", description: "Keep school conversations separate from administration and focused on your teaching role." },
  "Class Announcements": { kicker: "TEACHER · ANNOUNCEMENTS", title: "Class announcements", description: "Review announcements relevant to your school and teaching work." },
};

export default async function TeacherModulePage({ searchParams }: Props) {
  const params = await searchParams;
  const view = params.view || "My Classes";
  const copy = moduleCopy[view] ?? moduleCopy["My Classes"];
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => { const access = await getSchoolAuthorization(tx, session.userId); const user = await tx.user.findUnique({
    where: { id: session.userId },
    select: {
      name: true,
      userRoles: { select: { role: { select: { name: true } } } },
      classTeacherFor: { select: { id: true, name: true, level: true } },
      subjectAssignments: {
        select: {
          class: { select: { id: true, name: true, level: true } },
          subject: { select: { id: true, name: true } },
        },
      },
    },
  }); return { user, access }; });
  if (!data.user) redirect("/login/school");
  if (data.access.workspace !== "teacher") redirect("/dashboard");
  const roles = data.user.userRoles.map((entry) => entry.role.name);
  const teacher = data.access.isTeacher;
  if (!teacher) redirect("/dashboard");

  const classes = new Map<string, string>();
  data.user.classTeacherFor.forEach((item) => classes.set(item.id, `${item.level ? `${item.level} · ` : ""}${item.name}`));
  data.user.subjectAssignments.forEach((item) => classes.set(item.class.id, `${item.class.level ? `${item.class.level} · ` : ""}${item.class.name}`));
  const workspaceLinks = ["My Attendance", "My Homework", "My Gradebook", "My Assessments", "My Timetable", "My Messages"].filter((item) => item !== view);

  return (
    <AppShell universe="teacher" title={copy.title} subtitle={copy.description} active={view} userName={data.user.name} schoolName="School Workspace" role={roles[0] ?? "Teacher"}>
      <div className="teacher-workspace">
        <section className="teacher-page-head"><div><span className="teacher-eyebrow">{copy.kicker}</span><h2>{copy.title}</h2><p>{copy.description}</p></div><Link className="teacher-primary-action" href="/teacher">Teacher home →</Link></section>
        <section className="teacher-scope-strip"><div><span>Teaching scope</span><strong>{classes.size} classes</strong></div><div><span>Subject assignments</span><strong>{data.user.subjectAssignments.length}</strong></div><div><span>Role</span><strong>{roles[0] ?? "Teacher"}</strong></div></section>
        <section className="teacher-module-grid">
          <article className="teacher-surface"><span className="teacher-eyebrow">Teacher workspace</span><h3>Continue in your teaching area</h3><p>This workspace never opens Owner or School Administration screens. Your class and subject scope stays tied to your teacher profile.</p><div className="teacher-action-list">{workspaceLinks.map((label) => <Link key={label} href={teacherModule(label)}>{label}<span>→</span></Link>)}</div></article>
          <article className="teacher-surface"><span className="teacher-eyebrow">Assigned classes</span><h3>Only your teaching groups</h3>{classes.size ? <div className="teacher-assignment-list">{[...classes.entries()].map(([id, name]) => <div key={id}><strong>{name}</strong><span>Teaching scope</span></div>)}</div> : <p>No classes are assigned yet. Ask an authorised school administrator to connect your staff profile to a class and subject.</p>}</article>
        </section>
      </div>
    </AppShell>
  );
}
