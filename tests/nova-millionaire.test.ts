import { describe, expect, it } from "vitest";
import { millionaireCheckpointReached, millionaireLifelineTokens, millionaireReasoningCategory, millionaireReasoningCue, millionaireStageLabel } from "../src/lib/nova-millionaire";

describe("Nova Millionaire knowledge-show mechanics", () => {
  it("gives more answer-neutral support to guided learners without removing all challenge", () => {
    expect(millionaireLifelineTokens(2, "guided")).toBe(3);
    expect(millionaireLifelineTokens(3, "supported")).toBe(2);
    expect(millionaireLifelineTokens(5, "challenge")).toBe(1);
  });

  it("classifies reasoning prompts without needing the correct answer", () => {
    expect(millionaireReasoningCategory({ prompt:"What number comes next: 3, 6, 9, 12?" })).toBe("Pattern & sequence");
    expect(millionaireReasoningCategory({ prompt:"Which item does not belong in the group?" })).toBe("Classification");
    expect(millionaireReasoningCategory({ kind:"logic", prompt:"If every red card is marked, what must be true?" })).toBe("Deduction");
  });

  it("returns strategy clues that do not name or remove answer options", () => {
    const cue = millionaireReasoningCue({ prompt:"What number comes next: 4, 8, 12, 16?" });
    expect(cue).toContain("Compare each step");
    expect(cue).not.toContain("20");
    expect(cue.toLowerCase()).not.toContain("correct answer");
  });

  it("builds an untimed ten-step show ladder with visible checkpoints", () => {
    expect(millionaireStageLabel(0, 10)).toBe("First Light");
    expect(millionaireStageLabel(9, 10)).toBe("Nova Crown");
    expect(millionaireCheckpointReached(4, 10)).toBe(true);
    expect(millionaireCheckpointReached(9, 10)).toBe(true);
    expect(millionaireCheckpointReached(2, 10)).toBe(false);
  });
});
