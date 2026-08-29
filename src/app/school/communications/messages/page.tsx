import { AppShell } from "@/components/AppShell";
import CommunicationCommandCenter from "@/components/CommunicationCommandCenter";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function MessagesPage(){
 const session=await requireSchoolSession();
 const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));
 if(!school) throw new Error("School not found.");
 return <AppShell universe="school" title="Messages" subtitle="Direct school communication across parents, teachers, staff and the school portal." active="Messages" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><CommunicationCommandCenter mode="messages" schoolName={school.name}/></AppShell>;
}
