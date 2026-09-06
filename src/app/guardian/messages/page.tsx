import { AppShell } from "@/components/AppShell";
import GuardianMessagesDesk from "@/components/GuardianMessagesDesk";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";

export default async function GuardianMessagesPage(){
 const session=await requireGuardianSession();
 const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));
 if(!school) throw new Error("School not found.");
 return <AppShell universe="guardian" title="Messages" subtitle="School messages and direct family communication." active="Messages" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><GuardianMessagesDesk/></AppShell>;
}
