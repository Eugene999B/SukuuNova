import { describe, expect, it } from "vitest";
import { arcadeUniverseLevel, buildArcadeProgression } from "../src/lib/arcade-progression";

const stats = (overrides: Partial<{ rounds: number; xp: number; stars: number; correct: number; questions: number; games: number; perfectRounds: number; bossWins: number }> = {}) => ({
  rounds: 0,
  xp: 0,
  stars: 0,
  correct: 0,
  questions: 0,
  games: 0,
  perfectRounds: 0,
  bossWins: 0,
  ...overrides,
});

describe("Arcade progression universe", () => {
  it("advances universe levels every 250 authoritative XP", () => {
    expect(arcadeUniverseLevel(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 250, xpRemaining: 250 });
    expect(arcadeUniverseLevel(249).level).toBe(1);
    expect(arcadeUniverseLevel(250)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 250, xpRemaining: 250 });
    expect(arcadeUniverseLevel(635)).toMatchObject({ level: 3, xpIntoLevel: 135, xpRemaining: 115 });
  });

  it("derives Nova coins, missions and weekly challenges from completed-round totals", () => {
    const result = buildArcadeProgression(
      stats({ rounds: 8, xp: 520, stars: 18, correct: 44, questions: 50, games: 3, perfectRounds: 2 }),
      stats({ rounds: 1, xp: 80, stars: 3, games: 1 }),
      stats({ rounds: 5, xp: 310, stars: 12, games: 3 }),
      4,
    );
    expect(result.profile.novaCoins).toBe(88);
    expect(result.dailyMissions.find((item) => item.key === "daily-play")?.complete).toBe(true);
    expect(result.dailyMissions.find((item) => item.key === "daily-stars")?.complete).toBe(false);
    expect(result.weeklyChallenges.every((item) => item.complete)).toBe(true);
  });

  it("requires enough evidence before unlocking the precision achievement", () => {
    const tooFew = buildArcadeProgression(stats({ correct: 18, questions: 20 }), stats(), stats(), 0);
    expect(tooFew.achievements.find((item) => item.key === "precision-90")?.unlocked).toBe(false);

    const enough = buildArcadeProgression(stats({ correct: 46, questions: 50 }), stats(), stats(), 0);
    expect(enough.achievements.find((item) => item.key === "precision-90")?.unlocked).toBe(true);
  });

  it("unlocks cross-world, streak and boss achievements only at their thresholds", () => {
    const result = buildArcadeProgression(
      stats({ rounds: 9, xp: 1600, stars: 20, correct: 45, questions: 50, games: 3, perfectRounds: 1, bossWins: 1 }),
      stats(),
      stats(),
      7,
    );
    for (const key of ["three-worlds", "streak-three", "streak-seven", "xp-500", "xp-1500", "boss-breaker", "precision-90"]) {
      expect(result.achievements.find((item) => item.key === key)?.unlocked, key).toBe(true);
    }
  });
});
