import type { LearnQuestion, QuestionKind } from "./learn-domain";

export type CognitiveSkill = "remember" | "understand" | "apply" | "analyse" | "evaluate" | "create";
export type FoundryStatus = "draft" | "verified" | "held" | "published";
export type SourceKind = "original" | "open" | "licensed";
export type VerificationCheck =
  | "answer-check"
  | "ambiguity-check"
  | "curriculum-check"
  | "duplicate-check"
  | "age-check";

export type QuestionDNA = {
  country?: string;
  framework: string;
  frameworkVersion: string;
  level: string;
  subject: string;
  topic: string;
  objective: string;
  skill: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitiveSkill: CognitiveSkill;
  language: string;
  estimatedSeconds: number;
};

export type QuestionSource = {
  kind: SourceKind;
  name: string;
  license?: string;
  reference?: string;
};

export type FoundryReview = {
  status: FoundryStatus;
  checks: VerificationCheck[];
  confidence: number;
  reviewer?: string;
  reviewedAt?: string;
};

export type FoundryQuestion = LearnQuestion & {
  version: number;
  dna: QuestionDNA;
  source: QuestionSource;
  review: FoundryReview;
};

export type FoundryIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

const REQUIRED_PUBLISH_CHECKS: VerificationCheck[] = [
  "answer-check",
  "ambiguity-check",
  "curriculum-check",
  "duplicate-check",
  "age-check",
];

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasText(value: string | undefined, minimum = 1) {
  return Boolean(value && value.trim().length >= minimum);
}

function optionIds(question: FoundryQuestion) {
  return new Set((question.options ?? []).map((option) => option.id));
}

function validateAnswerShape(question: FoundryQuestion, issues: FoundryIssue[]) {
  const options = question.options ?? [];
  const ids = optionIds(question);

  if (question.kind === "single") {
    if (options.length < 2) {
      issues.push({ severity: "error", code: "single-options", message: "Single-choice questions need at least two options." });
    }
    if (typeof question.answer !== "string" || !ids.has(question.answer)) {
      issues.push({ severity: "error", code: "single-answer", message: "Single-choice answer must reference an existing option id." });
    }
  }

  if (question.kind === "multi") {
    if (options.length < 2) {
      issues.push({ severity: "error", code: "multi-options", message: "Multi-select questions need at least two options." });
    }
    if (!Array.isArray(question.answer) || question.answer.length < 2 || question.answer.some((answer) => !ids.has(answer))) {
      issues.push({ severity: "error", code: "multi-answer", message: "Multi-select answers must reference at least two existing option ids." });
    }
  }

  if (question.kind === "numeric" && (typeof question.answer !== "number" || !Number.isFinite(question.answer))) {
    issues.push({ severity: "error", code: "numeric-answer", message: "Numeric questions require a finite numeric answer." });
  }

  if (question.kind === "boolean" && typeof question.answer !== "boolean") {
    issues.push({ severity: "error", code: "boolean-answer", message: "True/false questions require a boolean answer." });
  }

  if (["fill", "short"].includes(question.kind)) {
    const accepted = question.acceptedAnswers ?? [];
    const direct = typeof question.answer === "string" ? question.answer : "";
    if (!hasText(direct) && !accepted.some((answer) => hasText(answer))) {
      issues.push({ severity: "error", code: "text-answer", message: "Text-response questions require at least one accepted answer." });
    }
  }

  if (options.length) {
    const normalizedIds = options.map((option) => normalized(option.id));
    const normalizedLabels = options.map((option) => normalized(option.label));
    if (new Set(normalizedIds).size !== normalizedIds.length) {
      issues.push({ severity: "error", code: "duplicate-option-id", message: "Option ids must be unique." });
    }
    if (new Set(normalizedLabels).size !== normalizedLabels.length) {
      issues.push({ severity: "warning", code: "duplicate-option-label", message: "Option labels should be unique to avoid ambiguity." });
    }
  }
}

