import { describe, expect, it } from "vitest";
import { CODEBOTS_CONTROLLED_CONCEPT_COUNT, CODEBOTS_MAX_CONTROLLED_DIFFICULTY, createCodeBotsQuestions } from "../src/lib/codebots-content";
import { codeBotsCycleDurationMs, codeBotsDebugRecovery, codeBotsEfficiencyChain, codeBotsFactoryZoneForCheckpoint, codeBotsOverheatDamage, codeBotsPowerReward, codeBotsZoneLabel } from "../src/lib/codebots-mission";

describe("CodeBots controlled content", () => {
  it("keeps a substantial curriculum-controlled concept bank across all five difficulty tiers", () => {
    expect(CODEBOTS_CONTROLLED_CONCEPT_COUNT).toBeGreaterThanOrEqual(30);
    expect(CODEBOTS_MAX_CONTROLLED_DIFFICULTY).toBe(5);
  });

  it("builds valid unique-command sort programs with private ordered answers", () => {
    const questions = createCodeBotsQuestions(3, 12);
    expect(questions).toHaveLength(12);
    for (const question of questions) {
      expect(question.kind).toBe("sort");
      expect(question.options.length).toBeGreaterThanOrEqual(4);
      expect(new Set(question.options).size).toBe(question.options.length);
      const answer = JSON.parse(question.answer) as string[];
      expect([...answer].sort()).toEqual([...question.options].sort());
      expect(question.scene.cue.length).toBeGreaterThan(8);
      expect(question.scene.meterLabels.length).toBeGreaterThan(0);
    }
  });

  it("keeps beginner generations away from advanced transaction concepts", () => {
    const beginner = createCodeBotsQuestions(1, 20);
    expect(beginner.every((question) => !question.scene.meterLabels.includes("transaction") && !question.scene.meterLabels.includes("deployment"))).toBe(true);
  });
});

describe("CodeBots factory mechanics", () => {
  it("rotates factory zones and reserves the Logic Core for boss builds", () => {
    expect(codeBotsZoneLabel(codeBotsFactoryZoneForCheckpoint(0))).toBe("Assembly Bay");
    expect(codeBotsZoneLabel(codeBotsFactoryZoneForCheckpoint(1))).toBe("Sensor Grid");
    expect(codeBotsZoneLabel(codeBotsFactoryZoneForCheckpoint(2))).toBe("Loop Reactor");
    expect(codeBotsFactoryZoneForCheckpoint(1, true)).toBe("logic-core");
  });

  it("gives supported learners more build time while bounding every cycle", () => {
    expect(codeBotsCycleDurationMs(4, 1.2, "guided")).toBeGreaterThan(codeBotsCycleDurationMs(4, 1.2, "challenge"));
    expect(codeBotsCycleDurationMs(99, 99, "challenge")).toBeGreaterThanOrEqual(6200);
    expect(codeBotsCycleDurationMs(-5, 0.01, "guided")).toBeLessThanOrEqual(18500);
  });

  it("caps overheat damage and never damages a cool line", () => {
    expect(codeBotsOverheatDamage(40, 1, false)).toBe(0);
    expect(codeBotsOverheatDamage(100, 99, true)).toBeLessThanOrEqual(15);
    expect(codeBotsOverheatDamage(100, 1, true)).toBeGreaterThan(codeBotsOverheatDamage(80, 1, false));
  });

  it("rewards efficient assembly and bounds debug recovery", () => {
    expect(codeBotsPowerReward(30, 6)).toBeGreaterThan(codeBotsPowerReward(90, 6));
    expect(codeBotsEfficiencyChain(2, 40)).toBe(3);
    expect(codeBotsEfficiencyChain(7, 90)).toBe(0);
    expect(codeBotsDebugRecovery(20, 2)).toBe(0);
    expect(codeBotsDebugRecovery(90, 0)).toBe(68);
  });
});
