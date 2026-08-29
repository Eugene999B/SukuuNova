import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import "../../module-workspace.css";

function dateOnly(daysAgo = 0) { const d = new Date(); d.setUTCDate(d.getUTCDate() - daysAgo); return d.toISOString().slice(0,10); }

export default async function AttendanceExceptionsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "attendance:review");
    const [school, events, recentMessages] = await Promise.all([
      tx.school.findUnique({ where:{id:session.schoolId}, select:{name:true,uniqueCode:true} }),
      tx.attendanceEvent.findMany({ where:{ schoolId:session.schoolId, studentId:{not:null}, attendanceDate:{gte:new Date(`${dateOnly(14)}T00:00:00.000Z`), lte:new Date(`${dateOnly(0)}T00:00:00.000Z`)} , OR:[{type:"absent"},{type:"late"},{isLate:true}] }, include:{student:{select:{id:true,name:true,admissionNo:true,class:{select:{name:true,level:true}}}}, recorder:{select:{name:true}}}, orderBy:{timestamp:"desc"}, take:150 }),
      tx.message.findMany({ where:{ schoolId:session.schoolId, recipientType:"guardian" }, orderBy:{createdAt:"desc"}, take:30, select:{id: true, status:true, channel:true, recipientPhone:true, body:true, createdAt:true, sentAt:true} })
    ]);
    return {school, events, recentMessages};
  });
  const absent = data.events.filter(e=>e.type === "absent").length;
  const late = data.events.filter(e=>e.type === "late" || e.isLate).length;
  const messagePhones = new Set(data.recentMessages.map(m=>m.recipientPhone));
  const notNotified = data.events.filter(e=>e.student && data.recentMessages.every(m=>!m.body.toLowerCase().includes(e.student!.name.toLowerCase()))).length;
  const canAlert = await withTenant(session.schoolId, tx => hasPermission(tx, session.userId, "guardian_alerts:manage"));

  return <AppShell universe="school" title="Late & Absence" subtitle="Investigate attendance exceptions, keep decisions explainable, and move confirmed events into guardian follow-up." active="Late & Absence" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="module-shell">
      <section className="module-hero"><div><span className="module-kicker">Attendance control room</span><h2>Late & absence exceptions</h2><p>Exceptions are where the school decides what happened, what needs follow-up, and whether a guardian should be informed. Review first; notify second.</p></div><div className="module-actions"><Link className="module-button secondary" href="/school/attendance">Back to register</Link>{canAlert ? <Link className="module-button primary" href="/school/communications/alerts">Guardian alerts →</Link> : null}</div></section>
      <section className="module-stats"><div className="module-stat"><small>Open signals</small><strong>{data.events.length}</strong><span>Last 15 days</span></div><div className="module-stat"><small>Absence</small><strong>{absent}</strong><span>Attendance marked absent</span></div><div className="module-stat"><small>Late</small><strong>{late}</strong><span>Late or marked late</span></div><div className="module-stat"><small>Needs follow-up</small><strong>{notNotified}</strong><span>Recent alert match not found</span></div></section>
      <section className="module-layout"><div className="module-panel"><div className="module-toolbar"><div><strong style={{fontSize:12}}>Exception queue</strong><p className="module-muted">Newest decisions appear first. Use the learner record and recorder information to investigate.</p></div><Link className="module-button secondary" href="/school/communications/alerts">Open alert centre</Link></div><div className="module-responsive"><table className="module-table"><thead><tr><th>Student</th><th>Class</th><th>Exception</th><th>Date</th><th>Recorded by</th></tr></thead><tbody>{data.events.length ? data.events.map(e=><tr key={e.id}><td><b>{e.student?.name ?? "Unknown"}</b><span className="module-muted">{e.student?.admissionNo}</span></td><td>{e.student?.class ? `${e.student.class.level ?? ""}${e.student.class.level ? " · " : ""}${e.student.class.name}` : "Unassigned"}</td><td><span className="module-pill">{e.type === "absent" ? "ABSENT" : "LATE"}</span></td><td>{e.attendanceDate.toISOString().slice(0,10)}</td><td>{e.recorder.name}</td></tr>) : <tr><td colSpan={5}><div className="module-empty"><strong>No late or absence exceptions</strong><span>The exception queue is clear for the current review window.</span></div></td></tr>}</tbody></table></div></div>
        <aside className="module-side-stack"><section className="module-side-card"><h3>Review rule</h3><p>Attendance decisions should be verified against the class register, timetable or other school evidence before a guardian message is queued.</p><div className="module-notice">Use this workspace for investigation and follow-up — not for re-entering duplicate attendance records.</div></section><section className="module-side-card"><h3>Alert delivery</h3><p>Guardian alerts are tracked separately from attendance so failed SMS/WhatsApp delivery never changes the attendance record.</p><div className="module-pill-row"><span className="module-pill">{messagePhones.size} guardian recipients seen</span><span className="module-pill">{data.recentMessages.filter(m=>m.status==="sent").length} sent</span><span className="module-pill">{data.recentMessages.filter(m=>m.status==="failed").length} failed</span></div></section></aside></section>
    </div>
  </AppShell>;
}
