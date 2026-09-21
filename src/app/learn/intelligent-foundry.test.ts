import { describe, expect, it } from "vitest";
import { isCorrectAnswer } from "./learn-domain";
import {
  buildIntelligentQuestions,
  intelligentCapacityForSelection,
  intelligentTemplatesForSelection,
} from "./intelligent-foundry";

const shsMath = {
  lane: "school" as const,
  programId: "shs-general-science",
  levelId: "shs-1",
  subjectId: "core-mathematics",
  topicId: "all",
  mode: "adaptive" as const,
  count: 100,
  seed: 20260919,
};

describe("SukuuNova intelligent question foundry", () => {
  it("exposes genuinely massive deterministic capacity for a broad SHS subject", () => {
    expect(intelligentCapacityForSelection(shsMath)).toBeGreaterThan(10_000_000);
    expect(intelligentTemplatesForSelection(shsMath).length).toBeGreaterThanOrEqual(4);
  });

  it("creates 100 unique mixed-form questions without storing 100 rows", () => {
    const first = buildIntelligentQuestions(shsMath, 100, shsMath.seed);
    const second = buildIntelligentQuestions(shsMath, 100, shsMath.seed);

    expect(first).toHaveLength(100);
    expect(new Set(first.map((question) => question.exposureKey)).size).toBe(100);
    expect(new Set(first.map((question) => question.prompt)).size).toBeGreaterThanOrEqual(95);
    expect(new Set(first.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(first.map((question) => question.kind)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(first.map((question) => question.challenge)).size).toBeGreaterThanOrEqual(2);
    expect(first.every((question) => Boolean(question.mission))).toBe(true);
    expect(second.map((question) => question.id)).toEqual(first.map((question) => question.id));
  });

  it("moves to a fresh generated region when the seed changes", () => {
    const first = buildIntelligentQuestions(shsMath, 60, 101);
    const second = buildIntelligentQuestions(shsMath, 60, 202);
    const seen = new Set(first.map((question) => question.exposureKey));
    expect(second.every((question) => !seen.has(question.exposureKey))).toBe(true);
  });

  it("generates answers that pass the shared scorer", () => {
    const selections = [
      shsMath,
      {
        ...shsMath,
        subjectId: "physics",
      },
      {
        lane: "university" as const,
        programId: "computer-science",
        levelId: "level-100",
        subjectId: "programming",
        topicId: "all",
        mode: "adaptive" as const,
        count: 40,
        seed: 99,
      },
      {
        lane: "university" as const,
        programId: "law",
        levelId: "level-100",
        subjectId: "law-of-contract-i",
        topicId: "all",
        mode: "adaptive" as const,
        count: 40,
        seed: 77,
      },
    ];

    for (const selection of selections) {
      const questions = buildIntelligentQuestions(selection, 40, selection.seed);
      expect(questions.length, `${selection.programId}/${selection.subjectId}`).toBeGreaterThan(0);
      expect(
        questions.every((question) => isCorrectAnswer(question, question.answer)),
        `${selection.programId}/${selection.subjectId}`,
      ).toBe(true);
    }
  });

  it("keeps generated scenarios inside the selected academic domain", () => {
    const medicine = buildIntelligentQuestions({
      lane: "university",
      programId: "medicine",
      levelId: "level-100",
      subjectId: "human-physiology",
      topicId: "all",
      mode: "adaptive",
      count: 24,
      seed: 20260921,
    }, 24, 20260921);

    expect(medicine.length).toBeGreaterThan(0);
    expect(medicine.some((question) => /hospital|clinic|health|medical|laboratory|care|physiology/i.test(question.prompt))).toBe(true);
    expect(medicine.every((question) => !/e-commerce warehouse|construction technology firm|fintech analytics team/i.test(question.prompt))).toBe(true);

    const contract = buildIntelligentQuestions({
      lane: "university",
      programId: "law",
      levelId: "level-100",
      subjectId: "law-of-contract-i",
      topicId: "all",
      mode: "adaptive",
      count: 24,
      seed: 20260922,
    }, 24, 20260922);

    expect(contract.length).toBeGreaterThan(0);
    expect(contract.some((question) => /agreement|transaction|contract|sale|lease/i.test(question.prompt))).toBe(true);
    expect(contract.every((question) => !/biomedical research laboratory|teaching hospital|physiology laboratory/i.test(question.prompt))).toBe(true);
  });

  it("uses modern scenario variation rather than a single repeated sentence frame", () => {
    const questions = buildIntelligentQuestions({
      lane: "university",
      programId: "computer-science",
      levelId: "level-100",
      subjectId: "programming",
      topicId: "all",
      mode: "adaptive",
      count: 80,
      seed: 314159,
    }, 80, 314159);

    expect(questions).toHaveLength(80);
    expect(new Set(questions.map((question) => question.prompt)).size).toBe(80);
    expect(questions.some((question) => /AI|cloud|cyber|robot|data|digital/i.test(question.prompt))).toBe(true);
  });
});
