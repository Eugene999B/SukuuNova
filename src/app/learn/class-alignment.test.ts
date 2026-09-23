import { describe, expect, it } from "vitest";
import { buildCoverageQuestions } from "./coverage-foundry";
import { catalogFor, type SessionConfig } from "./learn-domain";
import { buildPrimaryMathQuestions, primaryMathCapacityForSelection } from "./primary-math-foundry";

function cfg(levelId: string, topicId: string, count = 40): SessionConfig {
  return {
    lane: "school",
    programId: "ghana",
    levelId,
    subjectId: "mathematics",
    topicId,
    mode: "topic",
    count,
    seed: 20260921,
  };
}

describe("class-aligned Ghana basic-school assessment", () => {
  it("publishes distinct mathematics progression for Basic 4, 5 and 6", () => {
    const ghana = catalogFor("school").programs.find((program) => program.id === "ghana")!;
    const topics = (levelId: string) => ghana.levels
      .find((level) => level.id === levelId)!
      .subjects.find((subject) => subject.id === "mathematics")!
      .topics.map((topic) => topic.id);

    expect(topics("basic-4")).toContain("multiplication-division");
    expect(topics("basic-4")).toContain("fractions-decimals");
    expect(topics("basic-5")).toContain("fractions-decimals-percentages");
    expect(topics("basic-5")).toContain("data-chance");
    expect(topics("basic-6")).toContain("ratio-proportion");
    expect(new Set(topics("basic-4"))).not.toEqual(new Set(topics("basic-5")));
    expect(new Set(topics("basic-5"))).not.toEqual(new Set(topics("basic-6")));
  });

  it("moves Computing forward by class instead of repeating one generic topic list", () => {
    const ghana = catalogFor("school").programs.find((program) => program.id === "ghana")!;
    const ids = (levelId: string) => ghana.levels
      .find((level) => level.id === levelId)!
      .subjects.find((subject) => subject.id === "computing")!
      .topics.map((topic) => topic.id);

    expect(ids("basic-4")).toContain("computer-parts");
    expect(ids("basic-5")).toContain("presentations");
    expect(ids("basic-6")).toContain("networks");
    expect(ids("basic-6")).toContain("coding");
  });

  it("does not serve lower-primary arithmetic patterns to Basic 4 operations", () => {
    const questions = buildPrimaryMathQuestions(cfg("basic-4", "operations", 60), 60, 413);
    expect(questions).toHaveLength(60);
    expect(new Set(questions.map((question) => question.exposureKey)).size).toBe(60);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(questions.map((question) => question.skill)).size).toBeGreaterThanOrEqual(4);
    expect(questions.every((question) => question.difficulty >= 3)).toBe(true);
    expect(questions.some((question) => question.prompt.startsWith("Calculate "))).toBe(true);
    expect(questions.filter((question) => question.prompt.startsWith("Calculate ")).length).toBeLessThan(25);
    for (const question of questions) {
      expect(question.prompt).not.toMatch(/^Calculate\s+\d{1,2}\s*[+−-]\s*\d{1,2}/);
    }
  });

  it("keeps Basic 1 operations on addition, subtraction and inverse reasoning", () => {
    const questions = buildPrimaryMathQuestions(cfg("basic-1", "operations", 30), 30, 911);
    expect(questions).toHaveLength(30);
    expect(questions.every((question) => !/multiply|division|divide|equal groups/i.test(question.skill))).toBe(true);
    expect(questions.every((question) => question.difficulty <= 2)).toBe(true);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBe(3);
  });

  it("gives upper-primary topics genuine million-scale class-specific capacity", () => {
    for (const [levelId, topicId] of [
      ["basic-4", "operations"],
      ["basic-5", "fractions-decimals-percentages"],
      ["basic-6", "ratio-proportion"],
    ] as const) {
      expect(primaryMathCapacityForSelection(cfg(levelId, topicId))).toBeGreaterThanOrEqual(1_000_000);
      expect(buildPrimaryMathQuestions(cfg(levelId, topicId, 50), 50, 1001)).toHaveLength(50);
    }
  });

  it("uses school-age science contexts and varied human assessment forms for Basic 4", () => {
    const config: SessionConfig = {
      lane: "school",
      programId: "ghana",
      levelId: "basic-4",
      subjectId: "science",
      topicId: "materials-mixtures",
      mode: "topic",
      count: 48,
      seed: 7331,
    };
    const questions = buildCoverageQuestions(config, 48, 7331);
    expect(questions).toHaveLength(48);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(questions.map((question) => question.prompt.slice(0, 28))).size).toBeGreaterThanOrEqual(8);
    expect(questions.filter(question=>question.challenge==="Recall").every(question=>question.difficulty===1)).toBe(true);
    expect(questions.some(question=>question.challenge==="Recall")).toBe(true);
    expect(questions.some(question=>question.challenge==="Analyse"||question.challenge==="Evaluate")).toBe(true);
    for (const question of questions) {
      expect(question.prompt.toLowerCase()).not.toMatch(/university|startup|portfolio|corporate|clinical trial|data centre/);
    }
  });

  it("expands JHS mathematics to the official strand/sub-strand shaped practice map", () => {
    const ghana = catalogFor("school").programs.find((program) => program.id === "ghana")!;
    const math = ghana.levels.find((level) => level.id === "jhs-2")!.subjects.find((subject) => subject.id === "mathematics")!;
    const ids = math.topics.map((topic) => topic.id);
    for (const id of [
      "number",
      "operations",
      "fractions-decimals-percentages",
      "ratio-proportion",
      "patterns",
      "algebraic-expressions",
      "variables-equations",
      "geometry",
      "measurement",
      "position-transformation",
      "data",
      "probability",
    ]) expect(ids).toContain(id);
  });
});
