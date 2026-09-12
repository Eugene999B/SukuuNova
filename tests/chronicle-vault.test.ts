import { describe, expect, it } from "vitest";
import { createChronicleVaultQuestions } from "../src/lib/chronicle-vault-content";
import {
  chronicleCaseDurationMs,
  chronicleChainGain,
  chronicleInsightReward,
  chronicleIntegrityReward,
  chronicleLensRecovery,
  chronicleParadoxDamage,
  chronicleRestoreOrder,
} from "../src/lib/chronicle-vault";

describe("Chronicle Vault controlled history content", () => {
  it("creates gradable history records with archive metadata", () => {
    const questions = createChronicleVaultQuestions(5, 36);
    expect(questions).toHaveLength(36);
    for (const question of questions) {
      expect(["sort_plus", "simulation"]).toContain(question.kind);
      expect(question.conceptKey.startsWith("chronicle:")).toBe(true);
      expect(question.scene.boardTitle).toBe("Chronicle Vault");
      expect(question.scene.contextClues.length).toBeGreaterThan(0);
      expect(question.scene.paradoxLevel).toBeGreaterThanOrEqual(1);
      expect(question.scene.paradoxLevel).toBeLessThanOrEqual(5);
      if (question.kind === "sort_plus") {
        const answer = JSON.parse(question.answer) as string[];
        expect(answer).toHaveLength(question.options.length);
        expect([...answer].sort()).toEqual([...question.options].sort());
      } else {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.options).toContain(question.answer);
      }
    }
  });

  it("starts with chronology before adding advanced source reasoning", () => {
    const questions = createChronicleVaultQuestions(1, 24);
    expect(questions.every((question) => question.scene.mission === "timeline")).toBe(true);
  });

  it("unlocks evidence, source and causation missions at higher difficulty", () => {
    const questions = createChronicleVaultQuestions(5, 60);
    const modes = new Set(questions.map((question) => question.scene.mission));
    expect(modes.has("timeline")).toBe(true);
    expect(modes.has("evidence")).toBe(true);
    expect(modes.has("source")).toBe(true);
    expect(modes.has("cause")).toBe(true);
  });
});

describe("Chronicle Vault mechanics", () => {
  it("gives supported learners more time with safe bounds", () => {
    expect(chronicleCaseDurationMs(4, 1.2, "guided")).toBeGreaterThan(chronicleCaseDurationMs(4, 1.2, "challenge"));
    expect(chronicleCaseDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(9000);
    expect(chronicleCaseDurationMs(-9, 0.01, "guided")).toBeLessThanOrEqual(28000);
  });

  it("bounds paradox damage and ChronoLens recovery", () => {
    expect(chronicleParadoxDamage(20, 1, false)).toBe(0);
    expect(chronicleParadoxDamage(100, 99, true)).toBeLessThanOrEqual(12);
    expect(chronicleLensRecovery(90, 0)).toBe(73);
    expect(chronicleLensRecovery(20, 2)).toBe(0);
  });

  it("rewards efficient historical reasoning", () => {
    expect(chronicleIntegrityReward(20, 5)).toBeGreaterThan(chronicleIntegrityReward(90, 1));
    expect(chronicleInsightReward(5, 20)).toBeLessThanOrEqual(7);
    expect(chronicleChainGain(20)).toBe(2);
    expect(chronicleChainGain(90)).toBe(0);
  });

  it("only restores saved timeline answers that are exact permutations", () => {
    const options = ["A", "B", "C", "D"];
    expect(chronicleRestoreOrder(JSON.stringify(["B", "A", "D", "C"]), options)).toEqual(["B", "A", "D", "C"]);
    expect(chronicleRestoreOrder(JSON.stringify(["A", "A", "C", "D"]), options)).toEqual(options);
    expect(chronicleRestoreOrder(JSON.stringify(["A", "B", "C", "X"]), options)).toEqual(options);
    expect(chronicleRestoreOrder("not-json", options)).toEqual(options);
  });
});
