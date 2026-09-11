import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck2,
  ClipboardCheck,
  FileQuestion,
  HelpCircle,
  LockKeyhole,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./teacher-help.css";

const tasks = [
  { label: "Take class attendance", detail: "Open your class register, mark the day, then submit it once.", href: "/teacher/attendance", icon: CalendarCheck2 },
  { label: "Create homework or a test", detail: "Build visual questions, answers, timing, attempts and marks.", href: "/teacher/studio", icon: FileQuestion },
  { label: "Enter or edit marks", detail: "Use the markbook, bulk scoring or spreadsheet paste.", href: "/teacher/studio", icon: ClipboardCheck },
  { label: "Prepare lesson notes", detail: "Create Ghana-aligned weekly learning plans and submit for review.", href: "/teacher/lessons", icon: BookOpenCheck },
  { label: "Find learners", detail: "Open only the learners connected to your assigned classes.", href: "/teacher/students", icon: UsersRound },
  { label: "Message your school community", detail: "Open teacher messages without leaving the Teacher Workspace.", href: "/teacher/messages", icon: MessageSquareText },
  { label: "Send a class announcement", detail: "Send to an entire class or selected linked learners/families.", href: "/teacher/announcements", icon: Megaphone },
] as const;

const faq = [
  ["Why can’t I choose the academic term?", "The school calendar controls the live academic term. Teachers choose the class, subject, week and assessment date. This prevents marks and lesson work from accidentally entering the wrong term."],
  ["What happens when a term ends?", "New teacher academic entries stop when the configured term end date is reached. Authorised leadership reviews and locks the term, preserving the historical records before the next active term takes over."],
  ["Can attendance devices and teacher attendance work together?", "Yes. Accepted device check-ins can record a learner automatically. The teacher register remains the controlled fallback and exception workflow. A verified device arrival is protected from being casually changed to absent."],
  ["Can SukuuNova mark online work automatically?", "Objective question types can be auto-marked from the answer key. Written responses can use teacher-provided key ideas to assist review, but the teacher remains responsible for confirming judgement-based marks."],
  ["Why don’t I see school-wide settings or owner controls?", "Teacher accounts are deliberately isolated from school-administration controls. Permissions, finance administration, school settings and owner functions remain in authorised administration workspaces."],
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
    <AppShell universe="teacher" title="Teacher Help" subtitle="Practical help for your teaching workspace." active="Help & Support" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
      <main className="th-page">
        <section className="th-hero">
          <div>
            <span>TEACHER SUPPORT CENTER</span>
            <h1>Get to the task you need without leaving your teaching workspace.</h1>
            <p>Use direct workflow guides for attendance, assessments, lesson planning, marks, messages and class communication. Teacher help never routes through Owner or school-administration pages.</p>
          </div>
          <aside className="th-hero-card"><ShieldCheck size={23}/><strong>Teacher boundary active</strong><small>Your session is restricted to authorised teacher workflows even if an old administrative link is opened.</small></aside>
        </section>

        <section className="th-section">
          <header><div><span>QUICK HELP</span><h2>What do you want to do?</h2><p>Open the exact workspace instead of reading a wall of instructions.</p></div><HelpCircle size={24}/></header>
          <div className="th-grid">{tasks.map((task) => { const Icon = task.icon; return <Link className="th-task" href={task.href} key={task.label}><span><Icon size={19}/></span><div><strong>{task.label}</strong><small>{task.detail}</small></div><ArrowRight size={16}/></Link>; })}</div>
        </section>

        <section className="th-safety">
          <div><span>ACCESS & SAFETY</span><h2>Your teacher account cannot “fall upward” into Owner controls.</h2><p>Teacher navigation, direct URLs and legacy links are checked at the server-side workspace boundary. School-wide settings, finance administration, role management and owner-only controls are not part of this portal.</p></div>
          <div className="th-safety-list">
            <article><LockKeyhole size={18}/><div><strong>School administration stays separate</strong><small>Owner and authorised administration pages are outside a pure Teacher session.</small></div></article>
            <article><ShieldCheck size={18}/><div><strong>Assigned scope stays authoritative</strong><small>Classes, subjects, learners and marking contexts come from your actual teacher assignments.</small></div></article>
            <article><CalendarCheck2 size={18}/><div><strong>The calendar controls academic time</strong><small>The active term and school-day rules are controlled by authorised school leadership.</small></div></article>
          </div>
        </section>

        <section className="th-section">
          <header><div><span>COMMON QUESTIONS</span><h2>Short answers to the things teachers ask most</h2></div></header>
          <div className="th-faq">{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        </section>

        <div className="th-footer"><div><strong>Need to continue working?</strong><small>Return to your teaching dashboard. You will remain inside the Teacher Workspace.</small></div><Link href="/teacher">Teacher home <ArrowRight size={15}/></Link></div>
      </main>
    </AppShell>
  );
}
