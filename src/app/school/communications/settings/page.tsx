import { AppShell } from "@/components/AppShell";
import CommunicationCommandCenterV2 from "@/components/CommunicationCommandCenterV2";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function CommunicationSettingsPage(){
 const session=await requireSchoolSession();
 const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));
 if(!school) throw new Error("School not found.");
 return <AppShell universe="school" title="Communication Settings" subtitle="Configure SMS, WhatsApp, portal notifications, automation and delivery safeguards for this school." active="Communication Settings" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><CommunicationCommandCenterV2 mode="settings" schoolName={school.name}/></AppShell>;
}
