import { describe, expect, it } from "vitest";
import { createSolarNavigatorQuestions } from "../src/lib/solar-navigator-content";
import { solarDriftDamage, solarFlightWindowMs, solarFuelReward, solarOrbitChain, solarScanRecovery, solarScanTokens } from "../src/lib/solar-navigator";

describe("Solar Navigator controlled astronomy content", () => {
  it("creates secure four-option mission-control questions", () => {
    const questions = createSolarNavigatorQuestions(5, 32);
    expect(questions).toHaveLength(32);
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
      expect(question.conceptKey.startsWith("solar-navigator:")).toBe(true);
      expect(question.scene.boardTitle).toBe("Solar Navigator Mission Control");
      expect(question.scene.telemetry).toHaveLength(3);
      expect(question.scene.fuelRisk).toBeGreaterThanOrEqual(1);
      expect(question.scene.fuelRisk).toBeLessThanOrEqual(5);
      expect((question.scene.cue ?? "").toLowerCase()).not.toContain(question.answer.toLowerCase());
    }
  });

  it("keeps early missions on foundational astronomy", () => {
    const questions = createSolarNavigatorQuestions(1, 24);
    const missions = new Set(questions.map((item) => item.scene.spaceMission));
    expect([...missions].every((mission) => ["planet", "moon", "orbit", "rotation"].includes(mission))).toBe(true);
  });

  it("adds deeper navigation, communications and small-body reasoning at high difficulty", () => {
    const questions = createSolarNavigatorQuestions(5, 60);
    const missions = new Set(questions.map((item) => item.scene.spaceMission));
    expect(missions.has("communication")).toBe(true);
    expect(missions.has("navigation")).toBe(true);
    expect(missions.has("small-bodies")).toBe(true);
    expect(missions.has("scale")).toBe(true);
  });
});

describe("Solar Navigator mission mechanics", () => {
  it("gives guided learners a larger flight window and bounds timing", () => {
    expect(solarFlightWindowMs(3, 1, "guided")).toBeGreaterThan(solarFlightWindowMs(3, 1, "challenge"));
    expect(solarFlightWindowMs(1, .7, "guided")).toBeLessThanOrEqual(32000);
    expect(solarFlightWindowMs(5, 1.5, "challenge")).toBeGreaterThanOrEqual(12000);
  });

  it("keeps navigation drift bounded and inactive at low pressure", () => {
    expect(solarDriftDamage(.2, 1, 5)).toBe(0);
    expect(solarDriftDamage(1, 1.8, 5)).toBeLessThanOrEqual(9);
    expect(solarDriftDamage(.8, 1, 3)).toBeGreaterThan(0);
  });

  it("uses Star Scan for pressure recovery without grading", () => {
    expect(solarScanRecovery(0, 2)).toBe(0);
    expect(solarScanRecovery(.8, 2)).toBeGreaterThan(solarScanRecovery(.8, 0));
    expect(solarScanRecovery(1, 2)).toBeLessThanOrEqual(.45);
  });

  it("rewards efficient course planning and bounds support resources", () => {
    expect(solarFuelReward(5, 0, 5)).toBeGreaterThan(solarFuelReward(5, 4, 5));
    expect(solarFuelReward(1, 10, 1)).toBeGreaterThanOrEqual(2);
    expect(solarScanTokens(1, "guided")).toBeGreaterThan(solarScanTokens(5, "challenge"));
    expect(solarScanTokens(5, "challenge")).toBeGreaterThanOrEqual(1);
  });

  it("builds an orbit chain for decisive navigation", () => {
    expect(solarOrbitChain(0, 0)).toBe(1);
    expect(solarOrbitChain(3, 1)).toBe(4);
    expect(solarOrbitChain(3, 3)).toBe(2);
    expect(solarOrbitChain(9, 0)).toBe(9);
  });
});
