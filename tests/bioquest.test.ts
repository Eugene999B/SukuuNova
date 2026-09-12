import { describe, expect, it } from "vitest";
import { createBioQuestQuestions } from "../src/lib/bioquest-content";
import { bioCaseDurationMs, bioComboGain, bioInsightReward, bioScanRecovery, bioStrainDamage, bioSystemGain, bioVitalityReward } from "../src/lib/bioquest";

describe("BioQuest Human Systems controlled biology content", () => {
  it("creates secure four-choice anatomy cases with scene metadata", () => {
    const questions = createBioQuestQuestions(5, 32);
    expect(questions).toHaveLength(32);
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
      expect(question.conceptKey.startsWith("bioquest:")).toBe(true);
      expect(question.scene.boardTitle).toBe("BioQuest: Human Systems");
      expect(question.scene.organ.length).toBeGreaterThan(0);
      expect(question.scene.scanSignals.length).toBeGreaterThan(0);
      expect(question.scene.strainLevel).toBeGreaterThanOrEqual(1);
      expect(question.scene.strainLevel).toBeLessThanOrEqual(5);
    }
  });

  it("keeps early play focused on concrete body functions", () => {
    const questions = createBioQuestQuestions(1, 24);
    const allowed = new Set(["circulatory", "respiratory", "digestive", "skeletal", "muscular", "immune"]);
    expect(questions.every((question) => allowed.has(question.scene.bodySystem))).toBe(true);
  });

  it("expands into nervous, excretory, endocrine and multi-system coordination at high difficulty", () => {
    const questions = createBioQuestQuestions(5, 48);
    const systems = new Set(questions.map((question) => question.scene.bodySystem));
    expect(systems.has("nervous")).toBe(true);
    expect(systems.has("excretory")).toBe(true);
    expect(systems.has("endocrine")).toBe(true);
    expect(systems.has("coordination")).toBe(true);
  });
});

describe("BioQuest live mechanics", () => {
  it("gives supported learners more analysis time while keeping cases bounded", () => {
    expect(bioCaseDurationMs(4, 1.2, "guided")).toBeGreaterThan(bioCaseDurationMs(4, 1.2, "challenge"));
    expect(bioCaseDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(8200);
    expect(bioCaseDurationMs(-10, 0.01, "guided")).toBeLessThanOrEqual(25000);
  });

  it("bounds system strain and lets scans reduce pressure without grading", () => {
    expect(bioStrainDamage(20, 1, false)).toBe(0);
    expect(bioStrainDamage(100, 99, true)).toBeLessThanOrEqual(12);
    expect(bioScanRecovery(90, 0)).toBe(72);
    expect(bioScanRecovery(20, 2)).toBe(0);
  });

  it("rewards efficient case work while bounding system effects", () => {
    expect(bioVitalityReward(20, 5)).toBeGreaterThan(bioVitalityReward(90, 1));
    expect(bioInsightReward(5, 20)).toBeLessThanOrEqual(7);
    expect(bioSystemGain(99, 20)).toBeLessThanOrEqual(8);
    expect(bioSystemGain(1, 90)).toBeGreaterThanOrEqual(2);
    expect(bioComboGain(20)).toBe(2);
    expect(bioComboGain(90)).toBe(0);
  });
});
