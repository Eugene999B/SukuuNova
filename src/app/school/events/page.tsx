import { AppShell } from "@/components/AppShell";
import CommunicationCommandCenter from "@/components/CommunicationCommandCenter";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function EventsPage(){
 const session=await requireSchoolSession();
 const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));
 if(!school) throw new Error("School not found.");
 return <AppShell universe="school" title="Events & Calendar" subtitle="Plan school events, family activities, academic dates and operational programmes with communication built in." active="Events" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><CommunicationCommandCenter mode="events" schoolName={school.name}/></AppShell>;
}
