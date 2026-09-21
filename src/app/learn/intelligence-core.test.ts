import { describe, expect, it } from "vitest";
import type { LearnQuestion, SessionConfig } from "./learn-domain";
import { composeIntelligentOrder, questionPatternSignature, sessionIntelligenceDiagnostics } from "./intelligence-core";

const config: SessionConfig = {
  lane: "school",
  programId: "ghana",
  levelId: "jhs-2",
  subjectId: "mathematics",
  topicId: "geometry",
  mode: "topic",
  count: 12,
  seed: 99,
};

function q(index: number, family: string, kind: LearnQuestion["kind"], challenge: LearnQuestion["challenge"], stimulus?: LearnQuestion["stimulus"]): LearnQuestion {
  return {
    id: "q-" + index,
    exposureKey: "q:" + index,
    kind,
    subject: "Mathematics",
    topic: "Geometry",
    skill: family,
    difficulty: 4,
    prompt: index % 2 === 0 ? `Calculate the value shown in question ${index}.` : `Use the diagram to determine the missing value ${index}.`,
    options: kind === "single" ? [{ id: "a", label: "1" }, { id: "b", label: "2" }] : undefined,
    answer: kind === "single" ? "a" : 1,
    acceptedAnswers: kind === "numeric" || kind === "fill" || kind === "short" ? ["1"] : undefined,
    explanation: "Explanation",
    generationFamily: family,
    challenge,
    stimulus,
  };
}

describe("Learn intelligence core", () => {
  it("penalizes repeated generator families and response formats", () => {
    const questions = [
      q(1,"same","single","Recall"),
      q(2,"same","single","Recall"),
      q(3,"same","single","Recall"),
      q(4,"diagram","fill","Analyse",{kind:"diagram",diagram:"triangle",ariaLabel:"Triangle"}),
      q(5,"passage","short","Evaluate",{kind:"passage",text:"A short passage."}),
      q(6,"table","numeric","Apply",{kind:"table",columns:["A"],rows:[["1"]]}),
      q(7,"multi","multi","Transfer"),
    ];

    const ordered = composeIntelligentOrder(questions, config, 123);
    expect(ordered).toHaveLength(questions.length);
    expect(new Set(ordered.map((question) => question.exposureKey)).size).toBe(questions.length);
    expect(ordered.slice(0,4).filter((question) => question.generationFamily === "same").length).toBeLessThanOrEqual(2);
    expect(new Set(ordered.slice(0,5).map((question) => question.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it("tracks real cognitive and presentation diversity rather than only question count", () => {
    const questions = [
      q(1,"a","single","Recall"),
      q(2,"b","fill","Apply"),
      q(3,"c","short","Analyse",{kind:"passage",text:"Read this text."}),
      q(4,"d","numeric","Evaluate",{kind:"diagram",diagram:"rectangle",ariaLabel:"Rectangle"}),
      q(5,"e","multi","Transfer",{kind:"table",columns:["x"],rows:[["1"]]}),
    ];

    const diagnostics = sessionIntelligenceDiagnostics(questions);
    expect(diagnostics.kindCount).toBe(5);
    expect(diagnostics.familyCount).toBe(5);
    expect(diagnostics.challengeCount).toBe(5);
    expect(diagnostics.richStimulusCount).toBe(3);
    expect(diagnostics.higherOrderCount).toBe(3);
    expect(diagnostics.constructedResponseCount).toBe(3);
  });

  it("recognizes prompt patterns even when only numbers change", () => {
    const first = q(1,"math","numeric","Apply");
    const second = { ...q(2,"math","numeric","Apply"), prompt: "Calculate the value shown in question 999." };
    expect(questionPatternSignature(first)).toBe(questionPatternSignature(second));
  });
});
