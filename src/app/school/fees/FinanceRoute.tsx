import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import FinanceWorkspace from "@/components/FinanceWorkspace";
import { FinanceEvidenceDock } from "@/components/FinanceEvidenceDock";
import "@/components/finance-evidence.css";

export default async function FinanceRoute({ mode }: { mode: "overview"|"fees"|"invoices"|"payments"|"arrears"|"reports"|"payroll" }) {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name:true, uniqueCode:true } }));
  if (!school) throw new Error("School not found.");
  const title = mode === "fees" ? "School Fees" : mode === "invoices" ? "Invoices" : mode === "payments" ? "Payments" : mode === "arrears" ? "Arrears & Balances" : mode === "reports" ? "Finance Reports" : mode === "payroll" ? "Payroll" : "Finance";
  return <AppShell universe="school" title={title} subtitle="Connected billing, collections, balances and payroll." active={title} schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><FinanceEvidenceDock /><FinanceWorkspace mode={mode} schoolName={school.name} /></AppShell>;
}
