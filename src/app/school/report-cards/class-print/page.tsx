import { notFound } from "next/navigation";
import AutoPrint from "@/components/AutoPrint";
import OfficialReportCard from "@/components/OfficialReportCard";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";
import { getReportCardPrintData, reportBelongsToClass } from "@/lib/report-card-print-data";
import { signaturesForReport } from "@/lib/report-card-signatures";

export default async function ClassReportPrintPage({ searchParams }: { searchParams: Promise<{ term?: string; classId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const termId = params.term?.trim() ?? "";
  const classId = params.classId?.trim() ?? "";
  if (!termId || !classId) notFound();

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [access, selectedClass, term] = await Promise.all([
      getSchoolAuthorization(tx, session.userId),
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true, name: true, classTeacherId: true } }),
      tx.term.findFirst({ where: { id: termId, schoolId: session.schoolId }, select: { id: true, name: true } }),
    ]);
    if (!selectedClass || !term) return null;
    if (!access.isElevated) {
      if (!access.isTeacher) throw new Error("Only the school academic team or assigned teachers can print class reports.");
      const assigned = selectedClass.classTeacherId === session.userId || Boolean(
        await tx.classSubjectTeacher.findFirst({ where: { schoolId: session.schoolId, classId, teacherId: session.userId } }),
      );
      if (!assigned) throw new Error("Teachers may only print report cards for their assigned classes.");
    }

    const candidates = await tx.reportCard.findMany({
      where: { schoolId: session.schoolId, termId },
      select: { id: true, calculationSnapshot: true, student: { select: { classId: true, name: true } } },
      orderBy: { student: { name: "asc" } },
    });
    const reportIds = candidates.filter((row) => reportBelongsToClass(row.calculationSnapshot, row.student.classId, classId)).map((row) => row.id);
    const reports = await Promise.all(reportIds.map(async (reportId) => {
      const [report, signatures] = await Promise.all([
        getReportCardPrintData(tx, { schoolId: session.schoolId, reportId }),
        signaturesForReport(tx, { schoolId: session.schoolId, reportId }),
      ]);
      return { report, signatures };
    }));
    return { selectedClass, term, reports };
  });

  if (!data) notFound();
  if (!data.reports.length) {
    return <main style={{ maxWidth: 760, margin: "48px auto", padding: 24, fontFamily: "var(--sn-font-family)" }}><h1>No generated reports</h1><p>Generate report cards for {data.selectedClass.name} in {data.term.name} before printing the class.</p></main>;
  }

  return (
    <AutoPrint>
      <div className="class-report-batch">
        {data.reports.map(({ report, signatures }) => <OfficialReportCard key={report.reportId} data={report} signatures={signatures} embedded />)}
      </div>
    </AutoPrint>
  );
}
