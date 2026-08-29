import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { dayBlocks } from "@/lib/timetable-engine-v2";
import "./timetable.css";

type Day = { dayOfWeek:number; name:string; enabled:boolean; start:string; end:string };
type TimetableConfig = { days:Day[]; periodMinutes:number; breaks:{name:string;start:string;end:string}[]; periodsPerDay:number; published:boolean };

async function saveSlot(formData:FormData){
  "use server";
  const session=await requireSchoolSession();
  const classId=String(formData.get("classId")??"").trim(), subjectId=String(formData.get("subjectId")??"").trim(), teacherId=String(formData.get("teacherId")??"").trim();
  const dayOfWeek=Number(formData.get("dayOfWeek")), period=Number(formData.get("period")), slotId=String(formData.get("slotId")??"").trim();
  if(!classId||!subjectId||!teacherId||!Number.isInteger(dayOfWeek)||dayOfWeek<1||dayOfWeek>6||!Number.isInteger(period)||period<1) throw new Error("Complete the lesson details.");
  await withTenant(session.schoolId,async tx=>{
    await requirePermission(tx,session.userId,"calendar:manage");
    const [schoolClass,subject,teacher]=await Promise.all([
      tx.class.findFirst({where:{id:classId,schoolId:session.schoolId},select:{id:true}}),
      tx.subject.findFirst({where:{id:subjectId,schoolId:session.schoolId},select:{id:true}}),
      tx.user.findFirst({where:{id:teacherId,schoolId:session.schoolId,status:"active"},select:{id:true}})
    ]);
    if(!schoolClass||!subject||!teacher) throw new Error("Selected records do not belong to this school.");
    const clash=await tx.timetableSlot.findFirst({where:{schoolId:session.schoolId,dayOfWeek,period,OR:[{classId},{teacherId}],...(slotId?{NOT:{id:slotId}}:{})},select:{id:true,classId:true}});
    if(clash) throw new Error(clash.classId===classId?"That class already has a lesson at this time.":"That teacher is already scheduled at this time.");
    if(slotId) await tx.timetableSlot.update({where:{id:slotId},data:{classId,subjectId,teacherId,dayOfWeek,period}}); else await tx.timetableSlot.create({data:{schoolId:session.schoolId,classId,subjectId,teacherId,dayOfWeek,period}});
  });
  redirect(`/school/timetable?classId=${encodeURIComponent(classId)}`);
}

async function deleteSlot(formData:FormData){
  "use server";
  const session=await requireSchoolSession(); const slotId=String(formData.get("slotId")??"").trim(); if(!slotId)return;
  await withTenant(session.schoolId,async tx=>{await requirePermission(tx,session.userId,"calendar:manage");await tx.timetableSlot.deleteMany({where:{id:slotId,schoolId:session.schoolId}});});
  redirect("/school/timetable");
}