export function validateFoundryQuestion(question: FoundryQuestion): FoundryIssue[] {
  const issues: FoundryIssue[] = [];

  if (!hasText(question.id, 3)) issues.push({ severity: "error", code: "id", message: "Question id is required." });
  if (!hasText(question.exposureKey, 3)) issues.push({ severity: "error", code: "exposure-key", message: "Exposure key is required." });
  if (!Number.isInteger(question.version) || question.version < 1) issues.push({ severity: "error", code: "version", message: "Question version must be a positive integer." });
  if (!hasText(question.prompt, 8)) issues.push({ severity: "error", code: "prompt", message: "Question prompt is too short." });
  if (!hasText(question.explanation, 12)) issues.push({ severity: "error", code: "explanation", message: "A meaningful explanation is required." });

  const dnaFields: Array<[string, string]> = [
    ["framework", question.dna.framework],
    ["frameworkVersion", question.dna.frameworkVersion],
    ["level", question.dna.level],
    ["subject", question.dna.subject],
    ["topic", question.dna.topic],
    ["objective", question.dna.objective],
    ["skill", question.dna.skill],
    ["language", question.dna.language],
  ];
  for (const [name, value] of dnaFields) {
    if (!hasText(value)) issues.push({ severity: "error", code: `dna-${name}`, message: `Question DNA field ${name} is required.` });
  }

  if (question.dna.difficulty !== question.difficulty) {
    issues.push({ severity: "error", code: "difficulty-mismatch", message: "Question difficulty must match its DNA difficulty." });
  }
  if (!Number.isFinite(question.dna.estimatedSeconds) || question.dna.estimatedSeconds < 5 || question.dna.estimatedSeconds > 3600) {
    issues.push({ severity: "error", code: "estimated-seconds", message: "Estimated response time must be between 5 and 3600 seconds." });
  }

  if (!hasText(question.source.name, 2)) {
    issues.push({ severity: "error", code: "source-name", message: "Every question needs source provenance." });
  }
  if (question.source.kind !== "original" && !hasText(question.source.license, 2)) {
    issues.push({ severity: "error", code: "source-license", message: "Open and licensed content must record its licence." });
  }

  if (!Number.isFinite(question.review.confidence) || question.review.confidence < 0 || question.review.confidence > 1) {
    issues.push({ severity: "error", code: "review-confidence", message: "Review confidence must be between 0 and 1." });
  }

  const checks = new Set(question.review.checks);
  if (question.review.status === "published") {
    for (const required of REQUIRED_PUBLISH_CHECKS) {
      if (!checks.has(required)) {
        issues.push({ severity: "error", code: `publish-${required}`, message: `Published questions require ${required}.` });
      }
    }
    if (question.review.confidence < 0.9) {
      issues.push({ severity: "error", code: "publish-confidence", message: "Published questions require at least 0.90 review confidence." });
    }
  }

  validateAnswerShape(question, issues);
  return issues;
}

export function isPublishable(question: FoundryQuestion) {
  const issues = validateFoundryQuestion(question);
  const statusReady = question.review.status === "verified" || question.review.status === "published";
  const checks = new Set(question.review.checks);
  const checksReady = REQUIRED_PUBLISH_CHECKS.every((check) => checks.has(check));
  return statusReady && checksReady && question.review.confidence >= 0.9 && !issues.some((issue) => issue.severity === "error");
}

export function releaseQuestion(question: FoundryQuestion): LearnQuestion | null {
  if (!isPublishable(question)) return null;
  const { version: _version, dna: _dna, source: _source, review: _review, ...learnQuestion } = question;
  return learnQuestion;
}

function promptFingerprint(prompt: string) {
  return normalized(prompt).replace(/[^a-z0-9 ]/g, "");
}

export function auditQuestionPack(questions: FoundryQuestion[]) {
  const issuesByQuestion = new Map<string, FoundryIssue[]>();
  const exposureCounts = new Map<string, number>();
  const promptCounts = new Map<string, number>();

  for (const question of questions) {
    issuesByQuestion.set(question.id, validateFoundryQuestion(question));
    exposureCounts.set(question.exposureKey, (exposureCounts.get(question.exposureKey) ?? 0) + 1);
    const fingerprint = promptFingerprint(question.prompt);
    promptCounts.set(fingerprint, (promptCounts.get(fingerprint) ?? 0) + 1);
  }

  const duplicateExposureKeys = Array.from(exposureCounts.entries()).filter(([, count]) => count > 1).map(([key]) => key);
  const duplicatePrompts = Array.from(promptCounts.entries()).filter(([, count]) => count > 1).map(([fingerprint]) => fingerprint);
  const publishable = questions.filter(isPublishable).length;
  const errors = Array.from(issuesByQuestion.values()).flat().filter((issue) => issue.severity === "error").length;
  const warnings = Array.from(issuesByQuestion.values()).flat().filter((issue) => issue.severity === "warning").length;

  return {
    total: questions.length,
    publishable,
    held: questions.length - publishable,
    errors,
    warnings,
    duplicateExposureKeys,
    duplicatePrompts,
    issuesByQuestion,
  };
}

export function questionKindLabel(kind: QuestionKind) {
  const labels: Record<QuestionKind, string> = {
    single: "Single choice",
    multi: "Multi-select",
    fill: "Fill in the blank",
    numeric: "Numeric response",
    boolean: "True / false",
    short: "Short response",
  };
  return labels[kind];
}
