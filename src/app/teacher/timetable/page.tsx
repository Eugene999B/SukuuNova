import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { safeDayBlocks } from "@/lib/timetable-bell-schedule";
import "./teacher-timetable-v2.css";

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export default async function TeacherTimetablePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");

    const [school, slots, settings, academic] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.timetableSlot.findMany({
        where: { schoolId: session.schoolId, teacherId: session.userId },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        include: { class: { select: { name: true, level: true } }, subject: { select: { name: true } } },
      }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      getAcademicEngineConfig(tx, session.schoolId),
    ]);

    const days = academic.timetable.days
      .filter((day) => day.enabled)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((day) => ({
        ...day,
        periods: safeDayBlocks(day, academic.timetable).periods.map((period) => ({
          period: period.period,
          start: `${String(Math.floor(period.start / 60)).padStart(2, "0")}:${String(period.start % 60).padStart(2, "0")}`,
          end: `${String(Math.floor(period.end / 60)).padStart(2, "0")}:${String(period.end % 60).padStart(2, "0")}`,
        })),
      }));

    return {
      school,
      slots,
      days,
      published: academic.timetable.published,
      timezone: settings?.timezone || "Africa/Accra",
      role: access.roles.map((role) => role.name).join(" · "),
    };
  });

  const activeDays = data.days.map((day) => ({
    ...day,
    slots: data.slots.filter((slot) => slot.dayOfWeek === day.dayOfWeek),
  }));
  const teachingDays = activeDays.filter((day) => day.slots.length).length;
  const classes = new Set(data.slots.map((slot) => slot.class.name)).size;

  return <AppShell universe="teacher" title="My Timetable" subtitle="Your official teaching week, classes and lesson times." active="My Timetable" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
    <div className="teacher-workspace teacher-tt-page">
      <section className="teacher-page-head teacher-tt-head">
        <div><span className="teacher-eyebrow">TEACHER · TIMETABLE</span><h2>Your teaching week</h2><p>Every lesson below comes directly from the school timetable. Your class, subject and exact lesson time stay in one place.</p></div>
        <div className="teacher-tt-actions"><span className={`teacher-tt-status ${data.published ? "published" : "editing"}`}>{data.published ? "Published timetable" : "School updating timetable"}</span><Link href="/teacher/timetable/print" className="teacher-tt-download">Download / print timetable</Link></div>
      </section>

      <section className="teacher-scope-strip"><div><span>Scheduled periods</span><strong>{data.slots.length}</strong></div><div><span>Teaching days</span><strong>{teachingDays}</strong></div><div><span>Classes</span><strong>{classes}</strong></div><div><span>Timezone</span><strong>{data.timezone}</strong></div></section>

      {!data.published ? <div className="teacher-tt-notice">School leadership currently has the timetable open for changes. Your view updates automatically when lessons are changed.</div> : null}

      <section className="teacher-surface teacher-tt-surface"><span className="teacher-eyebrow">WEEKLY PLAN</span><h3>Assigned periods</h3>
        {data.slots.length ? <div className="teacher-week-grid teacher-tt-grid">{activeDays.map((day) => <article key={day.dayOfWeek}><header><b>{day.name}</b><span>{day.slots.length} period{day.slots.length === 1 ? "" : "s"}</span></header>{day.slots.length ? day.slots.map((slot) => {
          const timing = day.periods.find((period) => period.period === slot.period);
          return <div className="teacher-period teacher-tt-period" key={slot.id}><div className="teacher-tt-time"><strong>P{slot.period}</strong>{timing ? <span>{formatTime(timing.start)}–{formatTime(timing.end)}</span> : null}</div><div><b>{slot.subject.name}</b><span>{slot.class.level ? `${slot.class.level} · ` : ""}{slot.class.name}{slot.venue ? ` · ${slot.venue}` : ""}</span></div></div>;
        }) : <p className="teacher-muted">No lesson assigned.</p>}</article>)}</div> : <div className="teacher-empty-state"><strong>No timetable periods are assigned to you yet.</strong><p>Once school leadership generates or manually assigns your lessons, they will appear here automatically.</p></div>}
      </section>
    </div>
  </AppShell>;
}
