import { describe, expect, it } from "vitest";
import { createArcadeSessionRemix, arcadeSessionVarietySpace } from "../src/lib/arcade-session-remix";
import { arcadeV5NodeState } from "../src/lib/arcade-v5-progress";

describe("Arcade V5 session remix", () => {
  it("creates deterministic session DNA from a test seed without grading data", () => {
    const first = createArcadeSessionRemix("word", 1, "learner-a-attempt-1");
    const again = createArcadeSessionRemix("word", 1, "learner-a-attempt-1");
    expect(again).toEqual(first);
    expect(first.progressionMode).toBe("adventure");
    expect(first.progressionNode).toBe(1);
    expect(first.varietyFloor).toBeGreaterThan(1_000_000);
    expect(JSON.stringify(first)).not.toMatch(/answer|correct|solution/i);
  });

  it("changes session identity when the same chapter is replayed with a new seed", () => {
    const first = createArcadeSessionRemix("word", 1, "attempt-one");
    const replay = createArcadeSessionRemix("word", 1, "attempt-two");
    expect(replay.seedId).not.toBe(first.seedId);
    expect(replay.mutationKey).not.toBe(first.mutationKey);
  });

  it("keeps open-ended genres free of artificial progression nodes", () => {
    const run = createArcadeSessionRemix("math", 12, "endless-run");
    const market = createArcadeSessionRemix("money-math-market", 7, "market-day");
    expect(run.progressionNode).toBeNull();
    expect(market.progressionNode).toBeNull();
  });

  it("exposes a combinatorial floor above one million before content variation", () => {
    expect(arcadeSessionVarietySpace()).toBe(1_382_400);
  });
});

describe("Arcade V5 genre-aware progress", () => {
  it("migrates legacy history into node unlocks only for node-based games", () => {
    expect(arcadeV5NodeState("word", 4, 0, 0)).toMatchObject({ nodeCount: 10, unlockedNode: 5, clearedThroughNode: 4 });
    expect(arcadeV5NodeState("math", 40, 0, 0)).toMatchObject({ nodeCount: 0, unlockedNode: null, clearedThroughNode: null });
  });

  it("unlocks only the next node after explicit V5 progress", () => {
    expect(arcadeV5NodeState("keyboard-ninja", 3, 3, 3)).toMatchObject({ nodeCount: 8, unlockedNode: 4, clearedThroughNode: 3 });
    expect(arcadeV5NodeState("keyboard-ninja", 20, 20, 8)).toMatchObject({ nodeCount: 8, unlockedNode: 8, clearedThroughNode: 8 });
  });
});
