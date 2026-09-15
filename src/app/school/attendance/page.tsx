import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  Fingerprint,
  QrCode,
  RadioTower,
  UsersRound,
  UserRoundCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DataCard } from "@/components/ui/DataCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/rbac";
import "../module-workspace.css";
import "./attendance-dashboard.css";

function localDateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function isPresentEvent(event: { type: string }) {
  return event.type === "in" || event.type === "present" || event.type === "late";
}

function isAttendanceDecision(event: { type: string }) {
  return isPresentEvent(event) || event.type === "absent" || event.type === "excused";
}

function attendanceState(event: { type: string; isLate: boolean | null }) {
  if (event.type === "out") return "Checked out";
  if (event.type === "absent") return "Absent";
  if (event.type === "excused") return "Excused";
  if (event.type === "late" || event.isLate) return "Present · late";
  if (event.type === "in" || event.type === "present") return "Present";
  return event.type;
}

export default async function AttendancePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async tx => {
    const canRecord = await hasPermission(tx, session.userId, "attendance:record");
    const canReview = await hasPermission(tx, session.userId, "attendance:review");
    const canRecordAssigned = await hasPermission(tx, session.userId, "attendance:record_assigned");
    const canRecordAll = await hasPermission(tx, session.userId, "attendance:record_all");
    if (!canReview && !canRecordAll && !canRecordAssigned) await requirePermission(tx, session.userId, "attendance:record_assigned");

    const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } });
    const timezone = settings?.timezone || "Africa/Accra";
    const today = localDateInTimeZone(new Date(), timezone);
    const day = new Date(`${today}T00:00:00.000Z`);

    const assignedClassRows = (!canReview && !canRecordAll) ? await tx.class.findMany({ where: { classTeacherId: session.userId }, select: { id: true } }) : [];
    const assignedClassIds = assignedClassRows.map(row => row.id);
    const classScope = (canReview || canRecordAll) ? {} : { id: { in: assignedClassIds } };
    const studentScope = (canReview || canRecordAll) ? { status: "active" } : { status: "active", classId: { in: assignedClassIds } };
    const eventStudentScope = (canReview || canRecordAll) ? { studentId: { not: null } } : { studentId: { not: null }, student: { classId: { in: assignedClassIds } } };

    const [school, students, classes, todayEvents, recentEvents] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.student.findMany({ where: studentScope, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true, classId: true, class: { select: { id: true, name: true, level: true } } } }),
      tx.class.findMany({ where: classScope, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: day, ...eventStudentScope }, include: { student: { select: { id: true, name: true, admissionNo: true, classId: true, class: { select: { id: true, name: true, level: true } } } } }, orderBy: { timestamp: "desc" }, take: 500 }),
      tx.attendanceEvent.findMany({ where: eventStudentScope, include: { student: { select: { name: true, admissionNo: true } } }, orderBy: { timestamp: "desc" }, take: 20 })
    ]);
    return { school, students, classes, todayEvents, recentEvents, today, canRecord };
  });

  const presentIds = new Set(data.todayEvents.filter(isPresentEvent).map(event => event.studentId).filter(Boolean));
  const decidedIds = new Set(data.todayEvents.filter(isAttendanceDecision).map(event => event.studentId).filter(Boolean));
  const lateIds = new Set(data.todayEvents.filter(event => isPresentEvent(event) && (event.isLate || event.type === "late")).map(event => event.studentId).filter(Boolean));
  const absentIds = new Set(data.todayEvents.filter(event => event.type === "absent").map(event => event.studentId).filter(Boolean));
  const excusedIds = new Set(data.todayEvents.filter(event => event.type === "excused").map(event => event.studentId).filter(Boolean));
  const present = presentIds.size;
  const late = lateIds.size;
  const pending = Math.max(0, data.students.length - decidedIds.size);
  const firstIncompleteClass = data.classes.find(c => {
    const activeClassSize = data.students.filter(student => student.classId === c.id).length;
    const classDecided = new Set(data.todayEvents.filter(event => event.student?.classId === c.id && isAttendanceDecision(event)).map(event => event.studentId).filter(Boolean)).size;
    return classDecided < activeClassSize;
  });
  const todayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${data.today}T00:00:00.000Z`));

  return <AppShell universe="school" title="Student Attendance" subtitle="Monitor today's attendance and manage every check-in method from one place." active="Student Attendance" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="module-workspace attendance-dashboard">
      <section className="attendance-command module-card">
        <div className="attendance-command-copy">
          <span className="module-overline">Daily attendance · {todayLabel}</span>
          <h2>Start attendance from the action you need.</h2>
          <p>Class registers, QR and biometric devices all feed the same daily attendance history. Use the shortcuts here instead of hunting through the system.</p>
          <div className="attendance-command-status"><span>{pending ? `${pending} learners still need a decision` : "All active learners have a decision"}</span><strong>{present} present today</strong></div>
        </div>
        <div className="attendance-action-grid">
          <Link className="attendance-action" href="/school/devices"><span className="attendance-action-icon"><RadioTower size={18}/></span><span><strong>Attendance Control</strong><small>Rules, QR and connected devices</small></span><ArrowRight size={15}/></Link>
          {data.canRecord && firstIncompleteClass ? <Link className="attendance-action is-primary" href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`}><span className="attendance-action-icon"><UserRoundCheck size={18}/></span><span><strong>Continue register</strong><small>{firstIncompleteClass.name}</small></span><ArrowRight size={15}/></Link> : null}
          <Link className="attendance-action" href="/school/attendance/display" target="_blank"><span className="attendance-action-icon"><QrCode size={18}/></span><span><strong>Live QR station</strong><small>Open the full-screen check-in view</small></span><ArrowRight size={15}/></Link>
          <Link className="attendance-action" href="/school/attendance/exceptions"><span className="attendance-action-icon"><CircleAlert size={18}/></span><span><strong>Review exceptions</strong><small>Corrections, absences and verification</small></span><ArrowRight size={15}/></Link>
        </div>
      </section>

      <div className="module-metrics attendance-metrics"><DataCard label="Active learners" value={data.students.length} meta="Students expected today" icon={UsersRound} /><DataCard label="Present" value={present} meta="Manual or automated check-in" icon={CircleCheckBig} tone="success" /><DataCard label="Late" value={late} meta="Arrivals after the configured cutoff" icon={Clock3} tone={late ? "warning" : "success"} /><DataCard label="Absent" value={absentIds.size} meta={`${excusedIds.size} excused today`} icon={CircleAlert} tone={absentIds.size ? "warning" : "success"} /><DataCard label="Pending decisions" value={pending} meta={pending ? "Complete the remaining class registers" : "All active learners have a decision"} icon={UserRoundCheck} tone={pending ? "warning" : "success"} /></div>

      <section className="module-card" id="today">
        <div className="module-section-title attendance-section-title"><div><span className="module-overline">Today · {todayLabel}</span><h3>Class coverage</h3><p>See which class registers are complete and jump straight into any class that still needs attention.</p></div><div className="module-actions attendance-section-actions"><Link className="module-button secondary" href="/school/devices">Attendance Control</Link>{data.canRecord && firstIncompleteClass ? <Link className="module-button primary" href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`}>Continue register <ArrowRight size={14}/></Link> : null}</div></div>
        {data.classes.length ? <div className="attendance-class-list">
          <div className="attendance-class-head"><span>Class</span><span>Present</span><span>Absent</span><span>Pending</span><span>Status</span><span></span></div>
          {data.classes.map(c => {
            const activeClassSize = data.students.filter(student => student.classId === c.id).length;
            const classPresent = new Set(data.todayEvents.filter(event => event.student?.classId === c.id && isPresentEvent(event)).map(event => event.studentId).filter(Boolean)).size;
            const classAbsent = new Set(data.todayEvents.filter(event => event.student?.classId === c.id && event.type === "absent").map(event => event.studentId).filter(Boolean)).size;
            const classDecided = new Set(data.todayEvents.filter(event => event.student?.classId === c.id && isAttendanceDecision(event)).map(event => event.studentId).filter(Boolean)).size;
            const classPending = Math.max(0, activeClassSize - classDecided);
            const status = classDecided === 0 ? "Not started" : classPending ? "In progress" : "Complete";
            return <Link className="attendance-class-row" key={c.id} href={`/school/attendance/register?classId=${encodeURIComponent(c.id)}&date=${encodeURIComponent(data.today)}`}>
              <span className="attendance-class-name"><strong>{c.level ? `${c.level} · ` : ""}{c.name}</strong><small>{activeClassSize} active learners</small></span>
              <span className="attendance-class-number" data-label="Present">{classPresent}</span>
              <span className="attendance-class-number" data-label="Absent">{classAbsent}</span>
              <span className="attendance-class-number" data-label="Pending">{classPending}</span>
              <span className={`attendance-class-status ${classPending ? "is-pending" : "is-complete"}`}>{status}</span>
              <ArrowRight className="attendance-class-arrow" size={15}/>
            </Link>;
          })}
        </div> : <EmptyState title="No class groups" description="Create classes and assign class teachers before relying on class-based attendance workflows." action={<Link href="/school/classes?action=create" className="ui-button ui-button-primary">Create class</Link>}/>} 
      </section>

      <section className="module-card">
        <div className="module-section-title attendance-section-title"><div><span className="module-overline">Recorded today</span><h3>Attendance activity</h3><p>Every manual, QR and device event recorded today appears here.</p></div><Fingerprint size={19}/></div>
        <div className="module-table-wrap"><table className="module-table"><thead><tr><th>Student</th><th>Class</th><th>State</th><th>Method</th><th>Time</th></tr></thead><tbody>{data.todayEvents.length ? data.todayEvents.map(event => <tr key={event.id}><td><strong>{event.student?.name ?? "Unknown"}</strong><div className="attendance-student-meta">{event.student?.admissionNo}</div></td><td>{event.student?.class ? `${event.student.class.level ?? ""}${event.student.class.level ? " · " : ""}${event.student.class.name}` : "Unassigned"}</td><td>{attendanceState(event)}</td><td className="attendance-method">{event.method.replaceAll("_", " ")}</td><td>{event.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td></tr>) : <tr><td colSpan={5}><EmptyState icon={UserRoundCheck} title="No attendance recorded today" description={data.canRecord ? "Open a class register or Attendance Control to begin today's attendance." : "No attendance decisions have been recorded yet."} action={data.canRecord && firstIncompleteClass ? <Link href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`} className="ui-button ui-button-primary">Open class register</Link> : undefined}/></td></tr>}</tbody></table></div>
      </section>

      <section className="module-card">
        <div className="module-section-title attendance-section-title"><div><span className="module-overline">Recent history</span><h3>Latest attendance activity</h3><p>A quick trail of the most recent attendance events across your visible learners.</p></div></div>
        {data.recentEvents.length ? <div className="attendance-history-list">{data.recentEvents.map(event => <div className="attendance-history-row" key={event.id}><span className="attendance-history-state">{isPresentEvent(event) ? "P" : event.type.slice(0, 1).toUpperCase()}</span><div><strong>{event.student?.name ?? "Unknown student"}</strong><small>{event.student?.admissionNo} · {event.attendanceDate.toISOString().slice(0, 10)} · {attendanceState(event)} · {event.method.replaceAll("_", " ")}</small></div></div>)}</div> : <EmptyState title="No attendance history" description="Recorded events will appear here."/>}
      </section>
    </div>
  </AppShell>;
}
