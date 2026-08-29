import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/rbac";
import "../../module-workspace.css";

async function queueAttendanceAlert(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "absence");
  if (!studentId) throw new Error("Choose a learner first.");
  await withTenant(session.schoolId, async tx => {
    await requirePermission(tx, session.userId, "guardian_alerts:manage");
    const student = await tx.student.findUnique({ where:{id:studentId}, select:{id:true,name:true,admissionNo:true,guardians:{where:{isPrimary:true},include:{guardian:true}}} });
    if (!student) throw new Error("Learner not found in this school.");
    const primary = student.guardians[0]?.guardian;
    if (!primary) throw new Error("No primary guardian is linked to this learner.");
    const body = kind === "late" ? `SukuuNova attendance notice: ${student.name} (${student.admissionNo}) was recorded late today. Please contact the school if there is anything we should know.` : `SukuuNova attendance notice: ${student.name} (${student.admissionNo}) was recorded absent today. Please contact the school if this absence requires explanation.`;
    await tx.message.create({ data:{schoolId:session.schoolId,channel:"sms",recipientType:"guardian",recipientId:primary.id,recipientPhone:primary.phone,body,templateKey:kind === "late" ? "attendance_late" : "attendance_absent",templateVariables:{studentId:student.id,studentName:student.name,admissionNo:student.admissionNo},status:"queued",nextAttemptAt:new Date()} });
    await tx.auditLogSchool.create({ data:{schoolId:session.schoolId,actorId:session.userId,action:"guardian_alert.queued",entityType:"Guardian",entityId:primary.id,after:{studentId:student.id,kind,channel:"sms"}} });
  });
  redirect("/school/communications/alerts");
}

export default async function GuardianAlertsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async tx => {
    await requirePermission(tx, session.userId, "guardian_alerts:view");
    const [school, students, messages] = await Promise.all([
      tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}),
      tx.student.findMany({where:{status:"active"},orderBy:{name:"asc"},select:{id:true,name:true,admissionNo:true,class:{select:{name:true}},guardians:{where:{isPrimary:true},select:{guardian:{select:{id:true,name:true,phone:true}}}}},take:500}),
      tx.message.findMany({where:{schoolId:session.schoolId,recipientType:"guardian"},orderBy:{createdAt:"desc"},take:100,select:{id:true,channel:true,recipientPhone:true,body:true,status:true,createdAt:true,sentAt:true,lastError:true}})
    ]);
    return {school,students,messages};
  });
  if (!data.school) throw new Error("School not found.");
  const manage = await withTenant(session.schoolId, tx => hasPermission(tx, session.userId, "guardian_alerts:manage"));
  const sent = data.messages.filter(m=>m.status === "sent").length;
  const queued = data.messages.filter(m=>m.status === "queued").length;
  const failed = data.messages.filter(m=>m.status === "failed").length;
  return <AppShell universe="school" title="Guardian Alerts" subtitle="Turn confirmed attendance exceptions into clear, trackable family notifications without changing the attendance record." active="Guardian Alerts" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="module-shell">
      <section className="module-hero"><div><span className="module-kicker">Family communication</span><h2>Guardian alert centre</h2><p>Alerts are a communication workflow: review the attendance event, select the correct learner and queue a message. Delivery status is tracked independently.</p></div><div className="module-actions"><Link className="module-button secondary" href="/school/attendance/exceptions">Attendance exceptions</Link><Link className="module-button secondary" href="/school/communications/messages">All messages</Link></div></section>
      <section className="module-stats"><div className="module-stat"><small>Queued</small><strong>{queued}</strong><span>Waiting for delivery</span></div><div className="module-stat"><small>Sent</small><strong>{sent}</strong><span>Delivered to the provider queue</span></div><div className="module-stat"><small>Failed</small><strong>{failed}</strong><span>Needs delivery follow-up</span></div><div className="module-stat"><small>Guardian-linked learners</small><strong>{data.students.filter(s=>s.guardians.length).length}</strong><span>Active learners with a primary guardian</span></div></section>
      {manage ? <section className="module-layout"><div className="module-panel"><div className="module-toolbar"><div><strong style={{fontSize:12}}>Queue attendance notification</strong><p className="module-muted">Only use this after the attendance exception has been reviewed.</p></div></div><form action={queueAttendanceAlert} style={{display:"grid",gridTemplateColumns:"minmax(210px,1.6fr) minmax(150px,.7fr) auto",gap:9}}><select className="module-select" name="studentId" defaultValue="" required><option value="">Choose learner</option>{data.students.map(s=><option value={s.id} key={s.id}>{s.name} · {s.class?.name ?? "Unassigned"}{s.guardians.length ? "" : " · no primary guardian"}</option>)}</select><select className="module-select" name="kind" defaultValue="absence"><option value="absence">Absence notice</option><option value="late">Late arrival notice</option></select><button className="module-button primary" type="submit">Queue alert →</button></form></div><aside className="module-side-stack"><section className="module-side-card"><h3>Safe workflow</h3><p>Attendance remains the source of truth. A guardian alert is a separate message record with its own delivery status and audit trail.</p><div className="module-pill-row"><span className="module-pill">Review → notify</span><span className="module-pill">Primary guardian</span><span className="module-pill">SMS queue</span></div></section><section className="module-side-card"><h3>No primary guardian?</h3><p>The alert form deliberately refuses to queue a family message when the learner has no primary guardian link. Fix the relationship first.</p></section></aside></section> : <section className="module-card"><div className="module-empty"><strong>View-only alert centre</strong><span>Your role can inspect guardian notifications, but cannot queue new messages.</span></div></section>}
      <section className="module-card"><div className="module-toolbar"><div><strong style={{fontSize:12}}>Recent guardian alerts</strong><p className="module-muted">The most recent 100 guardian messages are shown for operational follow-up.</p></div></div><div className="module-responsive"><table className="module-table"><thead><tr><th>Channel</th><th>Recipient</th><th>Message</th><th>Status</th><th>Created</th></tr></thead><tbody>{data.messages.length ? data.messages.map(m=><tr key={m.id}><td>{m.channel.toUpperCase()}</td><td>{m.recipientPhone}</td><td><span>{m.body}</span>{m.lastError ? <small className="module-muted">{m.lastError}</small> : null}</td><td><span className="module-pill">{m.status}</span></td><td>{m.createdAt.toLocaleString()}</td></tr>) : <tr><td colSpan={5}><div className="module-empty"><strong>No guardian alerts yet</strong><span>Confirmed attendance exceptions can be turned into tracked family messages from this page.</span></div></td></tr>}</tbody></table></div></section>
      <section className="module-notice">Guardian alerts currently queue through SukuuNova's message pipeline. They do not silently alter attendance, and failed delivery stays visible for follow-up.</section>
    </div>
  </AppShell>;
}
