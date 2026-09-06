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
  exam: "exam",
  examination: "exam",
};

function key(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeType(value: string) {
  return TYPE_ALIASES[key(value)] ?? key(value);
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
};

export function previewSubjectTotal(items: PreviewAssessment[], rules: PreviewRules): number | null {
  const normalized = items.map((item) => ({ ...item, normalized: normalizeType(item.type) }));
  const buckets = new Map<string, typeof normalized>();
  for (const row of normalized) {
    const bucket = buckets.get(row.normalized) ?? [];
    bucket.push(row);
    buckets.set(row.normalized, bucket);
  }
  let total = 0;
  let appliedWeight = 0;
  for (const [type, rows] of buckets) {
    const configured = rules.categories.find((c) => normalizeType(c.name) === type)?.weight;
    const weight = configured ?? rows.reduce((sum, row) => sum + row.weight, 0);
    const scored = rows.map((row) => row.percentage);
    const effective =
      rules.missingScorePolicy === "zero"
        ? scored.map((p) => p ?? 0)
        : scored.filter((p): p is number => p != null);
    if (!effective.length) {
      if (rules.missingScorePolicy === "zero") appliedWeight += weight;
      continue;
    }
    const average = effective.reduce((a, b) => a + b, 0) / effective.length;
    total += (average * weight) / 100;
    appliedWeight += weight;
  }
  void appliedWeight;
  const complete = normalized.length > 0 && normalized.every((row) => row.percentage != null);
  if (!normalized.length) return null;
  if (rules.missingScorePolicy === "blank" && !complete) return null;
  return roundPreview(total, rules.rounding);
}
