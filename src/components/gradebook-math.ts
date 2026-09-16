// Client-safe mirror of the canonical grading math in
// src/lib/assessment-engine.ts (which cannot be imported by client components
// because it pulls server-only modules). Used ONLY for the optimistic
// mark-entry preview; the server always recomputes truth on save.
// Any change here must be mirrored there and vice versa —
// tests/gradebook-parity.test.ts pins the two implementations together.

export type PreviewRules = {
  categories: Array<{ name: string; weight: number }>;
  rounding: "nearest" | "down" | "up";
  missingScorePolicy: "blank" | "zero";
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
  examination: "exam",
};

function key(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeType(value: string) {
  return TYPE_ALIASES[key(value)] ?? key(value);
}

function bucket(value: string): "ca" | "exam" {
  return normalizeType(value) === "exam" ? "exam" : "ca";
}

function roundPreview(value: number, mode: PreviewRules["rounding"]) {
  if (mode === "down") return Math.floor(value * 100) / 100;
  if (mode === "up") return Math.ceil(value * 100) / 100;
  return Math.round(value * 100) / 100;
}

export type PreviewAssessment = {
  id: string;
  type: string;
  maxScore: number;
  weight: number;
  percentage: number | null;
  status?: "present" | "absent" | "excused" | string | null;
};

export function previewSubjectTotal(items: PreviewAssessment[], rules: PreviewRules): number | null {
  if (!items.length) return null;
  const examCategory = rules.categories.find((category) => bucket(category.name) === "exam");
  if (!examCategory) return null;
  const weights = { ca: 100 - examCategory.weight, exam: examCategory.weight };
  const normalized = items.map((item) => ({ ...item, bucket: bucket(item.type) }));
  const hasCaEvidence = weights.ca <= 0 || normalized.some((row) => row.bucket === "ca" && row.status !== "excused");
  const hasExamEvidence = weights.exam <= 0 || normalized.some((row) => row.bucket === "exam" && row.status !== "excused");
  const complete = normalized.every((row) => row.status === "excused" || row.percentage != null);
  if (!hasCaEvidence || !hasExamEvidence || (rules.missingScorePolicy === "blank" && !complete)) return null;

  let total = 0;
  for (const bucketName of ["ca", "exam"] as const) {
    const rows = normalized.filter((row) => row.bucket === bucketName && row.status !== "excused");
    const effective = rules.missingScorePolicy === "zero" ? rows : rows.filter((row) => row.percentage != null);
    const possible = effective.reduce((sum, row) => sum + row.maxScore, 0);
    if (possible <= 0) continue;
    const earned = effective.reduce((sum, row) => sum + ((row.percentage ?? 0) / 100) * row.maxScore, 0);
    total += (earned / possible) * weights[bucketName];
  }
  return roundPreview(total, rules.rounding);
}
