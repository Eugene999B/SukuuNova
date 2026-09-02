import Link from "next/link";
import { CircleAlert, CircleCheckBig, Clock3, UsersRound, UserRoundCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DataCard } from "@/components/ui/DataCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/rbac";
import "../module-workspace.css";

function localDateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export default async function AttendancePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async tx => {
    const canRecord = await hasPermission(tx, session.userId, "attendance:record");
    const canReview = await hasPermission(tx, session.userId, "attendance:review");
    const canRecordAssigned = await hasPermission(tx, session.userId, "attendance:record_assigned");
    const canRecordAll = await hasPermission(tx, session.userId, "attendance:record_all");
    if (!canReview && !canRecordAll && !canRecordAssigned) {
      await requirePermission(tx, session.userId, "attendance:record_assigned");
    }

    const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } });
    const timezone = settings?.timezone || "Africa/Accra";
    const today = localDateInTimeZone(new Date(), timezone);
    const day = new Date(`${today}T00:00:00.000Z`);

    const assignedClassRows = (!canReview && !canRecordAll)
      ? await tx.class.findMany({ where: { classTeacherId: session.userId }, select: { id: true } })
      : [];
    const assignedClassIds = assignedClassRows.map(row => row.id);
    const classScope = (canReview || canRecordAll) ? {} : { id: { in: assignedClassIds } };
    const studentScope = (canReview || canRecordAll)
      ? { status: "active" }
      : { status: "active", classId: { in: assignedClassIds } };
    const eventStudentScope = (canReview || canRecordAll)
      ? { studentId: { not: null } }
      : { studentId: { not: null }, student: { classId: { in: assignedClassIds } } };

    const [school, students, classes, todayEvents, recentEvents] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.student.findMany({ where: studentScope, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true, classId: true, class: { select: { id: true, name: true, level: true } } } }),
      tx.class.findMany({ where: classScope, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: day, ...eventStudentScope }, include: { student: { select: { id: true, name: true, admissionNo: true, classId: true, class: { select: { id: true, name: true, level: true } } } } }, orderBy: { timestamp: "desc" }, take: 500 }),
      tx.attendanceEvent.findMany({ where: eventStudentScope, include: { student: { select: { name: true, admissionNo: true } } }, orderBy: { timestamp: "desc" }, take: 20 })
    ]);
    return { school, students, classes, todayEvents, recentEvents, today, canRecord };
  });

  const recordedToday = new Set(data.todayEvents.map(e => e.studentId).filter(Boolean));
  const present = data.todayEvents.filter(e => e.type === "present" || e.type === "in").length;
  const absent = data.todayEvents.filter(e => e.type === "absent").length;
  const late = data.todayEvents.filter(e => e.type === "late" || e.isLate).length;
  const missing = Math.max(0, data.students.length - recordedToday.size);
  const firstIncompleteClass = data.classes.find(c => data.todayEvents.filter(e => e.student?.classId === c.id).length < c._count.students);

  return <AppShell universe="school" title="Student Attendance" subtitle="Run the daily class register, record exceptions once per day, and keep a clear queue of learners who still need a decision." active="Student Attendance" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="module-workspace">
      <section className="module-setup-card module-card"><div><span className="module-overline">Daily operations</span><h3>Attendance is a daily source of truth.</h3><p>Work class by class. Start with everyone present, change only exceptions, and save the full roster once. This is faster and safer than recording learners one at a time.</p></div><div className="module-setup-list"><Link href="#today"><span>1</span>Review today <b>Present · absent · late · missing</b></Link><Link href="/school/attendance/exceptions"><span>2</span>Resolve exceptions <b>Follow-up queue</b></Link><Link href="/school/communications/alerts"><span>3</span>Notify families <b>Guardian alerts</b></Link>{data.canRecord && firstIncompleteClass ? <Link href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`}><span>4</span>Continue register <b>{firstIncompleteClass.level ? `${firstIncompleteClass.level} · ` : ""}{firstIncompleteClass.name}</b></Link> : <Link href="/school/reports/analytics"><span>4</span>Monitor trends <b>Leadership view</b></Link>}</div></section>
      <div className="module-metrics"><DataCard label="Active learners" value={data.students.length} meta="Students expected today" icon={UsersRound} /><DataCard label="Present" value={present} meta="Recorded as present today" icon={CircleCheckBig} tone="success" /><DataCard label="Late" value={late} meta="Needs punctuality visibility" icon={Clock3} tone={late ? "warning" : "success"} /><DataCard label="Absent" value={absent} meta="Review reason and follow-up" icon={CircleAlert} tone={absent ? "warning" : "success"} /><DataCard label="Not yet recorded" value={missing} meta={missing ? "Complete the class registers" : "Register is complete"} icon={UserRoundCheck} tone={missing ? "warning" : "success"} /></div>
      <section className="module-card" id="today"><div className="module-section-title"><div><span>Today · {data.today}</span><h3>Class coverage</h3><p>Open the roster for any class that is incomplete or needs correction.</p></div><div className="modal-actions"><Link className="button secondary" href="/school/attendance/exceptions">Exception queue</Link>{data.canRecord && firstIncompleteClass ? <Link className="button primary" href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`}>Continue register →</Link> : null}</div></div><div className="module-workflow">{data.classes.map(c => { const classEvents = data.todayEvents.filter(e => e.student?.classId === c.id); const classMissing = Math.max(0, c._count.students - new Set(classEvents.map(e => e.studentId).filter(Boolean)).size); return <Link className="module-workflow-step" key={c.id} href={`/school/attendance/register?classId=${encodeURIComponent(c.id)}&date=${encodeURIComponent(data.today)}`}><span>{classMissing}</span><div><strong>{c.level ? `${c.level} · ` : ""}{c.name}</strong><small>{new Set(classEvents.map(e => e.studentId).filter(Boolean)).size} recorded of {c._count.students} learners · {classMissing ? `${classMissing} still missing` : "Register complete · open to review"}</small></div><span>→</span></Link>; })}{!data.classes.length ? <EmptyState title="No class groups" description="Create classes before relying on class-based attendance workflows." action={<Link href="/school/classes?action=create" className="ui-button ui-button-primary">Create class</Link>} /> : null}</div></section>
      <section className="module-card"><div className="module-section-title"><div><span>Recorded today</span><h3>Daily attendance activity</h3><p>Review the actual entries after completing a class register.</p></div></div><div className="module-table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>State</th><th>Method</th><th>Time</th></tr></thead><tbody>{data.todayEvents.length ? data.todayEvents.map(event => <tr key={event.id}><td style={{padding:12}}><strong>{event.student?.name ?? "Unknown"}</strong><div style={{color:"var(--sn-muted)",fontSize:8}}>{event.student?.admissionNo}</div></td><td style={{padding:12}}>{event.student?.class ? `${event.student.class.level ?? ""}${event.student.class.level ? " · " : ""}${event.student.class.name}` : "Unassigned"}</td><td style={{padding:12}}>{event.type}{event.isLate ? " · late" : ""}</td><td style={{padding:12}}>{event.method}</td><td style={{padding:12}}>{event.timestamp.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</td></tr>) : <tr><td colSpan={5}><EmptyState icon={UserRoundCheck} title="No attendance recorded today" description={data.canRecord ? "Open a class register to record today's attendance." : "No attendance decisions have been recorded yet."} action={data.canRecord && firstIncompleteClass ? <Link href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`} className="ui-button ui-button-primary">Open class register</Link> : undefined} /></td></tr>}</tbody></table></div>{missing ? <div style={{marginTop:12,padding:12,borderRadius:12,border:"1px solid rgba(220,160,80,.3)",background:"rgba(220,160,80,.05)",color:"var(--sn-warning)"}}>{missing} active learner{missing === 1 ? "" : "s"} still need{missing === 1 ? "s" : ""} an attendance decision today.</div> : null}</section>
      <section className="module-card"><div className="module-section-title"><div><span>Recent history</span><h3>Latest attendance activity</h3><p>A short operational trail for supervisors and follow-up.</p></div></div><div className="module-workflow">{data.recentEvents.map(e => <div className="module-workflow-step" key={e.id}><span>{e.type.slice(0,1).toUpperCase()}</span><div><strong>{e.student?.name ?? "Unknown student"}</strong><small>{e.student?.admissionNo} · {e.attendanceDate.toISOString().slice(0,10)} · {e.type}{e.isLate ? " · late" : ""}</small></div></div>)}{!data.recentEvents.length ? <EmptyState title="No attendance history" description="Recorded events will appear here." /> : null}</div></section>
    </div>
  </AppShell>;
}
