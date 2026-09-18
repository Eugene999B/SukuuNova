import { describe, expect, it } from "vitest";
import {
  createLearningPassport,
  LEARNING_PASSPORT_KIND,
  LEARNING_PASSPORT_VERSION,
  learningPassportSummary,
  normalizeLearningPassport,
} from "./learning-passport";

describe("SukuuNova Learning Passport", () => {
  it("creates a versioned normalized device-local backup", () => {
    const passport = createLearningPassport({
      progress: {
        answered: 5,
        correct: 4,
        sessions: 2,
        streak: 3,
        exposures: ["one", "one", "two"],
        mastery: { "Mathematics · Algebra": { answered: 5, correct: 4 } },
      },
      dailyHistory: [{ dateKey: "2026-09-17", score: 8, total: 10, completedAt: "2026-09-17T12:00:00.000Z" }],
      confidence: { attempts: 2, calibrationPoints: 3, maxCalibrationPoints: 4, strong: 1, fragileCorrect: 0, possibleMisconceptions: 0, topics: {} },
      confidenceCompletions: ["2026-09-17"],
    }, "2026-09-17T13:00:00.000Z");

    expect(passport.kind).toBe(LEARNING_PASSPORT_KIND);
    expect(passport.version).toBe(LEARNING_PASSPORT_VERSION);
    expect(passport.progress.exposures).toEqual(["one", "two"]);
    expect(learningPassportSummary(passport)).toMatchObject({ answers: 5, sessions: 2, masteryTopics: 1, dailyCompletions: 1, confidenceAttempts: 2 });
  });

  it("rejects unknown formats instead of silently importing them", () => {
    expect(normalizeLearningPassport({ kind: "other", version: 1 })).toBeNull();
    expect(normalizeLearningPassport({ kind: LEARNING_PASSPORT_KIND, version: 99, exportedAt: new Date().toISOString() })).toBeNull();
  });

  it("rejects passports without a valid export timestamp", () => {
    expect(normalizeLearningPassport({ kind: LEARNING_PASSPORT_KIND, version: 1, exportedAt: "not-a-date" })).toBeNull();
  });

  it("normalizes imported evidence instead of trusting malformed counts", () => {
    const imported = normalizeLearningPassport({
      kind: LEARNING_PASSPORT_KIND,
      version: LEARNING_PASSPORT_VERSION,
      exportedAt: "2026-09-17T13:00:00.000Z",
      progress: { answered: 2, correct: 99, exposures: ["x", "x"], mastery: {} },
      dailyHistory: [{ dateKey: "bad", score: 50, total: 10 }],
      confidence: { attempts: 1, calibrationPoints: 20, maxCalibrationPoints: 2, strong: 8, topics: {} },
      confidenceCompletions: ["bad", "2026-09-17"],
    });

    expect(imported?.progress.correct).toBe(2);
    expect(imported?.progress.exposures).toEqual(["x"]);
    expect(imported?.dailyHistory).toHaveLength(0);
    expect(imported?.confidence.calibrationPoints).toBe(2);
    expect(imported?.confidenceCompletions).toEqual(["2026-09-17"]);
  });
});
