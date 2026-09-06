import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import ReportCardIntelligenceSettings from "./ReportCardIntelligenceSettings";

export default async function ReportCardIntelligencePage(){
 const session=await requireSchoolSession();
 const school=await withTenant(session.schoolId,async(tx)=>{await requirePermission(tx,session.userId,"settings:manage_school");return tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}})});
 if(!school)return null;
 return <AppShell universe="school" title="Report Card Intelligence" subtitle="Advanced report-card configuration." active="School Settings" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><ReportCardIntelligenceSettings/></AppShell>;
}
