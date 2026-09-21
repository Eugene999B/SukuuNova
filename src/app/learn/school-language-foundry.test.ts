import { describe, expect, it } from "vitest";
import { catalogFor, type SessionConfig } from "./learn-domain";
import { buildLearningSession } from "./learning-engine";
import {
  buildSchoolLanguageQuestions,
  isNativeLanguageQuestion,
  languageCapacityForSelection,
} from "./school-language-foundry";

function config(subjectId: "french" | "ghanaian-language", topicId: string, levelId = "basic-4"): SessionConfig {
  return {
    lane: "school",
    programId: "ghana",
    levelId,
    subjectId,
    topicId,
    mode: "topic",
    count: 20,
    seed: 20260921,
  };
}

describe("native school-language practice", () => {
  it("makes the Ghanaian-language choice explicit instead of silently serving English", () => {
    const level = catalogFor("school").programs
      .find((program) => program.id === "ghana")?.levels
      .find((item) => item.id === "basic-4");
    const subject = level?.subjects.find((item) => item.id === "ghanaian-language");

    expect(subject?.label).toContain("Asante Twi");
    expect(subject?.topics.map((topic) => topic.id)).toEqual(
      expect.arrayContaining(["oral", "vocabulary", "grammar", "reading", "writing", "culture"]),
    );
  });

  it("builds French questions whose stems are actually French", () => {
    const questions = buildSchoolLanguageQuestions(config("french", "vocabulary"), 20, 41);

    expect(questions).toHaveLength(20);
    expect(new Set(questions.map((question) => question.prompt)).size).toBe(20);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(3);
    expect(questions.every(isNativeLanguageQuestion)).toBe(true);
    expect(questions.every((question) => !/^(which|what|choose|a learner)\b/i.test(question.prompt))).toBe(true);
  });

  it("builds Asante Twi questions whose stems are actually Twi", () => {
    const questions = buildSchoolLanguageQuestions(config("ghanaian-language", "vocabulary"), 20, 77);

    expect(questions).toHaveLength(20);
    expect(new Set(questions.map((question) => question.prompt)).size).toBe(20);
    expect(new Set(questions.map((question) => question.generationFamily)).size).toBeGreaterThanOrEqual(3);
    expect(questions.every(isNativeLanguageQuestion)).toBe(true);
    expect(questions.some((question) => /[ɛɔ]/i.test(question.prompt))).toBe(true);
  });

  it("does not leak the generic English coverage foundry into exact French or Twi sessions", () => {
    for (const [subjectId, topicId] of [["french", "vocabulary"], ["ghanaian-language", "vocabulary"]] as const) {
      const session = buildLearningSession(config(subjectId, topicId));
      expect(session).toHaveLength(20);
      expect(session.every((question) => question.exposureKey.startsWith("language:"))).toBe(true);
      expect(session.every(isNativeLanguageQuestion)).toBe(true);
    }
  });

  it("keeps each language topic on million-scale deterministic capacity", () => {
    expect(languageCapacityForSelection(config("french", "reading"))).toBeGreaterThanOrEqual(1_000_000);
    expect(languageCapacityForSelection(config("ghanaian-language", "reading"))).toBeGreaterThanOrEqual(1_000_000);
  });

  it("keeps grammar practice inside grammar/editing families instead of mixing unrelated reading drills", () => {
    const french = buildSchoolLanguageQuestions(config("french", "grammar"), 12, 101);
    const twi = buildSchoolLanguageQuestions(config("ghanaian-language", "grammar"), 12, 102);

    for (const questions of [french, twi]) {
      expect(questions.length).toBeGreaterThanOrEqual(8);
      expect(questions.every((question) => /-(grammar|editing)$/.test(question.generationFamily ?? ""))).toBe(true);
    }
  });
});
