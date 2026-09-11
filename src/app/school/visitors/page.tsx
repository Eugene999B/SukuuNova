import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { isOperationalStaffAccount } from "@/lib/authorization";
import { signInVisitor, signOutVisitor } from "@/lib/visitor-service";

async function logVisitor(formData: FormData){"use server";const session=await requireSchoolSession();const name=String(formData.get("name")??"").trim();const phone=String(formData.get("phone")??"").trim();const purpose=String(formData.get("purpose")??"").trim();const hostStaffId=String(formData.get("hostStaffId")??"").trim();if(!name||!purpose)throw new Error("Visitor name and purpose are required.");await withTenant(session.schoolId,async tx=>signInVisitor(tx,{schoolId:session.schoolId,actorId:session.userId,name,phone:phone||undefined,purpose,hostStaffId:hostStaffId||undefined}));redirect("/school/visitors");}
async function checkOutVisitor(formData:FormData){"use server";const session=await requireSchoolSession();const id=String(formData.get("id")??"");if(!id)return;await withTenant(session.schoolId,async tx=>signOutVisitor(tx,{schoolId:session.schoolId,actorId:session.userId,visitorId:id}));redirect("/school/visitors");}

export default async function VisitorsPage(){
 const session=await requireSchoolSession();
 const data=await withTenant(session.schoolId,async tx=>{await requirePermission(tx,session.userId,"visitors:log");const[school,staffCandidates,visitors]=await Promise.all([tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}),tx.user.findMany({where:{schoolId:session.schoolId,status:"active"},orderBy:{name:"asc"},select:{id:true,name:true,userRoles:{select:{role:{select:{key:true,name:true}}}}}}),tx.visitorLog.findMany({where:{schoolId:session.schoolId},orderBy:{timeIn:"desc"},take:100,select:{id:true,name:true,phone:true,purpose:true,timeIn:true,timeOut:true,hostStaff:{select:{name:true}}}})]);const staff=staffCandidates.filter(user=>isOperationalStaffAccount(user.userRoles.map(({role})=>role))).map(({userRoles:_roles,...user})=>user);return{school,staff,visitors};});
 const open=data.visitors.filter(v=>!v.timeOut);
 return <AppShell universe="school" title="Visitors" subtitle="Check visitors in and out." active="Visitors" schoolName={data.school?.name??"School Workspace"} schoolCode={data.school?.uniqueCode??""} userName={session.name}>
  <div className="module-workspace">
   <section className="module-layout">
    <div className="module-panel module-card"><div className="module-section-title"><div><span>Front desk</span><h3>Check in a visitor</h3><p>Record who arrived, why they are here and who they are visiting.</p></div></div><form action={logVisitor} className="module-toolbar"><input name="name" required placeholder="Visitor name"/><input name="phone" placeholder="Phone (optional)"/><input name="purpose" required placeholder="Purpose / reason for visit"/><select name="hostStaffId" defaultValue=""><option value="">Host staff (optional)</option>{data.staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="button primary" type="submit">Check in</button></form></div>
    <aside className="module-side-card"><div className="module-side-card-head"><h3>On campus</h3><span>{open.length}</span></div>{open.length?<div className="module-list">{open.slice(0,12).map(v=><div className="module-list-item" key={v.id}><span><strong>{v.name}</strong><small>{v.purpose} · {v.hostStaff?.name??"No host"}</small></span><form action={checkOutVisitor}><input type="hidden" name="id" value={v.id}/><button className="button secondary" type="submit">Check out</button></form></div>)}</div>:<div className="module-empty"><strong>No open visits</strong><span>Checked-in visitors appear here until they leave.</span></div>}</aside>
   </section>

   <details className="sn-progressive"><summary>Visitor history · {data.visitors.length}</summary><div className="sn-progressive-body"><div className="module-table-wrap"><table className="module-table"><thead><tr><th>Visitor</th><th>Purpose</th><th>Host</th><th>Arrived</th><th>Departed</th><th>Status</th></tr></thead><tbody>{data.visitors.map(v=><tr key={v.id}><td><strong>{v.name}</strong><small>{v.phone??"No phone recorded"}</small></td><td>{v.purpose}</td><td>{v.hostStaff?.name??"—"}</td><td>{new Date(v.timeIn).toLocaleString("en-GH")}</td><td>{v.timeOut?new Date(v.timeOut).toLocaleString("en-GH"):"—"}</td><td><span className="app-pill">{v.timeOut?"Closed":"On campus"}</span></td></tr>)}{!data.visitors.length?<tr><td colSpan={6}><div className="module-empty"><strong>No visitor records yet</strong></div></td></tr>:null}</tbody></table></div></div></details>
   <div className="module-actions"><Link className="module-button secondary" href="/school/help">Visitor policy</Link></div>
  </div>
 </AppShell>
}
