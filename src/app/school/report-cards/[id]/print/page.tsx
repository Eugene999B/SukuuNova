import { notFound } from "next/navigation";
import ReportCardPrintStudio from "@/components/ReportCardPrintStudioV2";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";
import { getClassSubjectIntelligence } from "@/lib/performance-intelligence";

type GradeBand = { grade?: string; min?: number; max?: number; remark?: string; label?: string };

type ReportSettings = {
  showOverallPosition: boolean;
  positionScope: "class" | "year_group";
  remarkSource: "grade_band" | "position_band";
  positionBandLabels: unknown;
  behaviorRatingFields: unknown;
  promotionRule: "manual" | "pass_mark" | "overall_position";
};

function gradeScale(value: unknown): GradeBand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const min = Number(item.min);
    const max = Number(item.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    return [{ min, max, grade: typeof item.grade === "string" ? item.grade : typeof item.label === "string" ? item.label : undefined, remark: typeof item.remark === "string" ? item.remark : undefined, label: typeof item.label === "string" ? item.label : undefined }];
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rulesFor(settings: { gradeCaWeight: unknown; gradeExamWeight: unknown; gradingScale: unknown; assessmentConfig: unknown }) {
  const configured = asObject(settings.assessmentConfig);
  const categories = Array.isArray(configured.categories)
    ? configured.categories.filter((entry): entry is { name: string; weight: number } => Boolean(entry) && typeof entry === "object" && typeof (entry as Record<string, unknown>).name === "string" && Number.isFinite(Number((entry as Record<string, unknown>).weight))).map((entry) => ({ name: entry.name, weight: Number(entry.weight) }))
    : [{ name: "ca", weight: Number(settings.gradeCaWeight) }, { name: "exam", weight: Number(settings.gradeExamWeight) }];
  const total = categories.reduce((sum, category) => sum + category.weight, 0);
  const normalized = Math.abs(total - 100) < 0.01 ? categories : [{ name: "ca", weight: Number(settings.gradeCaWeight) }, { name: "exam", weight: Number(settings.gradeExamWeight) }];
  const rounding = configured.rounding === "down" || configured.rounding === "up" ? configured.rounding : "nearest";
  const missingScorePolicy = configured.missingScorePolicy === "zero" ? "zero" : "blank";
  return { categories: normalized, rounding, missingScorePolicy, allowTeacherOverride: configured.allowTeacherOverride === true, gradingScale: gradeScale(settings.gradingScale) } as const;
}

export default async function ReportCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const access = await getSchoolAuthorization(tx, session.userId);

    const report = await tx.reportCard.findUnique({
      where: { id },
      include: { student: { include: { class: { include: { classTeacher: { select: { id: true, name: true } } } } } }, term: { include: { academicYear: true } }, template: true }
    });
    if (!report) return null;
    if (!report.student.class) return null;

    if (!access.isElevated) {
      if (!access.isTeacher) throw new Error("Only the school academic team or assigned teachers can view report cards.");
      const assigned = report.student.class.classTeacherId === session.userId || Boolean(await tx.classSubjectTeacher.findFirst({ where: { classId: report.student.class.id, teacherId: session.userId } }));
      if (!assigned) throw new Error("Teachers may only view report cards for their assigned classes.");
    }

    const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } });
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
    if (!settings || !school) return null;

    const assessments = await tx.assessment.findMany({ where: { termId: report.termId, classId: report.student.class.id }, include: { subject: true, scores: { where: { studentId: report.studentId } } }, orderBy: [{ subject: { name: "asc" } }, { type: "asc" }] });
    const grouped = new Map<string, typeof assessments>();
    for (const assessment of assessments) grouped.set(assessment.subject.name, [...(grouped.get(assessment.subject.name) ?? []), assessment]);
    const results = [...grouped.entries()].map(([subject, rows]) => {
      const average = (type: string) => {
        const values = rows.filter((row) => row.type === type && row.scores[0]).map((row) => Number(row.scores[0].value) / Number(row.maxScore) * 100);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      };
      const ca = average("ca");
      const exam = average("exam");
      return { subject, ca, exam, total: (ca ?? 0) * (Number(settings.gradeCaWeight) / 100) + (exam ?? 0) * (Number(settings.gradeExamWeight) / 100), position: null as number | null };
    });

    const reportConfigRaw = await tx.$queryRawUnsafe<Array<{ showOverallPosition: boolean; positionScope: string; remarkSource: string; positionBandLabels: unknown; behaviorRatingFields: unknown; promotionRule: string }>>(`SELECT "showOverallPosition", "positionScope", "remarkSource", "positionBandLabels", "behaviorRatingFields", "promotionRule" FROM "SchoolSettings" WHERE "schoolId"=$1`, session.schoolId);
    const configRow = reportConfigRaw[0];
    const reportSettings: ReportSettings = {
      showOverallPosition: configRow?.showOverallPosition ?? true,
      positionScope: configRow?.positionScope === "year_group" ? "year_group" : "class",
      remarkSource: configRow?.remarkSource === "position_band" ? "position_band" : "grade_band",
      positionBandLabels: configRow?.positionBandLabels ?? null,
      behaviorRatingFields: configRow?.behaviorRatingFields ?? null,
      promotionRule: configRow?.promotionRule === "pass_mark" || configRow?.promotionRule === "overall_position" ? configRow.promotionRule : "manual"
    };

    const rules = rulesFor(settings);
    const positions = await Promise.all(results.map(async (row) => {
      const subject = await tx.subject.findFirst({ where: { schoolId: session.schoolId, name: row.subject }, select: { id: true } });
      if (!subject) return row;
      const intelligence = await getClassSubjectIntelligence(tx, { classId: report.student.class!.id, subjectId: subject.id, termId: report.termId, rules, scope: reportSettings.positionScope });
      return { ...row, position: intelligence.rows.find((entry) => entry.studentId === report.studentId)?.position ?? null };
    }));

    const scopeClassIds = reportSettings.positionScope === "year_group" && report.student.class.level
      ? (await tx.class.findMany({ where: { level: report.student.class.level }, select: { id: true } })).map((entry) => entry.id)
      : [report.student.class.id];
    const students = await tx.student.findMany({ where: { classId: { in: scopeClassIds }, status: "active" }, select: { id: true } });
    const classScores = await tx.score.findMany({ where: { assessment: { termId: report.termId, classId: { in: scopeClassIds } } }, select: { studentId: true, value: true, assessment: { select: { maxScore: true, type: true, classId: true } } } });
    const totals = new Map<string, number>();
    for (const student of students) totals.set(student.id, 0);
    for (const score of classScores) {
      if (!totals.has(score.studentId)) continue;
      const normalized = Number(score.value) / Number(score.assessment.maxScore) * 100;
      const weight = score.assessment.type === "ca" ? Number(settings.gradeCaWeight) / 100 : score.assessment.type === "exam" ? Number(settings.gradeExamWeight) / 100 : 0;
      totals.set(score.studentId, (totals.get(score.studentId) ?? 0) + normalized * weight);
    }
    const rankedOverall = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    let overallPosition: number | null = null;
    let lastScore: number | null = null;
    let lastPosition = 0;
    for (let index = 0; index < rankedOverall.length; index += 1) {
      const score = rankedOverall[index][1];
      if (lastScore === null || score !== lastScore) lastPosition = index + 1;
      if (rankedOverall[index][0] === report.studentId) overallPosition = lastPosition;
      lastScore = score;
    }

    const attendance = await tx.attendanceEvent.findMany({ where: { studentId: report.studentId, type: "in", attendanceDate: { gte: report.term.startDate, lte: report.term.endDate } }, select: { attendanceDate: true, isLate: true } });
    const recordedDays = await tx.attendanceEvent.findMany({ where: { studentId: report.studentId, attendanceDate: { gte: report.term.startDate, lte: report.term.endDate } }, distinct: ["attendanceDate"], select: { attendanceDate: true } });
    const nextTerm = await tx.term.findFirst({ where: { academicYearId: report.term.academicYearId, startDate: { gt: report.term.endDate } }, orderBy: { startDate: "asc" }, select: { startDate: true } });

    let snapshot = report.calculationSnapshot;
    if (!snapshot) {
      snapshot = { version: 2, calculatedAt: new Date().toISOString(), positionScope: reportSettings.positionScope, overallPosition, classSize: students.length, subjectPositions: positions.map((row) => ({ subject: row.subject, position: row.position, total: row.total })), promotionRule: reportSettings.promotionRule };
      await tx.reportCard.update({ where: { id: report.id }, data: { calculationSnapshot: snapshot } });
    }
    const frozen = asObject(snapshot);
    const frozenSubjects = Array.isArray(frozen.subjectPositions) ? frozen.subjectPositions as Array<Record<string, unknown>> : [];
    const frozenMap = new Map(frozenSubjects.map((row) => [String(row.subject), row]));
    const finalResults = positions.map((row) => {
      const frozenRow = frozenMap.get(row.subject);
      return { ...row, position: typeof frozenRow?.position === "number" ? frozenRow.position : row.position, total: typeof frozenRow?.total === "number" ? frozenRow.total : row.total };
    });
    const frozenOverall = typeof frozen.overallPosition === "number" ? frozen.overallPosition : overallPosition;

    return { school, student: { name: report.student.name, admissionNo: report.student.admissionNo, className: report.student.class.name, level: report.student.class.level, photoUrl: report.student.photoUrl }, term: { name: report.term.name, startDate: report.term.startDate.toISOString(), endDate: report.term.endDate.toISOString(), nextTermStartDate: nextTerm?.startDate.toISOString() ?? null }, results: finalResults, gradingScale: gradeScale(settings.gradingScale), attendance: { present: new Set(attendance.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size, late: attendance.filter((row) => row.isLate).length, totalRecorded: recordedDays.length }, position: reportSettings.showOverallPosition ? frozenOverall : null, classSize: students.length, remarks: report.remarks ?? "", classTeacherName: report.student.class.classTeacher?.name ?? "Class Teacher", reportSettings };
  });

  if (!data) notFound();
  return <ReportCardPrintStudio data={data} />;
}
