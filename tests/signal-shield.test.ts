import { describe, expect, it } from "vitest";
import { createSignalShieldQuestions } from "../src/lib/signal-shield-content";
import { signalBreachDamage, signalChainGain, signalIncidentDurationMs, signalIntegrityReward, signalIntelReward, signalQuarantineCost, signalScannerRecovery } from "../src/lib/signal-shield";

describe("Signal Shield controlled cyber-safety content", () => {
  it("creates four-choice school-safe incidents with authoritative answers and scene telemetry", () => {
    const questions = createSignalShieldQuestions(5, 30);
    expect(questions).toHaveLength(30);
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
      expect(question.conceptKey.startsWith("signal-shield:")).toBe(true);
      expect(question.scene.boardTitle).toBe("Signal Shield CyberOps");
      expect(question.scene.source.length).toBeGreaterThan(0);
      expect(question.scene.asset.length).toBeGreaterThan(0);
      expect(question.scene.signalTags.length).toBeGreaterThan(0);
      expect(question.scene.threatLevel).toBeGreaterThanOrEqual(1);
      expect(question.scene.threatLevel).toBeLessThanOrEqual(5);
      expect(question.scene.packetId).toMatch(/^N-\d{2}-\d{3}$/);
      expect(question.scene.meterLabels?.length).toBe(3);
      expect(question.prompt.includes("http://")).toBe(false);
      expect(question.prompt.includes("https://")).toBe(false);
    }
  });

  it("keeps early play on foundational message, link and password judgement", () => {
    const questions = createSignalShieldQuestions(1, 24);
    const missions = new Set(questions.map((question) => question.scene.incidentType));
    expect([...missions].every((mission) => ["phishing", "link", "password"].includes(mission))).toBe(true);
  });

  it("adds privacy, network, recovery and impersonation decisions at higher difficulty", () => {
    const questions = createSignalShieldQuestions(5, 30);
    const missions = new Set(questions.map((question) => question.scene.incidentType));
    expect(missions.has("privacy")).toBe(true);
    expect(missions.has("wifi")).toBe(true);
    expect(missions.has("update")).toBe(true);
    expect(missions.has("recovery")).toBe(true);
    expect(missions.has("imposter")).toBe(true);
  });

  it("never embeds a real clickable web address in the controlled scenario bank", () => {
    const text = createSignalShieldQuestions(5, 50).flatMap((question) => [question.prompt, question.answer, question.explanation, ...question.options]).join(" ");
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/www\./i);
  });
});

describe("Signal Shield live defence mechanics", () => {
  it("gives guided learners more incident time and keeps timing bounded", () => {
    expect(signalIncidentDurationMs(4, 1.2, "guided")).toBeGreaterThan(signalIncidentDurationMs(4, 1.2, "challenge"));
    expect(signalIncidentDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(7600);
    expect(signalIncidentDurationMs(-10, 0.01, "guided")).toBeLessThanOrEqual(24500);
  });

  it("bounds breach damage and lets scans reduce pressure without exposing answers", () => {
    expect(signalBreachDamage(40, 1, false)).toBe(0);
    expect(signalBreachDamage(100, 99, true)).toBeLessThanOrEqual(15);
    expect(signalScannerRecovery(90, 0)).toBe(66);
    expect(signalScannerRecovery(20, 2)).toBe(0);
  });

  it("rewards calm containment while bounding integrity, intel and quarantine effects", () => {
    expect(signalIntegrityReward(20, 4)).toBeGreaterThan(signalIntegrityReward(90, 4));
    expect(signalIntegrityReward(99, 99)).toBeLessThanOrEqual(10);
    expect(signalIntelReward(5, 20)).toBeGreaterThan(signalIntelReward(1, 90));
    expect(signalChainGain(20)).toBe(2);
    expect(signalChainGain(90)).toBe(0);
    expect(signalQuarantineCost(99, 99)).toBeLessThanOrEqual(14);
  });
});
