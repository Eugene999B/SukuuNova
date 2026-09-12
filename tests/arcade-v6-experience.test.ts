import { describe, expect, it } from "vitest";
import { ARCADE_V5_IDENTITIES, type ArcadeV5GameKey } from "../src/lib/arcade-v5-design";
import { ARCADE_V6_EXPERIENCES, arcadeExperienceProfile, arcadeUsesHardTimer } from "../src/lib/arcade-v6-experience";

const games = Object.keys(ARCADE_V5_IDENTITIES) as ArcadeV5GameKey[];

describe("Learning Arcade V6 experience contract", () => {
  it("defines an experience profile for every flagship", () => {
    expect(Object.keys(ARCADE_V6_EXPERIENCES).sort()).toEqual([...games].sort());
    for (const game of games) {
      const profile = arcadeExperienceProfile(game);
      expect(profile.family.length).toBeGreaterThan(5);
      expect(profile.menuSubtitle.length).toBeGreaterThan(20);
      expect(profile.learningPromise.length).toBeGreaterThan(30);
      expect(profile.help).toHaveLength(3);
      expect(profile.controls.length).toBeGreaterThan(0);
    }
  });

  it("does not collapse the flagships into one visual or mechanical family", () => {
    expect(new Set(games.map((game) => arcadeExperienceProfile(game).family)).size).toBe(games.length);
    expect(new Set(games.map((game) => arcadeExperienceProfile(game).openingStyle)).size).toBe(games.length);
  });

  it("reserves hard timing for a skill where speed is part of mastery", () => {
    expect(arcadeUsesHardTimer("keyboard-ninja")).toBe(true);
    for (const game of games.filter((item) => item !== "keyboard-ninja")) {
      expect(arcadeUsesHardTimer(game), `${game} should not use a hard answer timer`).toBe(false);
    }
  });

  it("keeps early numeracy, reasoning, reading, engineering, coding, history, biology and creative design explicitly untimed", () => {
    const untimed: ArcadeV5GameKey[] = ["number-pop", "logic", "circuit-logic", "word", "comprehension-quest", "coding-sequence", "ghana-map-master", "environment-guardian", "body-explorer", "history-timeline", "culture-heritage"];
    for (const game of untimed) expect(arcadeExperienceProfile(game).timing).toBe("untimed");
  });

  it("makes Number Bloom a distinct calm early-numeracy garden", () => {
    const bloom = arcadeExperienceProfile("number-pop");
    expect(bloom.family).toBe("Early numeracy garden");
    expect(bloom.openingStyle).toBe("garden");
    expect(bloom.timing).toBe("untimed");
    expect(bloom.timingLabel).toContain("time to count");
  });

  it("makes Nova Millionaire an untimed knowledge show rather than a casino loop", () => {
    const millionaire = arcadeExperienceProfile("logic");
    expect(millionaire.family).toBe("Knowledge-show ladder");
    expect(millionaire.openingStyle).toBe("quiz-show");
    expect(millionaire.timing).toBe("untimed");
    expect(millionaire.timingLabel).toContain("think before you lock");
    expect(millionaire.help.join(" ").toLowerCase()).toContain("never reveals the answer");
  });

  it("uses navigation drift as soft world pressure without expiring astronomy answers", () => {
    const solar = arcadeExperienceProfile("space-explorer");
    expect(solar.family).toBe("Astronomy mission control");
    expect(solar.openingStyle).toBe("mission-control");
    expect(solar.timing).toBe("soft-pressure");
    expect(solar.timingLabel).toContain("no answer expires");
  });
});
