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
export type TimetableRoom = { id:string; name:string; type?:string };
export type TimetableConfig = { days:DayConfig[]; periodMinutes:number; breaks:BreakConfig[]; periodsPerDay:number; periods?:PeriodConfig[]; published:boolean; weeklyPeriods?:Record<string,number>; rooms?:TimetableRoom[]; teacherUnavailability?:Record<string,string[]>; roomRequirements?:Record<string,{roomType?:string;room?:string}>; doublePeriodSubjects?:Record<string,number> };
type AssessmentConfig = AssessmentRules;
type ReportCardConfig = { includePosition:boolean; includeSubjectPosition:boolean; includeAttendance:boolean; includeTeacherRemark:boolean; includeHeadRemark:boolean; includeSignatures:boolean; includeSchoolContacts:boolean; rankMethod:"total_average"|"weighted_total"; showGrades:boolean; showClassAverage:boolean };

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
  const slotKey = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const m = /^([1-6]):([1-9]|1[0-6])$/.exec(v.trim());
    return m ? `${Number(m[1])}:${Number(m[2])}` : null;
  };
  const rawRec = raw as Record<string, unknown>;
  const weeklyRaw = isRecord(rawRec.weeklyPeriods) ? rawRec.weeklyPeriods as Record<string, unknown> : {};
  const weeklyPeriods: Record<string, number> = {};
  for (const [k, v] of Object.entries(weeklyRaw)) {
    if (typeof v === "number" && Number.isFinite(v)) weeklyPeriods[k] = Math.max(1, Math.min(10, Math.round(v)));
  }
  const roomsRaw = Array.isArray(rawRec.rooms) ? rawRec.rooms as unknown[] : [];
  const rooms: TimetableRoom[] = roomsRaw.filter(isRecord).map((r) => {
    const x = r as Record<string, unknown>;
    return { id: String(x.id ?? "").slice(0, 60), name: asString(x.name, "Room"), type: typeof x.type === "string" ? String(x.type).slice(0, 60) : undefined };
  }).filter((r) => r.id && r.name);
  const unavRaw = isRecord(rawRec.teacherUnavailability) ? rawRec.teacherUnavailability as Record<string, unknown> : {};
  const teacherUnavailability: Record<string, string[]> = {};
  for (const [teacherId, slots] of Object.entries(unavRaw)) {
    if (!Array.isArray(slots)) continue;
    const clean = [...new Set(slots.map(slotKey).filter((s): s is string => s !== null))].slice(0, 96);
    if (clean.length) teacherUnavailability[teacherId.slice(0, 100)] = clean;
  }
  const roomReqRaw = isRecord(rawRec.roomRequirements) ? rawRec.roomRequirements as Record<string, unknown> : {};
  const roomRequirements: Record<string, { roomType?: string; room?: string }> = {};
  for (const [k, v] of Object.entries(roomReqRaw)) {
    if (!isRecord(v)) continue;
    const entry: { roomType?: string; room?: string } = {};
    if (typeof v.roomType === "string" && v.roomType.trim()) entry.roomType = v.roomType.trim().slice(0, 60);
    if (typeof v.room === "string" && v.room.trim()) entry.room = v.room.trim().slice(0, 60);
    if (entry.roomType || entry.room) roomRequirements[k.slice(0, 160)] = entry;
  }
  const dblRaw = isRecord(rawRec.doublePeriodSubjects) ? rawRec.doublePeriodSubjects as Record<string, unknown> : {};
  const doublePeriodSubjects: Record<string, number> = {};
  for (const [k, v] of Object.entries(dblRaw)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) doublePeriodSubjects[k.slice(0, 100)] = Math.min(5, Math.floor(v));
  }
  return {
    days,
    periodMinutes: asNumber(rawRec.periodMinutes, base.periodMinutes),
    breaks,
    periodsPerDay: asNumber(rawRec.periodsPerDay, base.periodsPerDay),
    periods: Array.isArray(rawRec.periods) ? rawRec.periods as PeriodConfig[] : base.periods,
    published: typeof rawRec.published === "boolean" ? rawRec.published : false,
    weeklyPeriods: Object.keys(weeklyPeriods).length ? weeklyPeriods : undefined,
    rooms: rooms.length ? rooms : undefined,
    teacherUnavailability: Object.keys(teacherUnavailability).length ? teacherUnavailability : undefined,
    roomRequirements: Object.keys(roomRequirements).length ? roomRequirements : undefined,
    doublePeriodSubjects: Object.keys(doublePeriodSubjects).length ? doublePeriodSubjects : undefined,
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
  const roomIds=new Set((timetable.rooms??[]).map(r=>r.id));
  if(roomIds.size!==(timetable.rooms??[]).length)throw new AppError("Room ids must be unique.",400,"DUPLICATE_ROOM");
  for(const [teacherId,slots] of Object.entries(timetable.teacherUnavailability??{})){
    if(!teacherId)throw new AppError("Teacher availability entries need a teacher.",400,"INVALID_UNAVAILABILITY");
    for(const slot of slots)if(!/^[1-6]:([1-9]|1[0-6])$/.test(slot))throw new AppError(`Invalid unavailable slot "${slot}". Use day:period, e.g. 2:4.`,400,"INVALID_UNAVAILABILITY");
  }
  for(const req of Object.values(timetable.roomRequirements??{})){
    if(req.room&&!roomIds.has(req.room))throw new AppError(`Room rule names unknown room "${req.room}".`,400,"ROOM_NOT_FOUND");
  }
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
export async function getGradebookConfiguration(tx:TenantDb){const config=await getAcademicEngineConfig(tx);const assignments=await tx.classSubjectTeacher.findMany({include:{class:{select:{id:true,name:true,level:true}},subject:{select:{id:true,name:true}},teacher:{select:{id:true,name:true}}},orderBy:{classId:"asc"}});const terms=await tx.term.findMany({orderBy:{startDate:"desc"},select:{id:true,name:true,startDate:true,endDate:true}});return{assessment:config.assessment,reportCard:config.reportCard,assignments,terms};}
export async function getClassSubjectPerformance(tx:TenantDb,classId:string,subjectId:string,termId:string){const [students,assessments]=await Promise.all([tx.student.findMany({where:{classId,status:"active"},select:{id:true,name:true,admissionNo:true},orderBy:{name:"asc"}}),tx.assessment.findMany({where:{classId,subjectId,termId},select:{id:true,name:true,type:true,maxScore:true,weight:true,scores:{select:{studentId:true,value:true}}},orderBy:{name:"asc"}})]);const config=(await getAcademicEngineConfig(tx)).assessment as AssessmentConfig;const rows=students.map(student=>{const studentAssessments=assessments.map(a=>({id:a.id,name:a.name,type:a.type,maxScore:a.maxScore,weight:a.weight,score:a.scores.find(s=>s.studentId===student.id)?.value??null}));const result=calculateSubjectResult(studentAssessments,config);return{student,total:result.total,scores:result.details};});return{rows,assessments:assessments.map(a=>({id:a.id,name:a.name,type:a.type,maxScore:Number(a.maxScore),weight:Number(a.weight)})),config};}