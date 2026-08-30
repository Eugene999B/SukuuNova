import { notFound } from "next/navigation";
import ReportCardPrintStudio from "@/components/ReportCardPrintStudio";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

function gradeScale(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const min = Number(item.min);
    const max = Number(item.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    return [{
      min,
      max,
      grade: typeof item.grade === "string" ? item.grade : typeof item.label === "string" ? item.label : undefined,
      remark: typeof item.remark === "string" ? item.remark : undefined,
      label: typeof item.label === "string" ? item.label : undefined
    }];
  });
}

export default async function ReportCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");

    const report = await tx.reportCard.findUnique({
      where: { id },
      include: {
        student: { include: { class: { include: { classTeacher: { select: { name: true } } } } } },
        term: { include: { academicYear: true } },
        template: true
      }
    });
    if (!report) return null;

    const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } });
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
    if (!settings || !school || !report.student.class) return null;

    const assessments = await tx.assessment.findMany({
      where: { termId: report.termId, classId: report.student.class.id },
      include: { subject: true, scores: { where: { studentId: report.studentId } } },
      orderBy: [{ subject: { name: "asc" } }, { type: "asc" }]
    });
    const grouped = new Map<string, typeof assessments>();
    for (const assessment of assessments) grouped.set(assessment.subject.name, [...(grouped.get(assessment.subject.name) ?? []), assessment]);
    const results = [...grouped.entries()].map(([subject, rows]) => {
      const average = (type: string) => {
        const values = rows.filter((row) => row.type === type && row.scores[0]);
        if (!values.length) return null;
        return values.reduce((sum, row) => sum + (Number(row.scores[0].value) / Number(row.maxScore)) * 100, 0) / values.length;
      };
      const ca = average("ca");
      const exam = average("exam");
      return { subject, ca, exam, total: (ca ?? 0) * (Number(settings.gradeCaWeight) / 100) + (exam ?? 0) * (Number(settings.gradeExamWeight) / 100) };
    });

    const students = await tx.student.findMany({
      where: { classId: report.student.class.id, status: "active" },
      select: { id: true }
    });
    const classScores = await tx.score.findMany({
      where: { assessment: { termId: report.termId, classId: report.student.class.id } },
      select: { studentId: true, value: true, assessment: { select: { maxScore: true, type: true } } }
    });
    const totals = new Map<string, { ca: number[]; exam: number[] }>();
    for (const student of students) totals.set(student.id, { ca: [], exam: [] });
    for (const score of classScores) {
      const target = totals.get(score.studentId);
      if (!target) continue;
      const normalized = (Number(score.value) / Number(score.assessment.maxScore)) * 100;
      if (score.assessment.type === "ca") target.ca.push(normalized);
      if (score.assessment.type === "exam") target.exam.push(normalized);
    }
    const classTotals = [...totals.entries()].map(([studentId, bucket]) => {
      const ca = bucket.ca.length ? bucket.ca.reduce((a, b) => a + b, 0) / bucket.ca.length : 0;
      const exam = bucket.exam.length ? bucket.exam.reduce((a, b) => a + b, 0) / bucket.exam.length : 0;
      return { studentId, total: ca * (Number(settings.gradeCaWeight) / 100) + exam * (Number(settings.gradeExamWeight) / 100) };
    }).sort((a, b) => b.total - a.total);
    const positionIndex = classTotals.findIndex((row) => row.studentId === report.studentId);

    const attendance = await tx.attendanceEvent.findMany({ where: { studentId: report.studentId, type: "in", attendanceDate: { gte: report.term.startDate, lte: report.term.endDate } }, select: { attendanceDate: true, isLate: true } });
    const recordedDays = await tx.attendanceEvent.findMany({ where: { studentId: report.studentId, attendanceDate: { gte: report.term.startDate, lte: report.term.endDate } }, distinct: ["attendanceDate"], select: { attendanceDate: true } });
    const nextTerm = await tx.term.findFirst({ where: { academicYearId: report.term.academicYearId, startDate: { gt: report.term.endDate } }, orderBy: { startDate: "asc" }, select: { startDate: true } });

    return {
      school,
      student: { name: report.student.name, admissionNo: report.student.admissionNo, className: report.student.class.name, level: report.student.class.level, photoUrl: report.student.photoUrl },
      term: { name: report.term.name, startDate: report.term.startDate.toISOString(), endDate: report.term.endDate.toISOString(), nextTermStartDate: nextTerm?.startDate.toISOString() ?? null },
      results,
      gradingScale: gradeScale(settings.gradingScale),
      attendance: { present: new Set(attendance.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size, late: attendance.filter((row) => row.isLate).length, totalRecorded: recordedDays.length },
      position: positionIndex >= 0 ? positionIndex + 1 : null,
      classSize: students.length,
      remarks: report.remarks ?? "",
      classTeacherName: report.student.class.classTeacher?.name ?? "Class Teacher"
    };
  });

  if (!data) notFound();
  return <ReportCardPrintStudio data={data} />;
}
