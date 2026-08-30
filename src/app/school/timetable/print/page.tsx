import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import PrintStudio from "./PrintStudio";
import "./print.css";

type Day={dayOfWeek:number;name:string;enabled:boolean;start:string;end:string};
type TimetableConfig={days:Day[];periodMinutes:number;breaks:{name:string;start:string;end:string}[];periodsPerDay:number;periods?:{period:number;start:string;end:string}[];published:boolean};

export default async function TimetablePrintPage(){
  const session=await requireSchoolSession();
  const data=await withTenant(session.schoolId,async tx=>{
    await requirePermission(tx,session.userId,"calendar:manage");
    const [school,classes,subjects,teachers,slots,academic]=await Promise.all([
      tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true,logoUrl:true,brandColors:true}}),
      tx.class.findMany({where:{schoolId:session.schoolId},orderBy:[{level:"asc"},{name:"asc"}],select:{id:true,name:true,level:true}}),
      tx.subject.findMany({where:{schoolId:session.schoolId},orderBy:{name:"asc"},select:{id:true,name:true}}),
      tx.user.findMany({where:{schoolId:session.schoolId,status:"active"},orderBy:{name:"asc"},select:{id:true,name:true}}),
      tx.timetableSlot.findMany({where:{schoolId:session.schoolId},orderBy:[{dayOfWeek:"asc"},{period:"asc"}],include:{class:{select:{id:true,name:true,level:true}},subject:{select:{id:true,name:true}},teacher:{select:{id:true,name:true}}}}),
      getAcademicEngineConfig(tx)
    ]);
    return {school,classes,subjects,teachers,slots,timetableConfig:academic.timetable as TimetableConfig};
  });
  return <AppShell universe="school" title="Print Timetable" subtitle="Design, print, edit, export and share the school timetable without changing the schedule." active="Print Timetable" schoolName={data.school?.name??"School Workspace"} schoolCode={data.school?.uniqueCode??""} userName={session.name}><PrintStudio data={data}/></AppShell>;
}
