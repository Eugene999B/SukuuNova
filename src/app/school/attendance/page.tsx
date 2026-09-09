import Link from "next/link";
import { CircleAlert, CircleCheckBig, Clock3, Fingerprint, QrCode, RadioTower, UsersRound, UserRoundCheck } from "lucide-react";
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

function isPresentEvent(event: { type: string }) {
  return event.type === "in" || event.type === "present" || event.type === "late";
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
      tx.class.findMany({ where: classScope, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: day, ...eventStudentScope }, include: { student: { select: { id: true, name: true, admissionNo: true, classId: true, class: { select: { id: true, name: true, level: true } } } } }, orderBy: { timestamp: "desc" }, take: 500 }),
      tx.attendanceEvent.findMany({ where: eventStudentScope, include: { student: { select: { name: true, admissionNo: true } } }, orderBy: { timestamp: "desc" }, take: 20 })
    ]);
    return { school, students, classes, todayEvents, recentEvents, today, canRecord };
  });

  const presentIds = new Set(data.todayEvents.filter(isPresentEvent).map(e => e.studentId).filter(Boolean));
  const present = presentIds.size;
  const absent = Math.max(0, data.students.length - present);
  const lateIds = new Set(data.todayEvents.filter(e => isPresentEvent(e) && (e.isLate || e.type === "late")).map(e => e.studentId).filter(Boolean));
  const late = lateIds.size;
  const firstIncompleteClass = data.classes.find(c => {
    const classPresent = new Set(data.todayEvents.filter(e => e.student?.classId === c.id && isPresentEvent(e)).map(e => e.studentId).filter(Boolean)).size;
    return classPresent < c._count.students;
  });

  return <AppShell universe="school" title="Student Attendance" subtitle="One attendance history across class registers, QR and biometric devices." active="Student Attendance" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="module-workspace">
      <section className="module-setup-card module-card"><div><span className="module-overline">Daily attendance</span><h3>One source of truth, however attendance is captured.</h3><p>Class registers and connected devices feed the same daily record. Use Attendance Control to configure QR, fingerprint, face, card and verification times.</p></div><div className="module-setup-list"><Link href="/school/devices"><span><RadioTower size={14}/></span>Attendance Control <b>Rules · QR · devices</b></Link>{data.canRecord&&firstIncompleteClass?<Link href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`}><span><UserRoundCheck size={14}/></span>Continue register <b>{firstIncompleteClass.name}</b></Link>:null}<Link href="/school/attendance/display" target="_blank"><span><QrCode size={14}/></span>Live QR station <b>Open full screen</b></Link><Link href="/school/attendance/exceptions"><span><CircleAlert size={14}/></span>Resolve exceptions <b>Corrections & review</b></Link></div></section>
      <div className="module-metrics"><DataCard label="Active learners" value={data.students.length} meta="Students expected today" icon={UsersRound} /><DataCard label="Present" value={present} meta="Manual or automated check-in" icon={CircleCheckBig} tone="success" /><DataCard label="Late" value={late} meta="Present arrivals after the configured cutoff" icon={Clock3} tone={late ? "warning" : "success"} /><DataCard label="Not present" value={absent} meta="No present/check-in decision yet" icon={CircleAlert} tone={absent ? "warning" : "success"} /></div>
      <section className="module-card" id="today"><div className="module-section-title"><div><span>Today · {data.today}</span><h3>Class coverage</h3></div><div className="modal-actions"><Link className="button secondary" href="/school/devices">Attendance Control</Link>{data.canRecord&&firstIncompleteClass?<Link className="button primary" href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`}>Continue register →</Link>:null}</div></div><div className="module-workflow">{data.classes.map(c=>{const classRecorded=new Set(data.todayEvents.filter(e=>e.student?.classId===c.id&&isPresentEvent(e)).map(e=>e.studentId).filter(Boolean)).size;const classMissing=Math.max(0,c._count.students-classRecorded);return <Link className="module-workflow-step" key={c.id} href={`/school/attendance/register?classId=${encodeURIComponent(c.id)}&date=${encodeURIComponent(data.today)}`}><span>{classMissing}</span><div><strong>{c.level?`${c.level} · `:""}{c.name}</strong><small>{classRecorded} present of {c._count.students} learners · {classMissing?`${classMissing} not yet present/decided`:"Register complete · open to review"}</small></div><span>→</span></Link>;})}{!data.classes.length?<EmptyState title="No class groups" description="Create classes and assign class teachers before relying on class-based attendance workflows." action={<Link href="/school/classes?action=create" className="ui-button ui-button-primary">Create class</Link>}/>:null}</div></section>
      <section className="module-card"><div className="module-section-title"><div><span>Recorded today</span><h3>Attendance activity</h3></div><Fingerprint size={18}/></div><div className="module-table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>State</th><th>Method</th><th>Time</th></tr></thead><tbody>{data.todayEvents.length?data.todayEvents.map(event=><tr key={event.id}><td style={{padding:12}}><strong>{event.student?.name??"Unknown"}</strong><div style={{color:"var(--sn-muted)",fontSize:8}}>{event.student?.admissionNo}</div></td><td style={{padding:12}}>{event.student?.class?`${event.student.class.level??""}${event.student.class.level?" · ":""}${event.student.class.name}`:"Unassigned"}</td><td style={{padding:12}}>{attendanceState(event)}</td><td style={{padding:12,textTransform:"capitalize"}}>{event.method.replaceAll("_"," ")}</td><td style={{padding:12}}>{event.timestamp.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</td></tr>):<tr><td colSpan={5}><EmptyState icon={UserRoundCheck} title="No attendance recorded today" description={data.canRecord?"Open a class register or Attendance Control to begin today's attendance.":"No attendance decisions have been recorded yet."} action={data.canRecord&&firstIncompleteClass?<Link href={`/school/attendance/register?classId=${encodeURIComponent(firstIncompleteClass.id)}&date=${encodeURIComponent(data.today)}`} className="ui-button ui-button-primary">Open class register</Link>:undefined}/></td></tr>}</tbody></table></div></section>
      <section className="module-card"><div className="module-section-title"><div><span>Recent history</span><h3>Latest attendance activity</h3></div></div><div className="module-workflow">{data.recentEvents.map(e=><div className="module-workflow-step" key={e.id}><span>{isPresentEvent(e)?"P":e.type.slice(0,1).toUpperCase()}</span><div><strong>{e.student?.name??"Unknown student"}</strong><small>{e.student?.admissionNo} · {e.attendanceDate.toISOString().slice(0,10)} · {attendanceState(e)} · {e.method.replaceAll("_"," ")}</small></div></div>)}{!data.recentEvents.length?<EmptyState title="No attendance history" description="Recorded events will appear here."/>:null}</div></section>
    </div>
  </AppShell>;
}
