import { AppShell } from "@/components/AppShell";
import UnifiedCommunicationsDesk from "@/components/UnifiedCommunicationsDesk";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function AnnouncementsPage(){const session=await requireSchoolSession();const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));if(!school)throw new Error("School not found.");return <AppShell universe="school" title="Announcements & Messages" subtitle="Use one clear communication desk for announcements, direct messages and delivery." active="Messages" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><UnifiedCommunicationsDesk schoolName={school.name}/></AppShell>}
