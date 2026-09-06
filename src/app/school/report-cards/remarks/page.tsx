import Link from "next/link";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";
import { AppShell } from "@/components/AppShell";

export default async function ReportRemarksCentre({searchParams}:{searchParams:Promise<{term?:string}>}){
 const session=await requireSchoolSession(); const params=await searchParams;
 const data=await withTenant(session.schoolId,async(tx)=>{
  await requirePermission(tx,session.userId,"report_cards:view"); const access=await getSchoolAuthorization(tx,session.userId);
  const [school,classes,terms]=await Promise.all([
   tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}),
   tx.class.findMany({where:access.isElevated?{schoolId:session.schoolId}:{schoolId:session.schoolId,classTeacherId:session.userId},select:{id:true,name:true,level:true,_count:{select:{students:true}}},orderBy:[{level:"asc"},{name:"asc"}]}),
   tx.term.findMany({where:{schoolId:session.schoolId},select:{id:true,name:true},orderBy:{startDate:"desc"},take:8})
  ]);
  const term=terms.find(t=>t.id===params.term)??terms[0];
  if(!term||!classes.length)return{school,classes,terms,term,reports:[]};
  const reports=await tx.reportCard.findMany({where:{schoolId:session.schoolId,termId:term.id,student:{classId:{in:classes.map(c=>c.id)}}},select:{id:true,status:true,remarks:true,student:{select:{id:true,name:true,admissionNo:true,classId:true}}},orderBy:{student:{name:"asc"}}});
  return{school,classes,terms,term,reports};
 });
 if(!data.school)return null;
 const byClass=new Map(data.classes.map(c=>[c.id,[] as typeof data.reports])); for(const report of data.reports){if(report.student.classId&&byClass.has(report.student.classId))byClass.get(report.student.classId)?.push(report);}
 return <AppShell universe="school" title="Class Teacher Remarks" subtitle="Individual report-card remarks." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
  <main style={{maxWidth:1120,margin:"0 auto",padding:"24px",color:"var(--color-text-primary,#163038)"}>
   <header style={{marginBottom:18}><span style={{fontSize:10,fontWeight:900,letterSpacing:".14em",color:"var(--color-text-muted,#718588)"}>REPORT CARD WORKFLOW</span><h1 style={{margin:"7px 0",fontSize:32,letterSpacing:"-.04em"}>Write each learner's class-teacher remark.</h1><p style={{margin:0,maxWidth:780,color:"var(--color-text-secondary,#6d8083)",fontSize:12,lineHeight:1.7}>Choose the reporting term, then open each learner's remark editor. Remarks stay editable while the report is draft and lock automatically after submission.</p></header>
   <form method="get" style={{display:"flex",gap:10,alignItems:"end",flexWrap:"wrap",padding:14,border:"1px solid var(--color-border,#dce7e4)",borderRadius:16,background:"var(--color-surface,#fff)",marginBottom:14}><label style={{display:"grid",gap:6,minWidth:240}><span style={{fontSize:9,fontWeight:900,letterSpacing:".1em",textTransform:"uppercase",color:"var(--color-text-muted,#718588)"}>Reporting term</span><select name="term" defaultValue={data.term?.id??""} style={{height:40,border:"1px solid var(--color-border,#dce7e4)",borderRadius:10,padding:"0 10px",background:"var(--color-surface-2,#f7fbfa)"}>{data.terms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button type="submit" style={{height:40,border:0,borderRadius:10,padding:"0 14px",background:"var(--color-brand,#1aa67e)",color: "var(--sn-ink)",fontWeight:900}>Open term</button></form>
   {!data.term||!data.classes.length?<section style={{padding:30,border:"1px dashed var(--color-border,#dce7e4)",borderRadius:16,textAlign:"center",background:"var(--color-surface,#fff)"}><strong>{!data.classes.length?"No class-teacher classes are assigned to you.":"No reporting term is available yet."}</strong></section>:<div style={{display:"grid",gap:12}>{data.classes.map(c=>{const reports=byClass.get(c.id)??[];return <section key={c.id} style={{border:"1px solid var(--color-border,#dce7e4)",borderRadius:18,background:"var(--color-surface,#fff)",overflow:"hidden",boxShadow:"0 12px 30px rgba(25,70,64,.05)"}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:"15px 16px",borderBottom:"1px solid var(--color-border,#e7efed)"}><div><strong style={{fontSize:14}>{c.level?`${c.level} · `:""}{c.name}</strong><small style={{display:"block",marginTop:4,color:"var(--color-text-muted,#718588)",fontSize:9}>{c._count.students} learner{c._count.students===1?"":"s"} · {reports.length} report{reports.length===1?"":"s"} available</small></div><Link href={`/school/report-cards?term=${encodeURIComponent(data.term!.id)}&classId=${encodeURIComponent(c.id)}`} style={{fontSize:9,fontWeight:900,textDecoration:"none"}>Open reports →</Link></div>{reports.length?<div>{reports.map(r=><div key={r.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:12,alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #eef3f2"}><div><strong style={{display:"block",fontSize:11}>{r.student.name}</strong><small style={{display:"block",marginTop:3,color:"var(--color-text-muted,#718588)",fontSize:8}>{r.student.admissionNo}</small></div><span style={{fontSize:8,fontWeight:900,color:r.status==="draft"?"#8a6a16":"#6c7d80"}>{r.status==="draft"?"EDITABLE":"LOCKED"}</span><Link href={`/school/report-cards/${r.id}/remarks`} style={{border:"1px solid var(--color-border,#dce7e4)",borderRadius:10,padding:"8px 10px",fontSize:8,fontWeight:900,textDecoration:"none",color:"var(--color-text-primary,#163038)"}>{r.status==="draft"?"Write remark":"View report"}</Link></div>)}</div>:<div style={{padding:18,color:"var(--color-text-muted,#718588)",fontSize:10}>No report card has been generated for this class and term yet. Generate the class reports first.</div>}</section>})}</div>}
  </main>
 </AppShell>
}