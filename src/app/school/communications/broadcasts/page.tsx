import { AppShell } from "@/components/AppShell";
import UnifiedCommunicationsDesk from "@/components/UnifiedCommunicationsDesk";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function BroadcastsPage(){
 const session=await requireSchoolSession();
 const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));
 if(!school) throw new Error("School not found.");
 return <AppShell universe="school" title="SMS & WhatsApp" subtitle="Reach the right school audience through an external channel." active="SMS / WhatsApp" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><UnifiedCommunicationsDesk schoolName={school.name} mode="external"/></AppShell>;
}
