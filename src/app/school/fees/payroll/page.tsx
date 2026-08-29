import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import PayrollWorkspace from "@/components/PayrollWorkspace";
export default async function Page(){const session=await requireSchoolSession();const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));if(!school)throw new Error("School not found.");return <AppShell universe="school" title="Payroll" subtitle="Salary structures, deductions, monthly runs and payslips." active="Payroll" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><PayrollWorkspace schoolName={school.name}/></AppShell>}