export default async function TimetablePage({searchParams}:{searchParams:Promise<{classId?:string;edit?:string}>}){
  const session=await requireSchoolSession(), params=await searchParams;
  const selectedClassId=String(params.classId??"").trim(), editId=String(params.edit??"").trim();
  const data=await withTenant(session.schoolId,async tx=>{
    await requirePermission(tx,session.userId,"calendar:manage");
    const [school,classes,subjects,teachers,slots,academic]=await Promise.all([
      tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true,logoUrl:true}}),
      tx.class.findMany({where:{schoolId:session.schoolId},orderBy:[{level:"asc"},{name:"asc"}],select:{id:true,name:true,level:true}}),
      tx.subject.findMany({where:{schoolId:session.schoolId},orderBy:{name:"asc"},select:{id:true,name:true}}),
      tx.user.findMany({where:{schoolId:session.schoolId,status:"active"},orderBy:{name:"asc"},select:{id:true,name:true}}),
      tx.timetableSlot.findMany({where:{schoolId:session.schoolId,...(selectedClassId?{classId:selectedClassId}:{})},orderBy:[{dayOfWeek:"asc"},{period:"asc"}],include:{class:{select:{id:true,name:true,level:true}},subject:{select:{id:true,name:true}},teacher:{select:{id:true,name:true}}}}),
      getAcademicEngineConfig(tx)
    ]);
    return {school,classes,subjects,teachers,slots,config:academic.timetable as TimetableConfig};
  });
  const enabledDays=data.config.days.filter(d=>d.enabled&&d.dayOfWeek>=1&&d.dayOfWeek<=6);
  const anchor=enabledDays[0]??{dayOfWeek:1,name:"Monday",enabled:true,start:"08:00",end:"15:00"};
  const columns=dayBlocks(anchor,data.config).blocks;
  const selectedClassName=data.classes.find(c=>c.id===selectedClassId)?.name??"All classes";
  const editSlot=data.slots.find(s=>s.id===editId)??null;
  const gridTemplateColumns=`132px ${columns.map(c=>c.kind==="break"?"60px":"minmax(132px,1fr)").join(" ")}`;
  return <AppShell universe="school" title="Timetable" subtitle="Build the weekly teaching schedule. Printing and distribution have their own workspace." active="Timetable" schoolName={data.school?.name??"School Workspace"} schoolCode={data.school?.uniqueCode??""} userName={session.name}>
    <main className="timetable-page">
      <section className="timetable-hero"><div><span className="timetable-eyebrow">ACADEMICS / SCHEDULE</span><h1>Your school week, clearly arranged.</h1><p>Days run down the left. Real school times run across the top. Breaks and lunch are separated into vertical bands.</p></div><div className="timetable-actions"><Link href={`/school/timetable?edit=new:1:1&classId=${encodeURIComponent(selectedClassId)}`} className="primary-action">+ Add lesson</Link></div></section>
      <section className="timetable-commandbar"><form method="get" className="class-picker"><label>Class view</label><select name="classId" defaultValue={selectedClassId} onChange={e=>e.currentTarget.form?.submit()}><option value="">All classes</option>{data.classes.map(c=><option key={c.id} value={c.id}>{c.level?`${c.level} · `:""}{c.name}</option>)}</select></form><div className="command-metrics"><div><span>Lessons</span><strong>{data.slots.length}</strong></div><div><span>Classes</span><strong>{new Set(data.slots.map(s=>s.classId)).size}</strong></div><div><span>Teachers</span><strong>{new Set(data.slots.map(s=>s.teacherId)).size}</strong></div><div><span>Schedule</span><strong className={data.config.published?"good":"neutral"}>{data.config.published?"Live":"Draft"}</strong></div></div></section>
      <section className="schedule-card"><div className="schedule-head"><div><span className="timetable-eyebrow">WEEKLY GRID</span><h2>{selectedClassName}</h2></div></div>
        <div className="schedule-scroll"><div className="schedule-grid" style={{gridTemplateColumns:gridTemplateColumns}}><div className="schedule-corner"><span>DAY</span><small>TIME →</small></div>{columns.map((c,i)=><div key={`${c.kind}-${c.start}-${i}`} className={`schedule-time ${c.kind==="break"?"break-band":""}`}>{c.kind==="break"?<span>{c.name}</span>:<><strong>{c.start}</strong><small>{c.end}</small></>}</div>)}{enabledDays.map(day=>{const dayMap=new Map(data.slots.filter(s=>s.dayOfWeek===day.dayOfWeek).map(s=>[s.period,s]));const blocks=dayBlocks(day,data.config).blocks;return <div key={day.dayOfWeek} style={{display:"contents"}}><div className="schedule-day"><strong>{day.name.slice(0,3).toUpperCase()}</strong><span>{day.name}</span></div>{columns.map((column,i)=>{if(column.kind==="break")return <div key={`${day.dayOfWeek}-b-${i}`} className="schedule-cell break-cell"><span>{column.name}</span></div>;const b=blocks.find(x=>x.kind==="lesson"&&x.period===column.period),slot=b?.period?dayMap.get(b.period):undefined;return <div key={`${day.dayOfWeek}-${i}`} className={`schedule-cell ${slot?"has-lesson":"open-slot"}`}>{slot?<Link href={`/school/timetable?classId=${encodeURIComponent(slot.classId)}&edit=${encodeURIComponent(slot.id)}`} className="lesson-card"><strong>{slot.subject.name}</strong><span>{slot.teacher.name}</span>{!selectedClassId?<small>{slot.class.name}</small>:null}</Link>:<Link href={`/school/timetable?classId=${encodeURIComponent(selectedClassId)}&edit=new:${day.dayOfWeek}:${b?.period??1}`} className="add-slot" aria-label={`Add lesson on ${day.name}`}>+</Link>}</div>})}</div>})}</div></div>
        <div className="schedule-legend"><span><i className="lesson-dot"/> Lesson</span><span><i className="break-dot"/> Break / lunch</span><span><i className="empty-dot"/> Open</span></div>
      </section>
      <section className="timetable-lower"><div className="workload-panel"><div className="section-head"><div><span className="timetable-eyebrow">TEACHER LOAD</span><h3>Teaching periods</h3></div><Link href="/school/staff">Staff</Link></div>{data.teachers.slice(0,10).map(t=>{const count=data.slots.filter(s=>s.teacherId===t.id).length;return <div className="load-item" key={t.id}><div><strong>{t.name}</strong><span>{count} periods</span></div><div className="load-track"><i style={{width:`${Math.min(100,count*8)}%`}}/></div></div>})}</div><div className="smart-panel"><div className="section-head"><div><span className="timetable-eyebrow">QUICK TOOLS</span><h3>Keep scheduling moving</h3></div></div><Link href="/school/academics/setup">Change days, hours or breaks</Link><Link href="/school/lessons">Open lesson planning</Link><Link href="/school/staff-attendance">Review staff cover</Link></div></section>
      {editId?<div className="edit-drawer"><div className="edit-panel"><div className="edit-panel-head"><div><span className="timetable-eyebrow">{editSlot?"EDIT LESSON":"NEW LESSON"}</span><h2>{editSlot?editSlot.subject.name:"Add a lesson"}</h2></div><Link href={`/school/timetable${selectedClassId?`?classId=${encodeURIComponent(selectedClassId)}`:""}`} aria-label="Close">×</Link></div><form action={saveSlot}>{editSlot?<input type="hidden" name="slotId" value={editSlot.id}/>:null}<label>Class<select name="classId" required defaultValue={editSlot?.classId??selectedClassId}><option value="">Choose class</option>{data.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Subject<select name="subjectId" required defaultValue={editSlot?.subjectId??""}><option value="">Choose subject</option>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Teacher<select name="teacherId" required defaultValue={editSlot?.teacherId??""}><option value="">Choose teacher</option>{data.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><div className="edit-two"><label>Day<select name="dayOfWeek" required defaultValue={editSlot?.dayOfWeek??(editId.startsWith("new:")?editId.split(":")[1]:"1")}>{enabledDays.map(d=><option key={d.dayOfWeek} value={d.dayOfWeek}>{d.name}</option>)}</select></label><label>Time<select name="period" required defaultValue={editSlot?.period??(editId.startsWith("new:")?editId.split(":")[2]:"1")}>{Array.from({length:data.config.periodsPerDay},(_,i)=><option key={i+1} value={i+1}>Period {i+1}</option>)}</select></label></div><div className="edit-actions"><Link href={`/school/timetable${selectedClassId?`?classId=${encodeURIComponent(selectedClassId)}`:""}`} className="secondary-action">Cancel</Link><button className="primary-action" type="submit">Save lesson</button></div></form>{editSlot?<form action={deleteSlot} className="delete-slot"><input type="hidden" name="slotId" value={editSlot.id}/><button type="submit">Delete lesson</button></form>:null}</div></div>:null}
    </main>
  </AppShell>;
}
