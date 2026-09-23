import { describe, expect, it } from "vitest";
import {
  buildLearningSession,
  isCorrectAnswer,
  rebalanceAdaptiveSession,
  sessionDiagnostics,
  type LearnQuestion,
} from "./learning-engine";
import { catalogFor } from "./learn-domain";

const baseConfig = {
  lane: "school" as const,
  programId: "ghana",
  levelId: "jhs-1",
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
      levelId: "jhs-1",
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
      levelId: "jhs-1",
      subjectId: "computing",
      topicId: "coding",
      mode: "topic",
      count: 2,
      seed: 20260917,
    });

    const currentTopic = catalogFor("school").programs
      .find((program) => program.id === "ghana")?.levels
      .find((level) => level.id === "jhs-1")?.subjects
      .find((subject) => subject.id === "computing")?.topics
      .find((topic) => topic.id === "coding")?.label;

    expect(session).toHaveLength(2);
    expect(currentTopic).toBeTruthy();
    expect(session.every((item) => item.subject === "Computing" && item.topic === currentTopic)).toBe(true);
  });

  it("routes newly covered topics to reviewed content before generated fallback", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "jhs-1",
      subjectId: "mathematics",
      topicId: "geometry",
      mode: "topic",
      count: 1,
      seed: 20260917,
    });

    expect(session).toHaveLength(1);
    expect(session[0].id).toBe("expand-math-geometry-001");
  });

  it("fills SHS topics from SHS generators without leaking JHS reviewed fixed questions", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "shs-general-science",
      levelId: "shs-2",
      subjectId: "computing",
      topicId: "digital-safety-and-ethics",
      mode: "topic",
      count: 10,
      seed: 44,
    });
    expect(session).toHaveLength(10);
    expect(session.every((item) => !item.id.startsWith("starter-"))).toBe(true);
    expect(session.every((item) => item.topic === "Digital safety & ethics")).toBe(true);
  });

  it("fills WASSCE selections from exam generators without leaking JHS reviewed fixed questions", () => {
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
    expect(session).toHaveLength(10);
    expect(session.every((item) => !item.id.startsWith("starter-"))).toBe(true);
    expect(session.every((item) => item.subject === "Social Studies" && item.topic === "Governance")).toBe(true);
  });

  it("never repeats an exposure key and does not flood a session with one generated skill", () => {
    const session = buildLearningSession({ ...baseConfig, count: 100, seed: 77 });
    const diagnostics = sessionDiagnostics(session);
    const generatedBySkill = session
      .filter((item) => item.exposureKey.startsWith("variant:"))
      .reduce<Record<string, number>>((counts, item) => {
        counts[item.skill] = (counts[item.skill] ?? 0) + 1;
        return counts;
      }, {});

    expect(session.length).toBeGreaterThan(0);
    expect(session.length).toBeLessThanOrEqual(100);
    expect(new Set(session.map(q=>q.prompt.toLowerCase().replace(/\s+/g," ").trim())).size).toBe(session.length);
    expect(diagnostics.uniqueExposureCount).toBe(session.length);
    expect(Object.values(generatedBySkill).every((count) => count <= 4)).toBe(true);
  });

  it("caps oversized requests without inventing extra content depth", () => {
    const session = buildLearningSession({ ...baseConfig, count: 999, seed: 101 });
    expect(session.length).toBeGreaterThan(0);
    expect(session.length).toBeLessThanOrEqual(100);
    expect(new Set(session.map((item) => item.exposureKey)).size).toBe(session.length);
  });

  it("prefers fresh generated variants before recycling reviewed questions", () => {
    const first = buildLearningSession({ ...baseConfig, count: 30, seed: 31 });
    const seen = first.map((item) => item.exposureKey);
    const second = buildLearningSession({ ...baseConfig, count: 30, seed: 32, seen });
    const firstGenerated = new Set(first.filter((item) => item.exposureKey.startsWith("variant:")).map((item) => item.exposureKey));
    const secondGenerated = second.filter((item) => item.exposureKey.startsWith("variant:"));

    expect(secondGenerated.length).toBeGreaterThan(0);
    expect(secondGenerated.every((item) => !firstGenerated.has(item.exposureKey))).toBe(true);
  });


  it("fills a 100-question SHS session from intelligent generators without repeats", () => {
    const session = buildLearningSession({
      lane: "school",
      programId: "shs-general-science",
      levelId: "shs-1",
      subjectId: "core-mathematics",
      topicId: "all",
      mode: "adaptive",
      count: 100,
      seed: 424242,
      mastery: {},
      streak: 0,
    });

    expect(session).toHaveLength(100);
    expect(new Set(session.map((item) => item.exposureKey)).size).toBe(100);
    expect(new Set(session.map((item) => item.generationFamily).filter(Boolean)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(session.map((item) => item.kind)).size).toBeGreaterThanOrEqual(2);

    let longestFamilyRun = 0;
    let currentRun = 0;
    let lastFamily: string | undefined;
    for (const item of session) {
      if (item.generationFamily && item.generationFamily === lastFamily) currentRun += 1;
      else currentRun = item.generationFamily ? 1 : 0;
      lastFamily = item.generationFamily;
      longestFamilyRun = Math.max(longestFamilyRun, currentRun);
    }
    expect(longestFamilyRun).toBeLessThanOrEqual(2);
  });

  it("rebalances a live adaptive session after every answer", () => {
    const questions = [
      question({ id: "current", exposureKey: "current", difficulty: 3, topic: "Algebra", generationFamily: "a" }),
      question({ id: "easy", exposureKey: "easy", difficulty: 1, topic: "Geometry", generationFamily: "b" }),
      question({ id: "repair", exposureKey: "repair", difficulty: 2, topic: "Algebra", generationFamily: "c" }),
      question({ id: "stretch", exposureKey: "stretch", difficulty: 4, topic: "Geometry", generationFamily: "d" }),
      question({ id: "hard", exposureKey: "hard", difficulty: 5, topic: "Statistics", generationFamily: "e" }),
    ];

    const afterCorrect = rebalanceAdaptiveSession(questions, 0, true, 1, 7);
    expect(afterCorrect[1].difficulty).toBe(4);

    const afterWrong = rebalanceAdaptiveSession(questions, 0, false, 0, 7);
    expect(afterWrong[1].difficulty).toBe(2);
    expect(afterWrong[1].topic).toBe("Algebra");
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
