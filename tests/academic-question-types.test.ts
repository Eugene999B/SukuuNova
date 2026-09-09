import { describe, expect, it } from "vitest";
import { validateAcademicQuestions } from "../src/lib/academic-work-validation";
import { gradeAcademicQuestions } from "../src/lib/academic-question-grading";

const q = (id: string, type: string, points: number, options: string[] = [], acceptedAnswers: string[] = []) => ({ id, type, points, options, acceptedAnswers });

describe("broader academic question types", () => {
  it("validates multiple-select, numeric, fill blank and ordering questions", () => {
    expect(() => validateAcademicQuestions([
      { type: "multiple_select", prompt: "Choose the prime numbers", points: 2, options: ["2", "3", "4"], acceptedAnswers: ["2", "3"] },
      { type: "numeric", prompt: "What is 2.5 + 2.5?", points: 2, acceptedAnswers: ["5", "5.0"] },
      { type: "fill_blank", prompt: "The capital of Ghana is ___.", points: 2, acceptedAnswers: ["Accra"] },
      { type: "ordering", prompt: "Put these in ascending order", points: 4, options: ["3", "1", "2"], acceptedAnswers: ["1", "2", "3"] },
    ], 10, "auto")).not.toThrow();
  });

  it("rejects incomplete or ambiguous objective definitions", () => {
    expect(() => validateAcademicQuestions([{ type: "multiple_select", prompt: "Choose", points: 1, options: ["A", "B"], acceptedAnswers: ["C"] }], 1, "auto")).toThrow(/option list/);
    expect(() => validateAcademicQuestions([{ type: "numeric", prompt: "Number", points: 1, acceptedAnswers: ["five"] }], 1, "auto")).toThrow(/numeric/);
    expect(() => validateAcademicQuestions([{ type: "fill_blank", prompt: "Capital of Ghana", points: 1, acceptedAnswers: ["Accra"] }], 1, "auto")).toThrow(/___/);
    expect(() => validateAcademicQuestions([{ type: "ordering", prompt: "Order", points: 1, options: ["A", "B", "C"], acceptedAnswers: ["A", "B"] }], 1, "auto")).toThrow(/every option/);
  });

  it("auto-grades the new objective response shapes without exposing answer keys", () => {
    const questions = [
      q("multi", "multiple_select", 2, ["2", "3", "4"], ["2", "3"]),
      q("number", "numeric", 2, [], ["5", "5.0"]),
      q("blank", "fill_blank", 2, [], ["Accra"]),
      q("order", "ordering", 4, ["3", "1", "2"], ["1", "2", "3"]),
    ];
    const answers = new Map([
      ["multi", { responseData: ["3", "2"] }],
      ["number", { responseText: "5.000" }],
      ["blank", { responseText: "  ACCRA " }],
      ["order", { responseData: ["1", "2", "3"] }],
    ]);
    const graded = gradeAcademicQuestions(questions, answers, null, "auto");
    expect(graded.map(item => item.score)).toEqual([2, 2, 2, 4]);
    expect(graded.every(item => item.markingMode === "auto")).toBe(true);
  });

  it("does not award partial objective credit for incomplete sets or wrong order", () => {
    const questions = [
      q("multi", "multiple_select", 5, ["A", "B", "C"], ["A", "C"]),
      q("order", "ordering", 5, ["A", "B", "C"], ["B", "A", "C"]),
    ];
    const graded = gradeAcademicQuestions(questions, new Map([
      ["multi", { responseData: ["A"] }],
      ["order", { responseData: ["A", "B", "C"] }],
    ]), null, "auto");
    expect(graded.map(item => item.score)).toEqual([0, 0]);
  });
});
