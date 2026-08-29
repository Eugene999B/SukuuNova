import { AppShell } from "@/components/AppShell";
import CommunicationWorkspace from "@/components/CommunicationWorkspace";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function BroadcastsPage(){
 const session=await requireSchoolSession();
 const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));
 if(!school) throw new Error("School not found.");
 return <AppShell universe="school" title="SMS & WhatsApp" subtitle="Targeted external broadcasts, automation and delivery control for parents, teachers and staff." active="SMS / WhatsApp" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><CommunicationWorkspace mode="broadcasts" schoolName={school.name} userName={session.name}/></AppShell>;
}
