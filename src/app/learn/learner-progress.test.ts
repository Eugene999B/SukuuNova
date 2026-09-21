import { describe, expect, it } from "vitest";
import {
  buildProgressSnapshot,
  masteryBand,
  normalizeLearnerProgress,
  percentage,
} from "./learner-progress";

describe("SukuuNova learner progress intelligence", () => {
  it("normalizes malformed local progress without trusting impossible counts", () => {
    const progress = normalizeLearnerProgress({
      sessions: 4.8,
      answered: 5,
      correct: 9,
      streak: -3,
      xp: 245.9,
      exposures: ["a", "a", "b", 4],
      mastery: {
        "Science · Energy": { answered: 4, correct: 8 },
        empty: { answered: 0, correct: 0 },
      },
    });

    expect(progress.sessions).toBe(4);
    expect(progress.correct).toBe(5);
    expect(progress.streak).toBe(0);
    expect(progress.xp).toBe(245);
    expect(progress.exposures).toEqual(["a", "b"]);
    expect(progress.mastery["Science · Energy"]).toEqual({ answered: 4, correct: 4 });
    expect(progress.mastery.empty).toBeUndefined();
  });

  it("does not label tiny samples as weakness", () => {
    expect(masteryBand(1, 0)).toBe("evidence");
    expect(masteryBand(2, 100)).toBe("evidence");
    expect(masteryBand(3, 33)).toBe("repair");
    expect(masteryBand(5, 60)).toBe("developing");
    expect(masteryBand(5, 80)).toBe("secure");
  });

  it("prioritizes repair before developing and evidence topics", () => {
    const progress = normalizeLearnerProgress({
      sessions: 3,
      answered: 14,
      correct: 8,
      streak: 2,
      exposures: ["one", "two"],
      mastery: {
        "Science · Force & energy": { answered: 4, correct: 1 },
        "Mathematics · Geometry": { answered: 5, correct: 3 },
        "Computing · Internet & networks": { answered: 2, correct: 2 },
        "English Language · Writing": { answered: 3, correct: 3 },
      },
    });
    const snapshot = buildProgressSnapshot(progress);

    expect(snapshot.lifetimeAccuracy).toBe(57);
    expect(snapshot.priority?.key).toBe("Science · Force & energy");
    expect(snapshot.repair).toHaveLength(1);
    expect(snapshot.developing).toHaveLength(1);
    expect(snapshot.evidence).toHaveLength(1);
    expect(snapshot.secure).toHaveLength(1);
  });

  it("normalizes confidence calibration and detects repeated overconfidence", () => {
    const progress = normalizeLearnerProgress({
      answered: 8,
      correct: 4,
      confidence: {
        low: { answered: 2, correct: 1 },
        medium: { answered: 1, correct: 1 },
        high: { answered: 5, correct: 2 },
      },
    });
    const snapshot = buildProgressSnapshot(progress);

    expect(progress.confidence.high).toEqual({ answered: 5, correct: 2 });
    expect(snapshot.confidenceCalibration.low).toBe(50);
    expect(snapshot.confidenceCalibration.high).toBe(40);
    expect(snapshot.confidenceCalibration.overconfidence).toBe(true);
  });

  it("calculates percentages safely", () => {
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(7, 9)).toBe(78);
  });
});
