import { Prisma } from "@prisma/client";
import { AppError } from "./errors";

type AssessmentCategory = { name: string; weight: number };
export type GradeBand = { min: number; max: number; grade: string; label?: string; remark?: string };
export type AssessmentRules = {
  categories: AssessmentCategory[];
  rounding: "nearest" | "down" | "up";
  missingScorePolicy: "blank" | "zero";
  allowTeacherOverride: boolean;
  gradingScale?: GradeBand[];
  /** Canonical top-level reporting weights. When present these win over legacy
   * per-category weights so Gradebook and Report Cards use the same policy. */
  caWeight?: number;
  examWeight?: number;
};

export type ScoreStatus = "present" | "absent" | "excused";
export type AssessmentBucket = "ca" | "exam";
export type ResultBucket = {
  earned: number;
  possible: number;
  percentage: number | null;
  weight: number;
  contribution: number;
};

type AssessmentLike = {
  id: string;
  name: string;
  type: string;
  maxScore: Prisma.Decimal | number;
  weight: Prisma.Decimal | number;
  score?: Prisma.Decimal | number | null;
  status?: ScoreStatus | string | null;
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
  participation: "participation",
  exam: "exam",
  exams: "exam",
  examination: "exam",
  finalexam: "exam",
  terminalexam: "exam",
  endoftermexam: "exam",
  termexam: "exam",
  midtermexam: "exam"
};

const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { min: 80, max: 100, grade: "A", label: "Excellent" },
  { min: 70, max: 79.99, grade: "B", label: "Very Good" },
  { min: 60, max: 69.99, grade: "C", label: "Good" },
  { min: 50, max: 59.99, grade: "D", label: "Pass" },
  { min: 40, max: 49.99, grade: "E", label: "Needs Improvement" },
  { min: 0, max: 39.99, grade: "F", label: "Below Standard" }
];

