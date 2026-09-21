import { describe, expect, it } from "vitest";
import type { LearnQuestion, SessionConfig } from "./learn-domain";
import {
  CLEARED_EXAM_QUESTION_BANK,
  examBankQuestionsForSelection,
  isAuthenticPastOrOfficialQuestion,
  validateExamQuestionRecord,
} from "./exam-question-bank";

const examConfig: SessionConfig = {
  lane: "exam",
  programId: "bece",
  levelId: "practice",
  subjectId: "mathematics",
  topicId: "geometry",
  mode: "topic",
  count: 10,
  seed: 1,
};

describe("provenance-safe exam bank", () => {
  it("never treats generated/original practice as a real past question", () => {
    const generated: LearnQuestion = {
      id: "generated",
      exposureKey: "generated:1",
      kind: "single",
      subject: "Mathematics",
      topic: "Geometry",
      skill: "Geometry",
      difficulty: 4,
      prompt: "Original practice prompt",
      options: [{ id: "a", label: "1" }, { id: "b", label: "2" }],
      answer: "a",
      explanation: "Original explanation",
      provenance: { sourceType: "original", rightsStatus: "not-applicable" },
    };

    expect(isAuthenticPastOrOfficialQuestion(generated)).toBe(false);
    expect(validateExamQuestionRecord(generated).valid).toBe(false);
  });

  it("requires cleared traceable provenance for official/past-paper records", () => {
    const cleared: LearnQuestion = {
      id: "cleared",
      exposureKey: "cleared:1",
      kind: "fill",
      subject: "Mathematics",
      topic: "Geometry",
      skill: "Geometry",
      difficulty: 4,
      prompt: "Cleared question text supplied under an allowed source workflow.",
      answer: "42",
      acceptedAnswers: ["42"],
      explanation: "Cleared explanation",
      provenance: {
        sourceType: "user-supplied-past",
        rightsStatus: "cleared",
        examBoard: "Example Board",
        exam: "BECE",
        year: 2025,
        paper: "Paper 2",
        sourceRef: "user-file:example",
      },
    };

    expect(isAuthenticPastOrOfficialQuestion(cleared)).toBe(true);
    expect(validateExamQuestionRecord(cleared)).toEqual({ valid: true });
  });

  it("ships no question falsely labelled as a past paper by default", () => {
    expect(CLEARED_EXAM_QUESTION_BANK).toHaveLength(0);
    expect(examBankQuestionsForSelection(examConfig)).toHaveLength(0);
  });
});
