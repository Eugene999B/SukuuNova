import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { getClassSubjectIntelligence } from "@/lib/performance-intelligence";
import { calculateSubjectResult, type AssessmentRules, type GradeBand } from "@/lib/assessment-engine";

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function gradeScale(value: Prisma.JsonValue | null | undefined): GradeBand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, Prisma.JsonValue>;
    const min = Number(item.min);
    const max = Number(item.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    return [{ min, max, grade: typeof item.grade === "string" ? item.grade : typeof item.label === "string" ? item.label : "", label: typeof item.label === "string" ? item.label : undefined, remark: typeof item.remark === "string" ? item.remark : undefined }];
  });
}

function rulesFor(settings: { gradeCaWeight: Prisma.Decimal | number; gradeExamWeight: Prisma.Decimal | number; gradingScale: Prisma.JsonValue | null; assessmentConfig: Prisma.JsonValue | null }): AssessmentRules {
  const configured = asObject(settings.assessmentConfig);
  const categories = Array.isArray(configured.categories)
    ? configured.categories.filter((entry): entry is { name: string; weight: number } => Boolean(entry) && typeof entry === "object" && typeof (entry as Record<string, Prisma.JsonValue>).name === "string" && Number.isFinite(Number((entry as Record<string, Prisma.JsonValue>).weight))).map((entry) => ({ name: entry.name, weight: Number(entry.weight) }))
    : [{ name: "ca", weight: Number(settings.gradeCaWeight) }, { name: "exam", weight: Number(settings.gradeExamWeight) }];
  const total = categories.reduce((sum, category) => sum + category.weight, 0);
  const normalized = Math.abs(total - 100) < 0.01 ? categories : [{ name: "ca", weight: Number(settings.gradeCaWeight) }, { name: "exam", weight: Number(settings.gradeExamWeight) }];
  const rounding = configured.rounding === "down" || configured.rounding === "up" ? configured.rounding : "nearest";
  const missingScorePolicy = configured.missingScorePolicy === "zero" ? "zero" : "blank";
  return { categories: normalized, rounding, missingScorePolicy, allowTeacherOverride: configured.allowTeacherOverride === true, gradingScale: gradeScale(settings.gradingScale) };
}

export const RANK_EPSILON = 0.005;

export function rankTotals(entries: Array<{ id: string; name?: string; total: number }>): Map<string, number> {
  const sorted = [...entries].sort((a, b) => {
    const diff = b.total - a.total;
    if (Math.abs(diff) > RANK_EPSILON) return diff;
    const nameCmp = (a.name ?? "").localeCompare(b.name ?? "");
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  });
  const positions = new Map<string, number>();
  let position = 0;
  let previous: number | null = null;
  for (let index = 0; index < sorted.length; index += 1) {
    const total = sorted[index].total;
    if (previous === null || Math.abs(total - previous) > RANK_EPSILON) position = index + 1;
    positions.set(sorted[index].id, position);
    previous = total;
  }
  return positions;
}

export async function freezeReportCardRanking(tx: TenantDb, input: { schoolId: string; reportCardId: string }) {
  const report = await tx.reportCard.findFirst({ where: { id: input.reportCardId, schoolId: input.schoolId }, select: { id: true, studentId: true, termId: true, calculationSnapshot: true, student: { select: { classId: true, class: { select: { id: true, level: true } } } } } });
  if (!report?.student.classId || !report.student.class) return;
  const settings = await tx.schoolSettings.findUnique({
    where: { schoolId: input.schoolId },
    select: {
      gradeCaWeight: true,
      gradeExamWeight: true,
      gradingScale: true,
      assessmentConfig: true,
      positionScope: true,
    },
  });
  if (!settings) return;
  const positionScope = settings.positionScope === "year_group" ? "year_group" : "class";
  const classIds = positionScope === "year_group" && report.student.class.level ? (await tx.class.findMany({ where: { level: report.student.class.level }, select: { id: true } })).map((row) => row.id) : [report.student.class.id];
  const students = await tx.student.findMany({ where: { schoolId: input.schoolId, classId: { in: classIds }, status: "active" }, select: { id: true, name: true, classId: true }, orderBy: { id: "asc" } });
  const assessments = await tx.assessment.findMany({ where: { schoolId: input.schoolId, termId: report.termId, classId: { in: classIds } }, select: { id: true, classId: true, subjectId: true, type: true, maxScore: true, weight: true, scores: { select: { studentId: true, value: true } }, subject: { select: { id: true, name: true } } } });
  const rules = rulesFor(settings);
  const totals = new Map<string, number>();
  for (const student of students) {
    const subjects = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
      if (assessment.classId !== student.classId) continue;
      const rows = subjects.get(assessment.subjectId) ?? [];
      rows.push(assessment);
      subjects.set(assessment.subjectId, rows);
    }
    const subjectTotals: number[] = [];
    for (const rows of subjects.values()) {
      const result = calculateSubjectResult(rows.map((assessment) => ({ id: assessment.id, name: assessment.subject.name, type: assessment.type, maxScore: assessment.maxScore, weight: assessment.weight, score: assessment.scores.find((score) => score.studentId === student.id)?.value ?? null })), rules);
      if (result.total != null) subjectTotals.push(result.total);
    }
    if (subjectTotals.length) totals.set(student.id, subjectTotals.reduce((sum, value) => sum + value, 0) / subjectTotals.length);
  }
  const rankedPositions = rankTotals(
    [...totals.entries()].map(([id, total]) => ({ id, name: students.find((s) => s.id === id)?.name ?? "", total }))
  );
  const overallPosition = rankedPositions.get(report.studentId) ?? null;
  const rankedCount = totals.size;
  const subjectsForReport = [...new Set(assessments.filter((assessment) => assessment.classId === report.student.classId).map((assessment) => assessment.subjectId))];
  const subjectPositions: Array<{ subject: string; position: number | null; total: number | null }> = [];
  for (const subjectId of subjectsForReport) {
    const subject = assessments.find((assessment) => assessment.subjectId === subjectId)?.subject;
    if (!subject) continue;
    const intelligence = await getClassSubjectIntelligence(tx, { classId: report.student.classId, subjectId, termId: report.termId, rules, scope: positionScope });
    const row = intelligence.rows.find((entry) => entry.studentId === report.studentId);
    subjectPositions.push({ subject: subject.name, position: row?.position ?? null, total: row?.total ?? null });
  }
  const existing = asObject(report.calculationSnapshot);
  const snapshot = { ...existing, rankingFrozenAt: new Date().toISOString(), positionScope, overallPosition, classSize: rankedCount, enrolledCount: students.length, unrankedCount: students.length - rankedCount, subjectPositions };
  await tx.reportCard.update({ where: { id: report.id }, data: { calculationSnapshot: snapshot } });
}
