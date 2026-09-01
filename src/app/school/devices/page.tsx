import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import DevicesDesk from "./DevicesDesk";

export default async function DevicesPage(){const session=await requireSchoolSession();const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));return <AppShell universe="school" title="Devices" subtitle="Register and control the attendance terminals used by this school." active="Devices" schoolName={school?.name??"School Workspace"} schoolCode={school?.uniqueCode??""} userName={session.name}><DevicesDesk/></AppShell>}
