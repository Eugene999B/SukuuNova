import { describe, expect, it } from "vitest";
import { buildRepairPlan, buildRepairSession } from "./repair-engine";
import { normalizeLearnerProgress } from "./learner-progress";

describe("SukuuNova weakness repair intelligence", () => {
  it("uses a baseline session when there is not enough evidence", () => {
    const progress = normalizeLearnerProgress({ sessions: 0, answered: 0, correct: 0, streak: 0, exposures: [], mastery: {} });
    const plan = buildRepairPlan(progress);
    const session = buildRepairSession(progress, 10, 20260917);

    expect(plan.kind).toBe("baseline");
    expect(session).toHaveLength(10);
    expect(new Set(session.map((question) => question.exposureKey)).size).toBe(10);
  });

  it("prioritizes proven repair evidence before developing and low-evidence topics", () => {
    const progress = normalizeLearnerProgress({
      sessions: 4,
      answered: 14,
      correct: 8,
      exposures: ["old-one"],
      mastery: {
        "Mathematics · Geometry": { answered: 5, correct: 1 },
        "English Language · Writing": { answered: 4, correct: 3 },
        "Computing · Internet & networks": { answered: 2, correct: 2 },
      },
    });
    const plan = buildRepairPlan(progress);

    expect(plan.kind).toBe("targeted");
    expect(plan.band).toBe("repair");
    expect(plan.subject).toBe("Mathematics");
    expect(plan.topic).toBe("Geometry");
    expect(plan.alternatives.map((item) => item.topic)).toEqual(["Writing", "Internet & networks"]);
  });

  it("builds a deterministic targeted repair session with no repeated exposures", () => {
    const progress = normalizeLearnerProgress({
      answered: 5,
      correct: 1,
      exposures: [],
      mastery: { "Mathematics · Geometry": { answered: 5, correct: 1 } },
    });
    const first = buildRepairSession(progress, 10, 42);
    const second = buildRepairSession(progress, 10, 42);

    expect(first).toHaveLength(10);
    expect(second.map((question) => question.id)).toEqual(first.map((question) => question.id));
    expect(new Set(first.map((question) => question.exposureKey)).size).toBe(10);
    expect(first[0].topic).toBe("Geometry");
  });

  it("keeps the repair target ahead of broader support and orders the target adaptively", () => {
    const progress = normalizeLearnerProgress({
      answered: 5,
      correct: 1,
      mastery: { "Mathematics · Geometry": { answered: 5, correct: 1 } },
    });
    const session = buildRepairSession(progress, 20, 90);
    const firstSupportIndex = session.findIndex((question) => question.topic !== "Geometry");
    const target = firstSupportIndex === -1 ? session : session.slice(0, firstSupportIndex);
    const support = firstSupportIndex === -1 ? [] : session.slice(firstSupportIndex);
    const targetDifficulties = target.map((question) => question.difficulty);

    expect(target.length).toBeGreaterThan(0);
    expect(support.some((question) => question.topic === "Geometry")).toBe(false);
    expect(targetDifficulties).toEqual([...targetDifficulties].sort((left, right) => left - right));
  });

  it("caps repair sessions at 30 questions and floors tiny requests to 5", () => {
    const progress = normalizeLearnerProgress({ answered: 0, correct: 0, mastery: {} });
    expect(buildRepairSession(progress, 2, 7)).toHaveLength(5);
    expect(buildRepairSession(progress, 200, 7)).toHaveLength(30);
  });
});
