import { questionKindLabel, isPublishable, validateFoundryQuestion } from "./question-foundry";
import { STANDARD_FOUNDRY_PACK } from "./verified-content";
import { isRichInteractionPublishable, richInteractionLabel, validateRichInteraction } from "./rich-interactions";
import { RICH_STARTER_FOUNDRY_PACK } from "./rich-starter-pack";

export type FoundryFamily = "standard" | "rich";
export type QueueStatus = "publishable" | "held";

export type FoundryReviewRow = {
  id: string;
  exposureKey: string;
  family: FoundryFamily;
  format: string;
  subject: string;
  topic: string;
  skill: string;
  prompt: string;
  objective: string;
  framework: string;
  frameworkVersion: string;
  version: number;
  difficulty: number;
  sourceKind: string;
  sourceName: string;
  sourceLicense?: string;
  reviewStatus: string;
  reviewer: string;
  reviewedAt?: string;
  confidence: number;
  checks: string[];
  status: QueueStatus;
  errors: number;
  warnings: number;
  issueCodes: string[];
};

const standardRows: FoundryReviewRow[] = STANDARD_FOUNDRY_PACK.map((question) => {
  const issues = validateFoundryQuestion(question);
  return {
    id: question.id,
    exposureKey: question.exposureKey,
    family: "standard",
    format: questionKindLabel(question.kind),
    subject: question.subject,
    topic: question.topic,
    skill: question.skill,
    prompt: question.prompt,
    objective: question.dna.objective,
    framework: question.dna.framework,
    frameworkVersion: question.dna.frameworkVersion,
    version: question.version,
    difficulty: question.difficulty,
    sourceKind: question.source.kind,
    sourceName: question.source.name,
    sourceLicense: question.source.license,
    reviewStatus: question.review.status,
    reviewer: question.review.reviewer ?? "Unassigned",
    reviewedAt: question.review.reviewedAt,
    confidence: question.review.confidence,
    checks: [...question.review.checks],
    status: isPublishable(question) ? "publishable" : "held",
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issueCodes: issues.map((issue) => issue.code),
  };
});

const richRows: FoundryReviewRow[] = RICH_STARTER_FOUNDRY_PACK.map((question) => {
  const issues = validateRichInteraction(question);
  return {
    id: question.id,
    exposureKey: question.exposureKey,
    family: "rich",
    format: richInteractionLabel(question.kind),
    subject: question.subject,
    topic: question.topic,
    skill: question.skill,
    prompt: question.prompt,
    objective: question.dna.objective,
    framework: question.dna.framework,
    frameworkVersion: question.dna.frameworkVersion,
    version: question.version,
    difficulty: question.difficulty,
    sourceKind: question.source.kind,
    sourceName: question.source.name,
    sourceLicense: question.source.license,
    reviewStatus: question.review.status,
    reviewer: question.review.reviewer ?? "Unassigned",
    reviewedAt: question.review.reviewedAt,
    confidence: question.review.confidence,
    checks: [...question.review.checks],
    status: isRichInteractionPublishable(question) ? "publishable" : "held",
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issueCodes: issues.map((issue) => issue.code),
  };
});

export const FOUNDRY_REVIEW_ROWS = [...standardRows, ...richRows];

function buildSummary(rows: FoundryReviewRow[]) {
  const publishable = rows.filter((row) => row.status === "publishable").length;
  const errors = rows.reduce((total, row) => total + row.errors, 0);
  const warnings = rows.reduce((total, row) => total + row.warnings, 0);
  const confidenceTotal = rows.reduce((total, row) => total + row.confidence, 0);
  return {
    total: rows.length,
    publishable,
    held: rows.length - publishable,
    errors,
    warnings,
    standard: rows.filter((row) => row.family === "standard").length,
    rich: rows.filter((row) => row.family === "rich").length,
    averageConfidence: rows.length ? confidenceTotal / rows.length : 0,
    subjects: Array.from(new Set(rows.map((row) => row.subject))).sort(),
  };
}

export const FOUNDRY_REVIEW_SUMMARY = buildSummary(FOUNDRY_REVIEW_ROWS);

export function filterFoundryRows(input: {
  family?: "all" | FoundryFamily;
  status?: "all" | QueueStatus;
  subject?: "all" | string;
  query?: string;
}) {
  const family = input.family ?? "all";
  const status = input.status ?? "all";
  const subject = input.subject ?? "all";
  const query = (input.query ?? "").trim().toLowerCase();

  return FOUNDRY_REVIEW_ROWS.filter((row) => {
    if (family !== "all" && row.family !== family) return false;
    if (status !== "all" && row.status !== status) return false;
    if (subject !== "all" && row.subject !== subject) return false;
    if (!query) return true;
    return [row.id, row.subject, row.topic, row.skill, row.format, row.prompt, row.objective]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}
