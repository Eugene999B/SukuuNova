import { AppShell } from "@/components/AppShell";
import { SettingsHero, SettingsRouteCard, SettingsSection } from "@/components/SettingsHub";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { CalendarDays, Download, FileText, GraduationCap, MessageSquare, Palette, ShieldCheck, UsersRound } from "lucide-react";
import SchoolSettingsWorkspace from "./SchoolSettingsWorkspace";
import ThemePreferences from "./ThemePreferences";
import "@/components/settings-hub.css";
import "./settings.css";
import "./settings-dark.css";

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
 const currentTerm=data.terms.find(term=>term.status==="current")??data.terms.find(term=>term.status==="upcoming")??null;
 return <AppShell universe="school" title="Settings" subtitle="School-wide configuration, access and document controls." active="School Settings" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
   <div className="settings-hub">
     <SettingsHero eyebrow="School settings" title="Change the school without getting lost in the system." description="Start with the area you actually want to change. Specialist settings stay with the workflow they control, while the few true school-wide defaults remain together below." contextLabel="School" contextValue={data.school.name} contextMeta={`${data.school.uniqueCode} · ${currentTerm?.name??"No current term"}`} />

     <SettingsSection title="What do you want to change?" description="Each area opens the place where that work is actually managed.">
       <div className="settings-route-grid">
         <SettingsRouteCard href="/school/settings/access" icon={UsersRound} title="People, roles & access" description="Create accounts, assign roles, review effective rights and control what each person can do." action="Manage access" />
         <SettingsRouteCard href="/school/academics/setup" icon={GraduationCap} title="Academic setup" description="Configure classes, subjects, teaching assignments, grading structure and academic workflow foundations." action="Open academic setup" />
         <SettingsRouteCard href="/school/terms" icon={CalendarDays} title="Terms, calendar & holidays" description="Manage academic years, terms and dates that drive attendance, reports and other term-aware workflows." action="Manage calendar" />
         <SettingsRouteCard href="/school/settings/reporting" icon={FileText} title="Report cards & documents" description="Choose report design, grading presentation, positions, signatories and official document behaviour." action="Configure reports" />
         <SettingsRouteCard href="/school/communications/settings" icon={MessageSquare} title="Communication settings" description="Manage channels, audiences, automations and delivery behaviour for school communication." action="Configure communication" />
         <SettingsRouteCard href="/school/settings/roles" icon={ShieldCheck} title="Role templates & permissions" description="Review system roles, permission coverage and governed role upgrades for the school." action="Review permissions" />
         <SettingsRouteCard href="/school/downloads" icon={Download} title="Downloads & data" description="Export operational records and official documents without mixing export controls into daily settings." action="Open downloads" />
         <SettingsRouteCard href="/school/settings/handout" icon={FileText} title="Staff handout" description="Open the printable SukuuNova guide for staff orientation and internal training." action="Open handout" />
       </div>
     </SettingsSection>

     <SchoolSettingsWorkspace initial={workspaceData} dataSession={{name:session.name}}/>

     <section className="settings-focus-panel">
       <header>
         <span className="settings-hub-eyebrow">Appearance</span>
         <h2>Workspace appearance</h2>
         <p>Personalise the visual experience without mixing appearance controls into academic, access or reporting rules.</p>
       </header>
       <div className="settings-focus-body">
         <ThemePreferences/>
       </div>
     </section>

     <div className="settings-hub-note">
       <strong>A setting should live beside the workflow it controls.</strong>
       <p>That is why roles, report cards, calendar dates and communications each open their own focused settings area instead of being duplicated inside one giant control page.</p>
     </div>
   </div>
 </AppShell>;
}
