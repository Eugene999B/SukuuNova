import {
  confidenceCalibrationPercent,
  normalizeConfidenceRecord,
  type ConfidenceRecord,
} from "./confidence-intelligence";
import { percentage, normalizeLearnerProgress, type LearnerProgress } from "./learner-progress";
import { buildMasteryMap } from "./mastery-map";

export type ReadinessStage = "baseline" | "breadth" | "depth" | "confidence" | "challenge";

export type ReadinessDimension = {
  id: "coverage" | "depth" | "accuracy" | "confidence";
  label: string;
  value: number | null;
  evidence: string;
  detail: string;
};

export type LearningReadinessProfile = {
  stage: ReadinessStage;
  title: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
  dimensions: ReadinessDimension[];
  answered: number;
  practicedTopics: number;
  totalTopics: number;
  evidenceReadyTopics: number;
  confidenceAttempts: number;
};

const STAGE_COPY: Record<ReadinessStage, Omit<LearningReadinessProfile, "stage" | "dimensions" | "answered" | "practicedTopics" | "totalTopics" | "evidenceReadyTopics" | "confidenceAttempts">> = {
  baseline: {
    title: "Build a reliable baseline",
    detail: "There is not enough practice evidence yet to make a responsible readiness recommendation.",
    actionLabel: "Build my baseline",
    actionHref: "/learn/repair",
  },
  breadth: {
    title: "Broaden your coverage",
    detail: "Your current evidence is concentrated in too few starter topics. Practise more of the map before judging overall readiness.",
    actionLabel: "Explore unseen topics",
    actionHref: "/learn/map",
  },
  depth: {
    title: "Deepen the evidence",
    detail: "You have useful breadth, but more topics need repeated evidence—or current accuracy needs repair—before harder mixed practice is the best next move.",
    actionLabel: "Strengthen weak evidence",
    actionHref: "/learn/repair",
  },
  confidence: {
    title: "Calibrate what you know",
    detail: "Your performance evidence is broad enough for harder practice, but a short confidence check can reveal fragile correct answers and possible misconception signals.",
    actionLabel: "Run confidence check",
    actionHref: "/learn/confidence",
  },
  challenge: {
    title: "Ready for harder practice",
    detail: "Your starter evidence has enough breadth, repetition, accuracy and confidence calibration to justify increasing practice difficulty. This is not an official exam prediction.",
    actionLabel: "Start a harder session",
    actionHref: "/learn/practice",
  },
};

export function buildLearningReadiness(
  rawProgress: LearnerProgress,
  rawConfidence: ConfidenceRecord,
): LearningReadinessProfile {
  const progress = normalizeLearnerProgress(rawProgress);
  const confidence = normalizeConfidenceRecord(rawConfidence);
  const map = buildMasteryMap(progress);
  const evidenceReadyTopics = map.secureTopics + map.developingTopics + map.repairTopics;
  const depthPercent = map.totalTopics ? Math.round((evidenceReadyTopics / map.totalTopics) * 100) : 0;
  const accuracy = percentage(progress.correct, progress.answered);
  const confidenceReady = confidence.attempts >= 4;
  const calibration = confidenceReady ? confidenceCalibrationPercent(confidence) : null;

  let stage: ReadinessStage;
  if (progress.answered < 10 || map.practicedTopics < 3) stage = "baseline";
  else if (map.practicedCoveragePercent < 50) stage = "breadth";
  else if (depthPercent < 40 || accuracy < 60) stage = "depth";
  else if (!confidenceReady) stage = "confidence";
  else stage = "challenge";

  return {
    stage,
    ...STAGE_COPY[stage],
    answered: progress.answered,
    practicedTopics: map.practicedTopics,
    totalTopics: map.totalTopics,
    evidenceReadyTopics,
    confidenceAttempts: confidence.attempts,
    dimensions: [
      {
        id: "coverage",
        label: "Starter-topic coverage",
        value: map.practicedCoveragePercent,
        evidence: `${map.practicedTopics}/${map.totalTopics} topics practised`,
        detail: "Breadth matters because strong results in a small slice should not look like whole-map readiness.",
      },
      {
        id: "depth",
        label: "Repeated evidence",
        value: depthPercent,
        evidence: `${evidenceReadyTopics}/${map.totalTopics} topics have at least three attempts`,
        detail: "A topic needs repeated attempts before SukuuNova treats its mastery band as meaningful.",
      },
      {
        id: "accuracy",
        label: "Lifetime accuracy",
        value: accuracy,
        evidence: `${progress.correct}/${progress.answered} answers correct`,
        detail: "Accuracy is useful only alongside breadth and repeated evidence, so it never decides readiness by itself.",
      },
      {
        id: "confidence",
        label: "Confidence calibration",
        value: calibration,
        evidence: confidenceReady ? `${confidence.attempts} calibrated attempts` : `${confidence.attempts}/4 minimum calibrated attempts`,
        detail: "Confidence calibration helps distinguish secure knowledge from lucky guesses and possible misconception signals.",
      },
    ],
  };
}
