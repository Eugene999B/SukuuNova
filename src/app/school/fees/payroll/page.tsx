import { AppShell } from "@/components/AppShell";
import FinanceRuntimeBoundary from "@/components/FinanceRuntimeBoundary";
import PayrollWorkspace from "@/components/PayrollWorkspace";
import "@/components/payroll-finance-v4.css";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function Page() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
    where: { id: session.schoolId },
    select: { name: true, uniqueCode: true },
  }));
  if (!school) throw new Error("School not found.");

  return <AppShell
    universe="school"
    title="Payroll"
    subtitle="Salary structures, payroll runs and staff payslips."
    active="Payroll"
    schoolName={school.name}
    schoolCode={school.uniqueCode}
    userName={session.name}
  >
    <FinanceRuntimeBoundary area="payroll">
      <PayrollWorkspace schoolName={school.name} />
    </FinanceRuntimeBoundary>
  </AppShell>;
}
