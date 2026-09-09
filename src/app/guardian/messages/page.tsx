import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import GuardianMessagesDesk from "@/components/GuardianMessagesDesk";
import { requireGuardianSession } from "@/lib/guardian-auth";

export default async function GuardianMessagesPage(){
 const session=await requireGuardianSession();
 if(session.needsPasswordChange)redirect("/account/security?required=1");
 return <AppShell universe="guardian" title="Messages" subtitle="School messages and direct family communication." active="Messages" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><GuardianMessagesDesk/></AppShell>;
}
