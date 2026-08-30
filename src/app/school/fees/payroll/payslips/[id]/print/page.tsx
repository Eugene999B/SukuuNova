import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PayslipPrintStudio from "@/components/PayslipPrintStudio";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { getVisiblePayslipPdf } from "@/lib/payroll-service";

export default async function PayslipPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requireSchoolFeatureInTransaction(tx, session.schoolId, "payroll");
    const payslip = await getVisiblePayslipPdf(tx, { actorId: session.userId, payslipId: id });
    const [school, staff] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } }),
      tx.user.findUnique({ where: { id: payslip.staffId }, select: { name: true, email: true } })
    ]);
    if (!school || !staff || !payslip.payrollRunId) return null;
    const run = await tx.payrollRun.findUnique({ where: { id: payslip.payrollRunId }, select: { period: true } });
    if (!run) return null;
    const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardWatermark: true } });
    return {
      school: { ...school, watermark: settings?.reportCardWatermark ?? null },
      staff,
      period: run.period,
      gross: Number(payslip.gross),
      deductions: Array.isArray(payslip.deductions) ? payslip.deductions as Array<{ label: string; amount: number | string }> : [],
      net: Number(payslip.net)
    };
  }).catch(() => null);

  if (!data) notFound();
  return <AppShell universe="school" title="Payslip Print Studio" subtitle="Preview and print a school-branded payslip without changing payroll data." active="Payroll" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}><PayslipPrintStudio data={data} /></AppShell>;
}
