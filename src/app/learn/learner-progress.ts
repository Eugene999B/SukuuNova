export const LEARNER_PROGRESS_STORAGE_KEY = "sukuunova-learn-progress-v1";

export type TopicMasteryRecord = {
  answered: number;
  correct: number;
};

export type ConfidenceLevel = "low" | "medium" | "high";

export type ConfidenceRecord = {
  answered: number;
  correct: number;
};

export type LearnerProgress = {
  sessions: number;
  answered: number;
  correct: number;
  streak: number;
  xp: number;
  exposures: string[];
  mastery: Record<string, TopicMasteryRecord>;
  confidence: Record<ConfidenceLevel, ConfidenceRecord>;
};

export type MasteryBand = "repair" | "developing" | "secure" | "evidence";

export type TopicProgress = {
  key: string;
  subject: string;
  topic: string;
  answered: number;
  correct: number;
  accuracy: number;
  band: MasteryBand;
};

export const EMPTY_LEARNER_PROGRESS: LearnerProgress = {
  sessions: 0,
  answered: 0,
  correct: 0,
  streak: 0,
  xp: 0,
  exposures: [],
  mastery: {},
  confidence: {
    low: { answered: 0, correct: 0 },
    medium: { answered: 0, correct: 0 },
    high: { answered: 0, correct: 0 },
  },
};

function finiteCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeRecord(value: unknown): TopicMasteryRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { answered?: unknown; correct?: unknown };
  const answered = finiteCount(candidate.answered);
  const correct = Math.min(answered, finiteCount(candidate.correct));
  if (!answered) return null;
  return { answered, correct };
}

function normalizeConfidenceRecord(value: unknown): ConfidenceRecord {
  if (!value || typeof value !== "object") return { answered: 0, correct: 0 };
  const candidate = value as { answered?: unknown; correct?: unknown };
  const answered = finiteCount(candidate.answered);
  return {
    answered,
    correct: Math.min(answered, finiteCount(candidate.correct)),
  };
}

export function normalizeLearnerProgress(value: unknown): LearnerProgress {
  if (!value || typeof value !== "object") return { ...EMPTY_LEARNER_PROGRESS };
  const candidate = value as Partial<LearnerProgress>;
  const mastery: Record<string, TopicMasteryRecord> = {};

  if (candidate.mastery && typeof candidate.mastery === "object") {
    for (const [key, record] of Object.entries(candidate.mastery)) {
      const normalized = normalizeRecord(record);
      if (normalized) mastery[key] = normalized;
    }
  }

  const answered = finiteCount(candidate.answered);
  const correct = Math.min(answered, finiteCount(candidate.correct));
  const exposures = Array.isArray(candidate.exposures)
    ? Array.from(new Set(candidate.exposures.filter((item): item is string => typeof item === "string" && item.length > 0))).slice(0, 200)
    : [];

  return {
    sessions: finiteCount(candidate.sessions),
    answered,
    correct,
    streak: finiteCount(candidate.streak),
    xp: finiteCount(candidate.xp),
    exposures,
    mastery,
    confidence: {
      low: normalizeConfidenceRecord(candidate.confidence?.low),
      medium: normalizeConfidenceRecord(candidate.confidence?.medium),
      high: normalizeConfidenceRecord(candidate.confidence?.high),
    },
  };
}

export function percentage(correct: number, answered: number) {
  return answered ? Math.round((correct / answered) * 100) : 0;
}

export function masteryBand(answered: number, accuracy: number): MasteryBand {
  if (answered < 3) return "evidence";
  if (accuracy < 60) return "repair";
  if (accuracy < 80) return "developing";
  return "secure";
}

function splitMasteryKey(key: string) {
  const [subject, ...topicParts] = key.split(" · ");
  return {
    subject: subject?.trim() || "Learning",
    topic: topicParts.join(" · ").trim() || "General practice",
  };
}

export function topicProgress(progress: LearnerProgress): TopicProgress[] {
  return Object.entries(progress.mastery)
    .map(([key, record]) => {
      const accuracy = percentage(record.correct, record.answered);
      const labels = splitMasteryKey(key);
      return {
        key,
        ...labels,
        answered: record.answered,
        correct: record.correct,
        accuracy,
        band: masteryBand(record.answered, accuracy),
      };
    })
    .sort((left, right) => {
      const bandOrder: Record<MasteryBand, number> = { repair: 0, developing: 1, evidence: 2, secure: 3 };
      return bandOrder[left.band] - bandOrder[right.band] || left.accuracy - right.accuracy || right.answered - left.answered;
    });
}

export function buildProgressSnapshot(progress: LearnerProgress) {
  const topics = topicProgress(progress);
  const repair = topics.filter((topic) => topic.band === "repair");
  const developing = topics.filter((topic) => topic.band === "developing");
  const evidence = topics.filter((topic) => topic.band === "evidence");
  const secure = topics.filter((topic) => topic.band === "secure");
  const priority = repair[0] ?? developing[0] ?? evidence[0] ?? null;

  return {
    lifetimeAccuracy: percentage(progress.correct, progress.answered),
    topics,
    repair,
    developing,
    evidence,
    secure,
    priority,
    uniqueExposureCount: progress.exposures.length,
    confidenceCalibration: {
      low: percentage(progress.confidence.low.correct, progress.confidence.low.answered),
      medium: percentage(progress.confidence.medium.correct, progress.confidence.medium.answered),
      high: percentage(progress.confidence.high.correct, progress.confidence.high.answered),
      overconfidence:
        progress.confidence.high.answered >= 3
        && percentage(progress.confidence.high.correct, progress.confidence.high.answered) < 60,
    },
  };
}
