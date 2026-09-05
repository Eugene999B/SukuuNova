import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { getAcademicEngineConfig, type TimetableRoom } from "./academic-engine";

type PeriodConfig={period:number;start:string;end:string};
type DayConfig={dayOfWeek:number;name:string;enabled:boolean;start:string;end:string;periods?:PeriodConfig[]};
type BreakConfig={name:string;start:string;end:string};
type TimetableConfig={days:DayConfig[];periodMinutes:number;breaks:BreakConfig[];periodsPerDay:number;periods?:PeriodConfig[];published:boolean;weeklyPeriods?:Record<string,number>;rooms?:TimetableRoom[];teacherUnavailability?:Record<string,string[]>;roomRequirements?:Record<string,{roomType?:string;room?:string}>;doublePeriodSubjects?:Record<string,number>};
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

type Constraints={
  weekly:Record<string,number>;
  unavailable:Set<string>;
  roomReq:Record<string,{roomType?:string;room?:string}>;
  doubles:Record<string,number>;
  rooms:TimetableRoom[];
  roomsById:Map<string,TimetableRoom>;
  roomsByType:Map<string,TimetableRoom[]>;
};

function readConstraints(timetable:TimetableConfig):Constraints{
  const weekly:Record<string,number>={};
  if(timetable.weeklyPeriods&&typeof timetable.weeklyPeriods==="object"){
    for(const [k,v] of Object.entries(timetable.weeklyPeriods)){
      const n=mapNumber(v as Prisma.JsonValue);
      if(n!==undefined)weekly[k]=Math.max(1,Math.min(10,Math.round(n)));
    }
  }
  const unavailable=new Set<string>();
  if(timetable.teacherUnavailability&&typeof timetable.teacherUnavailability==="object"){
    for(const [teacherId,slots] of Object.entries(timetable.teacherUnavailability)){
      if(!Array.isArray(slots))continue;
      for(const s of slots){
        if(typeof s!=="string")continue;
        const m=/^([1-6]):([1-9]|1[0-6])$/.exec(s.trim());
        if(m)unavailable.add(`${teacherId}:${Number(m[1])}:${Number(m[2])}`);
      }
    }
  }
  const roomReq:Constraints["roomReq"]={};
  if(timetable.roomRequirements&&typeof timetable.roomRequirements==="object"){
    for(const [k,v] of Object.entries(timetable.roomRequirements)){
      if(!v||typeof v!=="object")continue;
      const entry:{roomType?:string;room?:string}={};
      if(typeof v.roomType==="string"&&v.roomType.trim())entry.roomType=v.roomType.trim();
      if(typeof v.room==="string"&&v.room.trim())entry.room=v.room.trim();
      if(entry.roomType||entry.room)roomReq[k]=entry;
    }
  }
  const doubles:Record<string,number>={};
  if(timetable.doublePeriodSubjects&&typeof timetable.doublePeriodSubjects==="object"){
    for(const [k,v] of Object.entries(timetable.doublePeriodSubjects)){
      if(typeof v==="number"&&Number.isFinite(v)&&v>0)doubles[k]=Math.min(5,Math.floor(v));
    }
  }
  const rooms=Array.isArray(timetable.rooms)?timetable.rooms.filter(r=>r&&typeof r.id==="string"&&r.id&&typeof r.name==="string"&&r.name):[];
  const roomsById=new Map(rooms.map(r=>[r.id,r]));
  const roomsByType=new Map<string,TimetableRoom[]>();
  for(const r of rooms){
    const t=(r.type??"").trim()||"general";
    const arr=roomsByType.get(t)??[];
    arr.push(r);
    roomsByType.set(t,arr);
  }
  return {weekly,unavailable,roomReq,doubles,rooms,roomsById,roomsByType};
}

type Assignment={classId:string;subjectId:string;teacherId:string;className:string;subjectName:string;teacherName:string};
type Placed={schoolId:string;classId:string;subjectId:string;teacherId:string;dayOfWeek:number;period:number;venue:string|null};

const MAX_ATTEMPTS=6;

