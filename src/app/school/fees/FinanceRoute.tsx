import { AppShell } from "@/components/AppShell";
import FinanceWorkspace from "@/components/FinanceWorkspace";
import PayrollWorkspace from "@/components/PayrollWorkspace";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function FinanceRoute({ mode }: { mode: "overview" | "fees" | "invoices" | "payments" | "arrears" | "reports" | "payroll" }) {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
    where: { id: session.schoolId },
    select: { name: true, uniqueCode: true },
  }));
  if (!school) throw new Error("School not found.");

  const active = mode === "invoices" ? "Invoices"
    : mode === "payments" ? "Payments"
      : mode === "arrears" ? "Arrears & Balances"
        : mode === "reports" ? "Finance Reports"
          : mode === "payroll" ? "Payroll"
            : "School Fees";
  const title = mode === "payroll" ? "Payroll" : mode === "reports" ? "Finance Reports" : mode === "arrears" ? "Arrears & Balances" : mode === "payments" ? "Payments" : mode === "invoices" ? "Invoices" : "School Fees";
  const subtitle = mode === "payroll"
    ? "Salary structures, payroll runs and staff payslips."
    : "Billing, collections, balances, receipts and controlled financial reporting.";

  return <AppShell
    universe="school"
    title={title}
    subtitle={subtitle}
    active={active}
    schoolName={school.name}
    schoolCode={school.uniqueCode}
    userName={session.name}
  >
    {mode === "payroll"
      ? <PayrollWorkspace schoolName={school.name} />
      : <FinanceWorkspace mode={mode} schoolName={school.name} />}
  </AppShell>;
}
