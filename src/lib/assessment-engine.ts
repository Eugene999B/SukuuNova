import { Prisma } from "@prisma/client";
import { AppError } from "./errors";

type AssessmentCategory = { name: string; weight: number };
export type AssessmentRules = {
  categories: AssessmentCategory[];
  rounding: "nearest" | "down" | "up";
  missingScorePolicy: "blank" | "zero";
  allowTeacherOverride: boolean;
};

type AssessmentLike = {
  id: string;
  name: string;
  type: string;
  maxScore: Prisma.Decimal | number;
  weight: Prisma.Decimal | number;
  score?: Prisma.Decimal | number | null;
};

const TYPE_ALIASES: Record<string, string> = {
  ca: "classwork",
  classwork: "classwork",
  continuousassessment: "classwork",
  homework: "homework",
  exercise: "exercises",
  exercises: "exercises",
  quiz: "quizzes",
  quizzes: "quizzes",
  project: "project",
  exam: "exam",
  examination: "exam"
};

function key(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeAssessmentType(value: string) {
  return TYPE_ALIASES[key(value)] ?? key(value);
}

function round(value: number, mode: AssessmentRules["rounding"]) {
  if (mode === "down") return Math.floor(value * 100) / 100;
  if (mode === "up") return Math.ceil(value * 100) / 100;
  return Math.round(value * 100) / 100;
}

export function validateAssessmentRules(rules: AssessmentRules) {
  if (!rules.categories.length) throw new AppError("At least one assessment category is required.", 400, "NO_ASSESSMENT_CATEGORIES");
  const total = rules.categories.reduce((sum, category) => sum + category.weight, 0);
  if (Math.abs(total - 100) > 0.01) throw new AppError("Assessment category weights must add up to 100%.", 400, "INVALID_WEIGHTS");
  if (rules.categories.some((category) => category.weight < 0 || category.weight > 100)) {
    throw new AppError("Assessment category weights must be between 0% and 100%.", 400, "INVALID_WEIGHT_RANGE");
  }
}

export function categoryWeight(type: string, assessmentWeight: number, rules: AssessmentRules) {
  const normalized = normalizeAssessmentType(type);
  const configured = rules.categories.find((category) => normalizeAssessmentType(category.name) === normalized);
  return configured?.weight ?? assessmentWeight;
}

export function calculateSubjectResult(
  assessments: AssessmentLike[],
  rules: AssessmentRules
) {
  validateAssessmentRules(rules);
  let total = 0;
  let includedWeight = 0;
  const details = assessments.map((assessment) => {
    const maxScore = Number(assessment.maxScore);
    const rawScore = assessment.score == null ? null : Number(assessment.score);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      throw new AppError(`Assessment ${assessment.name} has an invalid maximum score.`, 409, "INVALID_MAX_SCORE");
    }
    const weight = categoryWeight(assessment.type, Number(assessment.weight), rules);
    const missing = rawScore == null;
    const percentage = missing ? null : Math.max(0, Math.min(100, rawScore / maxScore * 100));
    if (!missing) {
      total += (percentage ?? 0) * weight / 100;
      includedWeight += weight;
    } else if (rules.missingScorePolicy === "zero") {
      includedWeight += weight;
    }
    return {
      assessmentId: assessment.id,
      name: assessment.name,
      type: assessment.type,
      maxScore,
      rawScore,
      percentage,
      weight,
      contribution: percentage == null ? 0 : percentage * weight / 100
    };
  });

  const complete = details.every((detail) => detail.rawScore != null);
  const effectiveTotal = rules.missingScorePolicy === "blank" && !complete
    ? null
    : includedWeight > 0 ? total * 100 / includedWeight : 0;

  return {
    total: effectiveTotal == null ? null : round(effectiveTotal, rules.rounding),
    complete,
    includedWeight: round(includedWeight, rules.rounding),
    details
  };
}

export function gradeForPercentage(percentage: number | null) {
  if (percentage == null) return null;
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  if (percentage >= 40) return "E";
  return "F";
}
