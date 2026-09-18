import { describe, expect, it } from "vitest";
import { EMPTY_CONFIDENCE_RECORD, type ConfidenceRecord } from "./confidence-intelligence";
import { SCHOOL_STARTER_TOPIC_COVERAGE } from "./content-coverage";
import { normalizeLearnerProgress, type LearnerProgress } from "./learner-progress";
import { buildLearningReadiness } from "./readiness-intelligence";

function progressFor(topicCount: number, attemptsPerTopic: number, correctPerTopic: number): LearnerProgress {
  const mastery = Object.fromEntries(
    SCHOOL_STARTER_TOPIC_COVERAGE.slice(0, topicCount).map((entry) => [
      `${entry.subject} · ${entry.topic}`,
      { answered: attemptsPerTopic, correct: correctPerTopic },
    ]),
  );
  return normalizeLearnerProgress({
    sessions: Math.max(1, Math.ceil(topicCount / 2)),
    answered: topicCount * attemptsPerTopic,
    correct: topicCount * correctPerTopic,
    streak: 0,
    exposures: [],
    mastery,
  });
}

const calibratedConfidence: ConfidenceRecord = {
  attempts: 4,
  calibrationPoints: 6,
  maxCalibrationPoints: 8,
  strong: 2,
  fragileCorrect: 1,
  possibleMisconceptions: 0,
  topics: {},
};

describe("SukuuNova transparent learning readiness", () => {
  it("requires a baseline before making a readiness recommendation", () => {
    const profile = buildLearningReadiness(normalizeLearnerProgress({}), EMPTY_CONFIDENCE_RECORD);
    expect(profile.stage).toBe("baseline");
    expect(profile.dimensions.find((item) => item.id === "confidence")?.value).toBeNull();
  });

  it("does not let concentrated practice masquerade as broad readiness", () => {
    const profile = buildLearningReadiness(progressFor(4, 3, 3), calibratedConfidence);
    expect(profile.stage).toBe("breadth");
    expect(profile.dimensions.find((item) => item.id === "coverage")?.value).toBe(20);
  });

  it("asks for repeated evidence after breadth exists but depth does not", () => {
    const profile = buildLearningReadiness(progressFor(10, 1, 1), calibratedConfidence);
    expect(profile.stage).toBe("depth");
    expect(profile.evidenceReadyTopics).toBe(0);
  });

  it("keeps low accuracy in the deepen-evidence stage even with repeated attempts", () => {
    const profile = buildLearningReadiness(progressFor(10, 3, 1), calibratedConfidence);
    expect(profile.stage).toBe("depth");
    expect(profile.dimensions.find((item) => item.id === "accuracy")?.value).toBe(33);
  });

  it("requests confidence calibration only after breadth, depth and accuracy are sufficient", () => {
    const profile = buildLearningReadiness(progressFor(10, 3, 2), EMPTY_CONFIDENCE_RECORD);
    expect(profile.stage).toBe("confidence");
    expect(profile.actionHref).toBe("/learn/confidence");
  });

  it("recommends harder practice only when all transparent starter gates have evidence", () => {
    const profile = buildLearningReadiness(progressFor(10, 3, 2), calibratedConfidence);
    expect(profile.stage).toBe("challenge");
    expect(profile.title).toBe("Ready for harder practice");
    expect(profile.dimensions.find((item) => item.id === "confidence")?.value).toBe(75);
  });
});
