import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarPlus, CheckCircle2, Clock3, ExternalLink, Printer, Users, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { dayBlocks } from "@/lib/timetable-engine-v2";
import { createTimetableSlot, deleteTimetableSlot } from "@/lib/timetable-service";
import "./timetable.css";

type Period = { period: number; start: string; end: string };
type Day = { dayOfWeek: number; name: string; enabled: boolean; start: string; end: string; periods?: Period[] };
type TimetableConfig = { days: Day[]; periodMinutes: number; breaks: { name: string; start: string; end: string }[]; periodsPerDay: number; periods?: Period[]; published: boolean };

async function saveSlot(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const classId = String(formData.get("classId") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const period = Number(formData.get("period"));
  const slotId = String(formData.get("slotId") ?? "").trim();
  if (!classId || !subjectId || !teacherId || !Number.isInteger(dayOfWeek) || !Number.isInteger(period)) throw new Error("Choose a class, subject, teacher and lesson time.");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    if (slotId) {
      const existing = await tx.timetableSlot.findFirst({ where: { id: slotId, schoolId: session.schoolId }, select: { id: true } });
      if (!existing) throw new Error("That timetable lesson could not be found.");
      await tx.timetableSlot.update({ where: { id: slotId }, data: { classId, subjectId, teacherId, dayOfWeek, period } });
    } else {
      await createTimetableSlot(tx, { schoolId: session.schoolId, actorId: session.userId, classId, subjectId, teacherId, dayOfWeek, period });
    }
  });
  redirect(`/school/timetable?classId=${encodeURIComponent(classId)}`);
}

