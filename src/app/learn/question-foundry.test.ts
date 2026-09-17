import { describe, expect, it } from "vitest";
import {
  auditQuestionPack,
  isPublishable,
  releaseQuestion,
  validateFoundryQuestion,
  type FoundryQuestion,
} from "./question-foundry";

const completeChecks = [
  "answer-check",
  "ambiguity-check",
  "curriculum-check",
  "duplicate-check",
  "age-check",
] as const;

function validQuestion(overrides: Partial<FoundryQuestion> = {}): FoundryQuestion {
  return {
    id: "gh-jhs3-computing-safety-001",
    exposureKey: "computing-password-hygiene-001",
    kind: "multi",
    subject: "Computing",
    topic: "Digital safety",
    skill: "Apply safe account practices",
    difficulty: 2,
    prompt: "Which two actions improve the security of an important online account?",
    options: [
      { id: "unique", label: "Use a unique password" },
      { id: "mfa", label: "Enable multi-factor authentication" },
      { id: "share", label: "Share the password with a friend" },
      { id: "reuse", label: "Reuse one password everywhere" },
    ],
    answer: ["unique", "mfa"],
    explanation: "A unique password limits password-reuse risk, while multi-factor authentication adds another verification step.",
    version: 1,
    dna: {
      country: "GH",
      framework: "SukuuNova starter alignment",
      frameworkVersion: "2026.1",
      level: "JHS 3",
      subject: "Computing",
      topic: "Digital safety",
      objective: "Use secure authentication practices",
      skill: "Apply safe account practices",
      difficulty: 2,
      cognitiveSkill: "apply",
      language: "en-GH",
      estimatedSeconds: 45,
    },
    source: {
      kind: "original",
      name: "SukuuNova original content",
    },
    review: {
      status: "verified",
      checks: [...completeChecks],
      confidence: 0.97,
      reviewer: "SukuuNova content QA",
      reviewedAt: "2026-09-17T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("SukuuNova Question Foundry", () => {
  it("releases a structurally valid, fully verified original question", () => {
    const item = validQuestion();
    expect(validateFoundryQuestion(item)).toEqual([]);
    expect(isPublishable(item)).toBe(true);
    expect(releaseQuestion(item)).toMatchObject({ id: item.id, exposureKey: item.exposureKey, answer: item.answer });
  });

  it("blocks a single-choice answer that does not reference an option", () => {
    const item = validQuestion({
      kind: "single",
      answer: "missing",
      options: [
        { id: "a", label: "Option A" },
        { id: "b", label: "Option B" },
      ],
    });

    const issues = validateFoundryQuestion(item);
    expect(issues.some((issue) => issue.code === "single-answer" && issue.severity === "error")).toBe(true);
    expect(isPublishable(item)).toBe(false);
  });

  it("requires licence metadata for non-original content", () => {
    const item = validQuestion({ source: { kind: "open", name: "Open learning source" } });
    expect(validateFoundryQuestion(item).some((issue) => issue.code === "source-license")).toBe(true);
  });

  it("requires all publish checks and high confidence before release", () => {
    const item = validQuestion({
      review: {
        status: "verified",
        checks: ["answer-check", "curriculum-check"],
        confidence: 0.89,
      },
    });

    expect(isPublishable(item)).toBe(false);
    expect(releaseQuestion(item)).toBeNull();
  });

  it("audits duplicate concepts and duplicate prompts across a pack", () => {
    const first = validQuestion();
    const second = validQuestion({ id: "gh-jhs3-computing-safety-002" });
    const audit = auditQuestionPack([first, second]);

    expect(audit.duplicateExposureKeys).toEqual([first.exposureKey]);
    expect(audit.duplicatePrompts).toHaveLength(1);
    expect(audit.total).toBe(2);
  });

  it("holds malformed numeric questions", () => {
    const item = validQuestion({ kind: "numeric", answer: "seven" });
    expect(validateFoundryQuestion(item).some((issue) => issue.code === "numeric-answer")).toBe(true);
    expect(isPublishable(item)).toBe(false);
  });
});
