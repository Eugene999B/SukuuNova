import { describe, expect, it } from "vitest";
import {
  buildLearningSession,
  isCorrectAnswer,
  sessionDiagnostics,
  type LearnQuestion,
} from "./learning-engine";

const baseConfig = {
  lane: "school" as const,
  programId: "ghana",
  levelId: "jhs-3",
  subjectId: "science",
  topicId: "living",
  mode: "random" as const,
  count: 20,
};

function question(overrides: Partial<LearnQuestion>): LearnQuestion {
  return {
    id: "fixture",
    exposureKey: "fixture",
    kind: "single",
    subject: "Test",
    topic: "Test",
    skill: "Test",
    difficulty: 1,
    prompt: "Fixture",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    answer: "a",
    explanation: "Fixture explanation",
    ...overrides,
  };
}

describe("SukuuNova Learn session engine", () => {
  it("builds deterministic sessions when a seed is supplied", () => {
    const first = buildLearningSession({ ...baseConfig, seed: 20260917 });
    const second = buildLearningSession({ ...baseConfig, seed: 20260917 });

    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
    expect(second.map((item) => item.exposureKey)).toEqual(first.map((item) => item.exposureKey));
  });

  it("prefers released Foundry questions for strict topic practice", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "jhs-3",
      subjectId: "computing",
      topicId: "digital-safety",
      mode: "topic",
      count: 2,
      seed: 20260917,
    });

    expect(session.map((item) => item.id)).toEqual([
      "starter-computing-safety-001",
      "starter-computing-safety-002",
    ]);
  });

  it("resolves catalog ids to their labels before strict topic matching", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "jhs-3",
      subjectId: "computing",
      topicId: "coding",
      mode: "topic",
      count: 2,
      seed: 20260917,
    });

    expect(session).toHaveLength(2);
    expect(session.every((item) => item.subject === "Computing" && item.topic === "Computational thinking")).toBe(true);
  });

  it("routes newly covered topics to reviewed content before generated fallback", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "jhs-3",
      subjectId: "mathematics",
      topicId: "geometry",
      mode: "topic",
      count: 1,
      seed: 20260917,
    });

    expect(session).toHaveLength(1);
    expect(session[0].id).toBe("expand-math-geometry-001");
  });

  it("builds a broad all-subject/all-topic random session from eligible material only", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "jhs-3",
      subjectId: "all",
      topicId: "all",
      mode: "random",
      count: 100,
      seed: 20260918,
    });
    const subjects = new Set(session.map((item) => item.subject));

    expect(session).toHaveLength(100);
    expect(subjects.size).toBeGreaterThanOrEqual(4);
    expect(new Set(session.map((item) => item.exposureKey)).size).toBe(100);
  });

  it("builds subject-wide random practice without leaking into other subjects", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "jhs-3",
      subjectId: "mathematics",
      topicId: "all",
      mode: "random",
      count: 100,
      seed: 20260918,
    });

    expect(session).toHaveLength(100);
    expect(session.every((item) => item.subject === "Mathematics")).toBe(true);
    expect(new Set(session.map((item) => item.topic)).size).toBeGreaterThanOrEqual(3);
  });

  it("does not leak JHS reviewed fixed questions into SHS topics", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "shs-2",
      subjectId: "computing",
      topicId: "digital-safety",
      mode: "topic",
      count: 10,
      seed: 44,
    });
    expect(session).toEqual([]);
  });

  it("does not leak JHS reviewed fixed questions into WASSCE-only selections", () => {
    const session = buildLearningSession({
      lane: "exam",
      programId: "wassce",
      levelId: "practice",
      subjectId: "social",
      topicId: "governance",
      mode: "topic",
      count: 10,
      seed: 44,
    });
    expect(session).toEqual([]);
  });

  it("never repeats an exposure key inside a session", () => {
    const session = buildLearningSession({ ...baseConfig, count: 100, seed: 77 });
    const diagnostics = sessionDiagnostics(session);

    expect(session).toHaveLength(100);
    expect(diagnostics.uniqueExposureCount).toBe(100);
  });

  it("caps oversized requests at 100 questions", () => {
    const session = buildLearningSession({ ...baseConfig, count: 999, seed: 101 });
    expect(session).toHaveLength(100);
  });

  it("prefers fresh exposure keys over recently seen material", () => {
    const first = buildLearningSession({ ...baseConfig, count: 30, seed: 31 });
    const seen = first.map((item) => item.exposureKey);
    const second = buildLearningSession({ ...baseConfig, count: 30, seed: 32, seen });
    const overlap = second.filter((item) => seen.includes(item.exposureKey));

    expect(second).toHaveLength(30);
    expect(overlap).toHaveLength(0);
  });

  it("scores single-choice answers exactly", () => {
    const item = question({ kind: "single", answer: "b" });
    expect(isCorrectAnswer(item, "b")).toBe(true);
    expect(isCorrectAnswer(item, "a")).toBe(false);
  });

  it("scores multi-select answers independent of selection order", () => {
    const item = question({ kind: "multi", answer: ["safe", "mfa"] });
    expect(isCorrectAnswer(item, ["mfa", "safe"])).toBe(true);
    expect(isCorrectAnswer(item, ["safe"])).toBe(false);
  });

  it("normalizes fill and short-text answers", () => {
    const fill = question({ kind: "fill", answer: "are", acceptedAnswers: ["are"] });
    const short = question({ kind: "short", answer: "concise", acceptedAnswers: ["concise", "brief"] });

    expect(isCorrectAnswer(fill, "  ARE  ")).toBe(true);
    expect(isCorrectAnswer(short, "Brief")).toBe(true);
  });

  it("accepts equivalent numeric strings and rejects wrong values", () => {
    const item = question({ kind: "numeric", answer: 7 });
    expect(isCorrectAnswer(item, "7")).toBe(true);
    expect(isCorrectAnswer(item, 7)).toBe(true);
    expect(isCorrectAnswer(item, "7.1")).toBe(false);
  });

  it("scores true/false responses without text coercion", () => {
    const item = question({ kind: "boolean", answer: true });
    expect(isCorrectAnswer(item, true)).toBe(true);
    expect(isCorrectAnswer(item, false)).toBe(false);
    expect(isCorrectAnswer(item, "true")).toBe(false);
  });
});
