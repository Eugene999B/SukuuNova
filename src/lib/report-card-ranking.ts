import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { getClassSubjectIntelligence } from "@/lib/performance-intelligence";
import { calculateSubjectResult, gradeForPercentage, rankTotals, RANK_EPSILON, type AssessmentRules, type GradeBand } from "@/lib/assessment-engine";

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

export function gradeScale(value: Prisma.JsonValue | null | undefined): GradeBand[] {
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

export function rulesFor(settings: { gradeCaWeight: Prisma.Decimal | number; gradeExamWeight: Prisma.Decimal | number; gradingScale: Prisma.JsonValue | null; assessmentConfig: Prisma.JsonValue | null }): AssessmentRules {
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

export type PromotionDecision = "promoted" | "not_promoted" | "decision_required";
export type RemarkPolicy = { remarkSource: "grade_band" | "position_band"; positionBandLabels: unknown };

export function remarkForLine(
  total: number | null,
  scale: Array<{ min: number; max: number; grade: string; remark?: string; label?: string }>,
  position: number | null,
  rankedCount: number,
  policy: RemarkPolicy
): string | null {
  if (policy.remarkSource === "position_band" && Array.isArray(policy.positionBandLabels) && position != null && rankedCount > 0) {
    const bands = (policy.positionBandLabels as unknown[]).filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e));
    const withRange = bands.filter((b) => Number.isFinite(Number(b.min)) && Number.isFinite(Number(b.max)));
    const pool: Array<Record<string, unknown>> = withRange.length ? withRange : bands.map((b, i) => ({ ...b, min: Math.floor((i * rankedCount) / bands.length) + 1, max: Math.floor(((i + 1) * rankedCount) / bands.length) }));
    const hit = pool.find((b) => position >= Number(b.min) && position <= Number(b.max));
    if (hit && typeof hit.remark === "string" && hit.remark.trim()) return hit.remark.trim();
  }
  if (total == null) return null;
  const bands = scale.length ? scale : [{ min: 0, max: 100, grade: "", remark: "", label: "" }];
  const grade = [...bands].sort((a, b) => b.min - a.min).find((b) => total >= b.min && total <= b.max);
  return grade?.remark?.trim() || grade?.label?.trim() || grade?.grade?.trim() || null;
}

export function remarkForPosition(
  total: number | null,
  scale: Array<{ min: number; max: number; grade: string; remark?: string; label?: string }>,
  position: number | null,
  rankedCount: number,
  policy: RemarkPolicy
): string | null {
  return remarkForLine(total, scale, position, rankedCount, policy);
}

export function promotionForRule(
  rule: "manual" | "pass_mark" | "overall_position",
  input: { overallPosition: number | null; rankedCount: number; cutoffPercent: number; lines: Array<{ total: number | null }>; passMark: number }
): PromotionDecision {
  if (rule === "manual") return "decision_required";
  if (input.lines.some((l) => l.total == null)) return "decision_required";
  if (rule === "pass_mark") return input.lines.length > 0 && input.lines.every((l) => (l.total ?? -1) >= input.passMark) ? "promoted" : "not_promoted";
  const cutoff = Math.min(100, Math.max(1, Math.round(input.cutoffPercent)));
  return input.overallPosition != null && input.overallPosition <= Math.ceil((input.rankedCount * cutoff) / 100) ? "promoted" : "not_promoted";
}

/** Pass threshold independent of stored band order: labelled pass band first, else lowest band at/above 40. */
export function passMarkForScale(scale: Array<{ min: number; max: number; grade: string; remark?: string; label?: string }>): number {
  const sorted = [...scale].sort((a, b) => a.min - b.min);
  return sorted.find((b) => typeof b.label === "string" && /pass/i.test(b.label))?.min
    ?? sorted.find((b) => b.min >= 40)?.min
    ?? 50;
}

// Single ranking rule lives in assessment-engine (leaf module, no import cycles).
export { RANK_EPSILON, rankTotals };

export type ScopeTotals = { totals: Map<string, number>; names: Map<string, string> };

