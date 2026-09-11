import { describe, expect, it } from "vitest";
import { buildAdaptiveLearningPlan, publicAdaptiveLearningPlan } from "../src/lib/adaptive-learning-director";

const round = (correct: number, roundLength = 5, difficulty = 2) => ({ correct, roundLength, difficulty });

describe("Adaptive Learning Director", () => {
  it("starts younger learners with age-capped guided onboarding", () => {
    const plan = buildAdaptiveLearningPlan({
      game: "math",
      ageBand: "age_6_8",
      suggestedDifficulty: 5,
      completedRounds: [],
      completedRoundCount: 0,
      missionId: "mission-one",
    });
    expect(plan.targetDifficulty).toBe(2);
    expect(plan.missionMode).toBe("onboarding");
    expect(plan.supportMode).toBe("guided");
    expect(plan.hintStrength).toBe(2);
    expect(plan.speedScale).toBeLessThan(1);
    expect(plan.hazardDensity).toBeLessThan(1);
    expect(plan.masteryPercent).toBeNull();
  });

  it("moves repeated struggle into a slower recovery mission", () => {
    const plan = buildAdaptiveLearningPlan({
      game: "math",
      ageBand: "age_9_11",
      suggestedDifficulty: 3,
      completedRounds: [round(1, 5, 3), round(2, 5, 3), round(4, 5, 3)],
      completedRoundCount: 3,
      missionId: "recovery-run",
    });
    expect(plan.missionMode).toBe("recovery");
    expect(plan.supportMode).toBe("guided");
    expect(plan.generationDifficulties.filter((value) => value === 2).length).toBeGreaterThan(plan.generationDifficulties.filter((value) => value === 3).length);
    expect(plan.hintStrength).toBe(2);
  });

  it("uses reinforcement before challenge when mastery is still developing", () => {
    const plan = buildAdaptiveLearningPlan({
      game: "math",
      ageBand: "age_12_14",
      suggestedDifficulty: 4,
      completedRounds: [round(3, 5, 4), round(3, 5, 4), round(4, 5, 4)],
      completedRoundCount: 3,
      missionId: "reinforcement-run",
    });
    expect(plan.missionMode).toBe("reinforcement");
    expect(plan.supportMode).toBe("supported");
    expect(plan.hintStrength).toBe(1);
  });

  it("unlocks stretch challenge pacing after sustained mastery", () => {
    const plan = buildAdaptiveLearningPlan({
      game: "math",
      ageBand: "age_15_18",
      suggestedDifficulty: 5,
      completedRounds: [round(5, 5, 5), round(5, 5, 5), round(5, 5, 5)],
      completedRoundCount: 3,
      missionId: "mastery-run",
    });
    expect(plan.missionMode).toBe("stretch");
    expect(plan.supportMode).toBe("challenge");
    expect(plan.speedScale).toBeGreaterThan(1);
    expect(plan.hintStrength).toBe(0);
  });

  it("keeps boss cadence tied to total mission history after the recent window is full", () => {
    const recent = Array.from({ length: 6 }, () => round(4, 5, 3));
    const ninthMission = buildAdaptiveLearningPlan({
      game: "math",
      ageBand: "age_9_11",
      suggestedDifficulty: 3,
      completedRounds: recent,
      completedRoundCount: 8,
      missionId: "mission-nine",
    });
    const tenthMission = buildAdaptiveLearningPlan({
      game: "math",
      ageBand: "age_9_11",
      suggestedDifficulty: 3,
      completedRounds: recent,
      completedRoundCount: 9,
      missionId: "mission-ten",
    });
    expect(ninthMission.bossGate).toBe(true);
    expect(tenthMission.bossGate).toBe(false);
  });

  it("selects a stable world for the same mission plan seed", () => {
    const input = {
      game: "math",
      ageBand: "age_9_11" as const,
      suggestedDifficulty: 3,
      completedRounds: [round(4), round(4)],
      completedRoundCount: 2,
      missionId: "stable-world",
    };
    expect(buildAdaptiveLearningPlan(input).worldKey).toBe(buildAdaptiveLearningPlan(input).worldKey);
  });

  it("publishes only the safe player-facing mission plan fields", () => {
    const internal = buildAdaptiveLearningPlan({
      game: "math",
      ageBand: "age_12_14",
      suggestedDifficulty: 4,
      completedRounds: [round(4, 5, 4), round(4, 5, 4)],
      completedRoundCount: 2,
      missionId: "public-plan",
    });
    const publicPlan = publicAdaptiveLearningPlan(internal);
    expect(publicPlan).not.toBeNull();
    expect(publicPlan).not.toHaveProperty("generationDifficulties");
    expect(publicPlan).not.toHaveProperty("reasonCodes");
    expect(publicPlan).not.toHaveProperty("recentAccuracy");
    expect(publicPlan).toMatchObject({ version: 1, targetDifficulty: 4 });
  });
});