function key(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeAssessmentType(value: string) {
  return TYPE_ALIASES[key(value)] ?? key(value);
}

export function assessmentBucket(type: string): AssessmentBucket {
  const normalized = normalizeAssessmentType(type);
  return normalized === "exam" || normalized.endsWith("exam") ? "exam" : "ca";
}

function round(value: number, mode: AssessmentRules["rounding"]) {
  if (mode === "down") return Math.floor(value * 100) / 100;
  if (mode === "up") return Math.ceil(value * 100) / 100;
  return Math.round(value * 100) / 100;
}

/** Single ranking rule for the whole product: competition ranking ("1224")
 * with an epsilon so float dust never splits ties, and a stable
 * name-then-id tiebreak so equal totals always order identically. */
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

function validateGradeScale(scale: GradeBand[]) {
  if (!scale.length) throw new AppError("At least one grade band is required.", 400, "NO_GRADE_BANDS");
  for (const band of scale) {
    if (!Number.isFinite(band.min) || !Number.isFinite(band.max) || band.min < 0 || band.max > 100 || band.min > band.max || !band.grade.trim()) {
      throw new AppError("Each grade band must have a valid 0–100 range and grade.", 400, "INVALID_GRADE_BAND");
    }
  }
  const ordered = [...scale].sort((a, b) => b.min - a.min);
  for (let i = 0; i < ordered.length - 1; i += 1) {
    if (ordered[i].min < ordered[i + 1].max && ordered[i + 1].min < ordered[i].max) {
      throw new AppError("Grade bands must not overlap.", 400, "OVERLAPPING_GRADE_BANDS");
    }
  }
}

export function validateAssessmentRules(rules: AssessmentRules) {
  if (!rules.categories.length) throw new AppError("At least one assessment category is required.", 400, "NO_ASSESSMENT_CATEGORIES");
  if (rules.categories.some((category) => !category.name.trim())) throw new AppError("Every assessment category must have a name.", 400, "INVALID_ASSESSMENT_CATEGORY");
  const categoryKeys = rules.categories.map((category) => key(category.name));
  if (new Set(categoryKeys).size !== categoryKeys.length) throw new AppError("Assessment category names must be unique.", 400, "DUPLICATE_ASSESSMENT_CATEGORY");
  if (rules.categories.some((category) => !Number.isFinite(category.weight) || category.weight < 0 || category.weight > 100)) throw new AppError("Assessment category weights must be between 0% and 100%.", 400, "INVALID_WEIGHT_RANGE");
  const categoryTotal = rules.categories.reduce((sum, category) => sum + category.weight, 0);
  if (Math.abs(categoryTotal - 100) > 0.01) throw new AppError("Assessment category weights must add up to 100%.", 400, "INVALID_WEIGHTS");
  if (!rules.categories.some((category) => assessmentBucket(category.name) === "exam")) throw new AppError("The grading policy must include an Exam category so the CA/Exam split is explicit.", 400, "EXAM_WEIGHT_REQUIRED");

  const hasExplicitCa = rules.caWeight != null;
  const hasExplicitExam = rules.examWeight != null;
  if (hasExplicitCa !== hasExplicitExam) throw new AppError("CA and Exam weights must be configured together.", 400, "INCOMPLETE_BUCKET_WEIGHTS");
  if (hasExplicitCa && hasExplicitExam) {
    const ca = Number(rules.caWeight);
    const exam = Number(rules.examWeight);
    if (!Number.isFinite(ca) || !Number.isFinite(exam) || ca < 0 || ca > 100 || exam < 0 || exam > 100) throw new AppError("CA and Exam weights must each be between 0% and 100%.", 400, "INVALID_BUCKET_WEIGHTS");
    if (Math.abs(ca + exam - 100) > 0.01) throw new AppError("CA and Exam weights must add up to 100%.", 400, "INVALID_BUCKET_WEIGHTS");
  }
  if (rules.gradingScale?.length) validateGradeScale(rules.gradingScale);
}

export function assessmentBucketWeights(rules: AssessmentRules) {
  validateAssessmentRules(rules);
  if (rules.caWeight != null && rules.examWeight != null) return { ca: Number(rules.caWeight), exam: Number(rules.examWeight) };
  const exam = rules.categories.filter((category) => assessmentBucket(category.name) === "exam").reduce((sum, category) => sum + category.weight, 0);
  return { ca: 100 - exam, exam };
}

export function categoryWeight(type: string, _assessmentWeight: number, rules: AssessmentRules) {
  const weights = assessmentBucketWeights(rules);
  return assessmentBucket(type) === "exam" ? weights.exam : weights.ca;
}

function emptyBucket(weight: number): ResultBucket {
  return { earned: 0, possible: 0, percentage: null, weight, contribution: 0 };
}

export function calculateSubjectResult(assessments: AssessmentLike[], rules: AssessmentRules) {
  validateAssessmentRules(rules);
  const weights = assessmentBucketWeights(rules);
  const normalizedRows = assessments.map((assessment) => {
    const maxScore = Number(assessment.maxScore);
    const status: ScoreStatus = assessment.status === "excused" || assessment.status === "absent" ? assessment.status : "present";
    const excused = status === "excused";
    const rawScore = excused || assessment.score == null ? null : Number(assessment.score);
    if (!Number.isFinite(maxScore) || maxScore <= 0) throw new AppError(`Assessment ${assessment.name} has an invalid maximum score.`, 409, "INVALID_MAX_SCORE");
    if (rawScore != null && (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > maxScore)) throw new AppError(`Score for ${assessment.name} is outside the valid range.`, 409, "INVALID_SCORE");
    const type = normalizeAssessmentType(assessment.type);
    return { assessmentId: assessment.id, name: assessment.name, type, bucket: assessmentBucket(type), maxScore, rawScore, status, percentage: rawScore == null ? null : rawScore / maxScore * 100 };
  });

  const breakdown: { ca: ResultBucket; exam: ResultBucket } = { ca: emptyBucket(weights.ca), exam: emptyBucket(weights.exam) };
  for (const bucketName of ["ca", "exam"] as const) {
    const rows = normalizedRows.filter((row) => row.bucket === bucketName && row.status !== "excused");
    const effective = rules.missingScorePolicy === "zero" ? rows : rows.filter((row) => row.rawScore != null);
    const earned = effective.reduce((sum, row) => sum + (row.rawScore ?? 0), 0);
    const possible = effective.reduce((sum, row) => sum + row.maxScore, 0);
    const percentage = possible > 0 ? earned / possible * 100 : null;
    const weight = breakdown[bucketName].weight;
    breakdown[bucketName] = { earned, possible, percentage, weight, contribution: percentage == null ? 0 : percentage * weight / 100 };
  }

  const typeContributions = new Map<string, number>();
  for (const type of new Set(normalizedRows.map((row) => row.type))) {
    const rows = normalizedRows.filter((row) => row.type === type && row.status !== "excused");
    const bucket = breakdown[assessmentBucket(type)];
    if (bucket.possible <= 0) {
      typeContributions.set(type, 0);
      continue;
    }
    const earned = rows.reduce((sum, row) => sum + (row.rawScore ?? 0), 0);
    typeContributions.set(type, earned / bucket.possible * bucket.weight);
  }

  const details = normalizedRows.map((row) => {
    const bucket = breakdown[row.bucket];
    return {
      assessmentId: row.assessmentId,
      name: row.name,
      type: row.type,
      bucket: row.bucket,
      maxScore: row.maxScore,
      rawScore: row.rawScore,
      status: row.status,
      percentage: row.percentage,
      weight: bucket.weight,
      contribution: typeContributions.get(row.type) ?? 0,
    };
  });

  const allRecordedOrExcused = normalizedRows.length > 0 && normalizedRows.every((row) => row.status === "excused" || row.rawScore != null);
  const hasCaEvidence = weights.ca <= 0 || normalizedRows.some((row) => row.bucket === "ca" && row.status !== "excused");
  const hasExamEvidence = weights.exam <= 0 || normalizedRows.some((row) => row.bucket === "exam" && row.status !== "excused");
  const complete = allRecordedOrExcused && hasCaEvidence && hasExamEvidence;

  let effectiveTotal: number | null = null;
  if (normalizedRows.length && hasCaEvidence && hasExamEvidence && (rules.missingScorePolicy !== "blank" || complete)) {
    effectiveTotal = breakdown.ca.contribution + breakdown.exam.contribution;
  }

  return {
    total: effectiveTotal == null ? null : round(effectiveTotal, rules.rounding),
    complete,
    includedWeight: round((breakdown.ca.percentage == null ? 0 : weights.ca) + (breakdown.exam.percentage == null ? 0 : weights.exam), rules.rounding),
    breakdown: {
      ca: { ...breakdown.ca, contribution: round(breakdown.ca.contribution, rules.rounding) },
      exam: { ...breakdown.exam, contribution: round(breakdown.exam.contribution, rules.rounding) },
    },
    details,
  };
}

export function gradeForPercentage(percentage: number | null, scale: GradeBand[] = DEFAULT_GRADE_SCALE) {
  if (percentage == null) return null;
  validateGradeScale(scale);
  const band = [...scale].sort((a, b) => b.min - a.min).find((candidate) => percentage >= candidate.min && percentage <= candidate.max);
  return band?.grade ?? null;
}
