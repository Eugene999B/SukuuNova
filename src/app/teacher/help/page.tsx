import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenCheck, CheckSquare, CircleHelp, FileQuestion, GraduationCap, Megaphone, MessageSquareText, ShieldCheck, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./teacher-help.css";

const groups = [
  {
    eyebrow: "TODAY",
    title: "Run your class",
    detail: "The everyday teacher tasks should take one or two clicks.",
    links: [
      ["Take class attendance", "/teacher/attendance", CheckSquare],
      ["See my learners", "/teacher/students", UsersRound],
      ["Open my timetable", "/teacher/timetable", GraduationCap],
    ],
  },
  {
    eyebrow: "TEACHING",
    title: "Plan and assess",
    detail: "Create work, lesson notes and marks without entering school administration.",
    links: [
      ["Add homework, quiz or exam", "/teacher/studio", FileQuestion],
      ["Write Ghana lesson notes", "/teacher/lessons", BookOpenCheck],
      ["Enter or edit marks", "/teacher/studio#marks", CheckSquare],
    ],
  },
  {
    eyebrow: "COMMUNICATION",
    title: "Reach learners and families",
    detail: "Use only the classes and people already connected to your teaching role.",
    links: [
      ["My messages", "/teacher/messages", MessageSquareText],
      ["Class announcements", "/teacher/announcements", Megaphone],
      ["Teacher account settings", "/teacher/settings", CircleHelp],
    ],
  },
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
    <AppShell universe="teacher" title="Teacher Help" subtitle="Fast guidance for teaching work only." active="Help & Support" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
      <div className="th-page">
        <section className="th-hero">
          <div><span>TEACHER HELP CENTER</span><h1>Find the task you want. Stay inside the Teacher Workspace.</h1><p>No owner settings, finance controls or access administration are linked from this help center. Every shortcut below is scoped to normal teaching work.</p></div>
          <Link href="/teacher"><GraduationCap size={17}/>Teacher home</Link>
        </section>

        <section className="th-grid">
          {groups.map((group) => <article key={group.title}><span>{group.eyebrow}</span><h2>{group.title}</h2><p>{group.detail}</p><div className="th-task-list">{group.links.map(([label, href, Icon]) => <Link href={href} key={href}><span>{label}</span><Icon size={16}/></Link>)}</div></article>)}
        </section>

        <section className="th-boundary">
          <div><span>ACCOUNT SAFETY</span><strong>Your teacher account cannot become an owner account by following a link.</strong><p>School administration and Teacher Workspace are separated on the server. If an old or incorrect administrative URL is opened, the teacher session is redirected back to its own workspace.</p></div>
          <aside><span><ShieldCheck size={14}/> Teacher-only routes</span><span>No school settings</span><span>No role management</span><span>No finance administration</span></aside>
        </section>
      </div>
    </AppShell>
  );
}
