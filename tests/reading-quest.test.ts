import { describe, expect, it } from "vitest";
import { createReadingQuestQuestions } from "../src/lib/reading-quest-content";
import { readingQuestFocusRecovery, readingQuestFogDurationMs, readingQuestLanternReward, readingQuestRouteForChoice, readingQuestTrailDamage } from "../src/lib/reading-quest-mission";

describe("Reading Quest controlled content", () => {
  it("produces varied evidence chapters with passages and no duplicate prompt in a normal mission", () => {
    const questions = createReadingQuestQuestions(2, 10);
    expect(questions).toHaveLength(10);
    expect(new Set(questions.map((item) => item.prompt)).size).toBe(10);
    expect(questions.every((item) => item.kind === "path" && Boolean(item.scene.cue) && item.scene.meterLabels.length > 0)).toBe(true);
  });
});

describe("Reading Quest expedition mechanics", () => {
  it("branches routes without tying the route choice to academic correctness", () => {
    expect(readingQuestRouteForChoice(0, 0)).toBe("river-trail");
    expect(readingQuestRouteForChoice(0, 1)).toBe("market-archive");
    expect(readingQuestRouteForChoice(1, 0)).toBe("market-archive");
  });

  it("gives guided learners more reading time while bounding every fog timer", () => {
    expect(readingQuestFogDurationMs(3, 1, "guided")).toBeGreaterThan(readingQuestFogDurationMs(3, 1, "challenge"));
    expect(readingQuestFogDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(5600);
    expect(readingQuestFogDurationMs(-5, 0.01, "guided")).toBeLessThanOrEqual(16000);
  });

  it("caps trail damage and rewards efficient reading without using correctness", () => {
    expect(readingQuestTrailDamage(95, 1.4, true)).toBeLessThanOrEqual(14);
    expect(readingQuestTrailDamage(95, 1.4, true)).toBeGreaterThan(readingQuestTrailDamage(10, 0.7, false));
    expect(readingQuestLanternReward(20)).toBe(2);
    expect(readingQuestLanternReward(50)).toBe(1);
    expect(readingQuestLanternReward(90)).toBe(0);
  });

  it("focus lantern pushes fog back without revealing or scoring an answer", () => {
    expect(readingQuestFocusRecovery(90)).toBe(56);
    expect(readingQuestFocusRecovery(20)).toBe(0);
  });
});
