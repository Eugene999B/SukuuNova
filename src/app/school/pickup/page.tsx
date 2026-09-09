import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { addApprovedPickup, attemptPickup, reviewPickupRequest } from "@/lib/pickup-service";

async function approveGuardian(formData: FormData) { "use server"; const session = await requireSchoolSession(); const studentId=String(formData.get("studentId")??""); const guardianId=String(formData.get("guardianId")??""); await withTenant(session.schoolId,tx=>addApprovedPickup(tx,{schoolId:session.schoolId,actorId:session.userId,studentId,guardianId})); redirect("/school/pickup"); }
async function requestPickup(formData: FormData) { "use server"; const session = await requireSchoolSession(); const studentId=String(formData.get("studentId")??""); const guardianId=String(formData.get("guardianId")??""); await withTenant(session.schoolId,tx=>attemptPickup(tx,{schoolId:session.schoolId,actorId:session.userId,studentId,guardianId})); redirect("/school/pickup"); }
async function review(formData: FormData) { "use server"; const session = await requireSchoolSession(); const requestId=String(formData.get("requestId")??""); const decision=String(formData.get("decision")??"") as "approved"|"rejected"; await withTenant(session.schoolId,tx=>reviewPickupRequest(tx,{schoolId:session.schoolId,actorId:session.userId,requestId,decision})); redirect("/school/pickup"); }

export default async function PickupPage(){
 const session=await requireSchoolSession();
 const data=await withTenant(session.schoolId,async tx=>{ const [school,students,guardians,approved,requests,events]=await Promise.all([
   tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}),
   tx.student.findMany({where:{schoolId:session.schoolId,status:"active"},orderBy:{name:"asc"},take:250,select:{id:true,name:true,admissionNo:true,class:{select:{name:true,level:true}}}}),
   tx.guardian.findMany({where:{schoolId:session.schoolId},orderBy:{name:"asc"},take:250,select:{id:true,name:true,phone:true}}),
   tx.approvedPickup.findMany({where:{schoolId:session.schoolId},orderBy:{createdAt:"desc"},take:100,select:{id:true,studentId:true,guardianId:true,student:{select:{name:true,admissionNo:true}},guardian:{select:{name:true,phone:true}}}}),
   tx.pickupApprovalRequest.findMany({where:{schoolId:session.schoolId,status:"pending"},orderBy:{createdAt:"desc"},take:100,select:{id:true,studentId:true,collectedByGuardianId:true,createdAt:true,student:{select:{name:true,admissionNo:true}},collectingGuardian:{select:{name:true,phone:true}}}}),
   tx.pickupEvent.findMany({where:{schoolId:session.schoolId},orderBy:{timestamp:"desc"},take:50,select:{id:true,timestamp:true,wasPreApproved:true,student:{select:{name:true,admissionNo:true}},collectingGuardian:{select:{name:true}}}})
 ]); return {school,students,guardians,approved,requests,events}; });
 const canApprove=await withTenant(session.schoolId,tx=>requirePermission(tx,session.userId,"attendance:pickup_approve").then(()=>true).catch(()=>false));
 return <AppShell universe="school" title="Pickup & Gate" subtitle="Verify and record student collection." active="Pickup" schoolName={data.school?.name??"School Workspace"} schoolCode={data.school?.uniqueCode??""} userName={session.name}>
  <div className="module-workspace">
   <section className="module-layout">
    <div className="module-panel module-card">
     <div className="module-section-title"><div><span>Gate action</span><h3>Record a pickup</h3><p>Choose the learner and the person collecting them. SukuuNova checks whether approval already exists.</p></div></div>
     <form action={requestPickup} className="module-toolbar"><select name="studentId" required defaultValue=""><option value="">Choose student</option>{data.students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.admissionNo}{s.class?` · ${s.class.name}`:""}</option>)}</select><select name="guardianId" required defaultValue=""><option value="">Choose collecting guardian</option>{data.guardians.map(g=><option key={g.id} value={g.id}>{g.name}{g.phone?` · ${g.phone}`:""}</option>)}</select><button className="button primary" type="submit">Check & record</button></form>
    </div>
    <aside className="module-side-card"><div className="module-side-card-head"><h3>Needs approval</h3><span>{data.requests.length}</span></div>{data.requests.length?<div className="module-list">{data.requests.map(r=><div className="module-list-item" key={r.id}><span><strong>{r.student.name}</strong><small>{r.collectingGuardian.name}{r.collectingGuardian.phone?` · ${r.collectingGuardian.phone}`:""}</small></span>{canApprove?<form action={review}><input type="hidden" name="requestId" value={r.id}/><input type="hidden" name="decision" value="approved"/><button className="button primary" type="submit">Approve</button></form>:<small>Awaiting approver</small>}</div>)}</div>:<div className="module-empty"><strong>Nothing waiting</strong><span>Unscheduled collections appear here.</span></div>}</aside>
   </section>

   {canApprove?<details className="sn-progressive"><summary>Approved collectors · {data.approved.length}</summary><div className="sn-progressive-body"><p className="module-muted">Add a recurring approved guardian only when the school wants future pickups by this person to pass the gate check automatically.</p><form action={approveGuardian} className="module-toolbar"><select name="studentId" required defaultValue=""><option value="">Student</option>{data.students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.admissionNo}</option>)}</select><select name="guardianId" required defaultValue=""><option value="">Guardian</option>{data.guardians.map(g=><option key={g.id} value={g.id}>{g.name} · {g.phone??"No phone"}</option>)}</select><button className="button secondary" type="submit">Approve recurring collector</button></form></div></details>:null}

   <details className="sn-progressive"><summary>Recent pickup history · {data.events.length}</summary><div className="sn-progressive-body"><div className="module-table-wrap"><table className="module-table"><thead><tr><th>Student</th><th>Collected by</th><th>Time</th><th>Verification</th></tr></thead><tbody>{data.events.map(e=><tr key={e.id}><td><strong>{e.student.name}</strong><small>{e.student.admissionNo}</small></td><td>{e.collectingGuardian.name}</td><td>{new Date(e.timestamp).toLocaleString("en-GH")}</td><td><span className="app-pill">{e.wasPreApproved?"Pre-approved":"Approved at gate"}</span></td></tr>)}{data.events.length===0?<tr><td colSpan={4}><div className="module-empty"><strong>No pickup events yet</strong></div></td></tr>:null}</tbody></table></div></div></details>
   <div className="module-actions"><Link className="module-button secondary" href="/school/students">Student register</Link></div>
  </div>
 </AppShell>
}