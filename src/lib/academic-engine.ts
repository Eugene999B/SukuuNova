import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { currentSchoolId } from "./tenant-context";
import { calculateSubjectResult, validateAssessmentRules, type AssessmentRules } from "./assessment-engine";

type PeriodConfig = { period:number; start:string; end:string };
type DayConfig = { dayOfWeek:number; name:string; enabled:boolean; start:string; end:string; periods?:PeriodConfig[] };
type BreakConfig = { name:string; start:string; end:string };
type TimetableConfig = { days:DayConfig[]; periodMinutes:number; breaks:BreakConfig[]; periodsPerDay:number; periods?:PeriodConfig[]; published:boolean };
type AssessmentConfig = AssessmentRules;
type ReportCardConfig = { includePosition:boolean; includeSubjectPosition:boolean; includeAttendance:boolean; includeTeacherRemark:boolean; includeHeadRemark:boolean; includeSignatures:boolean; includeSchoolContacts:boolean; rankMethod:"total_average"|"weighted_total"; showGrades:boolean; showClassAverage:boolean };

function jsonObject(value: Prisma.JsonValue|null|undefined): Record<string, Prisma.JsonValue> { return value && !Array.isArray(value) && typeof value === "object" ? value as Record<string, Prisma.JsonValue> : {}; }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function asNumber(value: unknown, fallback: number): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function asString(value: unknown, fallback: string): string { return typeof value === "string" && value ? value : fallback; }
function normalizeTimetable(raw: unknown): TimetableConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_TIMETABLE)) as TimetableConfig;
  if (!isRecord(raw)) return base;
  const daysRaw = Array.isArray((raw as Record<string, unknown>).days) ? (raw as Record<string, unknown>).days as unknown[] : [];
  const days: DayConfig[] = daysRaw.length
    ? daysRaw.filter(isRecord).map((d, i) => {
        const r = d as Record<string, unknown>;
        const dayOfWeek = Number.isInteger(r.dayOfWeek) ? (r.dayOfWeek as number) : i + 1;
        return {
          dayOfWeek,
          name: asString(r.name, `Day ${dayOfWeek}`),
          enabled: typeof r.enabled === "boolean" ? r.enabled : true,
          start: /^\d{2}:\d{2}$/.test(String(r.start ?? "")) ? String(r.start) : "08:00",
          end: /^\d{2}:\d{2}$/.test(String(r.end ?? "")) ? String(r.end) : "15:00",
          periods: Array.isArray(r.periods) ? (r.periods as PeriodConfig[]) : undefined,
        };
      })
    : base.days;
  const breaksRaw = Array.isArray((raw as Record<string, unknown>).breaks) ? (raw as Record<string, unknown>).breaks as unknown[] : [];
  const breaks: BreakConfig[] = breaksRaw.filter(isRecord).map((b) => {
    const r = b as Record<string, unknown>;
    return {
      name: asString(r.name, "Break"),
      start: /^\d{2}:\d{2}$/.test(String(r.start ?? "")) ? String(r.start) : "10:00",
      end: /^\d{2}:\d{2}$/.test(String(r.end ?? "")) ? String(r.end) : "10:20",
    };
  });
  return {
    days,
    periodMinutes: asNumber((raw as Record<string, unknown>).periodMinutes, base.periodMinutes),
    breaks,
    periodsPerDay: asNumber((raw as Record<string, unknown>).periodsPerDay, base.periodsPerDay),
    periods: Array.isArray((raw as Record<string, unknown>).periods) ? (raw as Record<string, unknown>).periods as PeriodConfig[] : base.periods,
    published: typeof (raw as Record<string, unknown>).published === "boolean" ? (raw as Record<string, unknown>).published as boolean : false,
  };
}
const DEFAULT_TIMETABLE:TimetableConfig={days:[1,2,3,4,5].map(day=>({dayOfWeek:day,name:["","Monday","Tuesday","Wednesday","Thursday","Friday"][day],enabled:true,start:"08:00",end:day===5?"14:00":"15:00"})),periodMinutes:40,breaks:[{name:"Break",start:"10:00",end:"10:20"},{name:"Lunch",start:"12:20",end:"13:00"}],periodsPerDay:8,published:false};
const DEFAULT_ASSESSMENT:AssessmentConfig={categories:[{name:"Classwork",weight:20},{name:"Homework",weight:10},{name:"Exercises",weight:10},{name:"Quizzes",weight:10},{name:"Project",weight:10},{name:"Exam",weight:40}],rounding:"nearest",missingScorePolicy:"blank",allowTeacherOverride:false};
const DEFAULT_REPORT:ReportCardConfig={includePosition:true,includeSubjectPosition:true,includeAttendance:true,includeTeacherRemark:true,includeHeadRemark:true,includeSignatures:true,includeSchoolContacts:true,rankMethod:"total_average",showGrades:true,showClassAverage:true};
function asTimeMinutes(value:string){const [h,m]=value.split(":").map(Number);if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||h>23||m<0||m>59)throw new AppError("Time must use HH:MM.",400,"INVALID_TIME");return h*60+m;}
function fmt(n:number){return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;}
function overlaps(a:{start:number;end:number},b:{start:number;end:number}){return a.start<b.end&&a.end>b.start;}
function buildPeriods(day:DayConfig,config:TimetableConfig){
  const explicit=Array.isArray(day.periods)&&day.periods.length?day.periods:config.periods;
  if(Array.isArray(explicit)&&explicit.length){
    const dayStart=asTimeMinutes(day.start),dayEnd=asTimeMinutes(day.end);
    const normalized=explicit.slice(0,Math.max(1,Math.min(16,config.periodsPerDay))).map((p,i)=>({period:Number(p.period)||i+1,start:String(p.start),end:String(p.end)}));
    return normalized.filter(p=>asTimeMinutes(p.end)>asTimeMinutes(p.start)&&asTimeMinutes(p.start)>=dayStart&&asTimeMinutes(p.end)<=dayEnd);
  }
  const start=asTimeMinutes(day.start),end=asTimeMinutes(day.end),breaks=config.breaks.map(b=>({start:asTimeMinutes(b.start),end:asTimeMinutes(b.end),name:b.name})).sort((a,b)=>a.start-b.start);
  const periods:PeriodConfig[]=[];let cursor=start,period=1;
  while(cursor+config.periodMinutes<=end&&period<=config.periodsPerDay){const next=cursor+config.periodMinutes;const crossing=breaks.find(b=>overlaps({start:cursor,end:next},b));if(crossing){cursor=Math.max(cursor,crossing.end);continue;}periods.push({period,start:fmt(cursor),end:fmt(next)});cursor=next;period++;}
  return periods;
}
export function getDayPeriods(day:DayConfig,config:TimetableConfig){return buildPeriods(day,config);}
function parse<T>(value:unknown,fallback:T):T{return value==null?fallback:value as T;}
export async function getAcademicEngineConfig(tx:TenantDb, schoolIdInput?: string){
  const schoolId = schoolIdInput ?? currentSchoolId();
  const r = schoolId ? await tx.schoolSettings.findUnique({
    where: { schoolId },
    select: { timetableConfig: true, assessmentConfig: true, reportCardConfig: true },
  }) : null;
  return {
    timetable: normalizeTimetable(r?.timetableConfig as unknown),
    assessment: parse(r?.assessmentConfig, DEFAULT_ASSESSMENT),
    reportCard: parse(r?.reportCardConfig, DEFAULT_REPORT),
  };
}
export async function saveAcademicEngineConfig(tx:TenantDb,input:{schoolId:string;actorId:string;timetable?:TimetableConfig;assessment?:AssessmentConfig;reportCard?:ReportCardConfig}){
  await requirePermission(tx,input.actorId,"settings:manage_school");
  const current=await getAcademicEngineConfig(tx, input.schoolId);
  const next={timetable:input.timetable??current.timetable,assessment:input.assessment??current.assessment,reportCard:input.reportCard??current.reportCard};
  validateAssessmentRules(next.assessment as AssessmentConfig);
  const timetable=next.timetable as TimetableConfig;
  for(const day of timetable.days){
    const periods=getDayPeriods(day,timetable);
    if(periods.length===0&&day.enabled)throw new AppError(`${day.name} has no valid lesson time blocks.`,400,"NO_TIMETABLE_PERIODS");
    for(const p of periods)if(asTimeMinutes(p.end)<=asTimeMinutes(p.start))throw new AppError(`Period ${p.period} has an invalid time range.`,400,"INVALID_PERIOD_TIME");
    for(let i=1;i<periods.length;i++)if(asTimeMinutes(periods[i].start)<asTimeMinutes(periods[i-1].end))throw new AppError(`${day.name} lesson time blocks overlap.`,400,"OVERLAPPING_PERIODS");
  }
  await tx.schoolSettings.upsert({
    where: { schoolId: input.schoolId },
    update: {
      timetableConfig: next.timetable as unknown as Prisma.InputJsonValue,
      assessmentConfig: next.assessment as unknown as Prisma.InputJsonValue,
      reportCardConfig: next.reportCard as unknown as Prisma.InputJsonValue,
    },
    create: {
      schoolId: input.schoolId,
      timetableConfig: next.timetable as unknown as Prisma.InputJsonValue,
      assessmentConfig: next.assessment as unknown as Prisma.InputJsonValue,
      reportCardConfig: next.reportCard as unknown as Prisma.InputJsonValue,
    },
  });
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"academic.configuration_updated",entityType:"SchoolSettings",entityId:input.schoolId,after:next});
  return next;
}
export async function generateAutomaticTimetable(tx:TenantDb,input:{schoolId:string;actorId:string;replaceExisting:boolean;classIds?:string[]}){await requirePermission(tx,input.actorId,"calendar:manage");const config=await getAcademicEngineConfig(tx);const timetable=config.timetable as TimetableConfig;const activeDays=timetable.days.filter(d=>d.enabled);if(activeDays.length===0)throw new AppError("Enable at least one school day before generating a timetable.",400,"NO_SCHOOL_DAYS");const periodsByDay=new Map<number,ReturnType<typeof buildPeriods>>();for(const day of activeDays)periodsByDay.set(day.dayOfWeek,buildPeriods(day,timetable));const classes=await tx.class.findMany({where:input.classIds?.length?{id:{in:input.classIds}}:{},select:{id:true,name:true}});if(!classes.length)throw new AppError("Create at least one class before generating the timetable.",409,"NO_CLASSES");const assignments=await tx.classSubjectTeacher.findMany({where:{classId:{in:classes.map(c=>c.id)}},include:{subject:true,teacher:true,class:true}});if(assignments.length===0)throw new AppError("Assign subjects to classes and teachers before generating the timetable.",409,"NO_ASSIGNMENTS");const preferredRaw=jsonObject(config.timetable as unknown as Prisma.JsonValue).weeklyPeriods as Prisma.JsonValue|undefined;const weeklyMap:Record<string,number>=preferredRaw&&typeof preferredRaw==="object"&&!Array.isArray(preferredRaw)?Object.fromEntries(Object.entries(preferredRaw).filter((e):e is [string,Prisma.JsonValue]=>typeof e[1]==="number")) as Record<string,number>:{};const classBusy=new Set<string>(),teacherBusy=new Set<string>(),chosen:{schoolId:string;classId:string;subjectId:string;teacherId:string;dayOfWeek:number;period:number}[]=[];const ordered=[...assignments].sort((a,b)=>a.classId.localeCompare(b.classId)||a.subject.name.localeCompare(b.subject.name));for(const assignment of ordered){const key=`${assignment.classId}:${assignment.subjectId}:${assignment.teacherId}`;const target=Math.max(1,Math.min(10,weeklyMap[key]??2));let placed=0;for(let pass=0;pass<target;pass++){let found=false;for(const day of activeDays){for(const p of periodsByDay.get(day.dayOfWeek)??[]){const classKey=`${assignment.classId}:${day.dayOfWeek}:${p.period}`,teacherKey=`${assignment.teacherId}:${day.dayOfWeek}:${p.period}`;if(classBusy.has(classKey)||teacherBusy.has(teacherKey))continue;chosen.push({schoolId:input.schoolId,classId:assignment.classId,subjectId:assignment.subjectId,teacherId:assignment.teacherId,dayOfWeek:day.dayOfWeek,period:p.period});classBusy.add(classKey);teacherBusy.add(teacherKey);placed++;found=true;break;}if(found)break;}if(!found)break;}if(placed<target)throw new AppError(`Could not fit ${assignment.subject.name} for ${assignment.class.name}. Reduce weekly periods or expand the available timetable window.`,409,"TIMETABLE_UNSATISFIABLE");}
if(input.replaceExisting)await tx.timetableSlot.deleteMany({where:{schoolId:input.schoolId}});for(const slot of chosen)await tx.timetableSlot.create({data:slot});const result={scheduled:chosen.length,classes:classes.length,teachers:new Set(chosen.map(x=>x.teacherId)).size,days:activeDays.length,periodsPerDay:Math.max(...activeDays.map(d=>(periodsByDay.get(d.dayOfWeek)??[]).length)),published:false};await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"timetable.auto_generated",entityType:"Timetable",entityId:randomUUID(),after:{...result,replaceExisting:input.replaceExisting}});return result;}
export async function getGradebookConfiguration(tx:TenantDb){const config=await getAcademicEngineConfig(tx);const assignments=await tx.classSubjectTeacher.findMany({include:{class:{select:{id:true,name:true,level:true}},subject:{select:{id:true,name:true}},teacher:{select:{id:true,name:true}}},orderBy:{classId:"asc"}});const terms=await tx.term.findMany({orderBy:{startDate:"desc"},select:{id:true,name:true,startDate:true,endDate:true}});return{assessment:config.assessment,reportCard:config.reportCard,assignments,terms};}
export async function getClassSubjectPerformance(tx:TenantDb,classId:string,subjectId:string,termId:string){const [students,assessments]=await Promise.all([tx.student.findMany({where:{classId,status:"active"},select:{id:true,name:true,admissionNo:true},orderBy:{name:"asc"}}),tx.assessment.findMany({where:{classId,subjectId,termId},select:{id:true,name:true,type:true,maxScore:true,weight:true,scores:{select:{studentId:true,value:true}}},orderBy:{name:"asc"}})]);const config=(await getAcademicEngineConfig(tx)).assessment as AssessmentConfig;const rows=students.map(student=>{const studentAssessments=assessments.map(a=>({id:a.id,name:a.name,type:a.type,maxScore:a.maxScore,weight:a.weight,score:a.scores.find(s=>s.studentId===student.id)?.value??null}));const result=calculateSubjectResult(studentAssessments,config);return{student,total:result.total,scores:result.details};});return{rows,assessments:assessments.map(a=>({id:a.id,name:a.name,type:a.type,maxScore:Number(a.maxScore),weight:Number(a.weight)})),config};}