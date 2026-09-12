import { describe, expect, it } from "vitest";
import { createNumberBloomQuestions } from "../src/lib/number-bloom-content";
import { numberBloomFreeGrowNext, numberBloomGrowthStage, numberBloomHintTokens, numberBloomMaxNumber, numberBloomPetalReward } from "../src/lib/number-bloom";

describe("Number Bloom early numeracy", () => {
  it("scales quantities gently from three to ten", () => {
    expect(numberBloomMaxNumber(1)).toBe(3);
    expect(numberBloomMaxNumber(2)).toBe(5);
    expect(numberBloomMaxNumber(3)).toBe(6);
    expect(numberBloomMaxNumber(4)).toBe(8);
    expect(numberBloomMaxNumber(5)).toBe(10);
  });

  it("keeps the first tier to counting and numeral matching", () => {
    const questions = createNumberBloomQuestions(1, 20);
    expect(questions).toHaveLength(20);
    expect(new Set(questions.map((question) => question.scene.bloomChallenge))).toEqual(new Set(["count", "match"]));
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toContain(question.answer);
      expect(question.scene.cue?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("opens comparison, composition and sequence reasoning at higher tiers", () => {
    const questions = createNumberBloomQuestions(5, 20);
    const challenges = new Set(questions.map((question) => question.scene.bloomChallenge));
    expect(challenges.has("count")).toBe(true);
    expect(challenges.has("match")).toBe(true);
    expect(challenges.has("compare")).toBe(true);
    expect(challenges.has("make")).toBe(true);
    expect(challenges.has("next")).toBe(true);
  });

  it("never generates a visual quantity beyond the current difficulty ceiling", () => {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      const ceiling = numberBloomMaxNumber(difficulty);
      for (const question of createNumberBloomQuestions(difficulty, 20)) {
        const scene = question.scene;
        for (const value of [scene.targetNumber, scene.shownCount, scene.leftCount, scene.rightCount, scene.startCount, scene.sequenceStart]) {
          if (typeof value === "number") expect(value).toBeLessThanOrEqual(ceiling);
        }
      }
    }
  });

  it("bounds hints, rewards, growth and free play safely", () => {
    expect(numberBloomHintTokens(1, "guided")).toBeGreaterThan(numberBloomHintTokens(5, "challenge"));
    expect(numberBloomPetalReward(5, 0)).toBeGreaterThan(numberBloomPetalReward(1, 4));
    expect(numberBloomGrowthStage(0, 5)).toBe(0);
    expect(numberBloomGrowthStage(5, 5)).toBe(5);
    expect(numberBloomFreeGrowNext(9)).toBe(10);
    expect(numberBloomFreeGrowNext(10)).toBe(0);
  });
});
