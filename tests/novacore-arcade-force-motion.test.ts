import { describe, expect, it } from "vitest";
import { createForceMotionQuestions } from "../src/lib/novacore/arcade-force-motion";
import { ARCADE_PHYSICS_VERSION } from "../src/lib/novacore/arcade-physics";

describe("NovaCore Force & Motion Arcade content", () => {
  it("generates measured simulation questions with valid answer contracts", () => {
    const questions = createForceMotionQuestions(4, 9);
    expect(questions).toHaveLength(9);
    for (const question of questions) {
      expect(question.kind).toBe("simulation");
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
      expect(question.scene.meterLabels).toHaveLength(3);
      expect(question.scene.cue.length).toBeGreaterThan(20);
      expect(question.explanation).toMatch(/NovaCore|fixed-step/i);
    }
  });

  it("derives acceleration answers from force divided by mass", () => {
    const [question] = createForceMotionQuestions(5, 1);
    const match = question.prompt.match(/A (\d+) kg cart is pushed horizontally with (\d+) N/);
    expect(match).not.toBeNull();
    const mass = Number(match![1]);
    const force = Number(match![2]);
    const answer = Number(question.answer.replace(" m/s²", ""));
    expect(answer).toBeCloseTo(force / mass, 8);
    expect(question.scene.cue).toContain(ARCADE_PHYSICS_VERSION);
  });

  it("cycles through acceleration, speed and displacement experiment families", () => {
    const questions = createForceMotionQuestions(3, 6);
    expect(questions[0].answer).toMatch(/m\/s²$/);
    expect(questions[1].answer).toMatch(/m\/s$/);
    expect(questions[2].answer).toMatch(/m$/);
    expect(questions[3].answer).toMatch(/m\/s²$/);
    expect(questions[4].answer).toMatch(/m\/s$/);
    expect(questions[5].answer).toMatch(/m$/);
  });
});
