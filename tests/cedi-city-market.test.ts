import { describe, expect, it } from "vitest";
import { createCediCityMarketQuestions } from "../src/lib/cedi-city-market-content";
import { marketComboGain, marketPatienceDurationMs, marketQueueTrustLoss, marketRestockGain, marketScanRecovery, marketStockCost, marketTillReward } from "../src/lib/cedi-city-market";

describe("Cedi City Market controlled learning content", () => {
  it("creates secure Ghana-cedi market questions with four distinct receipt choices", () => {
    const questions = createCediCityMarketQuestions(5, 30);
    expect(questions).toHaveLength(30);
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
      expect(question.answer.startsWith("GH₵")).toBe(true);
      expect(question.conceptKey.startsWith("market-")).toBe(true);
      expect(question.scene.boardTitle).toBe("Cedi City Market");
      expect(question.scene.customer.length).toBeGreaterThan(0);
      expect(question.scene.wallet).toBeGreaterThanOrEqual(0);
      expect(question.scene.meterLabels?.length).toBe(3);
    }
  });

  it("keeps early play focused on totals and change before introducing business maths", () => {
    const questions = createCediCityMarketQuestions(1, 20);
    expect(questions.every((question) => question.scene.mission === "change" || question.scene.mission === "basket")).toBe(true);
  });

  it("introduces budgeting, profit and percentage decisions at higher difficulty", () => {
    const questions = createCediCityMarketQuestions(5, 24);
    const missions = new Set(questions.map((question) => question.scene.mission));
    expect(missions.has("budget")).toBe(true);
    expect(missions.has("profit")).toBe(true);
    expect(missions.has("percentage")).toBe(true);
    expect(missions.has("tradeoff")).toBe(true);
  });
});

describe("Cedi City Market live mechanics", () => {
  it("gives supported learners more customer patience and keeps timing bounded", () => {
    expect(marketPatienceDurationMs(4, 1.2, "guided")).toBeGreaterThan(marketPatienceDurationMs(4, 1.2, "challenge"));
    expect(marketPatienceDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(7000);
    expect(marketPatienceDurationMs(-10, 0.01, "guided")).toBeLessThanOrEqual(22000);
  });

  it("bounds trust loss and lets price scans reduce pressure without revealing answers", () => {
    expect(marketQueueTrustLoss(40, 1, false)).toBe(0);
    expect(marketQueueTrustLoss(100, 99, true)).toBeLessThanOrEqual(12);
    expect(marketScanRecovery(90, 0)).toBe(68);
    expect(marketScanRecovery(20, 2)).toBe(0);
  });

  it("rewards efficient service while bounding stock and till effects", () => {
    expect(marketStockCost(2, 3)).toBeGreaterThanOrEqual(2);
    expect(marketStockCost(99, 99)).toBeLessThanOrEqual(18);
    expect(marketTillReward(20, 4)).toBeGreaterThan(marketTillReward(90, 4));
    expect(marketComboGain(20)).toBe(2);
    expect(marketComboGain(90)).toBe(0);
    expect(marketRestockGain(20)).toBe(2);
  });
});
