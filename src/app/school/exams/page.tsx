import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AcademicWorkspaceNav } from "@/components/AcademicWorkspaceNav";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import "./exams-workspace.css";
import "../academic-workspace.css";

export default async function ExamsPage(){
  const session=await requireSchoolSession();
  const data=await withTenant(session.schoolId,async tx=>{
    const [canManage,canReport,canTeacher,canWriteAssigned,canWriteAll]=await Promise.all([
      hasPermission(tx,session.userId,"exams:manage"),
      hasPermission(tx,session.userId,"reports:generate"),
      hasPermission(tx,session.userId,"exams:take"),
      hasPermission(tx,session.userId,"scores:write:assigned"),
      hasPermission(tx,session.userId,"scores:write:all"),
    ]);
    if(!canManage&&!canReport&&!canTeacher&&!canWriteAssigned&&!canWriteAll)throw new ForbiddenError("You do not have access to assessment records.");
    const [assessments,terms,classes]=await Promise.all([
      tx.assessment.findMany({where:{schoolId:session.schoolId},select:{id:true,name:true,maxScore:true,term:{select:{name:true}},subject:{select:{name:true}},class:{select:{name:true}}},take:30}),
      tx.term.findMany({where:{schoolId:session.schoolId},select:{id:true,name:true,academicYear:{select:{name:true}}},orderBy:{startDate:"desc"},take:8}),
      tx.class.count({where:{schoolId:session.schoolId}}),
    ]);
    return{canManage,canReport,canTeacher,assessments,terms,classes};
  });

  return <AppShell universe="school" title="Exams & Assessments" subtitle="Assessment records connected to class, subject and term." active="Exams & Assessments">
    <div className="academic-page">
      <AcademicWorkspaceNav current="assessments"/>
      <div className="exams-shell exams-simple">
        <section className="exams-simple-head">
          <div><span className="exams-kicker">ASSESSMENTS</span><h2>Assessment register</h2><p>See the school&apos;s assessments, then continue to the Gradebook when you need to enter marks.</p></div>
          <div className="exams-actions"><Link className="exams-primary" href="/school/gradebook/studio">Enter marks</Link>{data.canManage?<Link className="exams-secondary" href="/school/academics/setup">Assessment rules</Link>:null}</div>
        </section>
        <section className="exams-kpis" aria-label="Assessment summary">
          <article><span>Assessments</span><strong>{data.assessments.length}</strong><small>Recent records</small></article>
          <article><span>Terms</span><strong>{data.terms.length}</strong><small>Available periods</small></article>
          <article><span>Classes</span><strong>{data.classes}</strong><small>School class groups</small></article>
          <article><span>Access</span><strong>{data.canManage?"Manage":data.canReport?"Review":"Teaching"}</strong><small>{data.canReport?"Leadership oversight":"Assignment scope"}</small></article>
        </section>
        <section className="exams-card">
          <div className="exams-card-head"><div><span className="exams-kicker">RECENT</span><h3>Assessments</h3></div></div>
          <div className="assessment-register">{data.assessments.length===0?<div className="exams-empty">No assessment records yet. Configure the assessment structure, then create the first classroom assessment.</div>:data.assessments.map(assessment=><article key={assessment.id}><div><b>{assessment.name}</b><small>{assessment.class?.name??"Unlinked class"} · {assessment.subject?.name??"Unlinked subject"} · {assessment.term?.name??"No term"}</small></div><span>{String(assessment.maxScore)} max</span></article>)}</div>
        </section>
      </div>
    </div>
  </AppShell>;
}