async function deleteSlot(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const slotId = String(formData.get("slotId") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  if (!slotId) return;
  await withTenant(session.schoolId, async (tx) => deleteTimetableSlot(tx, { schoolId: session.schoolId, actorId: session.userId, slotId }));
  redirect(`/school/timetable${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`);
}

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(value: number) {
  const h = Math.floor(value / 60) % 24;
  const m = value % 60;
  return formatTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ classId?: string; edit?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const selectedClassId = String(params.classId ?? "").trim();
  const editId = String(params.edit ?? "").trim();

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const [school, classes, subjects, teachers, slots, academic] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.subject.findMany({ where: { schoolId: session.schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.timetableSlot.findMany({
        where: { schoolId: session.schoolId, ...(selectedClassId ? { classId: selectedClassId } : {}) },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        include: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } }, teacher: { select: { id: true, name: true } } },
      }),
      getAcademicEngineConfig(tx),
    ]);
    return { school, classes, subjects, teachers, slots, config: academic.timetable as TimetableConfig };
  });

  const enabledDays = data.config.days.filter((day) => day.enabled && day.dayOfWeek >= 1 && day.dayOfWeek <= 6);
  const anchor = enabledDays[0] ?? { dayOfWeek: 1, name: "Monday", enabled: true, start: "08:00", end: "15:00", periods: [] };
  const schedule = dayBlocks(anchor, data.config);
  const periods = schedule.periods.length ? schedule.periods : (data.config.periods ?? []);
  const selectedClass = data.classes.find((schoolClass) => schoolClass.id === selectedClassId) ?? null;
  const selectedClassName = selectedClass ? `${selectedClass.level ? `${selectedClass.level} · ` : ""}${selectedClass.name}` : "All classes";
  const editSlot = data.slots.find((slot) => slot.id === editId) ?? null;
  const newParts = editId.startsWith("new:") ? editId.split(":") : [];
  const openSlots = Math.max(0, enabledDays.length * periods.length - data.slots.length);
  const classesCovered = new Set(data.slots.map((slot) => slot.classId)).size;
  const teachersScheduled = new Set(data.slots.map((slot) => slot.teacherId)).size;
  const gridTemplateColumns = `112px repeat(${Math.max(enabledDays.length, 1)}, minmax(190px, 1fr))`;

  return (
    <AppShell universe="school" title="Timetable" subtitle="Build the weekly teaching schedule, then print or publish it from a dedicated output workspace." active="Timetable" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <main className="timetable-page">
        <section className="timetable-intro">
          <div className="timetable-intro-copy">
            <span className="timetable-kicker">ACADEMIC SCHEDULE</span>
            <h1>One clear view of the school week.</h1>
            <p>Choose a class to work on, place lessons into the fixed periods from Academic Setup, and keep the finished timetable ready for print or publication.</p>
          </div>
          <div className="timetable-intro-actions">
            <Link className="tt-button primary" href={`/school/timetable?edit=new:${enabledDays[0]?.dayOfWeek ?? 1}:${periods[0]?.period ?? 1}${selectedClassId ? `&classId=${encodeURIComponent(selectedClassId)}` : ""}`}><CalendarPlus size={15} /> Add lesson</Link>
            <Link className="tt-button secondary" href="/school/timetable/print"><Printer size={15} /> Print timetable</Link>
          </div>
        </section>

        <section className="timetable-toolbar">
          <div className="tt-context">
            <div className="tt-context-label">WORKING VIEW</div>
            <div className="tt-context-row">
              <form method="get" className="tt-class-form">
                <label htmlFor="classId">Class</label>
                <select id="classId" name="classId" defaultValue={selectedClassId}>
                  <option value="">All classes</option>
                  {data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}
                </select>
                <button className="tt-button secondary compact" type="submit">View</button>
              </form>
              <Link className="tt-text-link" href="/school/academics/setup">Schedule setup <ArrowRight size={13} /></Link>
            </div>
          </div>
          <div className="tt-summary">
            <div><span>Lessons</span><strong>{data.slots.length}</strong></div>
            <div><span>Classes</span><strong>{classesCovered}</strong></div>
            <div><span>Teachers</span><strong>{teachersScheduled}</strong></div>
            <div className="tt-summary-status"><span>Publication</span><strong className={data.config.published ? "is-live" : "is-draft"}>{data.config.published ? "Live" : "Draft"}</strong></div>
          </div>
        </section>

        <section className="timetable-surface">
          <div className="timetable-surface-head">
            <div><span className="timetable-kicker">WEEKLY TIMETABLE</span><h2>{selectedClassName}</h2><p>{enabledDays.length ? `${enabledDays.length} school days · ${periods.length} teaching periods per day` : "No school days are enabled yet."}</p></div>
            <div className="tt-head-note"><Clock3 size={14} /> Times are controlled by Academic Setup</div>
          </div>

          {!enabledDays.length || !periods.length ? (
            <div className="tt-empty-state"><div className="tt-empty-icon"><Clock3 size={18} /></div><strong>Set the school day before scheduling lessons.</strong><span>Turn on school days and define lesson periods in Academic Setup. The timetable will use those times automatically.</span><Link className="tt-button secondary" href="/school/academics/setup">Open Academic Setup <ExternalLink size={14} /></Link></div>
          ) : (
            <div className="tt-grid-scroll">
              <div className="tt-grid" style={{ gridTemplateColumns }}>
                <div className="tt-grid-corner"><span>TIME</span><small>LESSON PERIOD</small></div>
                {enabledDays.map((day) => <div className="tt-day-head" key={day.dayOfWeek}><strong>{day.name.slice(0, 3).toUpperCase()}</strong><span>{day.name}</span></div>)}
                {periods.map((period) => (
                  <div key={`p-${period.period}`} style={{ display: "contents" }}>
                    <div className="tt-time-cell"><strong>P{period.period}</strong><span>{formatTime(period.start)} – {formatTime(period.end)}</span></div>
                    {enabledDays.map((day) => {
                      const slot = data.slots.find((item) => item.dayOfWeek === day.dayOfWeek && item.period === period.period);
                      return <div className={`tt-lesson-cell ${slot ? "filled" : "open"}`} key={`${day.dayOfWeek}-${period.period}`}>
                        {slot ? <Link className="tt-lesson" href={`/school/timetable?classId=${encodeURIComponent(slot.classId)}&edit=${encodeURIComponent(slot.id)}`}><span className="tt-lesson-subject">{slot.subject.name}</span><span className="tt-lesson-teacher">{slot.teacher.name}</span>{!selectedClassId ? <span className="tt-lesson-class">{slot.class.name}</span> : null}<ArrowRight className="tt-lesson-arrow" size={14} aria-hidden="true" /></Link> : <Link className="tt-open-slot" href={`/school/timetable?edit=new:${day.dayOfWeek}:${period.period}${selectedClassId ? `&classId=${encodeURIComponent(selectedClassId)}` : ""}`} aria-label={`Add lesson on ${day.name}, period ${period.period}`}><CalendarPlus size={15} /><span>Add lesson</span></Link>}
                      </div>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.config.breaks.length ? <div className="tt-breaks"><span className="tt-break-label">NON-TEACHING TIME</span>{data.config.breaks.map((item) => <span className="tt-break" key={`${item.name}-${item.start}`}>{item.name} · {formatTime(item.start)}–{formatTime(item.end)}</span>)}</div> : null}
        </section>

        <section className="tt-support-grid">
          <article className="tt-support-card"><div className="tt-support-icon"><CheckCircle2 size={17} /></div><div><span className="timetable-kicker">SCHEDULE HEALTH</span><h3>{openSlots ? `${openSlots} open teaching slots` : "The weekly grid is fully booked"}</h3><p>{data.slots.length ? "Open cells are genuine scheduling opportunities. Click one to place a lesson, or open an existing lesson to edit it." : "Start by placing the first lesson. The timetable will build itself around the periods already defined for the school."}</p></div></article>
          <article className="tt-support-card"><div className="tt-support-icon"><Users size={17} /></div><div><span className="timetable-kicker">NEXT TOOLS</span><h3>Finish, then distribute</h3><div className="tt-tool-links"><Link href="/school/academics/setup">Adjust school days & lesson times <ArrowRight size={13} /></Link><Link href="/school/timetable/print">Design & print the timetable <ArrowRight size={13} /></Link></div></div></article>
        </section>

        {editId ? <div className="tt-drawer" role="dialog" aria-modal="true" aria-label={editSlot ? "Edit lesson" : "Add lesson"}>
          <div className="tt-drawer-panel">
            <div className="tt-drawer-head"><div><span className="timetable-kicker">{editSlot ? "EDIT LESSON" : "NEW LESSON"}</span><h2>{editSlot ? editSlot.subject.name : "Add a lesson"}</h2><p>{editSlot ? "Change the lesson details without changing the school time structure." : "Choose who, what and when. The lesson time comes from Academic Setup."}</p></div><Link className="tt-close" href={`/school/timetable${selectedClassId ? `?classId=${encodeURIComponent(selectedClassId)}` : ""}`} aria-label="Close"><X size={18} /></Link></div>
            <form action={saveSlot} className="tt-form">
              {editSlot ? <input type="hidden" name="slotId" value={editSlot.id} /> : null}
              <label>Class<select name="classId" required defaultValue={editSlot?.classId ?? selectedClassId}><option value="">Choose class</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select></label>
              <label>Subject<select name="subjectId" required defaultValue={editSlot?.subjectId ?? ""}><option value="">Choose subject</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
              <label>Teacher<select name="teacherId" required defaultValue={editSlot?.teacherId ?? ""}><option value="">Choose teacher</option>{data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
              <div className="tt-form-two"><label>Day<select name="dayOfWeek" required defaultValue={editSlot?.dayOfWeek ?? (newParts[1] || enabledDays[0]?.dayOfWeek || 1)}>{enabledDays.map((day) => <option key={day.dayOfWeek} value={day.dayOfWeek}>{day.name}</option>)}</select></label><label>Lesson period<select name="period" required defaultValue={editSlot?.period ?? (newParts[2] || periods[0]?.period || 1)}>{periods.map((item) => <option key={item.period} value={item.period}>P{item.period} · {formatMinutes(timeToMinutes(item.start))} – {formatTime(item.end)}</option>)}</select></label></div>
              <div className="tt-form-note"><Clock3 size={14} /><span>Lesson times are managed in <Link href="/school/academics/setup">Academic Setup</Link>, so every class stays on the same school-day structure.</span></div>
              <div className="tt-form-actions"><Link className="tt-button secondary" href={`/school/timetable${selectedClassId ? `?classId=${encodeURIComponent(selectedClassId)}` : ""}`}>Cancel</Link><button className="tt-button primary" type="submit">Save lesson</button></div>
            </form>
            {editSlot ? <form action={deleteSlot} className="tt-delete-form"><input type="hidden" name="slotId" value={editSlot.id} /><input type="hidden" name="classId" value={selectedClassId} /><button type="submit">Delete this lesson</button></form> : null}
          </div>
        </div> : null}
      </main>
    </AppShell>
  );
}
