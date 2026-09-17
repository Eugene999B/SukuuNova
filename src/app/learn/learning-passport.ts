import { normalizeDailyHistory, type DailyCompletion } from "./daily-challenge";
import {
  EMPTY_CONFIDENCE_RECORD,
  normalizeConfidenceRecord,
  type ConfidenceRecord,
} from "./confidence-intelligence";
import { normalizeConfidenceCompletions } from "./confidence-run";
import {
  EMPTY_LEARNER_PROGRESS,
  normalizeLearnerProgress,
  type LearnerProgress,
} from "./learner-progress";

export const LEARNING_PASSPORT_KIND = "sukuunova-learning-passport";
export const LEARNING_PASSPORT_VERSION = 1;

export type LearningPassport = {
  kind: typeof LEARNING_PASSPORT_KIND;
  version: typeof LEARNING_PASSPORT_VERSION;
  exportedAt: string;
  progress: LearnerProgress;
  dailyHistory: DailyCompletion[];
  confidence: ConfidenceRecord;
  confidenceCompletions: string[];
};

export type LearningPassportSource = {
  progress?: unknown;
  dailyHistory?: unknown;
  confidence?: unknown;
  confidenceCompletions?: unknown;
};

function validIsoTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function createLearningPassport(source: LearningPassportSource, exportedAt = new Date().toISOString()): LearningPassport {
  return {
    kind: LEARNING_PASSPORT_KIND,
    version: LEARNING_PASSPORT_VERSION,
    exportedAt: validIsoTimestamp(exportedAt) ?? new Date(0).toISOString(),
    progress: normalizeLearnerProgress(source.progress ?? EMPTY_LEARNER_PROGRESS),
    dailyHistory: normalizeDailyHistory(source.dailyHistory),
    confidence: normalizeConfidenceRecord(source.confidence ?? EMPTY_CONFIDENCE_RECORD),
    confidenceCompletions: normalizeConfidenceCompletions(source.confidenceCompletions),
  };
}

export function normalizeLearningPassport(value: unknown): LearningPassport | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<LearningPassport>;
  if (candidate.kind !== LEARNING_PASSPORT_KIND || candidate.version !== LEARNING_PASSPORT_VERSION) return null;
  const exportedAt = validIsoTimestamp(candidate.exportedAt);
  if (!exportedAt) return null;

  return createLearningPassport({
    progress: candidate.progress,
    dailyHistory: candidate.dailyHistory,
    confidence: candidate.confidence,
    confidenceCompletions: candidate.confidenceCompletions,
  }, exportedAt);
}

export function learningPassportSummary(passport: LearningPassport) {
  return {
    answers: passport.progress.answered,
    correct: passport.progress.correct,
    sessions: passport.progress.sessions,
    masteryTopics: Object.keys(passport.progress.mastery).length,
    dailyCompletions: passport.dailyHistory.length,
    confidenceAttempts: passport.confidence.attempts,
    confidenceCheckDays: passport.confidenceCompletions.length,
  };
}
