import { describe, expect, it } from "vitest";
import { createEcoGridQuestions } from "../src/lib/ecogrid-content";
import { ecoChainGain, ecoEventDurationMs, ecoResilienceReward, ecoResourceGain, ecoSeedReward, ecoStressDamage, ecoSurveyRecovery } from "../src/lib/ecogrid";

describe("EcoGrid Ghana controlled environmental content", () => {
  it("creates secure four-choice environmental projects with scene metadata", () => {
    const questions = createEcoGridQuestions(5, 32);
    expect(questions).toHaveLength(32);
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
      expect(question.conceptKey.startsWith("ecogrid:")).toBe(true);
      expect(question.scene.boardTitle).toBe("EcoGrid Ghana");
      expect(question.scene.zone.length).toBeGreaterThan(0);
      expect(question.scene.ecoSignals.length).toBeGreaterThan(0);
      expect(question.scene.riskLevel).toBeGreaterThanOrEqual(1);
      expect(question.scene.riskLevel).toBeLessThanOrEqual(5);
    }
  });

  it("keeps early play practical before introducing harder systems trade-offs", () => {
    const questions = createEcoGridQuestions(1, 24);
    const allowed = new Set(["waste", "water", "sanitation", "habitat"]);
    expect(questions.every((question) => allowed.has(question.scene.ecoMission))).toBe(true);
  });

  it("expands into energy, e-waste, transport, climate and circularity at high difficulty", () => {
    const questions = createEcoGridQuestions(5, 32);
    const missions = new Set(questions.map((question) => question.scene.ecoMission));
    expect(missions.has("energy")).toBe(true);
    expect(missions.has("ewaste")).toBe(true);
    expect(missions.has("transport")).toBe(true);
    expect(missions.has("climate")).toBe(true);
    expect(missions.has("circularity")).toBe(true);
  });
});

describe("EcoGrid Ghana live mechanics", () => {
  it("gives supported learners more planning time and keeps timing bounded", () => {
    expect(ecoEventDurationMs(4, 1.2, "guided")).toBeGreaterThan(ecoEventDurationMs(4, 1.2, "challenge"));
    expect(ecoEventDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(8000);
    expect(ecoEventDurationMs(-10, 0.01, "guided")).toBeLessThanOrEqual(24000);
  });

  it("bounds environmental stress and lets field surveys reduce pressure without grading", () => {
    expect(ecoStressDamage(20, 1, false)).toBe(0);
    expect(ecoStressDamage(100, 99, true)).toBeLessThanOrEqual(12);
    expect(ecoSurveyRecovery(90, 0)).toBe(72);
    expect(ecoSurveyRecovery(20, 2)).toBe(0);
  });

  it("rewards efficient restoration while bounding resource effects", () => {
    expect(ecoResilienceReward(20, 5)).toBeGreaterThan(ecoResilienceReward(90, 1));
    expect(ecoSeedReward(5, 20)).toBeLessThanOrEqual(7);
    expect(ecoResourceGain(99, 20)).toBeLessThanOrEqual(8);
    expect(ecoResourceGain(1, 90)).toBeGreaterThanOrEqual(2);
    expect(ecoChainGain(20)).toBe(2);
    expect(ecoChainGain(90)).toBe(0);
  });
});
