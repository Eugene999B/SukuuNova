import { describe, expect, it } from "vitest";
import { buildLearningSession } from "./learning-engine";
import { buildRichStimulusQuestions, richStimulusCapacityForSelection } from "./rich-stimulus-foundry";
import type { SessionConfig } from "./learn-domain";

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    lane: "school",
    programId: "ghana",
    levelId: "basic-4",
    subjectId: "mathematics",
    topicId: "geometry",
    mode: "topic",
    count: 20,
    seed: 20260921,
    ...overrides,
  };
}

describe("rich Learn stimuli", () => {
  it("builds geometry questions from diagrams instead of text-only repetition", () => {
    const questions = buildRichStimulusQuestions(config(), 36, 101);

    expect(questions).toHaveLength(36);
    expect(questions.every((question) => question.stimulus?.kind === "diagram")).toBe(true);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(questions.map((question) => question.kind)).size).toBeGreaterThanOrEqual(3);
    expect(questions.some((question) => question.kind === "fill")).toBe(true);
    expect(questions.some((question) => question.challenge === "Analyse")).toBe(true);
    expect(questions.every((question) => question.provenance?.sourceType === "original")).toBe(true);
    expect(richStimulusCapacityForSelection(config())).toBeGreaterThanOrEqual(1_000_000);
  });

  it("builds English comprehension around passages with varied response forms", () => {
    const reading = config({
      levelId: "basic-5",
      subjectId: "english",
      topicId: "reading",
      count: 30,
    });
    const questions = buildRichStimulusQuestions(reading, 30, 220);

    expect(questions).toHaveLength(30);
    expect(questions.every((question) => question.stimulus?.kind === "passage")).toBe(true);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(questions.map((question) => question.kind)).size).toBeGreaterThanOrEqual(3);
    expect(questions.some((question) => question.kind === "short")).toBe(true);
    expect(questions.some((question) => question.kind === "fill")).toBe(true);
    expect(questions.some((question) => question.challenge === "Evaluate")).toBe(true);
  });

  it("builds data interpretation from tables", () => {
    const data = config({
      levelId: "basic-6",
      subjectId: "mathematics",
      topicId: "data-chance",
      count: 20,
    });
    const questions = buildRichStimulusQuestions(data, 20, 330);

    expect(questions).toHaveLength(20);
    expect(questions.every((question) => question.stimulus?.kind === "table")).toBe(true);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(questions.map((question) => question.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it("actually surfaces rich questions inside learner sessions", () => {
    const geometrySession = buildLearningSession(config({ count: 12, seed: 410 }));
    const readingSession = buildLearningSession(config({
      levelId: "basic-5",
      subjectId: "english",
      topicId: "reading",
      count: 12,
      seed: 411,
    }));

    expect(geometrySession).toHaveLength(12);
    expect(geometrySession.some((question) => question.stimulus?.kind === "diagram")).toBe(true);
    expect(geometrySession.some((question) => question.kind === "fill")).toBe(true);

    expect(readingSession).toHaveLength(12);
    expect(readingSession.some((question) => question.stimulus?.kind === "passage")).toBe(true);
    expect(readingSession.some((question) => ["fill", "short"].includes(question.kind))).toBe(true);
  });
});
