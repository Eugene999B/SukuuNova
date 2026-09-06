import { AppShell } from "@/components/AppShell";
import TeacherMessagesDesk from "@/components/TeacherMessagesDesk";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function TeacherMessagesPage(){const session=await requireSchoolSession();const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));if(!school)throw new Error("School not found.");return <AppShell universe="teacher" title="My Messages" subtitle="School inbox and direct guardian communication." active="My Messages" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name} role="Teacher"><TeacherMessagesDesk/></AppShell>}
