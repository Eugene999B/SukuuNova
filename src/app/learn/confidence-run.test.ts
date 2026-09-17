import { describe, expect, it } from "vitest";
import {
  emptyConfidenceRun,
  normalizeConfidenceCompletions,
  normalizeConfidenceRun,
  recordConfidenceCompletion,
} from "./confidence-run";

describe("SukuuNova confidence run resilience", () => {
  it("resets runs from another date", () => {
    const run = normalizeConfidenceRun({ dateKey: "2026-09-16", questionIndex: 7, score: 6 }, "2026-09-17", 10);
    expect(run).toEqual(emptyConfidenceRun("2026-09-17"));
  });

  it("preserves a submitted answer so refresh cannot double-count it", () => {
    const run = normalizeConfidenceRun({
      dateKey: "2026-09-17",
      questionIndex: 4,
      score: 3,
      submitted: true,
      lastCorrect: false,
      response: "option-b",
      confidence: "sure",
    }, "2026-09-17", 10);

    expect(run.questionIndex).toBe(4);
    expect(run.submitted).toBe(true);
    expect(run.response).toBe("option-b");
    expect(run.confidence).toBe("sure");
    expect(run.score).toBe(3);
  });

  it("clamps corrupt indexes and scores safely", () => {
    const run = normalizeConfidenceRun({
      dateKey: "2026-09-17",
      questionIndex: 99,
      score: 99,
      submitted: false,
      confidence: "invalid",
    }, "2026-09-17", 10);

    expect(run.questionIndex).toBe(9);
    expect(run.score).toBe(9);
    expect(run.confidence).toBeNull();
  });

  it("deduplicates and caps completion history", () => {
    const completions = recordConfidenceCompletion(["2026-09-16", "2026-09-17"], "2026-09-17");
    expect(completions).toEqual(["2026-09-17", "2026-09-16"]);
    expect(normalizeConfidenceCompletions(["bad", ...completions])).toEqual(completions);
  });
});
