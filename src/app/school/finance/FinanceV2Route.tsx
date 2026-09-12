import { AppShell } from "@/components/AppShell";
import { FinanceV2Workspace, type FinanceV2Mode } from "@/components/FinanceV2Workspace";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./finance-v2.css";

const TITLES:Record<FinanceV2Mode,string>={dashboard:"Finance",fees:"Fee Structures",payments:"Record Payments",scholarships:"Scholarships",expenses:"Purchases & Expenses",history:"Finance History",reports:"Finance Reports"};
export default async function FinanceV2Route({mode}:{mode:FinanceV2Mode}){const session=await requireSchoolSession();const school=await withTenant(session.schoolId,async tx=>{await requirePermission(tx,session.userId,"finance:read");return tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}});});return <AppShell universe="school" title={TITLES[mode]} subtitle="Simple, auditable school finance from fee setup to collection, scholarships, spending and reporting." active={mode==="dashboard"?"School Fees":mode==="payments"?"Payments":mode==="reports"?"Finance Reports":"School Fees"} schoolName={school?.name||"School"} schoolCode={school?.uniqueCode||""} userName={session.name}><FinanceV2Workspace mode={mode} schoolName={school?.name||"School"}/></AppShell>}
