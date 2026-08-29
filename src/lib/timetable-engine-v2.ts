import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { getAcademicEngineConfig } from "./academic-engine";

type PeriodConfig={period:number;start:string;end:string};
type DayConfig={dayOfWeek:number;name:string;enabled:boolean;start:string;end:string;periods?:PeriodConfig[]};
type BreakConfig={name:string;start:string;end:string};
type TimetableConfig={days:DayConfig[];periodMinutes:number;breaks:BreakConfig[];periodsPerDay:number;periods?:PeriodConfig[];published:boolean;weeklyPeriods?:Record<string,number>};
type LessonPeriod={period:number;start:number;end:number};

function minutes(value:string){const m=/^(\d{2}):(\d{2})$/.exec(value);if(!m)throw new AppError(`Invalid time: ${value}`,400,"INVALID_TIME");const h=Number(m[1]),min=Number(m[2]);if(h>23||min>59)throw new AppError(`Invalid time: ${value}`,400,"INVALID_TIME");return h*60+min;}
function clock(value:number){return `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;}
function overlaps(a:{start:number;end:number},b:{start:number;end:number}){return a.start<b.end&&a.end>b.start;}

export function dayBlocks(day:DayConfig,config:TimetableConfig){
  const start=minutes(day.start),end=minutes(day.end);
  const breaks=config.breaks.map(b=>({name:b.name.trim(),start:minutes(b.start),end:minutes(b.end)})).filter(b=>b.end>b.start).sort((a,b)=>a.start-b.start);
  for(let i=1;i<breaks.length;i++)if(overlaps(breaks[i-1],breaks[i]))throw new AppError(`Breaks overlap on ${day.name}.`,400,"OVERLAPPING_BREAKS");
  for(const b of breaks)if(b.start<start||b.end>end)throw new AppError(`${b.name} falls outside ${day.name}'s school hours.`,400,"BREAK_OUTSIDE_DAY");
  const explicit=Array.isArray(day.periods)&&day.periods.length?day.periods:config.periods;
  const periods:LessonPeriod[]=[];
  if(Array.isArray(explicit)&&explicit.length){
    for(const p of explicit.slice(0,Math.max(1,Math.min(16,config.periodsPerDay)))){
      const ps=minutes(p.start),pe=minutes(p.end);
      if(ps<start||pe>end||pe<=ps)continue;
      if(breaks.some(b=>overlaps({start:ps,end:pe},b)))throw new AppError(`${day.name} period ${p.period} overlaps a break or lunch.`,400,"PERIOD_OVERLAPS_BREAK");
      periods.push({period:Number(p.period),start:ps,end:pe});
    }
  }else{
    let cursor=start,period=1;
    while(period<=config.periodsPerDay){
      const next=cursor+config.periodMinutes;
      const crossing=breaks.find(b=>overlaps({start:cursor,end:next},b));
      if(crossing){cursor=crossing.end;continue;}
      if(next>end)break;
      periods.push({period,start:cursor,end:next});cursor=next;period++;
    }
  }
  periods.sort((a,b)=>a.start-b.start||a.period-b.period);
  for(let i=1;i<periods.length;i++)if(overlaps(periods[i-1],periods[i]))throw new AppError(`${day.name} lesson time blocks overlap.`,400,"OVERLAPPING_PERIODS");
  const blocks:Array<{kind:"lesson"|"break";period?:number;name:string;start:string;end:string}>=[];
  const events=[...breaks.map(b=>({kind:"break" as const,start:b.start,end:b.end,name:b.name})),...periods.map(p=>({kind:"lesson" as const,start:p.start,end:p.end,name:`Period ${p.period}`,period:p.period}))].sort((a,b)=>a.start-b.start||(a.kind==="break"?1:-1));
  for(const e of events)blocks.push({kind:e.kind,period:"period" in e?e.period:undefined,name:e.name,start:clock(e.start),end:clock(e.end)});
  return {periods,breaks,blocks};
}
function mapNumber(value:Prisma.JsonValue|undefined){return typeof value==="number"?value:undefined;}
export async function generateBalancedTimetable(tx:TenantDb,input:{schoolId:string;actorId:string;replaceExisting:boolean;classIds?:string[]}){
  await requirePermission(tx,input.actorId,"calendar:manage");
  const config=await getAcademicEngineConfig(tx);const timetable=config.timetable as TimetableConfig;const days=timetable.days.filter(d=>d.enabled);if(!days.length)throw new AppError("Enable at least one school day before generating the timetable.",400,"NO_SCHOOL_DAYS");
  const periodsByDay=new Map<number,ReturnType<typeof dayBlocks>>();for(const day of days){const built=dayBlocks(day,timetable);if(!built.periods.length)throw new AppError(`${day.name} has no usable teaching periods after breaks.`,400,"NO_USABLE_PERIODS");periodsByDay.set(day.dayOfWeek,built);}
  const classes=await tx.class.findMany({where:input.classIds?.length?{id:{in:input.classIds}}:{},select:{id:true,name:true,level:true}});if(!classes.length)throw new AppError("Create at least one class before generating the timetable.",409,"NO_CLASSES");
  const classIds=classes.map(c=>c.id);const assignments=await tx.classSubjectTeacher.findMany({where:{classId:{in:classIds}},include:{class:true,subject:true,teacher:true}});if(!assignments.length)throw new AppError("Assign subjects to classes and teachers before generating the timetable.",409,"NO_ASSIGNMENTS");
  const rawWeekly=typeof timetable.weeklyPeriods==="object"&&timetable.weeklyPeriods?Object.entries(timetable.weeklyPeriods).reduce<Record<string,number>>((acc,[k,v])=>{const n=mapNumber(v as Prisma.JsonValue);if(n!==undefined)acc[k]=Math.max(1,Math.min(10,Math.round(n)));return acc;},{}):{};
  const dayLoad=new Map<string,number>(),teacherLoad=new Map<string,number>();const placedClass=new Set<string>(),placedTeacher=new Set<string>();const chosen:{schoolId:string;classId:string;subjectId:string;teacherId:string;dayOfWeek:number;period:number}[]=[];
  const work=[...assignments].sort((a,b)=>{const ka=`${a.classId}:${a.subjectId}:${a.teacherId}`,kb=`${b.classId}:${b.subjectId}:${b.teacherId}`;return(rawWeekly[kb]??2)-(rawWeekly[ka]??2)||a.classId.localeCompare(b.classId)||a.subject.name.localeCompare(b.subject.name);});
  for(const assignment of work){const key=`${assignment.classId}:${assignment.subjectId}:${assignment.teacherId}`,target=rawWeekly[key]??2;let placed=0;for(let occurrence=0;occurrence<target;occurrence++){let best:{score:number;day:DayConfig;period:LessonPeriod}|null=null;for(const day of days){const built=periodsByDay.get(day.dayOfWeek);if(!built)continue;for(const period of built.periods){const classKey=`${assignment.classId}:${day.dayOfWeek}:${period.period}`,teacherKey=`${assignment.teacherId}:${day.dayOfWeek}:${period.period}`;if(placedClass.has(classKey)||placedTeacher.has(teacherKey))continue;const classDay=`${assignment.classId}:${day.dayOfWeek}`,teacherDay=`${assignment.teacherId}:${day.dayOfWeek}`;const score=(dayLoad.get(classDay)??0)*4+(teacherLoad.get(teacherDay)??0)*5+period.period*0.1;if(!best||score<best.score)best={score,day,period};}}if(!best)break;const slot={schoolId:input.schoolId,classId:assignment.classId,subjectId:assignment.subjectId,teacherId:assignment.teacherId,dayOfWeek:best.day.dayOfWeek,period:best.period.period};chosen.push(slot);placedClass.add(`${assignment.classId}:${best.day.dayOfWeek}:${best.period.period}`);placedTeacher.add(`${assignment.teacherId}:${best.day.dayOfWeek}:${best.period.period}`);dayLoad.set(`${assignment.classId}:${best.day.dayOfWeek}`,(dayLoad.get(`${assignment.classId}:${best.day.dayOfWeek}`)??0)+1);teacherLoad.set(`${assignment.teacherId}:${best.day.dayOfWeek}`,(teacherLoad.get(`${assignment.teacherId}:${best.day.dayOfWeek}`)??0)+1);placed++;}if(placed<target)throw new AppError(`I could not fit ${assignment.subject.name} for ${assignment.class.name} ${target} time(s) a week without double-booking the class or teacher.`,409,"TIMETABLE_UNSATISFIABLE");}
  if(input.replaceExisting)await tx.timetableSlot.deleteMany({where:{schoolId:input.schoolId,classId:{in:classIds}}});for(const slot of chosen)await tx.timetableSlot.create({data:slot});const result={scheduled:chosen.length,classes:classes.length,teachers:new Set(chosen.map(x=>x.teacherId)).size,days:days.length,periodsPerDay:Math.max(...days.map(d=>periodsByDay.get(d.dayOfWeek)?.periods.length??0)),published:false,breaks:timetable.breaks};await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"timetable.auto_generated_balanced",entityType:"Timetable",entityId:`generation-${Date.now()}`,after:{...result,replaceExisting:input.replaceExisting}});return result;
}
