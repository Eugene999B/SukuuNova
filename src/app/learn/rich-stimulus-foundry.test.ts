import { describe, expect, it } from "vitest";
import { buildLearningSession } from "./learning-engine";
import { buildRichStimulusQuestions, richStimulusCapacityForSelection } from "./rich-stimulus-foundry";
import { catalogFor, type SessionConfig } from "./learn-domain";

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
    expect(richStimulusCapacityForSelection(config())).toBe(6);
  });

  it("builds English comprehension around passages with varied response forms", () => {
    const reading = config({
      levelId: "basic-5",
      subjectId: "english",
      topicId: "reading",
      count: 30,
    });
    const questions = buildRichStimulusQuestions(reading, 30, 220);

    expect(questions).toHaveLength(24);
    expect(richStimulusCapacityForSelection(reading)).toBe(24);
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

describe("rich question mathematical and curriculum integrity", () => {
  it("only produces physically possible triangles with correct perimeters", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const questions = buildRichStimulusQuestions(config(), 60, seed);
      for (const question of questions.filter((q) => q.generationFamily === "rich-geometry-triangle-perimeter")) {
        if (question.stimulus?.kind !== "diagram") throw new Error("Missing triangle");
        const labels = question.stimulus.labels!;
        const sides = [Number(labels.leftSide), Number(labels.rightSide), Number(labels.base)].sort((a,b) => a-b);
        expect(sides[0] + sides[1]).toBeGreaterThan(sides[2]);
        expect(question.answer).toBe(sides.reduce((sum, side) => sum + side, 0));
      }
    }
  });

  it("includes all ten maths task families in mixed-topic sessions", () => {
    const questions = buildRichStimulusQuestions(config({ topicId: "all" }), 60, 901);
    expect(new Set(questions.map((q) => q.generationFamily)).size).toBe(10);
    expect(richStimulusCapacityForSelection(config({ topicId: "all" }))).toBe(10);
  });

  it("does not label simple table retrieval or range calculations as advanced exam questions", () => {
    const questions = buildRichStimulusQuestions(config({
      lane: "exam", programId: "bece", levelId: "practice",
      subjectId: "mathematics", topicId: "all",
    }), 80, 42);
    expect(questions.length).toBeGreaterThan(0);
    const ranges = questions.filter(q => q.generationFamily === "rich-data-table-range");
    const retrieval = questions.filter(q => q.generationFamily === "rich-data-table-maximum");
    expect(ranges.length).toBeGreaterThan(0);
    expect(retrieval.length).toBeGreaterThan(0);
    expect(ranges.every(q => q.difficulty === 2)).toBe(true);
    expect(retrieval.every(q => q.difficulty === 1)).toBe(true);
  });

  it("keeps elementary diagrams out of degree courses and early years", () => {
    for (const program of catalogFor("university").programs) {
      for (const level of program.levels) {
        for (const subject of level.subjects) {
          const selection = config({ lane: "university", programId: program.id, levelId: level.id, subjectId: subject.id, topicId: "all" });
          expect(buildRichStimulusQuestions(selection, 5, 2)).toEqual([]);
          expect(richStimulusCapacityForSelection(selection)).toBe(0);
        }
      }
    }
    expect(buildRichStimulusQuestions(config({ levelId: "basic-1", topicId: "all" }))).toEqual([]);
  });

  it("keeps renamed reading tasks from masquerading as fresh questions", () => {
    const reading = config({ levelId: "basic-5", subjectId: "english", topicId: "reading" });
    const first = buildRichStimulusQuestions(reading, 100, 51);
    const second = buildRichStimulusQuestions(reading, 100, 83);
    expect(first).toHaveLength(24);
    expect(second).toHaveLength(24);
    expect(new Set([...first, ...second].map(q => q.exposureKey)).size).toBe(24);
    const detail = first.filter(q => q.generationFamily === "rich-reading-detail");
    expect(detail.every(q => q.difficulty === 1)).toBe(true);
    for (const question of first.filter(q => q.generationFamily === "rich-reading-cloze")) {
      expect(question.stimulus?.kind === "passage" && question.stimulus.text.includes("guided by evidence")).toBe(true);
    }
  });

  it("accepts every day tied for the largest table entry", () => {
    const questions = buildRichStimulusQuestions(config({ levelId: "basic-6", topicId: "data-chance" }), 100, 31);
    const maximums = questions.filter(q => q.generationFamily === "rich-data-table-maximum");
    expect(maximums.length).toBeGreaterThan(0);
    for (const question of maximums) {
      if (question.stimulus?.kind !== "table") throw new Error("Missing data");
      const rows = question.stimulus.rows;
      const max = Math.max(...rows.map(row => Number(row[1])));
      expect(question.acceptedAnswers).toEqual(rows.filter(row => Number(row[1]) === max).map(row => row[0]));
    }
  });
});
