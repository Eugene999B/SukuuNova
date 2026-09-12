import { describe, expect, it } from "vitest";
import { ARCADE_SESSION_VARIETY_MIN, ARCADE_V5_IDENTITIES, arcadeGameRewardCount, arcadeLevelDifficulty, arcadeProgressionDifficulty, arcadeV5Identity } from "../src/lib/arcade-v5-design";

describe("Learning Arcade V5 identities", () => {
  it("gives every flagship its own world, reward and genre-aware progression", () => {
    const identities = Object.values(ARCADE_V5_IDENTITIES);
    expect(identities).toHaveLength(15);
    expect(new Set(identities.map((item) => item.game)).size).toBe(15);
    expect(new Set(identities.map((item) => item.world)).size).toBe(15);
    expect(new Set(identities.map((item) => item.rewardName)).size).toBe(15);
    expect(new Set(identities.map((item) => item.accent)).size).toBe(15);
    expect(new Set(identities.map((item) => item.progression.mode)).size).toBeGreaterThanOrEqual(8);
    for (const identity of identities) {
      expect(identity.introTitle.length).toBeGreaterThan(8);
      expect(identity.introCopy.length).toBeGreaterThan(40);
      expect(identity.progression.remixDimensions.length).toBeGreaterThanOrEqual(6);
      expect(identity.progression.selectableNodes).toBe(identity.progression.nodes.length > 0);
    }
  });

  it("does not force endless, survival or simulation games into fake level maps", () => {
    expect(ARCADE_V5_IDENTITIES.math.progression.mode).toBe("endless");
    expect(ARCADE_V5_IDENTITIES.math.progression.nodes).toHaveLength(0);
    expect(ARCADE_V5_IDENTITIES["force-motion-lab"].progression.mode).toBe("survival");
    expect(ARCADE_V5_IDENTITIES["force-motion-lab"].progression.nodes).toHaveLength(0);
    expect(ARCADE_V5_IDENTITIES["money-math-market"].progression.mode).toBe("simulation");
    expect(ARCADE_V5_IDENTITIES["money-math-market"].progression.nodes).toHaveLength(0);
  });

  it("uses different progression structures for adventures, tournaments, expeditions, contracts and navigation", () => {
    expect(ARCADE_V5_IDENTITIES.word.progression.mode).toBe("adventure");
    expect(ARCADE_V5_IDENTITIES.word.progression.nodes).toHaveLength(10);
    expect(ARCADE_V5_IDENTITIES["keyboard-ninja"].progression.mode).toBe("tournament");
    expect(ARCADE_V5_IDENTITIES["keyboard-ninja"].progression.nodes).toHaveLength(8);
    expect(ARCADE_V5_IDENTITIES["ghana-map-master"].progression.mode).toBe("expedition");
    expect(ARCADE_V5_IDENTITIES["circuit-logic"].progression.mode).toBe("contracts");
    expect(ARCADE_V5_IDENTITIES["space-explorer"].progression.mode).toBe("navigation");
    expect(ARCADE_V5_IDENTITIES["space-explorer"].progression.nodes).toHaveLength(10);
  });

  it("falls back safely to Nova Runner for unknown presentation lookups", () => {
    expect(arcadeV5Identity("unknown-game").game).toBe("math");
  });
});

describe("Learning Arcade V5 adaptive progression", () => {
  it("maps each node journey proportionally onto five adaptive difficulty tiers", () => {
    expect(arcadeProgressionDifficulty("keyboard-ninja", 1)).toBe(1);
    expect(arcadeProgressionDifficulty("keyboard-ninja", 8)).toBe(5);
    expect(arcadeProgressionDifficulty("word", 5)).toBe(3);
    expect(arcadeProgressionDifficulty("space-explorer", 10)).toBe(5);
    expect(arcadeProgressionDifficulty("math", 1)).toBeNull();
  });

  it("retains the legacy level helper during rollout", () => {
    expect(arcadeLevelDifficulty(1)).toBe(1);
    expect(arcadeLevelDifficulty(7)).toBe(3);
    expect(arcadeLevelDifficulty(99)).toBe(5);
  });

  it("keeps per-game reward counts deterministic and non-negative", () => {
    expect(arcadeGameRewardCount(0, 0)).toBe(0);
    expect(arcadeGameRewardCount(100, 3)).toBe(8);
    expect(arcadeGameRewardCount(-40, -3)).toBe(0);
  });

  it("provides more than one million session-DNA combinations before content permutations", () => {
    expect(ARCADE_SESSION_VARIETY_MIN).toBeGreaterThan(1_000_000);
  });
});
