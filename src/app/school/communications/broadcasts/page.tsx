import { AppShell } from "@/components/AppShell";
import CommunicationCommandCenterV2 from "@/components/CommunicationCommandCenterV2";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function BroadcastsPage(){
 const session=await requireSchoolSession();
 const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));
 if(!school) throw new Error("School not found.");
 return <AppShell universe="school" title="SMS & WhatsApp" subtitle="Bulk external communication, scheduling, automation and delivery controls." active="SMS / WhatsApp" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><CommunicationCommandCenterV2 mode="broadcasts" schoolName={school.name}/></AppShell>;
}
