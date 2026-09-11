import type { TenantDb } from "./db";
import { calculateSubjectResult, validateAssessmentRules, type AssessmentRules } from "./assessment-engine";

const DEFAULT_ASSESSMENT_RULES: AssessmentRules = {
  categories: [
    { name: "Classwork", weight: 20 },
    { name: "Homework", weight: 10 },
    { name: "Exercises", weight: 10 },
    { name: "Quizzes", weight: 10 },
    { name: "Project", weight: 10 },
    { name: "Exam", weight: 40 },
  ],
  rounding: "nearest",
  missingScorePolicy: "blank",
  allowTeacherOverride: false,
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function runtimeCategories(value: unknown): AssessmentRules["categories"] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const categories = value.flatMap((entry) => {
    const item = record(entry);
    if (!item) return [];
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const weight = Number(item.weight);
    if (!name || !Number.isFinite(weight) || weight < 0 || weight > 100) return [];
    return [{ name: name.slice(0, 80), weight }];
  });
  if (categories.length !== value.length) return null;
  return categories;
}

export function normalizeAssessmentRulesForRuntime(value: unknown): { rules: AssessmentRules; repaired: boolean } {
  const source = record(value);
  if (!source) return { rules: DEFAULT_ASSESSMENT_RULES, repaired: value != null };

  const categories = runtimeCategories(source.categories);
  const candidate: AssessmentRules = {
    categories: categories ?? DEFAULT_ASSESSMENT_RULES.categories,
    rounding: source.rounding === "down" || source.rounding === "up" || source.rounding === "nearest" ? source.rounding : "nearest",
    missingScorePolicy: source.missingScorePolicy === "zero" ? "zero" : "blank",
    allowTeacherOverride: source.allowTeacherOverride === true,
  };

  try {
    validateAssessmentRules(candidate);
    const repaired = !categories
      || source.rounding !== candidate.rounding
      || source.missingScorePolicy !== candidate.missingScorePolicy
      || source.allowTeacherOverride !== candidate.allowTeacherOverride;
    return { rules: candidate, repaired };
  } catch {
    return { rules: DEFAULT_ASSESSMENT_RULES, repaired: true };
  }
}

export async function getClassSubjectPerformanceForRuntime(
  tx: TenantDb,
  classId: string,
  subjectId: string,
  termId: string,
  rules: AssessmentRules,
) {
  const [students, assessments] = await Promise.all([
    tx.student.findMany({
      where: { classId, status: "active" },
      select: { id: true, name: true, admissionNo: true },
      orderBy: { name: "asc" },
    }),
    tx.assessment.findMany({
      where: { classId, subjectId, termId },
      select: {
        id: true,
        name: true,
        type: true,
        maxScore: true,
        weight: true,
        scores: { select: { id: true, studentId: true, value: true, status: true, enteredAt: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = students.map((student) => {
    const studentAssessments = assessments.map((assessment) => {
      const hit = assessment.scores.find((score) => score.studentId === student.id);
      return {
        id: assessment.id,
        name: assessment.name,
        type: assessment.type,
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        score: hit?.value ?? null,
        status: hit?.status ?? null,
      };
    });
    const result = calculateSubjectResult(studentAssessments, rules);
    return {
      student,
      total: result.total,
      scores: result.details.map((detail) => {
        const score = assessments.find((assessment) => assessment.id === detail.assessmentId)?.scores.find((item) => item.studentId === student.id);
        return {
          ...detail,
          expected: score ? {
            id: score.id,
            value: Number(score.value),
            status: score.status,
            enteredAt: score.enteredAt.toISOString(),
          } : null,
        };
      }),
    };
  });

  return {
    rows,
    assessments: assessments.map((assessment) => ({
      id: assessment.id,
      name: assessment.name,
      type: assessment.type,
      maxScore: Number(assessment.maxScore),
      weight: Number(assessment.weight),
    })),
    config: rules,
  };
}
