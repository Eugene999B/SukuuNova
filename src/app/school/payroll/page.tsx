import { AppShell } from "@/components/AppShell";
import { PayrollV2Workspace } from "@/components/PayrollV2Workspace";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "../finance/finance-v2.css";

export default async function PayrollPage(){const session=await requireSchoolSession();const school=await withTenant(session.schoolId,async tx=>{await requirePermission(tx,session.userId,"payroll:view_all");return tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}});});return <AppShell universe="school" title="Payroll" subtitle="Staff salary structures, monthly payroll processing, payment confirmation and payslip reporting." active="Payroll" schoolName={school?.name||"School"} schoolCode={school?.uniqueCode||""} userName={session.name}><PayrollV2Workspace schoolName={school?.name||"School"}/></AppShell>}
