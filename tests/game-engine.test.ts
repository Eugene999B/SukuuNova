import { describe, expect, it } from "vitest";
import { SUKUUNOVA_GAME_CATALOG } from "../src/lib/game-engine/catalog";
import { directNextBeat } from "../src/lib/game-engine/director";
import { gameVarietyGate, scoreGameDnaSimilarity } from "../src/lib/game-engine/game-dna";
import { FIXED_SIMULATION_HZ, MOVEMENT_PROFILES } from "../src/lib/game-engine/movement-profiles";

const byId = (id: string) => {
  const entry = SUKUUNOVA_GAME_CATALOG.find((candidate) => candidate.dna.id === id);
  if (!entry) throw new Error(`Missing catalog entry: ${id}`);
  return entry;
};

describe("Sukuunova game engine foundation", () => {
  it("uses a stable 60 Hz simulation baseline", () => {
    expect(FIXED_SIMULATION_HZ).toBe(60);
  });

  it("gives platforming and runner games distinct movement identities", () => {
    expect(MOVEMENT_PROFILES.responsivePlatformer.coyoteTimeMs).toBeGreaterThan(0);
    expect(MOVEMENT_PROFILES.arcadeRunner.laneCount).toBe(3);
    expect(MOVEMENT_PROFILES.arcadeRunner.id).not.toBe(MOVEMENT_PROFILES.responsivePlatformer.id);
  });

  it("rejects a reskin that keeps the same core game DNA", () => {
    const original = byId("nova-run").dna;
    const reskin = {
      ...original,
      id: "biology-run",
      title: "Biology Run",
      setting: "microscopic tunnel",
      academicDomains: ["Biology"],
    };
    const result = gameVarietyGate(reskin, [original]);
    expect(result.accepted).toBe(false);
    expect(result.conflicts[0]?.similarity.score).toBeGreaterThanOrEqual(0.6);
  });

  it("keeps genuinely different game categories well below the similarity gate", () => {
    const runner = byId("nova-run").dna;
    const archive = byId("the-archive").dna;
    expect(scoreGameDnaSimilarity(runner, archive).score).toBeLessThan(0.6);
  });

  it("rotates mechanics when recent gameplay is repetitive", () => {
    const action = directNextBeat({
      telemetry: {
        elapsedMs: 180000,
        successes: 6,
        failures: 2,
        retries: 0,
        hintsUsed: 0,
        optionalInteractions: 1,
        skippedNarrative: 0,
        repeatedActionCount: 7,
        recentMechanics: ["investigate", "investigate", "investigate", "investigate", "investigate"],
      },
      mastery: [{ conceptKey: "source-bias", mastery: 0.75 }],
      currentMechanic: "investigate",
      availableMechanics: ["investigate", "timeline", "interview"],
    });
    expect(action.type).toBe("rotate-mechanic");
    if (action.type === "rotate-mechanic") expect(action.mechanic).not.toBe("investigate");
  });

  it("uses contextual remediation when struggle and weak mastery coincide", () => {
    const action = directNextBeat({
      telemetry: {
        elapsedMs: 120000,
        successes: 1,
        failures: 5,
        retries: 3,
        hintsUsed: 2,
        optionalInteractions: 0,
        skippedNarrative: 0,
        repeatedActionCount: 1,
        recentMechanics: ["build", "build"],
      },
      mastery: [{ conceptKey: "structural-support", mastery: 0.32 }],
      currentMechanic: "build",
      availableMechanics: ["build", "force-visualisation"],
    });
    expect(action).toMatchObject({ type: "contextual-remediation", conceptKey: "structural-support" });
  });
});
