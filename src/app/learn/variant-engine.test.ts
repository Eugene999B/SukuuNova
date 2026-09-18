import { describe, expect, it } from "vitest";
import { isCorrectAnswer } from "./learn-domain";
import {
  buildVariantQuestions,
  templatesForSelection,
  variantCapacityForSelection,
  VARIANT_TEMPLATES,
} from "./variant-engine";

const algebraConfig = {
  lane: "school" as const,
  programId: "ghana",
  levelId: "jhs-3",
  subjectId: "mathematics",
  topicId: "algebra",
  mode: "topic" as const,
  count: 100,
  seed: 20260918,
};

describe("SukuuNova parameterized variant engine", () => {
  it("publishes only large deterministic template spaces", () => {
    expect(VARIANT_TEMPLATES.length).toBeGreaterThanOrEqual(24);
    expect(VARIANT_TEMPLATES.every((template) => template.capacity >= 1_000_000)).toBe(true);
  });

  it("exposes multi-million algebra capacity without storing question rows", () => {
    expect(variantCapacityForSelection(algebraConfig)).toBeGreaterThan(1_000_000);
    expect(templatesForSelection(algebraConfig).map((template) => template.id)).toContain("math-linear-equations");
  });

  it("builds 100 unique deterministic variants for one strict topic", () => {
    const first = buildVariantQuestions(algebraConfig);
    const second = buildVariantQuestions(algebraConfig);

    expect(first).toHaveLength(100);
    expect(new Set(first.map((question) => question.exposureKey)).size).toBe(100);
    expect(second.map((question) => question.id)).toEqual(first.map((question) => question.id));
    expect(first.every((question) => question.subject === "Mathematics" && question.topic === "Algebra")).toBe(true);
  });

  it("moves to a different variant block when the seed changes", () => {
    const first = buildVariantQuestions({ ...algebraConfig, count: 30, seed: 31 });
    const second = buildVariantQuestions({ ...algebraConfig, count: 30, seed: 32 });
    const firstKeys = new Set(first.map((question) => question.exposureKey));

    expect(second.every((question) => !firstKeys.has(question.exposureKey))).toBe(true);
  });

  it("renders questions whose own stored answers pass the shared scorer", () => {
    for (const template of VARIANT_TEMPLATES) {
      const config = {
        lane: "school" as const,
        programId: "ghana",
        levelId: template.schoolLevels[0] ?? "jhs-3",
        subjectId: template.subjectId,
        topicId: template.topicId,
        mode: "topic" as const,
        count: 5,
        seed: 731,
      };
      const questions = buildVariantQuestions(config);
      expect(questions.length, template.id).toBeGreaterThan(0);
      expect(questions.every((question) => isCorrectAnswer(question, question.answer)), template.id).toBe(true);
    }
  });

  it("gives every JHS launch topic at least one million deterministic variants", () => {
    const launchTopics: Record<string, string[]> = {
      mathematics: ["number", "algebra", "geometry", "statistics"],
      english: ["grammar", "vocabulary", "reading", "writing"],
      science: ["living", "matter", "energy", "environment"],
      social: ["governance", "citizenship", "environment", "development"],
      computing: ["digital-safety", "systems", "internet", "coding"],
    };

    for (const [subjectId, topicIds] of Object.entries(launchTopics)) {
      for (const topicId of topicIds) {
        const capacity = variantCapacityForSelection({
          lane: "school",
          programId: "ghana",
          levelId: "jhs-3",
          subjectId,
          topicId,
          mode: "topic",
          count: 100,
          seed: 20260918,
        });
        expect(capacity, `${subjectId} · ${topicId}`).toBeGreaterThanOrEqual(1_000_000);
      }
    }
  });

  it("builds 100 unique generated questions inside every JHS launch topic", () => {
    const launchTopics: Record<string, string[]> = {
      mathematics: ["number", "algebra", "geometry", "statistics"],
      english: ["grammar", "vocabulary", "reading", "writing"],
      science: ["living", "matter", "energy", "environment"],
      social: ["governance", "citizenship", "environment", "development"],
      computing: ["digital-safety", "systems", "internet", "coding"],
    };

    for (const [subjectId, topicIds] of Object.entries(launchTopics)) {
      for (const topicId of topicIds) {
        const questions = buildVariantQuestions({
          lane: "school",
          programId: "ghana",
          levelId: "jhs-3",
          subjectId,
          topicId,
          mode: "topic",
          count: 100,
          seed: 9182026,
        });
        expect(questions, `${subjectId} · ${topicId}`).toHaveLength(100);
        expect(new Set(questions.map((question) => question.exposureKey)).size, `${subjectId} · ${topicId}`).toBe(100);
        expect(questions.every((question) => isCorrectAnswer(question, question.answer)), `${subjectId} · ${topicId}`).toBe(true);
      }
    }
  });

  it("keeps unsupported university selections out of school/exam templates", () => {
    const questions = buildVariantQuestions({
      lane: "university",
      programId: "computer-science",
      levelId: "foundation",
      subjectId: "programming",
      topicId: "variables",
      mode: "topic",
      count: 20,
      seed: 1,
    });
    expect(questions).toEqual([]);
  });
});
