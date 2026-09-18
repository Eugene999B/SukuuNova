export const CONFIDENCE_STORAGE_KEY = "sukuunova-learn-confidence-v1";

export type ConfidenceLevel = "unsure" | "somewhat" | "sure";
export type ConfidenceSignal = "strong" | "stable" | "fragile" | "possible-misconception" | "gap" | "discovery";

export type ConfidenceAttempt = {
  topicKey: string;
  correct: boolean;
  confidence: ConfidenceLevel;
};

export type TopicConfidenceRecord = {
  attempts: number;
  strong: number;
  fragileCorrect: number;
  possibleMisconceptions: number;
};

export type ConfidenceRecord = {
  attempts: number;
  calibrationPoints: number;
  maxCalibrationPoints: number;
  strong: number;
  fragileCorrect: number;
  possibleMisconceptions: number;
  topics: Record<string, TopicConfidenceRecord>;
};

export type ConfidenceEvaluation = {
  signal: ConfidenceSignal;
  title: string;
  explanation: string;
  calibrationPoints: number;
  maxCalibrationPoints: number;
};

export const EMPTY_CONFIDENCE_RECORD: ConfidenceRecord = {
  attempts: 0,
  calibrationPoints: 0,
  maxCalibrationPoints: 0,
  strong: 0,
  fragileCorrect: 0,
  possibleMisconceptions: 0,
  topics: {},
};

function finiteCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function normalizeConfidenceRecord(value: unknown): ConfidenceRecord {
  if (!value || typeof value !== "object") return { ...EMPTY_CONFIDENCE_RECORD };
  const candidate = value as Partial<ConfidenceRecord>;
  const topics: Record<string, TopicConfidenceRecord> = {};

  if (candidate.topics && typeof candidate.topics === "object") {
    for (const [key, raw] of Object.entries(candidate.topics)) {
      if (!raw || typeof raw !== "object") continue;
      const topic = raw as Partial<TopicConfidenceRecord>;
      const attempts = finiteCount(topic.attempts);
      if (!attempts) continue;
      topics[key] = {
        attempts,
        strong: Math.min(attempts, finiteCount(topic.strong)),
        fragileCorrect: Math.min(attempts, finiteCount(topic.fragileCorrect)),
        possibleMisconceptions: Math.min(attempts, finiteCount(topic.possibleMisconceptions)),
      };
    }
  }

  const attempts = finiteCount(candidate.attempts);
  const maxCalibrationPoints = Math.min(attempts * 2, finiteCount(candidate.maxCalibrationPoints));
  return {
    attempts,
    calibrationPoints: Math.min(maxCalibrationPoints, finiteCount(candidate.calibrationPoints)),
    maxCalibrationPoints,
    strong: Math.min(attempts, finiteCount(candidate.strong)),
    fragileCorrect: Math.min(attempts, finiteCount(candidate.fragileCorrect)),
    possibleMisconceptions: Math.min(attempts, finiteCount(candidate.possibleMisconceptions)),
    topics,
  };
}

export function evaluateConfidence(correct: boolean, confidence: ConfidenceLevel): ConfidenceEvaluation {
  if (correct && confidence === "sure") {
    return {
      signal: "strong",
      title: "Strong evidence",
      explanation: "You were correct and highly confident. Repeated evidence like this can support a secure mastery judgement.",
      calibrationPoints: 2,
      maxCalibrationPoints: 2,
    };
  }

  if (correct && confidence === "somewhat") {
    return {
      signal: "stable",
      title: "Useful evidence",
      explanation: "You were correct with moderate confidence. Keep practising until the answer feels reliably retrievable.",
      calibrationPoints: 1,
      maxCalibrationPoints: 2,
    };
  }

  if (correct) {
    return {
      signal: "fragile",
      title: "Correct, but fragile",
      explanation: "You were correct while unsure. Treat this as promising evidence, not proof that the idea is fully secure yet.",
      calibrationPoints: 0,
      maxCalibrationPoints: 2,
    };
  }

  if (confidence === "sure") {
    return {
      signal: "possible-misconception",
      title: "Possible misconception signal",
      explanation: "You were highly confident but incorrect. That can be a useful signal to inspect the explanation closely; it is not a diagnosis.",
      calibrationPoints: 0,
      maxCalibrationPoints: 2,
    };
  }

  if (confidence === "somewhat") {
    return {
      signal: "gap",
      title: "Learning gap",
      explanation: "You were incorrect with moderate confidence. Use the explanation and another attempt to strengthen the idea.",
      calibrationPoints: 1,
      maxCalibrationPoints: 2,
    };
  }

  return {
    signal: "discovery",
    title: "Good uncertainty awareness",
    explanation: "You were unsure and incorrect. Recognising uncertainty is useful because it tells SukuuNova where learning support may help.",
    calibrationPoints: 2,
    maxCalibrationPoints: 2,
  };
}

export function recordConfidenceAttempt(record: ConfidenceRecord, attempt: ConfidenceAttempt): ConfidenceRecord {
  const normalized = normalizeConfidenceRecord(record);
  const evaluation = evaluateConfidence(attempt.correct, attempt.confidence);
  const previous = normalized.topics[attempt.topicKey] ?? { attempts: 0, strong: 0, fragileCorrect: 0, possibleMisconceptions: 0 };
  const strong = evaluation.signal === "strong" ? 1 : 0;
  const fragileCorrect = evaluation.signal === "fragile" ? 1 : 0;
  const possibleMisconception = evaluation.signal === "possible-misconception" ? 1 : 0;

  return {
    attempts: normalized.attempts + 1,
    calibrationPoints: normalized.calibrationPoints + evaluation.calibrationPoints,
    maxCalibrationPoints: normalized.maxCalibrationPoints + evaluation.maxCalibrationPoints,
    strong: normalized.strong + strong,
    fragileCorrect: normalized.fragileCorrect + fragileCorrect,
    possibleMisconceptions: normalized.possibleMisconceptions + possibleMisconception,
    topics: {
      ...normalized.topics,
      [attempt.topicKey]: {
        attempts: previous.attempts + 1,
        strong: previous.strong + strong,
        fragileCorrect: previous.fragileCorrect + fragileCorrect,
        possibleMisconceptions: previous.possibleMisconceptions + possibleMisconception,
      },
    },
  };
}

export function confidenceCalibrationPercent(record: ConfidenceRecord) {
  const normalized = normalizeConfidenceRecord(record);
  if (!normalized.maxCalibrationPoints) return 0;
  return Math.round((normalized.calibrationPoints / normalized.maxCalibrationPoints) * 100);
}

export function confidencePriorityTopics(record: ConfidenceRecord) {
  const normalized = normalizeConfidenceRecord(record);
  return Object.entries(normalized.topics)
    .map(([key, value]) => ({ key, ...value }))
    .filter((item) => item.possibleMisconceptions > 0 || item.fragileCorrect > 0)
    .sort((left, right) => right.possibleMisconceptions - left.possibleMisconceptions || right.fragileCorrect - left.fragileCorrect || right.attempts - left.attempts);
}