export async function overallTotalsForScope(
  tx: TenantDb,
  input: { schoolId: string; termId: string; classIds: string[]; rules: AssessmentRules }
): Promise<ScopeTotals> {
  const students = await tx.student.findMany({ where: { schoolId: input.schoolId, classId: { in: input.classIds }, status: "active" }, select: { id: true, name: true, classId: true }, orderBy: { id: "asc" } });
  const assessments = await tx.assessment.findMany({ where: { schoolId: input.schoolId, termId: input.termId, classId: { in: input.classIds } }, select: { id: true, classId: true, subjectId: true, type: true, maxScore: true, weight: true, scores: { select: { studentId: true, value: true, status: true } }, subject: { select: { id: true, name: true } } } });
  const totals = new Map<string, number>();
  const names = new Map<string, string>();
  for (const student of students) {
    names.set(student.id, student.name);
    const subjects = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
      if (assessment.classId !== student.classId) continue;
      const rows = subjects.get(assessment.subjectId) ?? [];
      rows.push(assessment);
      subjects.set(assessment.subjectId, rows);
    }
    const subjectTotals: number[] = [];
    for (const rows of subjects.values()) {
      const result = calculateSubjectResult(rows.map((assessment) => { const hit = assessment.scores.find((score) => score.studentId === student.id); return { id: assessment.id, name: assessment.subject.name, type: assessment.type, maxScore: assessment.maxScore, weight: assessment.weight, score: hit?.value ?? null, status: hit?.status ?? null }; }), input.rules);
      if (result.total != null) subjectTotals.push(result.total);
    }
    if (subjectTotals.length) totals.set(student.id, subjectTotals.reduce((sum, value) => sum + value, 0) / subjectTotals.length);
  }
  return { totals, names };
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
  const assessments = await tx.assessment.findMany({ where: { schoolId: input.schoolId, termId: report.termId, classId: report.student.class.id }, select: { classId: true, subjectId: true, subject: { select: { id: true, name: true } } } });
  const rules = rulesFor(settings);
  const { totals, names } = await overallTotalsForScope(tx, { schoolId: input.schoolId, termId: report.termId, classIds, rules });
  const rankedPositions = rankTotals(
    [...totals.entries()].map(([id, total]) => ({ id, name: names.get(id) ?? "", total }))
  );
  const overallPosition = rankedPositions.get(report.studentId) ?? null;
  const rankedCount = totals.size;
  const subjectsForReport = [...new Set(assessments.filter((assessment) => assessment.classId === report.student.classId).map((assessment) => assessment.subjectId))];
  const scale = rules.gradingScale?.length ? rules.gradingScale : undefined;
  const policyRows = await tx.$queryRawUnsafe<Array<{ remarkSource: string; positionBandLabels: unknown; promotionRule: string; positionPromotionCutoffPercent: number | null }>>(
    `SELECT "remarkSource", "positionBandLabels", "promotionRule",
      CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SchoolSettings' AND column_name='positionPromotionCutoffPercent') THEN "positionPromotionCutoffPercent" ELSE 50 END AS "positionPromotionCutoffPercent"
     FROM "SchoolSettings" WHERE "schoolId"=$1`, input.schoolId);
  const policyRow = policyRows[0];
  const remarkPolicy: RemarkPolicy = {
    remarkSource: policyRow?.remarkSource === "position_band" ? "position_band" : "grade_band",
    positionBandLabels: policyRow?.positionBandLabels ?? null,
  };
  const promotionRule = policyRow?.promotionRule === "pass_mark" || policyRow?.promotionRule === "overall_position" ? policyRow.promotionRule : "manual";
  const cutoffPercent = policyRow?.positionPromotionCutoffPercent != null && Number.isFinite(Number(policyRow.positionPromotionCutoffPercent)) ? Math.min(100, Math.max(1, Math.round(Number(policyRow.positionPromotionCutoffPercent)))) : 50;
  const subjectPositions: Array<{ subject: string; position: number | null; total: number | null; grade: string | null; remark: string | null }> = [];
  for (const subjectId of subjectsForReport) {
    const subject = assessments.find((assessment) => assessment.subjectId === subjectId)?.subject;
    if (!subject) continue;
    const intelligence = await getClassSubjectIntelligence(tx, { classId: report.student.classId, subjectId, termId: report.termId, rules, scope: positionScope });
    const row = intelligence.rows.find((entry) => entry.studentId === report.studentId);
    const position = row?.position ?? null;
    const total = row?.total ?? null;
    subjectPositions.push({
      subject: subject.name,
      position,
      total,
      grade: gradeForPercentage(total, scale),
      remark: remarkForLine(total, scale ?? [], position, rankedCount, remarkPolicy),
    });
  }
  const promotionDecision = promotionForRule(promotionRule, {
    overallPosition,
    rankedCount,
    cutoffPercent,
    lines: subjectPositions.map((s) => ({ total: s.total })),
    passMark: passMarkForScale(scale ?? []),
  });
  const existing = asObject(report.calculationSnapshot);
  const snapshot = {
    ...existing,
    calculationVersion: 4,
    rankingFrozenAt: new Date().toISOString(),
    positionScope,
    overallPosition,
    classSize: rankedCount,
    enrolledCount: names.size,
    unrankedCount: names.size - rankedCount,
    subjectPositions,
    promotionRule,
    promotionDecision,
  };
  await tx.reportCard.update({ where: { id: report.id }, data: { calculationSnapshot: snapshot } });
}
