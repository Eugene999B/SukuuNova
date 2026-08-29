import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { customRoleBuilderData } from "@/lib/role-builder-service";
import { RoleBuilder } from "@/components/RoleBuilder";
import "./roles-workspace.css";
export default async function SchoolRolesPage(){const session=await requireSchoolSession();const data=await withTenant(session.schoolId,(tx)=>customRoleBuilderData(tx,session.userId));return <AppShell universe="school" title="Roles & Permissions" subtitle="Define default responsibilities, create specialist roles, and combine roles on individual accounts without changing the school's baseline jobs." active="Roles & Permissions" schoolName="School Workspace" userName={session.name}><RoleBuilder initial={data}/></AppShell>}
