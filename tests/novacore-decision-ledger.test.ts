import { describe, expect, it } from "vitest";
import { fingerprintNovaCoreInput, prepareNovaCoreDecision } from "../src/lib/novacore/decision-ledger";

describe("NovaCore decision ledger", () => {
  it("fingerprints equivalent object inputs deterministically regardless of key order", () => {
    const a = fingerprintNovaCoreInput({ routeId: "r1", speed: 24, nested: { b: 2, a: 1 } });
    const b = fingerprintNovaCoreInput({ nested: { a: 1, b: 2 }, speed: 24, routeId: "r1" });
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(b).toBe(a);
  });

  it("prepares telemetry from the authoritative registry version and rollout mode", () => {
    const inputFingerprint = fingerprintNovaCoreInput({ massKg: 2, forceN: 4 });
    const row = prepareNovaCoreDecision({
      schoolId: "school-1",
      algorithmKey: "arcade.physics",
      entityType: "ArcadeRound",
      entityId: "round-1",
      inputFingerprint,
      confidence: 1,
      reasonCodes: ["Measured output", "measured output", "Fixed step 120Hz"],
      outputSummary: { finalSpeedMps: 2 },
      latencyMs: 4,
    });
    expect(row.algorithm.key).toBe("arcade.physics");
    expect(row.algorithm.version.length).toBeGreaterThan(0);
    expect(row.reasonCodes).toEqual(["measured_output", "fixed_step_120hz"]);
    expect(row.inputFingerprint).toBe(inputFingerprint);
    expect(row.confidence).toBe(1);
  });

  it("rejects unknown algorithms, invalid fingerprints and invalid confidence", () => {
    expect(() => prepareNovaCoreDecision({ schoolId: "school-1", algorithmKey: "made.up" })).toThrow(/Unknown NovaCore algorithm/);
    expect(() => prepareNovaCoreDecision({ schoolId: "school-1", algorithmKey: "arcade.physics", inputFingerprint: "bad" })).toThrow(/fingerprint/i);
    expect(() => prepareNovaCoreDecision({ schoolId: "school-1", algorithmKey: "arcade.physics", confidence: 1.5 })).toThrow(/confidence/i);
  });

  it("never includes the raw input in prepared telemetry", () => {
    const secretInput = { studentName: "Sensitive Example", exactHomeAddress: "Do not store" };
    const row = prepareNovaCoreDecision({
      schoolId: "school-1",
      algorithmKey: "transport.route-matching",
      inputFingerprint: fingerprintNovaCoreInput(secretInput),
      outputSummary: { routeDeviation: false },
    });
    expect(JSON.stringify(row)).not.toContain("Sensitive Example");
    expect(JSON.stringify(row)).not.toContain("Do not store");
  });
});
