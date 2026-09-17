import { describe, expect, it } from "vitest";
import {
  confidenceCalibrationPercent,
  confidencePriorityTopics,
  EMPTY_CONFIDENCE_RECORD,
  evaluateConfidence,
  normalizeConfidenceRecord,
  recordConfidenceAttempt,
} from "./confidence-intelligence";

describe("SukuuNova confidence intelligence", () => {
  it("distinguishes strong evidence from fragile correct answers", () => {
    expect(evaluateConfidence(true, "sure").signal).toBe("strong");
    expect(evaluateConfidence(true, "unsure").signal).toBe("fragile");
  });

  it("labels confident wrong answers only as possible misconception signals", () => {
    const evaluation = evaluateConfidence(false, "sure");
    expect(evaluation.signal).toBe("possible-misconception");
    expect(evaluation.title).toContain("Possible");
    expect(evaluation.explanation.toLowerCase()).toContain("not a diagnosis");
  });

  it("rewards awareness when a learner is unsure and incorrect", () => {
    const evaluation = evaluateConfidence(false, "unsure");
    expect(evaluation.signal).toBe("discovery");
    expect(evaluation.calibrationPoints).toBe(2);
  });

  it("records topic-level fragile and misconception evidence", () => {
    let record = EMPTY_CONFIDENCE_RECORD;
    record = recordConfidenceAttempt(record, { topicKey: "Mathematics · Geometry", correct: true, confidence: "unsure" });
    record = recordConfidenceAttempt(record, { topicKey: "Mathematics · Geometry", correct: false, confidence: "sure" });
    record = recordConfidenceAttempt(record, { topicKey: "Science · Systems", correct: true, confidence: "sure" });

    expect(record.attempts).toBe(3);
    expect(record.fragileCorrect).toBe(1);
    expect(record.possibleMisconceptions).toBe(1);
    expect(record.topics["Mathematics · Geometry"].fragileCorrect).toBe(1);
    expect(record.topics["Mathematics · Geometry"].possibleMisconceptions).toBe(1);
  });

  it("prioritizes possible misconceptions ahead of fragile correct evidence", () => {
    let record = EMPTY_CONFIDENCE_RECORD;
    record = recordConfidenceAttempt(record, { topicKey: "English Language · Reading", correct: true, confidence: "unsure" });
    record = recordConfidenceAttempt(record, { topicKey: "Computing · Internet & networks", correct: false, confidence: "sure" });

    expect(confidencePriorityTopics(record).map((item) => item.key)).toEqual([
      "Computing · Internet & networks",
      "English Language · Reading",
    ]);
  });

  it("normalizes malformed records and calculates calibration safely", () => {
    const normalized = normalizeConfidenceRecord({
      attempts: 2,
      calibrationPoints: 99,
      maxCalibrationPoints: 4,
      strong: 8,
      topics: { "Science · Systems": { attempts: 2, strong: 9, fragileCorrect: -3, possibleMisconceptions: 1 } },
    });

    expect(normalized.calibrationPoints).toBe(4);
    expect(normalized.strong).toBe(2);
    expect(normalized.topics["Science · Systems"].strong).toBe(2);
    expect(confidenceCalibrationPercent(normalized)).toBe(100);
  });
});
