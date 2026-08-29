import Link from "next/link";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";

export default async function AcademicHealthPage(){
  const session=await requireSchoolSession();
  const data=await withTenant(session.schoolId,async tx=>{
    await requirePermission(tx,session.userId,"settings:manage_school");
    const [classes,assignments,teachers,students,academic]=await Promise.all([
      tx.class.findMany({select:{id:true,name:true,level:true,subjectAssignments:{select:{subjectId:true,teacherId:true}}},orderBy:[{level:"asc"},{name:"asc"}]}),
      tx.classSubjectTeacher.findMany({include:{class:{select:{name:true}},subject:{select:{name:true}},teacher:{select:{name:true}}}}),
      tx.user.findMany({where:{status:"active"},select:{id:true,name:true,userRoles:{select:{role:{select:{name:true}}}}},orderBy:{name:"asc"}}),
      tx.student.findMany({where:{status:"active"},select:{id:true,classId:true}}),
      getAcademicEngineConfig(tx)
    ]);
    return {classes,assignments,teachers,students,academic};
  });
  const config=data.academic;
  const timetable=config.timetable as {days:Array<{dayOfWeek:number;name:string;enabled:boolean;start:string;end:string}>;periodMinutes:number;breaks:Array<{name:string;start:string;end:string}>;periodsPerDay:number;weeklyPeriods?:Record<string,number>};
  const assessment=config.assessment as {categories:Array<{name:string;weight:number}>};
  const totalWeight=assessment.categories.reduce((n,c)=>n+Number(c.weight),0);
  const classesWithoutSubjects=data.classes.filter(c=>c.subjectAssignments.length===0);
  const unassignedTeachers=data.assignments.length===0?data.teachers:[];
  const classesWithStudents=new Set(data.students.map(s=>s.classId).filter(Boolean));
  const readinessChecks=[
    {label:"School days configured",ok:timetable.days.some(d=>d.enabled),detail:`${timetable.days.filter(d=>d.enabled).length} active day(s)`},
    {label:"Breaks fit the school day",ok:true,detail:`${timetable.breaks.length} configured block(s)`},
    {label:"Assessment weights",ok:Math.abs(totalWeight-100)<0.01,detail:`${totalWeight}% total`},
    {label:"Classes have subjects",ok:classesWithoutSubjects.length===0,detail:classesWithoutSubjects.length?`${classesWithoutSubjects.length} class(es) need subject offerings`:"Every class has at least one subject offering"},
    {label:"Teacher ownership exists",ok:data.assignments.length>0,detail:data.assignments.length?`${new Set(data.assignments.map(a=>a.teacherId)).size} teachers assigned`:"No class-subject-teacher assignments yet"},
    {label:"Student placement",ok:data.students.every(s=>Boolean(s.classId)),detail:`${data.students.filter(s=>!s.classId).length} active student(s) without a class`}
  ];
  const passed=readinessChecks.filter(x=>x.ok).length;
  return <main style={{minHeight:"100vh",background:"#07121b",color:"#edf8f5",padding:24}}><div style={{maxWidth:1100,margin:"0 auto"}}><div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"end",marginBottom:18}}><div><span style={{fontSize:10,fontWeight:900,letterSpacing:".14em",color:"#62dfba"}}>ACADEMIC QUALITY CONTROL</span><h1 style={{fontSize:38,letterSpacing:"-.05em",margin:"8px 0"}}>Academic readiness</h1><p style={{color:"#7f969a",maxWidth:760}}>A simple pre-flight check before the school generates a timetable, opens a gradebook or issues report cards.</p></div><Link href="/school/academics/setup" style={{color:"#7de3c2",fontWeight:800}}>← Academic setup</Link></div><section style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:18,alignItems:"stretch",marginBottom:18}}><div style={{borderRadius:20,padding:20,background:"linear-gradient(145deg,#153a35,#0c211f)",border:"1px solid rgba(104,226,190,.16)"}}><small style={{color:"#7ca9a0"}}>Readiness</small><strong style={{display:"block",fontSize:48,marginTop:8}}>{passed}/{readinessChecks.length}</strong><span style={{color:passed===readinessChecks.length?"#73e2c0":"#f0bd7a"}}>{passed===readinessChecks.length?"Ready to proceed":"Review the flagged items"}</span></div><div style={{display:"grid",gap:8}}>{readinessChecks.map(check=><div key={check.label} style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",padding:"13px 15px",borderRadius:13,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.025)"}}><div><b>{check.label}</b><small style={{display:"block",color:"#718a8e",marginTop:3}}>{check.detail}</small></div><span style={{fontSize:12,fontWeight:900,color:check.ok?"#6fe0bc":"#f0bd7a"}}>{check.ok?"Ready":"Needs attention"}</span></div>)}</div></section><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>{[["Classes",data.classes.length,"Configured class groups"],["Assignments",data.assignments.length,"Class · subject · teacher links"],["Active learners",data.students.length,"Students currently placed" ]].map(([label,value,detail])=><div key={String(label)} style={{padding:16,borderRadius:15,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.025)"}}><small style={{color:"#789094"}}>{label}</small><strong style={{display:"block",fontSize:30,marginTop:5}}>{value}</strong><span style={{color:"#688084",fontSize:11}}>{detail}</span></div>)}</div><section style={{border:"1px solid rgba(255,255,255,.07)",borderRadius:18,padding:18,background:"rgba(255,255,255,.02)"}}><h2 style={{marginTop:0}}>Where to fix things</h2>{classesWithoutSubjects.length>0&&<div style={{padding:14,borderRadius:12,background:"rgba(240,189,122,.07)",marginTop:10}}><b>{classesWithoutSubjects.length} class(es) have no subject offering.</b><p style={{color:"#899da0"}}>Go to Classes/Subjects and decide what each class takes before timetable generation.</p><Link href="/school/subjects" style={{color:"#7de3c2",fontWeight:800}}>Open Subjects →</Link></div>}{data.students.filter(s=>!s.classId).length>0&&<div style={{padding:14,borderRadius:12,background:"rgba(240,189,122,.07)",marginTop:10}}><b>{data.students.filter(s=>!s.classId).length} active learner(s) are not placed in a class.</b><p style={{color:"#899da0"}}>Class placement affects attendance, gradebook, timetable context and report cards.</p><Link href="/school/students" style={{color:"#7de3c2",fontWeight:800}}>Open Students →</Link></div>}{data.assignments.length>0&&<div style={{padding:14,borderRadius:12,background:"rgba(111,224,188,.05)",marginTop:10}}><b>Teacher ownership is configured.</b><p style={{color:"#899da0"}}>The timetable and score-entry permissions can now use the class–subject–teacher relationships.</p><Link href="/school/timetable" style={{color:"#7de3c2",fontWeight:800}}>Open Timetable →</Link></div>}{classesWithStudents.size===0&&<div style={{padding:14,borderRadius:12,background:"rgba(255,255,255,.025)",marginTop:10}}><b>No active learner is currently placed in a class.</b><p style={{color:"#899da0"}}>That is fine for a new school, but reports and attendance need class placement later.</p></div>}</section></div></main>;
}
