import { describe, expect, it } from "vitest";
import { arcadeCopyLooksBroken, polishArcadeQuestionCopy } from "../src/lib/arcade-copy-quality";
import { createNovaMillionaireQuestions } from "../src/lib/nova-millionaire-content";

describe("Nova Millionaire v2 content quality", () => {
  it("builds a ten-spotlight show from genuinely different reasoning scenes", () => {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      const questions = createNovaMillionaireQuestions(difficulty, 10);
      const modes = new Set(questions.map((question) => question.scene.mode));
      expect(questions).toHaveLength(10);
      expect(modes.size).toBeGreaterThanOrEqual(8);
      expect(questions.filter((question) => question.scene.mode === "pattern-wall").length).toBeLessThanOrEqual(2);
    }
  });

  it("does not collapse back into a next-number quiz", () => {
    const questions = createNovaMillionaireQuestions(2, 10);
    const numericSequencePrompts = questions.filter((question) => /\d+\s*,\s*\d+\s*,\s*\d+/.test(question.prompt));
    const evidenceOrDeduction = questions.filter((question) => ["case-file", "evidence-desk", "rule-gate", "logic-switch"].includes(question.scene.mode));
    expect(numericSequencePrompts.length).toBeLessThanOrEqual(2);
    expect(evidenceOrDeduction.length).toBeGreaterThanOrEqual(4);
  });

  it("ships every spotlight with four usable choices, one valid answer and an explanation", () => {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      for (const question of createNovaMillionaireQuestions(difficulty, 10)) {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.options).toContain(question.answer);
        expect(question.explanation.trim().length).toBeGreaterThan(12);
        expect(question.scene.title.trim().length).toBeGreaterThan(3);
        expect(question.scene.instruction.trim().length).toBeGreaterThan(8);
      }
    }
  });

  it("repairs known broken learner-facing grammar at the presentation boundary", () => {
    const bad = { prompt: "Complete the sentence.", explanation: "They takes are in the present tense." };
    expect(arcadeCopyLooksBroken(bad.explanation)).toBe(true);
    const polished = polishArcadeQuestionCopy(bad);
    expect(polished.explanation).toBe("Use ‘are’ with the plural subject ‘they’ in the present tense.");
    expect(arcadeCopyLooksBroken(polished.explanation)).toBe(false);
  });
});
