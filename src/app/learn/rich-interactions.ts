import type {
  FoundryIssue,
  FoundryReview,
  QuestionDNA,
  QuestionSource,
  VerificationCheck,
} from "./question-foundry";

export type RichInteractionKind = "matching" | "ordering";

export type MatchPrompt = {
  id: string;
  label: string;
};

export type RichInteractionOption = {
  id: string;
  label: string;
};

type RichInteractionBase = {
  id: string;
  exposureKey: string;
  kind: RichInteractionKind;
  subject: string;
  topic: string;
  skill: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  options: RichInteractionOption[];
  answer: string[];
  explanation: string;
  hint?: string;
  version: number;
  dna: QuestionDNA;
  source: QuestionSource;
  review: FoundryReview;
};

export type MatchingInteraction = RichInteractionBase & {
  kind: "matching";
  matchPrompts: MatchPrompt[];
};

export type OrderingInteraction = RichInteractionBase & {
  kind: "ordering";
  matchPrompts?: never;
};

export type RichInteractionQuestion = MatchingInteraction | OrderingInteraction;

export type RichLearnerQuestion = Omit<RichInteractionQuestion, "version" | "dna" | "source" | "review">;

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

function pushDuplicateIssues(values: string[], code: string, message: string, issues: FoundryIssue[]) {
  const normalizedValues = values.map(normalized);
  if (new Set(normalizedValues).size !== normalizedValues.length) {
    issues.push({ severity: "error", code, message });
  }
}

function validateShared(question: RichInteractionQuestion, issues: FoundryIssue[]) {
  if (!hasText(question.id, 3)) issues.push({ severity: "error", code: "id", message: "Interaction id is required." });
  if (!hasText(question.exposureKey, 3)) issues.push({ severity: "error", code: "exposure-key", message: "Exposure key is required." });
  if (!Number.isInteger(question.version) || question.version < 1) issues.push({ severity: "error", code: "version", message: "Interaction version must be a positive integer." });
  if (!hasText(question.prompt, 8)) issues.push({ severity: "error", code: "prompt", message: "Interaction prompt is too short." });
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
    issues.push({ severity: "error", code: "difficulty-mismatch", message: "Interaction difficulty must match its DNA difficulty." });
  }
  if (!Number.isFinite(question.dna.estimatedSeconds) || question.dna.estimatedSeconds < 5 || question.dna.estimatedSeconds > 3600) {
    issues.push({ severity: "error", code: "estimated-seconds", message: "Estimated response time must be between 5 and 3600 seconds." });
  }

  if (!hasText(question.source.name, 2)) {
    issues.push({ severity: "error", code: "source-name", message: "Every interaction needs source provenance." });
  }
  if (question.source.kind !== "original" && !hasText(question.source.license, 2)) {
    issues.push({ severity: "error", code: "source-license", message: "Open and licensed interactions must record their licence." });
  }

  if (!Number.isFinite(question.review.confidence) || question.review.confidence < 0 || question.review.confidence > 1) {
    issues.push({ severity: "error", code: "review-confidence", message: "Review confidence must be between 0 and 1." });
  }

  const checks = new Set(question.review.checks);
  if (question.review.status === "published") {
    for (const required of REQUIRED_PUBLISH_CHECKS) {
      if (!checks.has(required)) {
        issues.push({ severity: "error", code: `publish-${required}`, message: `Published interactions require ${required}.` });
      }
    }
    if (question.review.confidence < 0.9) {
      issues.push({ severity: "error", code: "publish-confidence", message: "Published interactions require at least 0.90 review confidence." });
    }
  }

  if (question.options.length < 2) {
    issues.push({ severity: "error", code: "options", message: "Rich interactions need at least two selectable options." });
  }
  pushDuplicateIssues(question.options.map((option) => option.id), "duplicate-option-id", "Option ids must be unique.", issues);
  pushDuplicateIssues(question.options.map((option) => option.label), "duplicate-option-label", "Option labels must be unique.", issues);
}

export function validateRichInteraction(question: RichInteractionQuestion): FoundryIssue[] {
  const issues: FoundryIssue[] = [];
  validateShared(question, issues);

  const optionIds = new Set(question.options.map((option) => option.id));

  if (question.kind === "matching") {
    if (question.matchPrompts.length < 2) {
      issues.push({ severity: "error", code: "matching-prompts", message: "Matching interactions need at least two left-side prompts." });
    }
    pushDuplicateIssues(question.matchPrompts.map((item) => item.id), "duplicate-match-id", "Matching prompt ids must be unique.", issues);
    pushDuplicateIssues(question.matchPrompts.map((item) => item.label), "duplicate-match-label", "Matching prompt labels must be unique.", issues);

    if (question.answer.length !== question.matchPrompts.length) {
      issues.push({ severity: "error", code: "matching-answer-length", message: "Matching answers must contain one option id for each prompt." });
    }
    if (question.answer.some((answer) => !optionIds.has(answer))) {
      issues.push({ severity: "error", code: "matching-answer-option", message: "Every matching answer must reference an existing option id." });
    }
    if (new Set(question.answer).size !== question.answer.length) {
      issues.push({ severity: "error", code: "matching-answer-repeat", message: "Starter matching interactions must use each answer option once." });
    }
  }

  if (question.kind === "ordering") {
    if (question.options.length < 3) {
      issues.push({ severity: "error", code: "ordering-options", message: "Ordering interactions need at least three items." });
    }
    if (question.answer.length !== question.options.length) {
      issues.push({ severity: "error", code: "ordering-answer-length", message: "Ordering answers must include every option exactly once." });
    }
    if (question.answer.some((answer) => !optionIds.has(answer)) || new Set(question.answer).size !== question.answer.length) {
      issues.push({ severity: "error", code: "ordering-answer-options", message: "Ordering answers must be a unique sequence of existing option ids." });
    }
    if (question.options.some((option) => !question.answer.includes(option.id))) {
      issues.push({ severity: "error", code: "ordering-missing-option", message: "Ordering answers must include every displayed item." });
    }
  }

  return issues;
}

export function isRichInteractionPublishable(question: RichInteractionQuestion) {
  const checks = new Set(question.review.checks);
  const statusReady = question.review.status === "verified" || question.review.status === "published";
  const checksReady = REQUIRED_PUBLISH_CHECKS.every((check) => checks.has(check));
  return statusReady && checksReady && question.review.confidence >= 0.9 && !validateRichInteraction(question).some((issue) => issue.severity === "error");
}

export function releaseRichInteraction(question: RichInteractionQuestion): RichLearnerQuestion | null {
  if (!isRichInteractionPublishable(question)) return null;
  if (question.kind === "matching") {
    return {
      id: question.id,
      exposureKey: question.exposureKey,
      kind: question.kind,
      subject: question.subject,
      topic: question.topic,
      skill: question.skill,
      difficulty: question.difficulty,
      prompt: question.prompt,
      options: question.options,
      answer: question.answer,
      explanation: question.explanation,
      hint: question.hint,
      matchPrompts: question.matchPrompts,
    };
  }
  return {
    id: question.id,
    exposureKey: question.exposureKey,
    kind: question.kind,
    subject: question.subject,
    topic: question.topic,
    skill: question.skill,
    difficulty: question.difficulty,
    prompt: question.prompt,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation,
    hint: question.hint,
  };
}

export function isRichInteractionCorrect(question: RichLearnerQuestion, response: string[]) {
  return response.length === question.answer.length && question.answer.every((answer, index) => response[index] === answer);
}

export function richInteractionLabel(kind: RichInteractionKind) {
  return kind === "matching" ? "Matching" : "Ordering";
}
