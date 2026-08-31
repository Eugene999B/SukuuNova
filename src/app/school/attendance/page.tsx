import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, CircleCheckBig, Clock3, UsersRound, UserRoundCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DataCard } from "@/components/ui/DataCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/rbac";
import "../module-workspace.css";

function dateOnly(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10); }

async function recordAttendance(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const attendanceDate = dateOnly(String(formData.get("attendanceDate") ?? "").trim());
  const type = String(formData.get("type") ?? "present").trim();
  const isLate = String(formData.get("isLate") ?? "") === "true";
  if (!studentId || !["present", "absent", "late", "excused"].includes(type)) throw new Error("Student and attendance status are required.");
  await withTenant(session.schoolId, async tx => {
    await requirePermission(tx, session.userId, "attendance:record");
    const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true, name: true } });
    if (!student) throw new Error("The selected student does not belong to this school.");
    const existing = await tx.attendanceEvent.findFirst({ where: { schoolId: session.schoolId, studentId, attendanceDate }, select: { id: true } });
    if (existing) throw new Error(`${student.name} already has an attendance record for ${attendanceDate}.`);
    const event = await tx.attendanceEvent.create({ data: { schoolId: session.schoolId, studentId, type, method: "school_register", timestamp: new Date(), attendanceDate: new Date(`${attendanceDate}T00:00:00.000Z`), isLate: isLate || type === "late", recordedBy: session.userId } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "attendance.recorded", entityType: "AttendanceEvent", entityId: event.id, after: { studentId, attendanceDate, type, isLate: isLate || type === "late" } } });
  });
  redirect("/school/attendance");
}

