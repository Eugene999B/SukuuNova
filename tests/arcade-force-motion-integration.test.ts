import { describe, expect, it } from "vitest";
import { createArcadeWorldQuestions } from "../src/lib/arcade-world-content";
import { ARCADE_PHYSICS_VERSION } from "../src/lib/novacore/arcade-physics";

describe("Force & Motion Lab NovaCore integration", () => {
  it("routes the live world-game generator through measured physics experiments", () => {
    const questions = createArcadeWorldQuestions("force-motion-lab", 4, 6);
    expect(questions).toHaveLength(6);
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toContain(question.answer);
      expect(question.scene?.meterLabels).toHaveLength(3);
      expect(question.explanation).toMatch(/NovaCore|fixed-step/i);
    }
    expect(questions[0].scene?.cue).toContain(ARCADE_PHYSICS_VERSION);
  });
});