export async function generateBalancedTimetable(tx:TenantDb,input:{schoolId:string;actorId:string;replaceExisting:boolean;classIds?:string[]}){
  await requirePermission(tx,input.actorId,"calendar:manage");
  const config=await getAcademicEngineConfig(tx,input.schoolId);const timetable=config.timetable as TimetableConfig;const days=timetable.days.filter(d=>d.enabled);if(!days.length)throw new AppError("Enable at least one school day before generating the timetable.",400,"NO_SCHOOL_DAYS");
  const periodsByDay=new Map<number,ReturnType<typeof dayBlocks>>();for(const day of days){const built=dayBlocks(day,timetable);if(!built.periods.length)throw new AppError(`${day.name} has no usable teaching periods after breaks.`,400,"NO_USABLE_PERIODS");periodsByDay.set(day.dayOfWeek,built);}
  const classes=await tx.class.findMany({where:input.classIds?.length?{id:{in:input.classIds}}:{},select:{id:true,name:true,level:true}});if(!classes.length)throw new AppError("Create at least one class before generating the timetable.",409,"NO_CLASSES");
  const classIds=classes.map(c=>c.id);
  const classById=new Map(classes.map(c=>[c.id,c]));
  const rawAssignments=await tx.classSubjectTeacher.findMany({where:{classId:{in:classIds}},include:{class:true,subject:true,teacher:true}});if(!rawAssignments.length)throw new AppError("Assign subjects to classes and teachers before generating the timetable.",409,"NO_ASSIGNMENTS");
  const constraints=readConstraints(timetable);
  for(const [,req] of Object.entries(constraints.roomReq)){
    if(req.room&&!constraints.roomsById.has(req.room))throw new AppError(`A timetable rule names room "${req.room}", which is not in the school's room list. Add the room or fix the rule first.`,400,"ROOM_NOT_FOUND");
  }
  const assignments:Assignment[]=rawAssignments.map(a=>({classId:a.classId,subjectId:a.subjectId,teacherId:a.teacherId,className:a.class.name,subjectName:a.subject.name,teacherName:a.teacher.name}));
  const targetFor=(a:Assignment)=>constraints.weekly[`${a.classId}:${a.subjectId}:${a.teacherId}`]??2;
  // Seed occupancy: always respect slots outside this run's scope (manual edits + other
  // classes), and also respect in-scope slots when appending rather than replacing.
  const seedScope = input.replaceExisting ? { schoolId: input.schoolId, classId: { notIn: classIds } } : { schoolId: input.schoolId };
  const seeded=await tx.timetableSlot.findMany({where:seedScope,select:{classId:true,teacherId:true,dayOfWeek:true,period:true,venue:true,class:{select:{name:true}},teacher:{select:{name:true}}}});
  const holderNames=new Map<string,string>();
  const baseClass=new Set<string>(),baseTeacher=new Set<string>(),baseRoom=new Set<string>();
  for(const s of seeded){
    baseClass.add(`${s.classId}:${s.dayOfWeek}:${s.period}`);
    baseTeacher.add(`${s.teacherId}:${s.dayOfWeek}:${s.period}`);
    if(s.venue)baseRoom.add(`${s.venue}:${s.dayOfWeek}:${s.period}`);
    holderNames.set(`t:${s.teacherId}:${s.dayOfWeek}:${s.period}`, s.class.name);
    holderNames.set(`c:${s.classId}:${s.dayOfWeek}:${s.period}`, s.class.name);
  }
  const dayName=(d:number)=>days.find(x=>x.dayOfWeek===d)?.name??`Day ${d}`;

  const resolveVenue=(a:Assignment,day:number,period:number,occupied:Set<string>):{venue:string|null;blocked?:string}=>{
    const req=constraints.roomReq[`${a.classId}:${a.subjectId}`]??constraints.roomReq[a.subjectId];
    if(!req)return{venue:null};
    if(req.room){
      const key=`room:${req.room}:${day}:${period}`;
      if(occupied.has(key))return{venue:null,blocked:req.room};
      return{venue:`room:${req.room}`};
    }
    const type=(req.roomType??"").trim()||"general";
    const pool=constraints.roomsByType.get(type)??[];
    if(!pool.length)return{venue:`type:${type}`};
    for(const room of pool){
      const key=`room:${room.id}:${day}:${period}`;
      if(!occupied.has(key))return{venue:`room:${room.id}`};
    }
    return{venue:null,blocked:pool.map(r=>r.name).join(", ")};
  };

  let best:{placed:Placed[];count:number;pairs:number}|null=null;
  let lastFailure:{assignment:Assignment;target:number;placed:number;teacherBlocks:Map<string,Array<string>>;classBlocks:number;roomBlocks:number;unavailBlocks:number;roomLabel:string|null}|null=null;

  for(let attempt=0;attempt<MAX_ATTEMPTS;attempt++){
    const placedClass=new Set(baseClass),placedTeacher=new Set(baseTeacher),placedRoom=new Set(baseRoom);
    const dayLoad=new Map<string,number>(),teacherLoad=new Map<string,number>(),subjectDay=new Map<string,number>();
    const chosen:Placed[]=[];
    const ordered=[...assignments].sort((x,y)=>{
      const tx2=targetFor(y)-targetFor(x);
      if(tx2!==0)return tx2;
      const c=x.classId.localeCompare(y.classId);
      if(c!==0)return c;
      return x.subjectName.localeCompare(y.subjectName);
    });
    const rotated=ordered.length?[...ordered.slice(attempt%ordered.length),...ordered.slice(0,attempt%ordered.length)]:ordered;
    const dayOrder=days.length?[...days.slice(attempt%days.length),...days.slice(0,attempt%days.length)]:days;
    let failed:{assignment:Assignment;target:number;placed:number}|null=null;

    const trySingle=(a:Assignment):boolean=>{
      let bestSlot:{score:number;day:number;period:number;venue:string|null}|null=null;
      for(const day of dayOrder){
        const built=periodsByDay.get(day.dayOfWeek);if(!built)continue;
        for(const p of built.periods){
          const classKey=`${a.classId}:${day.dayOfWeek}:${p.period}`,teacherKey=`${a.teacherId}:${day.dayOfWeek}:${p.period}`;
          if(placedClass.has(classKey)||placedTeacher.has(teacherKey))continue;
          if(constraints.unavailable.has(`${a.teacherId}:${day.dayOfWeek}:${p.period}`))continue;
          const venue=resolveVenue(a,day.dayOfWeek,p.period,placedRoom);
          if(venue.blocked!==undefined&&venue.venue===null)continue;
          const score=(dayLoad.get(`${a.classId}:${day.dayOfWeek}`)??0)*4+(teacherLoad.get(`${a.teacherId}:${day.dayOfWeek}`)??0)*5+(subjectDay.get(`${a.classId}:${a.subjectId}:${day.dayOfWeek}`)??0)*6+p.period*0.1;
          if(!bestSlot||score<bestSlot.score)bestSlot={score,day:day.dayOfWeek,period:p.period,venue:venue.venue};
        }
      }
      if(!bestSlot)return false;
      chosen.push({schoolId:input.schoolId,classId:a.classId,subjectId:a.subjectId,teacherId:a.teacherId,dayOfWeek:bestSlot.day,period:bestSlot.period,venue:bestSlot.venue});
      placedClass.add(`${a.classId}:${bestSlot.day}:${bestSlot.period}`);
      placedTeacher.add(`${a.teacherId}:${bestSlot.day}:${bestSlot.period}`);
      if(bestSlot.venue)placedRoom.add(`${bestSlot.venue}:${bestSlot.day}:${bestSlot.period}`);
      dayLoad.set(`${a.classId}:${bestSlot.day}`,(dayLoad.get(`${a.classId}:${bestSlot.day}`)??0)+1);
      teacherLoad.set(`${a.teacherId}:${bestSlot.day}`,(teacherLoad.get(`${a.teacherId}:${bestSlot.day}`)??0)+1);
      subjectDay.set(`${a.classId}:${a.subjectId}:${bestSlot.day}`,(subjectDay.get(`${a.classId}:${a.subjectId}:${bestSlot.day}`)??0)+1);
      return true;
    };

    const tryDouble=(a:Assignment):boolean=>{
      let bestPair:{score:number;day:number;first:number;second:number;venue:string|null}|null=null;
      for(const day of dayOrder){
        const built=periodsByDay.get(day.dayOfWeek);if(!built)continue;
        const list=built.periods;
        for(let i=0;i<list.length-1;i++){
          const p=list[i],q=list[i+1];
          const ck1=`${a.classId}:${day.dayOfWeek}:${p.period}`,ck2=`${a.classId}:${day.dayOfWeek}:${q.period}`;
          const tk1=`${a.teacherId}:${day.dayOfWeek}:${p.period}`,tk2=`${a.teacherId}:${day.dayOfWeek}:${q.period}`;
          if(placedClass.has(ck1)||placedClass.has(ck2)||placedTeacher.has(tk1)||placedTeacher.has(tk2))continue;
          if(constraints.unavailable.has(`${a.teacherId}:${day.dayOfWeek}:${p.period}`)||constraints.unavailable.has(`${a.teacherId}:${day.dayOfWeek}:${q.period}`))continue;
          const v1=resolveVenue(a,day.dayOfWeek,p.period,placedRoom);
          if(v1.venue===null&&v1.blocked!==undefined)continue;
          const occupiedPlus=new Set(placedRoom);
          if(v1.venue)occupiedPlus.add(`${v1.venue}:${day.dayOfWeek}:${p.period}`);
          const v2=resolveVenue(a,day.dayOfWeek,q.period,occupiedPlus);
          if(v2.venue===null&&v2.blocked!==undefined)continue;
          if(v1.venue&&v2.venue&&v1.venue!==v2.venue)continue;
          const score=(dayLoad.get(`${a.classId}:${day.dayOfWeek}`)??0)*4+(teacherLoad.get(`${a.teacherId}:${day.dayOfWeek}`)??0)*5+(subjectDay.get(`${a.classId}:${a.subjectId}:${day.dayOfWeek}`)??0)*6+p.period*0.1;
          if(!bestPair||score<bestPair.score)bestPair={score,day:day.dayOfWeek,first:p.period,second:q.period,venue:v1.venue};
        }
      }
      if(!bestPair)return false;
      for(const period of [bestPair.first,bestPair.second]){
        chosen.push({schoolId:input.schoolId,classId:a.classId,subjectId:a.subjectId,teacherId:a.teacherId,dayOfWeek:bestPair.day,period,venue:bestPair.venue});
        placedClass.add(`${a.classId}:${bestPair.day}:${period}`);
        placedTeacher.add(`${a.teacherId}:${bestPair.day}:${period}`);
        if(bestPair.venue)placedRoom.add(`${bestPair.venue}:${bestPair.day}:${period}`);
      }
      dayLoad.set(`${a.classId}:${bestPair.day}`,(dayLoad.get(`${a.classId}:${bestPair.day}`)??0)+2);
      teacherLoad.set(`${a.teacherId}:${bestPair.day}`,(teacherLoad.get(`${a.teacherId}:${bestPair.day}`)??0)+2);
      subjectDay.set(`${a.classId}:${a.subjectId}:${bestPair.day}`,(subjectDay.get(`${a.classId}:${a.subjectId}:${bestPair.day}`)??0)+2);
      return true;
    };

    let attemptOk=true;
    let pairsPlaced=0;
    for(const a of rotated){
      const target=targetFor(a);
      const doubles=Math.min(constraints.doubles[a.subjectId]??0,Math.floor(target/2));
      let placed=0;
      for(let d=0;d<doubles;d++){if(tryDouble(a)){placed+=2;pairsPlaced++;}else break;}
      while(placed<target){if(trySingle(a)){placed++;}else break;}
      if(placed<target){failed={assignment:a,target,placed};attemptOk=false;break;}
    }
    if(!best||chosen.length>best.count)best={placed:chosen,count:chosen.length,pairs:pairsPlaced};
    if(attemptOk)break;
    if(failed&&attempt===MAX_ATTEMPTS-1){
      // Diagnose the failure against a clean board seeded only with fixed commitments.
      const a=failed.assignment;
      const teacherBlocks=new Map<string,Array<string>>();
      let classBlocks=0,roomBlocks=0,unavailBlocks=0;
      let roomLabel:string|null=null;
      const req=constraints.roomReq[`${a.classId}:${a.subjectId}`]??constraints.roomReq[a.subjectId];
      if(req)roomLabel=req.room??req.roomType??null;
      for(const day of days){
        const built=periodsByDay.get(day.dayOfWeek);if(!built)continue;
        for(const p of built.periods){
          const classKey=`${a.classId}:${day.dayOfWeek}:${p.period}`,teacherKey=`${a.teacherId}:${day.dayOfWeek}:${p.period}`;
          if(baseClass.has(classKey)){classBlocks++;continue;}
          if(baseTeacher.has(teacherKey)){
            const holder=holderNames.get(`t:${a.teacherId}:${day.dayOfWeek}:${p.period}`)??classById.get(a.classId)?.name??"another class";
            const arr=teacherBlocks.get(holder)??[];
            arr.push(`${dayName(day.dayOfWeek)} period ${p.period}`);
            teacherBlocks.set(holder,arr);
            continue;
          }
          if(constraints.unavailable.has(`${a.teacherId}:${day.dayOfWeek}:${p.period}`)){unavailBlocks++;continue;}
          const venue=resolveVenue(a,day.dayOfWeek,p.period,baseRoom);
          if(venue.venue===null&&venue.blocked!==undefined){roomBlocks++;continue;}
        }
      }
      lastFailure={assignment:a,target:failed.target,placed:failed.placed,teacherBlocks,classBlocks,roomBlocks,unavailBlocks,roomLabel};
    }
  }

  const totalNeeded=assignments.reduce((n,a)=>n+targetFor(a),0);
  if(!best||best.count<totalNeeded){
    if(lastFailure){
      const f=lastFailure;
      const lines:string[]=[
        `I could not fit ${f.assignment.subjectName} for ${f.assignment.className} ${f.target} time(s) a week (placed ${f.placed}).`,
      ];
      const teacherEntries=[...f.teacherBlocks.entries()].sort((x,y)=>y[1].length-x[1].length);
      if(teacherEntries.length){
        const [holder,slots]=teacherEntries[0];
        const shown=slots.slice(0,3).join(", ");
        const target=targetFor(f.assignment);
        lines.push(`The tightest squeeze: ${f.assignment.teacherName} is already committed in ${slots.length} of the remaining free slots${holder!==f.assignment.className?` (e.g. ${holder}: ${shown})`:` (${shown})`}. Options: reduce ${f.assignment.subjectName} to fewer than ${target} lessons a week for ${f.assignment.className}, free ${f.assignment.teacherName} in one of those slots, or assign a second ${f.assignment.subjectName} teacher to ${f.assignment.className}.`);
      }
      if(f.roomBlocks>0)lines.push(`Room pressure: ${f.roomBlocks} otherwise-free slot(s) need ${f.roomLabel?`"${f.roomLabel}"`:"a special room"} that is already booked then. Add another room of that type or loosen the room rule.`);
      if(f.unavailBlocks>0)lines.push(`Availability: ${f.assignment.teacherName} is marked unavailable in ${f.unavailBlocks} slot(s). Adjust their availability window if those hours are actually free.`);
      if(f.classBlocks>0&&!teacherEntries.length)lines.push(`${f.assignment.className} itself is fully booked in ${f.classBlocks} slot(s). Reduce that class's weekly load or open more teaching periods.`);
      throw new AppError(lines.join(" "),409,"TIMETABLE_UNSATISFIABLE");
    }
    throw new AppError(`I could not fit the requested weekly load (${best?.count??0}/${totalNeeded} lessons placed) without double-booking a class, teacher or room.`,409,"TIMETABLE_UNSATISFIABLE");
  }

  const chosen=best.placed;
  if(input.replaceExisting)await tx.timetableSlot.deleteMany({where:{schoolId:input.schoolId,classId:{in:classIds}}});
  for(const slot of chosen)await tx.timetableSlot.create({data:slot});
  const result={scheduled:chosen.length,classes:classes.length,teachers:new Set(chosen.map(x=>x.teacherId)).size,days:days.length,periodsPerDay:Math.max(...days.map(d=>periodsByDay.get(d.dayOfWeek)?.periods.length??0)),published:false,breaks:timetable.breaks,attempts:MAX_ATTEMPTS,roomsUsed:new Set(chosen.map(x=>x.venue).filter((v):v is string=>!!v)).size,pairedBlocks:best.pairs};
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"timetable.auto_generated_balanced",entityType:"Timetable",entityId:`generation-${Date.now()}`,after:{...result,replaceExisting:input.replaceExisting}});
  return result;
}
