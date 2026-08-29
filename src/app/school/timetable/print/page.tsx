import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import "./print.css";

function minutes(value: string) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function fmt(value: number) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }

export default async function TimetablePrintPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:view");
    const [school, config, classes, slots] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      getAcademicEngineConfig(tx),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, classTeacher: { select: { name: true } } } }),
      tx.timetableSlot.findMany({ where: params.classId ? { classId: params.classId } : {}, include: { class: { select: { name: true } }, subject: { select: { name: true } }, teacher: { select: { name: true } } }, orderBy: { period: "asc" } as never })
    ]);
    return { school, config, classes, slots };
  });
  const timetable = data.config.timetable as { days: Array<{ dayOfWeek: number; name: string; enabled: boolean; start: string; end: string }>; periodMinutes: number; breaks: Array<{ name: string; start: string; end: string }>; periodsPerDay: number };
  const selectedClass = data.classes.find((item) => item.id === params.classId) ?? data.classes[0];
  const days = timetable.days.filter((day) => day.enabled).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const start = selectedClass ? timetable.days.find((day) => day.enabled)?.start ?? "08:00" : "08:00";
  const end = selectedClass ? Math.max(...days.map((day) => minutes(day.end))) : minutes("15:00");
  const breakRows = timetable.breaks.map((b) => `${b.name} ${b.start}–${b.end}`);
  const rows: number[] = [];
  let cursor = minutes(start); let period = 1;
  while (cursor + timetable.periodMinutes <= end && rows.length < timetable.periodsPerDay * 2) { const crossing = timetable.breaks.find((b) => cursor < minutes(b.end) && cursor + timetable.periodMinutes > minutes(b.start)); if (crossing) { cursor = minutes(crossing.end); continue; } rows.push(period); period += 1; cursor += timetable.periodMinutes; }
  return <AppShell universe="school" title="Printable timetable" subtitle="A school-ready weekly grid with breaks and lunch built into the day." active="Timetable" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="print-page-actions"><a href="#print">Print / save as PDF</a><Link href="/school/timetable">Back to timetable</Link></div>
    <section id="print" className="school-paper timetable-paper">
      <header className="paper-header"><div className="school-logo-box">{data.school?.logoUrl ? <img src={data.school.logoUrl} alt="School logo" /> : <span>LOGO</span>}</div><div className="school-heading"><div className="school-kicker">TIMETABLE</div><h2>{data.school?.name ?? "School"}</h2><p>{data.school?.uniqueCode ?? ""}</p><strong>{selectedClass?.name ?? "Weekly timetable"}</strong>{selectedClass?.classTeacher?.name && <span>Class Teacher: {selectedClass.classTeacher.name}</span>}</div></header>
      <div className="paper-meta"><span>Weekly schedule</span><span>{breakRows.length ? breakRows.join(" · ") : "Breaks not configured"}</span></div>
      <table className="timetable-table"><thead><tr><th>TIME</th>{days.map((day) => <th key={day.dayOfWeek}>{day.name.toUpperCase()}</th>)}</tr></thead><tbody>{rows.map((periodNumber) => { const sample = days[0]; const startM = sample ? minutes(sample.start) + (periodNumber - 1) * timetable.periodMinutes : minutes("08:00") + (periodNumber - 1) * timetable.periodMinutes; const breakBlock = timetable.breaks.find((b) => Math.abs(minutes(b.start) - startM) < 2); if (breakBlock) return <tr key={periodNumber} className="break-row"><th>{breakBlock.start}–{breakBlock.end}</th><td colSpan={days.length}>{breakBlock.name.toUpperCase()}</td></tr>; return <tr key={periodNumber}><th>{fmt(startM)}–{fmt(startM + timetable.periodMinutes)}</th>{days.map((day) => { const slot = data.slots.find((item) => item.dayOfWeek === day.dayOfWeek && item.period === periodNumber && (!params.classId || item.classId === selectedClass?.id)); return <td key={day.dayOfWeek}>{slot ? <><strong>{slot.subject.name}</strong><span>{slot.teacher.name}</span></> : ""}</td>; })}</tr>; })}</tbody></table>
      <footer className="paper-footer"><span>{selectedClass?.name ?? "School timetable"}</span><span>Generated by SukuuNova</span></footer>
    </section>
  </AppShell>;
}
