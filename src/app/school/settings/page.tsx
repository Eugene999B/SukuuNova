import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import SchoolSettingsWorkspace from "./SchoolSettingsWorkspace";
import "./settings.css";

type WorkspaceSettings = { expectedResumptionTime:string; attendanceGraceMinutes:number; timezone:string; gradeCaWeight:number; gradeExamWeight:number; allowPartialReportCards:boolean; smsSenderId:string|null };
type WorkspaceTerm = { id:string; name:string; startDate:string; endDate:string; status:"upcoming"|"current"|"completed"; academicYear:{id:string;name:string;startDate:string;endDate:string} };
type WorkspaceData = { school:{id:string;name:string;uniqueCode:string;status:string}; settings:WorkspaceSettings|null; academicYears:{id:string;name:string;startDate:string;endDate:string}[]; terms:WorkspaceTerm[] };

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
  return {school,settings,academicYears,terms:terms.map(term=>({...term,status:(now<term.startDate?"upcoming":now>term.endDate?"completed":"current") as "upcoming"|"current"|"completed"}))};
 });
 const workspaceData:WorkspaceData={
  school:data.school,
  settings:data.settings?{expectedResumptionTime:data.settings.expectedResumptionTime??"07:30",attendanceGraceMinutes:data.settings.attendanceGraceMinutes,timezone:data.settings.timezone,gradeCaWeight:Number(data.settings.gradeCaWeight),gradeExamWeight:Number(data.settings.gradeExamWeight),allowPartialReportCards:data.settings.allowPartialReportCards,smsSenderId:data.settings.smsSenderId??null}:null,
  academicYears:data.academicYears.map(year=>({id:year.id,name:year.name,startDate:year.startDate.toISOString(),endDate:year.endDate.toISOString()})),
  terms:data.terms.map(term=>({id:term.id,name:term.name,startDate:term.startDate.toISOString(),endDate:term.endDate.toISOString(),status:term.status,academicYear:{id:term.academicYear.id,name:term.academicYear.name,startDate:term.academicYear.startDate.toISOString(),endDate:term.academicYear.endDate.toISOString()}}))
 };
 return <AppShell universe="school" title="School Settings" subtitle="Configure the school, academic rules and the timeline that powers every term-aware workflow." active="School Settings" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}><SchoolSettingsWorkspace initial={workspaceData} dataSession={{name:session.name}}/></AppShell>;
}
