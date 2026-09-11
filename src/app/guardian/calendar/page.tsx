import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CalendarRange, Clock3, GraduationCap, MapPin, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { getGuardianFamilyContext } from "@/lib/guardian-family-context";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { safeDayBlocks } from "@/lib/timetable-bell-schedule";
import "./guardian-calendar-v2.css";

type Props = { searchParams: Promise<{ studentId?: string }> };
type EventRow = { id: string; name: string; type: string; startDate: Date; endDate: Date; affectsAttendance: boolean; affectsTransport: boolean };

const eventLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const eventDate = (start: Date, end: Date) => {
  const formatter = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric" });
  return start.toDateString() === end.toDateString() ? formatter.format(start) : `${formatter.format(start)} – ${formatter.format(end)}`;
};
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const formatTime = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
};

export default async function GuardianCalendarPage({ searchParams }: Props) {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const requested = (await searchParams).studentId?.trim() || null;

  const data = await withTenant(session.schoolId, async (tx) => {
    const family = await getGuardianFamilyContext(tx, { schoolId: session.schoolId, guardianId: session.guardianId, userId: session.userId, studentId: requested });
    const selected = family.selectedChild ?? family.children[0] ?? null;
    const [slots, events, academic] = await Promise.all([
      selected?.classId ? tx.timetableSlot.findMany({
        where: { schoolId: session.schoolId, classId: selected.classId },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        include: { subject: { select: { name: true } }, teacher: { select: { name: true } } },
      }) : Promise.resolve([]),
      tx.$queryRawUnsafe<EventRow[]>(`SELECT "id","name","type","startDate","endDate","affectsAttendance","affectsTransport" FROM "CalendarEvent" WHERE "schoolId"=$1 AND "endDate">=CURRENT_DATE - INTERVAL '14 days' ORDER BY "startDate" ASC LIMIT 18`, session.schoolId),
      getAcademicEngineConfig(tx, session.schoolId),
    ]);
    const days = academic.timetable.days.filter((day) => day.enabled && day.dayOfWeek >= 1 && day.dayOfWeek <= 6).sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((day) => ({
      ...day,
      periods: safeDayBlocks(day, academic.timetable).periods.map((period) => ({ period: period.period, start: clock(period.start), end: clock(period.end) })),
    }));
    return { family, selected, slots, events, days, published: academic.timetable.published };
  });

  const today = new Date();
  const todayDow = today.getUTCDay();
  const upcoming = data.events.filter((event) => event.endDate.getTime() >= new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`).getTime());
  const todaySlots = data.slots.filter((slot) => slot.dayOfWeek === todayDow);
  const todayConfig = data.days.find((day) => day.dayOfWeek === todayDow);

  return <AppShell universe="guardian" title="Schedule & events" subtitle="Your child’s weekly timetable, school calendar and operational dates in one family view." active="Schedule & Events" schoolName={session.schoolName} schoolCode="" userName={data.family.guardian.name} role="Guardian">
    <div className="gsc-page">
      <section className="gsc-hero"><div><span>FAMILY SCHEDULE INTELLIGENCE</span><h1>Know what is happening before the school day happens.</h1><p>Switch children, see today’s exact lesson times, review the full school-week timetable and keep important school events in context.</p></div><div className="gsc-today"><CalendarDays size={23}/><strong>{today.toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "short" })}</strong><span>{todaySlots.length ? `${todaySlots.length} lessons scheduled for the selected learner` : "No timetable lessons listed for today"}</span>{data.selected ? <Link className="gsc-print-link" href={`/guardian/calendar/print?studentId=${encodeURIComponent(data.selected.id)}`}>Download / print timetable</Link> : null}</div></section>

      {data.family.children.length > 1 ? <nav className="gsc-switcher">{data.family.children.map((child) => <Link key={child.id} className={data.selected?.id === child.id ? "active" : ""} href={`/guardian/calendar?studentId=${encodeURIComponent(child.id)}`}><span>{child.name.slice(0, 2).toUpperCase()}</span><div><strong>{child.name}</strong><small>{child.className || "Class not set"} · {child.admissionNo}</small></div></Link>)}</nav> : null}

      {data.selected ? <section className="gsc-kpis"><article><GraduationCap size={17}/><div><span>Learner in focus</span><strong>{data.selected.name}</strong><p>{data.selected.className || "Class not assigned"}</p></div></article><article><Clock3 size={17}/><div><span>Today</span><strong>{todaySlots.length} lessons</strong><p>{todaySlots[0] ? `Starts with ${todaySlots[0].subject.name}` : "No lesson entries today"}</p></div></article><article><CalendarRange size={17}/><div><span>Upcoming dates</span><strong>{upcoming.length}</strong><p>School calendar events currently visible.</p></div></article><article><Sparkles size={17}/><div><span>Weekly coverage</span><strong>{data.slots.length} slots</strong><p>{data.published ? "Current published class timetable." : "School is currently updating this timetable."}</p></div></article></section> : null}

      {!data.published && data.selected ? <div className="gsc-editing-note">The school currently has the timetable open for changes. This family view will reflect those changes automatically.</div> : null}

      <div className="gsc-layout"><section className="gsc-panel"><header><div><span>TODAY’S FLOW</span><h2>{data.selected ? `${data.selected.name} today` : "No linked learner"}</h2><p>Lesson time, period, teacher and classroom location at a glance.</p></div></header>{todaySlots.length ? <div className="gsc-today-list">{todaySlots.map((slot) => { const timing = todayConfig?.periods.find((period) => period.period === slot.period); return <article key={slot.id}><span className="gsc-period">P{slot.period}</span><div><strong>{slot.subject.name}</strong><p>{slot.teacher.name}{timing ? ` · ${formatTime(timing.start)}–${formatTime(timing.end)}` : ""}</p></div><span className="gsc-venue"><MapPin size={12}/>{slot.venue || "Venue not set"}</span></article>; })}</div> : <div className="gsc-empty"><Clock3 size={27}/><strong>No lessons to show today</strong><p>The selected class may not have timetable entries for this weekday.</p></div>}</section><section className="gsc-panel"><header><div><span>SCHOOL CALENDAR</span><h2>Important dates</h2><p>Upcoming events and recent dates that can affect family planning.</p></div></header>{data.events.length ? <div className="gsc-events">{data.events.map((event) => <article key={event.id}><span className="gsc-event-date"><b>{event.startDate.toLocaleDateString("en-GH", { day: "2-digit" })}</b>{event.startDate.toLocaleDateString("en-GH", { month: "short" }).toUpperCase()}</span><div><strong>{event.name}</strong><p>{eventDate(event.startDate, event.endDate)}</p><div><span>{eventLabel(event.type)}</span>{event.affectsAttendance ? <span>Attendance impact</span> : null}{event.affectsTransport ? <span>Transport impact</span> : null}</div></div></article>)}</div> : <div className="gsc-empty"><CalendarDays size={27}/><strong>No school events are published</strong><p>Calendar dates will appear here as the school adds them.</p></div>}</section></div>

      {data.selected ? <section className="gsc-panel gsc-week"><header className="gsc-week-head"><div><span>WEEKLY TIMETABLE</span><h2>{data.selected.className || "Class timetable"}</h2><p>A live class view built directly from the school timetable. Times reflect each configured school day.</p></div><Link className="gsc-week-download" href={`/guardian/calendar/print?studentId=${encodeURIComponent(data.selected.id)}`}>Save as PDF / print</Link></header><div className="gsc-week-grid" style={{ gridTemplateColumns: `repeat(${Math.max(data.days.length, 1)}, minmax(0,1fr))` }}>{data.days.map((day) => { const slots = data.slots.filter((slot) => slot.dayOfWeek === day.dayOfWeek); return <section key={day.dayOfWeek} className={todayDow === day.dayOfWeek ? "today" : ""}><h3>{day.name}<span>{slots.length}</span></h3>{slots.length ? slots.map((slot) => { const timing = day.periods.find((period) => period.period === slot.period); return <article key={slot.id}><b>P{slot.period}</b><div><strong>{slot.subject.name}</strong><small>{timing ? `${formatTime(timing.start)}–${formatTime(timing.end)} · ` : ""}{slot.teacher.name}{slot.venue ? ` · ${slot.venue}` : ""}</small></div></article>; }) : <p>No lessons</p>}</section>; })}</div></section> : null}
    </div>
  </AppShell>;
}
