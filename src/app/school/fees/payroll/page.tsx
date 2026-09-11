import { AppShell } from "@/components/AppShell";
import FinanceRuntimeBoundary from "@/components/FinanceRuntimeBoundary";
import PayrollWorkspaceSafe from "@/components/PayrollWorkspaceSafe";
import "@/components/payroll-finance-v4.css";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function Page() {
  const session = await requireSchoolSession();
  let school: { name: string; uniqueCode: string } | null = null;
  try {
    school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
      where: { id: session.schoolId },
      select: { name: true, uniqueCode: true },
    }));
  } catch (error) {
    console.error("Payroll shell school identity lookup failed", error);
  }

  const schoolName = school?.name || "School";
  const schoolCode = school?.uniqueCode || "";
  return <AppShell
    universe="school"
    title="Payroll"
    subtitle="Salary structures, payroll runs and staff payslips."
    active="Payroll"
    schoolName={schoolName}
    schoolCode={schoolCode}
    userName={session.name}
  >
    <FinanceRuntimeBoundary area="payroll">
      <PayrollWorkspaceSafe schoolName={schoolName} />
    </FinanceRuntimeBoundary>
  </AppShell>;
}