export default async function AttendancePage() {
  const session = await requireSchoolSession();
  const today = new Date().toISOString().slice(0, 10);
  const data = await withTenant(session.schoolId, async tx => {
    const canRecord = await hasPermission(tx, session.userId, "attendance:record");
    const canReview = await hasPermission(tx, session.userId, "attendance:review");
    if (!canRecord && !canReview) await requirePermission(tx, session.userId, "attendance:view_own");
    const [school, students, classes, todayEvents, recentEvents] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.student.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true, class: { select: { name: true, level: true } } } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.attendanceEvent.findMany({ where: { schoolId: session.schoolId, attendanceDate: new Date(`${today}T00:00:00.000Z`), studentId: { not: null } }, include: { student: { select: { id: true, name: true, admissionNo: true, class: { select: { name: true, level: true } } } } }, orderBy: { timestamp: "desc" }, take: 500 }),
      tx.attendanceEvent.findMany({ where: { schoolId: session.schoolId, studentId: { not: null } }, include: { student: { select: { name: true, admissionNo: true } } }, orderBy: { timestamp: "desc" }, take: 20 })
    ]);
    return { school, students, classes, todayEvents, recentEvents, canRecord };
  });
  const recordedToday = new Set(data.todayEvents.map(e => e.studentId).filter(Boolean));
  const present = data.todayEvents.filter(e => e.type === "present").length;
  const absent = data.todayEvents.filter(e => e.type === "absent").length;
  const late = data.todayEvents.filter(e => e.type === "late" || e.isLate).length;
  const missing = Math.max(0, data.students.length - recordedToday.size);
  return <AppShell universe="school" title="Student Attendance" subtitle="Run the daily student register, record exceptions once per day, and keep a clear queue of learners who still need a decision." active="Student Attendance" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="module-workspace">
      <section className="module-setup-card module-card"><div><span className="module-overline">Daily operations</span><h3>Attendance is a daily source of truth.</h3><p>Every active learner should receive one attendance decision per date. Present, absent, late and excused states feed guardian alerts, exception handling and trend reporting without duplicate records.</p></div><div className="module-setup-list"><Link href="#today"><span>1</span>Review today <b>Present · absent · late · missing</b></Link><Link href="/school/attendance/exceptions"><span>2</span>Resolve exceptions <b>Follow-up queue</b></Link><Link href="/school/communications/alerts"><span>3</span>Notify families <b>Guardian alerts</b></Link>{data.canRecord ? <Link href="#record"><span>4</span>Record attendance <b>One decision per date</b></Link> : <Link href="/school/reports/analytics"><span>4</span>Monitor trends <b>Leadership view</b></Link>}</div></section>
      <div className="module-metrics"><DataCard label="Active learners" value={data.students.length} meta="Students expected today" icon={UsersRound} /><DataCard label="Present" value={present} meta="Recorded as present today" icon={CircleCheckBig} tone="success" /><DataCard label="Late" value={late} meta="Needs punctuality visibility" icon={Clock3} tone={late ? "warning" : "success"} /><DataCard label="Absent" value={absent} meta="Review reason and follow-up" icon={CircleAlert} tone={absent ? "warning" : "success"} /><DataCard label="Not yet recorded" value={missing} meta={missing ? "Complete the register" : "Register is complete"} icon={UserRoundCheck} tone={missing ? "warning" : "success"} /></div>
      {data.canRecord ? <section className="module-card" id="record"><div className="module-section-title"><div><span>Register action</span><h3>Record student attendance</h3><p>The form refuses a second attendance record for the same learner on the same date.</p></div></div><form action={recordAttendance} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 15 }}><select name="studentId" required defaultValue="" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "var(--sn-surface-2)", color: "var(--sn-ink)" }}><option value="">Choose student</option>{data.students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.class?.name ?? "Unassigned"}</option>)}</select><input name="attendanceDate" type="date" defaultValue={today} required style={{ padding: 11, borderRadius: 10, border: "1px solid var(--sn-line)", background: "var(--sn-surface-2)", color: "var(--sn-ink)" }} /><select name="type" defaultValue="present" style={{ padding: 11, borderRadius: 10, border: "1px solid var(--sn-line)", background: "var(--sn-surface-2)", color: "var(--sn-ink)" }}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select><select name="isLate" defaultValue="false" style={{ padding: 11, borderRadius: 10, border: "1px solid var(--sn-line)", background: "var(--sn-surface-2)", color: "var(--sn-ink)" }}><option value="false">Not separately late</option><option value="true">Mark as late</option></select><button className="module-hero-button" type="submit">Save attendance →</button></form></section> : null}
      <section className="module-card" id="today"><div className="module-section-title"><div><span>Today · {today}</span><h3>Daily register</h3><p>Review the recorded list to see exactly which learners have a decision and which remain outstanding.</p></div><Link href="/school/attendance/exceptions">Open exception queue →</Link></div><div className="module-table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>State</th><th>Method</th><th>Time</th></tr></thead><tbody>{data.todayEvents.length ? data.todayEvents.map(event => <tr key={event.id}><td style={{padding:12}}><strong>{event.student?.name ?? "Unknown"}</strong><div style={{color:"var(--sn-muted)",fontSize:8}}>{event.student?.admissionNo}</div></td><td style={{padding:12}}>{event.student?.class ? `${event.student.class.level ?? ""}${event.student.class.level ? " · " : ""}${event.student.class.name}` : "Unassigned"}</td><td style={{padding:12}}>{event.type}{event.isLate ? " · late" : ""}</td><td style={{padding:12}}>{event.method}</td><td style={{padding:12}}>{event.timestamp.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</td></tr>) : <tr><td colSpan={5}><EmptyState icon={UserRoundCheck} title="No attendance recorded today" description={data.canRecord ? "Start the daily register by recording each active learner's status." : "No attendance decisions have been recorded yet."} action={<Link href={data.canRecord ? "#record" : "/school/attendance"} className="ui-button ui-button-primary">{data.canRecord ? "Record attendance" : "Refresh register"}</Link>} /></td></tr>}</tbody></table></div>{missing ? <div style={{marginTop:12,padding:12,borderRadius:12,border:"1px solid rgba(220,160,80,.3)",background:"rgba(220,160,80,.05)",color:"var(--sn-warning)"}}>{missing} active learner{missing === 1 ? "" : "s"} still need{missing === 1 ? "s" : ""} an attendance decision today.</div> : null}</section>
      <section className="module-card"><div className="module-section-title"><div><span>Class coverage</span><h3>Attendance readiness by class</h3><p>Classes with no or partial attendance are immediately visible before the register is considered complete.</p></div><Link href="/school/classes">Review class structure →</Link></div><div className="module-workflow">{data.classes.map(c => { const classEvents = data.todayEvents.filter(e => e.student?.class?.name === c.name); const classMissing = Math.max(0, c._count.students - classEvents.length); return <div className="module-workflow-step" key={c.id}><span>{classMissing}</span><div><strong>{c.level ? `${c.level} · ` : ""}{c.name}</strong><small>{classEvents.length} recorded of {c._count.students} learners · {classMissing ? `${classMissing} still missing` : "Register complete"}</small></div></div>; })}{!data.classes.length ? <EmptyState title="No class groups" description="Create classes before relying on class-based attendance workflows." action={<Link href="/school/classes?action=create" className="ui-button ui-button-primary">Create class</Link>} /> : null}</div></section>
      <section className="module-card"><div className="module-section-title"><div><span>Recent history</span><h3>Latest attendance activity</h3><p>A short operational trail for supervisors and follow-up.</p></div></div><div className="module-workflow">{data.recentEvents.map(e => <div className="module-workflow-step" key={e.id}><span>{e.type.slice(0,1).toUpperCase()}</span><div><strong>{e.student?.name ?? "Unknown student"}</strong><small>{e.student?.admissionNo} · {e.attendanceDate.toISOString().slice(0,10)} · {e.type}{e.isLate ? " · late" : ""}</small></div></div>)}{!data.recentEvents.length ? <EmptyState title="No attendance history" description="Recorded events will appear here." /> : null}</div></section>
    </div>
  </AppShell>;
}
