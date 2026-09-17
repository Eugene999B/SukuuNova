import type { ConfidenceLevel } from "./confidence-intelligence";

export const CONFIDENCE_RUN_STORAGE_KEY = "sukuunova-learn-confidence-run-v1";
export const CONFIDENCE_COMPLETION_STORAGE_KEY = "sukuunova-learn-confidence-completions-v1";

export type ConfidenceResponseValue = string | string[] | number | boolean;

export type ConfidenceRunState = {
  dateKey: string;
  questionIndex: number;
  score: number;
  submitted: boolean;
  lastCorrect: boolean;
  response: ConfidenceResponseValue;
  confidence: ConfidenceLevel | null;
};

export function emptyConfidenceRun(dateKey: string): ConfidenceRunState {
  return {
    dateKey,
    questionIndex: 0,
    score: 0,
    submitted: false,
    lastCorrect: false,
    response: "",
    confidence: null,
  };
}

function validResponse(value: unknown): ConfidenceResponseValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return "";
}

function validConfidence(value: unknown): ConfidenceLevel | null {
  return value === "unsure" || value === "somewhat" || value === "sure" ? value : null;
}

export function normalizeConfidenceRun(value: unknown, dateKey: string, sessionLength: number): ConfidenceRunState {
  if (!value || typeof value !== "object") return emptyConfidenceRun(dateKey);
  const candidate = value as Partial<ConfidenceRunState>;
  if (candidate.dateKey !== dateKey) return emptyConfidenceRun(dateKey);

  const maxIndex = Math.max(0, sessionLength - 1);
  const questionIndex = typeof candidate.questionIndex === "number" && Number.isFinite(candidate.questionIndex)
    ? Math.min(maxIndex, Math.max(0, Math.floor(candidate.questionIndex)))
    : 0;
  const submitted = candidate.submitted === true;
  const answeredSoFar = questionIndex + (submitted ? 1 : 0);
  const score = typeof candidate.score === "number" && Number.isFinite(candidate.score)
    ? Math.min(answeredSoFar, Math.max(0, Math.floor(candidate.score)))
    : 0;

  return {
    dateKey,
    questionIndex,
    score,
    submitted,
    lastCorrect: submitted && candidate.lastCorrect === true,
    response: validResponse(candidate.response),
    confidence: validConfidence(candidate.confidence),
  };
}

export function normalizeConfidenceCompletions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item))))
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 90);
}

export function recordConfidenceCompletion(completions: string[], dateKey: string) {
  return normalizeConfidenceCompletions([dateKey, ...completions]);
}
