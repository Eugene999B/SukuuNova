import { describe, expect, it } from "vitest";
import { ARCADE_GAME_CATALOG } from "../src/lib/arcade-catalog";
import { ARCADE_AGE_MOTION, arcadeExperienceForGame } from "../src/lib/arcade-experience";

describe("Arcade experience director", () => {
  it("gives major learning families genuinely different world identities", () => {
    expect(arcadeExperienceForGame("times-table-turbo").label).toBe("Equation Speedway");
    expect(arcadeExperienceForGame("money-math-market").label).toBe("Nova Market District");
    expect(arcadeExperienceForGame("spelling-sprint").label).toBe("Kinetic Typing Runway");
    expect(arcadeExperienceForGame("force-motion-lab").label).toBe("Motion & Matter Laboratory");
    expect(arcadeExperienceForGame("ghana-map-master").label).toBe("Explorer Map Expedition");
    expect(arcadeExperienceForGame("cyber-safety").label).toBe("Digital Skills City");
    expect(arcadeExperienceForGame("memory-matrix").label).toBe("Puzzle Orbit");
  });

  it("resolves every catalogue game to a complete animated experience", () => {
    for (const game of ARCADE_GAME_CATALOG) {
      const experience = arcadeExperienceForGame(game.gameKey, game.category, game.subject);
      expect(experience.key.length).toBeGreaterThan(2);
      expect(experience.label.length).toBeGreaterThan(4);
      expect(experience.objects.length).toBeGreaterThanOrEqual(9);
      expect(["race", "float", "orbit", "city", "lab", "map", "build", "pulse"]).toContain(experience.motion);
    }
  });

  it("slows and enlarges motion for younger learners while increasing challenge density with age", () => {
    const little = ARCADE_AGE_MOTION.age_4_5;
    const primary = ARCADE_AGE_MOTION.age_9_11;
    const senior = ARCADE_AGE_MOTION.age_15_18;
    expect(little.scale).toBeGreaterThan(primary.scale);
    expect(little.duration).toBeGreaterThan(primary.duration);
    expect(primary.duration).toBeGreaterThan(senior.duration);
    expect(little.density).toBeLessThan(senior.density);
    expect(little.label).not.toBe(senior.label);
  });
});
