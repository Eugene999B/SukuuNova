import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import SchoolSettingsWorkspace from "./SchoolSettingsWorkspace";
import "./settings.css";

export default async function SchoolSettingsPage(){
 const session=await requireSchoolSession();
 const data=await withTenant(session.schoolId,async(tx)=>{
   const [school,settings,academicYears,terms]=await Promise.all([
     tx.school.findUnique({where:{id:session.schoolId},select:{id:true,name:true,uniqueCode:true,status:true}}),
     tx.schoolSettings.findUnique({where:{schoolId:session.schoolId}}),
     tx.academicYear.findMany({where:{schoolId:session.schoolId},orderBy:{startDate:"desc"}}),
     tx.term.findMany({where:{schoolId:session.schoolId},include:{academicYear:{select:{id:true,name:true,startDate:true,endDate:true}}},orderBy:[{startDate:"desc"},{name:"asc"}]})
   ]);
   if(!school) throw new Error("School not found.");
   const now=new Date();
   return {school,settings,academicYears,terms:terms.map(term=>({...term,status:now<term.startDate?"upcoming":now>term.endDate?"completed":"current"}))};
 });
 return <AppShell universe="school" title="School Settings" subtitle="Configure the school, academic rules and the timeline that powers every term-aware workflow." active="School Settings" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
   <SchoolSettingsWorkspace initial={data as any} dataSession={{name:session.name}}/>
 </AppShell>;
}
