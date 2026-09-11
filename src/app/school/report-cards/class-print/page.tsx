import Link from "next/link";
import { notFound } from "next/navigation";
import AutoPrint from "@/components/AutoPrint";
import OfficialReportCard from "@/components/OfficialReportCard";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";
import { loadReportCardPrintPack } from "@/lib/report-card-print-pack";
import { resolveStudentTermClass } from "@/lib/student-term-context";

function PrintMessage({ title, body, classId, termId }: { title: string; body: string; classId?: string; termId?: string }) {
  const reportsHref = classId && termId
    ? `/school/report-cards?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}`
    : "/school/report-cards";
  return (
    <main style={{ maxWidth: 760, margin: "48px auto", padding: 24, fontFamily: "var(--sn-font-family)" }}>
      <h1>{title}</h1>
      <p>{body}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
        {classId && termId ? <Link href={`/school/report-cards/class-print?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}`}>Retry class pack</Link> : null}
        <Link href={reportsHref}>Back to report cards</Link>
      </div>
    </main>
  );
}

export default async function ClassReportPrintPage({ searchParams }: { searchParams: Promise<{ term?: string; classId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const termId = params.term?.trim() ?? "";
  const classId = params.classId?.trim() ?? "";
  if (!termId || !classId) notFound();

  const context = await withTenant(session.schoolId, async (tx) => {
    if (!(await hasPermission(tx, session.userId, "report_cards:view"))) {
      return { kind: "denied" as const, message: "Your account does not have permission to view report cards." };
    }

    const [access, selectedClass, term] = await Promise.all([
      getSchoolAuthorization(tx, session.userId),
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true, name: true, classTeacherId: true } }),
      tx.term.findFirst({ where: { id: termId, schoolId: session.schoolId }, select: { id: true, name: true } }),
    ]);
    if (!selectedClass || !term) return { kind: "missing" as const };

    if (!access.isElevated) {
      if (!access.isTeacher) {
        return { kind: "denied" as const, message: "Only the school academic team or assigned teachers can print class reports." };
      }
      const assigned = selectedClass.classTeacherId === session.userId || Boolean(
        await tx.classSubjectTeacher.findFirst({ where: { schoolId: session.schoolId, classId, teacherId: session.userId }, select: { classId: true } }),
      );
      if (!assigned) {
        return { kind: "denied" as const, message: "Teachers may print report cards only for classes assigned to them." };
      }
    }

    const candidates = await tx.reportCard.findMany({
      where: { schoolId: session.schoolId, termId },
      select: { id: true, studentId: true, student: { select: { name: true } } },
      orderBy: { student: { name: "asc" } },
    });
    const reportIds: string[] = [];
    for (const row of candidates) {
      const termClass = await resolveStudentTermClass(tx, { schoolId: session.schoolId, studentId: row.studentId, termId });
      if (termClass.classId === classId) reportIds.push(row.id);
    }

    return { kind: "ready" as const, selectedClass, term, reportIds };
  });

  if (context.kind === "missing") notFound();
  if (context.kind === "denied") {
    return <PrintMessage title="Class report pack unavailable" body={context.message} />;
  }
  if (!context.reportIds.length) {
    return <PrintMessage title="No generated reports" body={`Generate report cards for ${context.selectedClass.name} in ${context.term.name} before printing the class.`} classId={classId} termId={termId} />;
  }

  const pack = await loadReportCardPrintPack({
    schoolId: session.schoolId,
    reportIds: context.reportIds,
    batchSize: 3,
  });

  if (pack.failures.length) {
    console.error("Class report print pack could not be prepared completely", {
      schoolId: session.schoolId,
      classId,
      termId,
      reportCount: context.reportIds.length,
      failures: pack.failures,
    });
    return (
      <PrintMessage
        title="Class report pack needs another try"
        body={`${pack.failures.length} of ${context.reportIds.length} report cards could not be prepared safely. Nothing was sent to print. Retry the class pack, or return to Report Cards and print the affected learners individually.`}
        classId={classId}
        termId={termId}
      />
    );
  }

  return (
    <AutoPrint>
      <div className="class-report-batch">
        {pack.reports.map(({ report, signatures }) => <OfficialReportCard key={report.reportId} data={report} signatures={signatures} embedded />)}
      </div>
    </AutoPrint>
  );
}
