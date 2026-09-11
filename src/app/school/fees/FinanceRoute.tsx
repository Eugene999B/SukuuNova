import { AppShell } from "@/components/AppShell";
import FinanceWorkspace from "@/components/FinanceWorkspace";
import FinanceRuntimeBoundary from "@/components/FinanceRuntimeBoundary";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function FinanceRoute({ mode }: { mode: "overview" | "fees" | "invoices" | "payments" | "arrears" | "reports" }) {
  const session = await requireSchoolSession();
  let school: { name: string; uniqueCode: string } | null = null;
  try {
    school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
      where: { id: session.schoolId },
      select: { name: true, uniqueCode: true },
    }));
  } catch (error) {
    console.error("Finance shell school identity lookup failed", error);
  }

  const schoolName = school?.name || "School";
  const schoolCode = school?.uniqueCode || "";
  const active = mode === "invoices" ? "Invoices"
    : mode === "payments" ? "Payments"
      : mode === "arrears" ? "Arrears & Balances"
        : mode === "reports" ? "Finance Reports"
          : "School Fees";
  const title = mode === "reports" ? "Finance Reports" : mode === "arrears" ? "Arrears & Balances" : mode === "payments" ? "Payments" : mode === "invoices" ? "Invoices" : "School Fees";

  return <AppShell
    universe="school"
    title={title}
    subtitle="Billing, collections, balances, receipts and controlled financial reporting."
    active={active}
    schoolName={schoolName}
    schoolCode={schoolCode}
    userName={session.name}
  >
    <FinanceRuntimeBoundary area="finance">
      <FinanceWorkspace mode={mode} schoolName={schoolName} />
    </FinanceRuntimeBoundary>
  </AppShell>;
}
