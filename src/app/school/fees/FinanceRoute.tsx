import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import FinanceWorkspace from "@/components/FinanceWorkspace";
import FinanceDownloadCenter from "@/components/FinanceDownloadCenter";
import { FinanceEvidenceDock } from "@/components/FinanceEvidenceDock";
import "@/components/finance-evidence.css";
import "@/components/finance-workspace-simple.css";
import "./finance-theme-parity.css";

export default async function FinanceRoute({ mode }: { mode: "overview"|"fees"|"invoices"|"payments"|"arrears"|"reports"|"payroll" }) {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, canExportFinance] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name:true, uniqueCode:true } }),
      hasPermission(tx, session.userId, "exports:finance"),
    ]);
    return { school, canExportFinance };
  });
  if (!data.school) throw new Error("School not found.");
  const title = mode === "fees" ? "School Fees" : mode === "invoices" ? "Invoices" : mode === "payments" ? "Payments" : mode === "arrears" ? "Arrears & Balances" : mode === "reports" ? "Finance Reports" : mode === "payroll" ? "Payroll" : "Finance";
  const showDownloads = mode === "overview" || mode === "payments" || mode === "arrears" || mode === "reports";
  return <AppShell universe="school" title={title} subtitle="Fees, collections, receipts, exports and payroll." active={title} schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}><FinanceEvidenceDock /><FinanceWorkspace mode={mode} schoolName={data.school.name} />{showDownloads ? <FinanceDownloadCenter mode={mode} canExport={data.canExportFinance} /> : null}</AppShell>;
}
