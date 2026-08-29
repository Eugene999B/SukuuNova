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
  if (!rules.categories.length) {
    throw new AppError("At least one assessment category is required.", 400, "NO_ASSESSMENT_CATEGORIES");
  }
  if (rules.categories.some((category) => !Number.isFinite(category.weight) || category.weight < 0 || category.weight > 100)) {
    throw new AppError("Assessment category weights must be between 0% and 100%.", 400, "INVALID_WEIGHT_RANGE");
  }
  const total = rules.categories.reduce((sum, category) => sum + category.weight, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new AppError("Assessment category weights must add up to 100%.", 400, "INVALID_WEIGHTS");
  }
}

export function categoryWeight(type: string, assessmentWeight: number, rules: AssessmentRules) {
  const normalized = normalizeAssessmentType(type);
  const configured = rules.categories.find((category) => normalizeAssessmentType(category.name) === normalized);
  return configured?.weight ?? assessmentWeight;
}

export function calculateSubjectResult(assessments: AssessmentLike[], rules: AssessmentRules) {
  validateAssessmentRules(rules);

  const normalizedRows = assessments.map((assessment) => {
    const maxScore = Number(assessment.maxScore);
    const rawScore = assessment.score == null ? null : Number(assessment.score);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      throw new AppError(`Assessment ${assessment.name} has an invalid maximum score.`, 409, "INVALID_MAX_SCORE");
    }
    if (rawScore != null && (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > maxScore)) {
      throw new AppError(`Score for ${assessment.name} is outside the valid range.`, 409, "INVALID_SCORE");
    }
    const type = normalizeAssessmentType(assessment.type);
    return {
      assessmentId: assessment.id,
      name: assessment.name,
      type,
      maxScore,
      rawScore,
      percentage: rawScore == null ? null : rawScore / maxScore * 100,
      fallbackWeight: Number(assessment.weight)
    };
  });

  const configuredKeys = new Set(rules.categories.map((category) => normalizeAssessmentType(category.name)));
  const buckets = new Map<string, typeof normalizedRows>();
  for (const row of normalizedRows) {
    const bucket = buckets.get(row.type) ?? [];
    bucket.push(row);
    buckets.set(row.type, bucket);
  }

  let total = 0;
  let appliedWeight = 0;
  const details = normalizedRows.map((row) => ({
    assessmentId: row.assessmentId,
    name: row.name,
    type: row.type,
    maxScore: row.maxScore,
    rawScore: row.rawScore,
    percentage: row.percentage,
    weight: configuredKeys.has(row.type) ? rules.categories.find((category) => normalizeAssessmentType(category.name) === row.type)?.weight ?? 0 : row.fallbackWeight,
    contribution: 0
  }));

  for (const [type, rows] of buckets) {
    const configuredWeight = rules.categories.find((category) => normalizeAssessmentType(category.name) === type)?.weight;
    const weight = configuredWeight ?? rows.reduce((sum, row) => sum + row.fallbackWeight, 0);
    const scored = rows.filter((row) => row.percentage != null);
    if (scored.length === 0) {
      if (rules.missingScorePolicy === "zero") appliedWeight += weight;
      continue;
    }
    const average = scored.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / scored.length;
    total += average * weight / 100;
    appliedWeight += weight;
    for (const detail of details) {
      if (detail.type === type) detail.contribution = average * weight / 100;
    }
  }

  const complete = normalizedRows.length > 0 && normalizedRows.every((row) => row.rawScore != null);
  let effectiveTotal: number | null;
  if (!normalizedRows.length) {
    effectiveTotal = null;
  } else if (rules.missingScorePolicy === "blank" && !complete) {
    effectiveTotal = null;
  } else {
    effectiveTotal = total;
  }

  return {
    total: effectiveTotal == null ? null : round(effectiveTotal, rules.rounding),
    complete,
    includedWeight: round(appliedWeight, rules.rounding),
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
