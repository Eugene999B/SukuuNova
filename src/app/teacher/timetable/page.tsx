import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function TeacherTimetablePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");
    const [school, slots] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.timetableSlot.findMany({
        where: { schoolId: session.schoolId, teacherId: session.userId },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        include: { class: { select: { name: true, level: true } }, subject: { select: { name: true } } },
      }),
    ]);
    return { school, slots };
  });

  return <AppShell universe="teacher" title="My timetable" subtitle="Your published teaching schedule, limited to periods assigned to you." active="My Timetable" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
    <div className="teacher-workspace">
      <section className="teacher-page-head"><div><span className="teacher-eyebrow">TEACHER · TIMETABLE</span><h2>My timetable</h2><p>Only timetable slots assigned to your teacher profile are displayed.</p></div><Link className="teacher-primary-action" href="/teacher">Teacher home →</Link></section>
      <section className="teacher-scope-strip"><div><span>Scheduled periods</span><strong>{data.slots.length}</strong></div><div><span>Classes</span><strong>{new Set(data.slots.map((slot) => slot.classId)).size}</strong></div><div><span>Subjects</span><strong>{new Set(data.slots.map((slot) => slot.subjectId)).size}</strong></div></section>
      <section className="teacher-surface"><span className="teacher-eyebrow">Weekly schedule</span><h3>Your assigned periods</h3>{data.slots.length ? <div className="grid gap-3">{data.slots.map((slot) => <article key={slot.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{days[slot.dayOfWeek - 1] ?? `Day ${slot.dayOfWeek}`} · Period {slot.period}</strong><p>{slot.class.level ? `${slot.class.level} · ` : ""}{slot.class.name} · {slot.subject.name}</p></div><span className="rounded-full border px-3 py-1 text-xs font-semibold">Teacher assignment</span></div></article>)}</div> : <div className="teacher-empty-state"><strong>No timetable periods assigned yet.</strong><p>Ask an authorised school administrator to assign your teacher profile to timetable slots.</p></div>}</section>
    </div>
  </AppShell>;
}
