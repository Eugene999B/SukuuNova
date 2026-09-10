import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

const labels: Record<number,string>={0:"Sunday",1:"Monday",2:"Tuesday",3:"Wednesday",4:"Thursday",5:"Friday",6:"Saturday"};
function configuredDays(value: unknown){if(!value||typeof value!=="object"||Array.isArray(value))return[1,2,3,4,5];const raw=(value as Record<string,unknown>).schoolDays;if(!Array.isArray(raw))return[1,2,3,4,5];const days=raw.filter((item):item is number=>Number.isInteger(item)&&Number(item)>=0&&Number(item)<=6);return days.length?[...new Set(days)]:[1,2,3,4,5];}

export default async function TeacherTimetablePage(){
 const session=await requireSchoolSession();
 const data=await withTenant(session.schoolId,async tx=>{
  const access=await getSchoolAuthorization(tx,session.userId);if(access.workspace!=="teacher"||!access.isTeacher)redirect("/dashboard");
  const [school,slots,settings]=await Promise.all([
   tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}),
   tx.timetableSlot.findMany({where:{schoolId:session.schoolId,teacherId:session.userId},orderBy:[{dayOfWeek:"asc"},{period:"asc"}],include:{class:{select:{name:true,level:true}},subject:{select:{name:true}}}}),
   tx.schoolSettings.findUnique({where:{schoolId:session.schoolId},select:{timetableConfig:true,timezone:true}}),
  ]);
  return{school,slots,days:configuredDays(settings?.timetableConfig),timezone:settings?.timezone||"Africa/Accra",role:access.roles.map(r=>r.name).join(" · ")};
 });
 const activeDays=data.days.map(day=>({day,label:labels[day]||`Day ${day}`,slots:data.slots.filter(slot=>slot.dayOfWeek===day)}));
 return <AppShell universe="teacher" title="My Timetable" subtitle="The school-controlled teaching week for your account." active="My Timetable" schoolName={data.school?.name??"School Workspace"} schoolCode={data.school?.uniqueCode??""} userName={session.name} role={data.role||"Teacher"}>
  <div className="teacher-workspace">
   <section className="teacher-page-head"><div><span className="teacher-eyebrow">TEACHER · TIMETABLE</span><h2>Your published teaching week</h2><p>Only days enabled by school leadership appear here. Weekends stay out unless the school explicitly adds them.</p></div><div className="teacher-state-pill">{data.timezone}</div></section>
   <section className="teacher-scope-strip"><div><span>Scheduled periods</span><strong>{data.slots.length}</strong></div><div><span>School days</span><strong>{data.days.length}</strong></div><div><span>Week</span><strong>{data.days.map(day=>labels[day]?.slice(0,3)).join(" · ")}</strong></div></section>
   <section className="teacher-surface"><span className="teacher-eyebrow">WEEKLY PLAN</span><h3>Assigned periods</h3>{data.slots.length?<div className="teacher-week-grid">{activeDays.map(({day,label,slots})=><article key={day}><header><b>{label}</b><span>{slots.length} period{slots.length===1?"":"s"}</span></header>{slots.length?slots.map(slot=><div className="teacher-period" key={slot.id}><strong>P{slot.period}</strong><div><b>{slot.subject.name}</b><span>{slot.class.level?`${slot.class.level} · `:""}{slot.class.name}{slot.venue?` · ${slot.venue}`:""}</span></div></div>):<p className="teacher-muted">No lesson assigned.</p>}</article>)}</div>:<div className="teacher-empty-state"><strong>No timetable periods are assigned to this teacher yet.</strong><p>School leadership publishes class, subject and teacher assignments. Once assigned, the timetable appears here automatically.</p></div>}</section>
  </div>
 </AppShell>;
}
