import { describe, expect, it } from "vitest";
import { normalizeLearnerProgress } from "./learner-progress";
import { buildStudyPlan } from "./study-plan";

describe("SukuuNova evidence-driven study plan", () => {
  it("builds a seven-day baseline without inventing weak areas", () => {
    const progress = normalizeLearnerProgress({ answered: 0, correct: 0, mastery: {} });
    const plan = buildStudyPlan(progress);

    expect(plan.kind).toBe("baseline");
    expect(plan.days).toHaveLength(7);
    expect(plan.days.some((item) => item.task.kind === "repair")).toBe(false);
    expect(plan.days.filter((item) => item.task.kind === "recovery")).toHaveLength(2);
  });

  it("spaces the strongest repair signal instead of drilling it on consecutive days", () => {
    const progress = normalizeLearnerProgress({
      answered: 16,
      correct: 8,
      mastery: {
        "Mathematics · Geometry": { answered: 5, correct: 1 },
        "English Language · Writing": { answered: 5, correct: 3 },
        "Science · Systems": { answered: 4, correct: 4 },
        "Computing · Data & information": { answered: 2, correct: 0 },
      },
    });
    const plan = buildStudyPlan(progress);
    const geometryDays = plan.days.filter((item) => item.task.topic === "Geometry").map((item) => item.day);

    expect(plan.kind).toBe("personalized");
    expect(plan.primaryTopic).toBe("Mathematics · Geometry");
    expect(geometryDays).toEqual([1, 3, 6]);
    expect(geometryDays.every((value, index) => index === 0 || value - geometryDays[index - 1] > 1)).toBe(true);
  });

  it("keeps secure-only evidence in maintenance review rather than repair", () => {
    const progress = normalizeLearnerProgress({
      answered: 8,
      correct: 8,
      mastery: {
        "Science · Systems": { answered: 4, correct: 4 },
        "English Language · Reading": { answered: 4, correct: 4 },
      },
    });
    const plan = buildStudyPlan(progress);
    const kinds = plan.days.map((item) => item.task.kind);

    expect(plan.kind).toBe("maintenance");
    expect(kinds).toContain("review");
    expect(kinds).not.toContain("repair");
    expect(kinds).not.toContain("strengthen");
  });

  it("treats low-evidence topics as evidence gathering, not weakness", () => {
    const progress = normalizeLearnerProgress({
      answered: 2,
      correct: 2,
      mastery: { "Computing · Internet & networks": { answered: 2, correct: 2 } },
    });
    const plan = buildStudyPlan(progress);

    expect(plan.kind).toBe("personalized");
    expect(plan.days[0].task.kind).toBe("evidence");
    expect(plan.days[0].task.topic).toBe("Internet & networks");
  });

  it("caps every day and reports workload from the final clipped plan", () => {
    const progress = normalizeLearnerProgress({
      answered: 10,
      correct: 3,
      mastery: { "Mathematics · Algebra": { answered: 10, correct: 3 } },
    });
    const plan = buildStudyPlan(progress, 6);
    const summed = plan.days.reduce((total, item) => total + item.totalQuestions, 0);

    expect(plan.maxDailyQuestions).toBe(6);
    expect(plan.days.every((item) => item.totalQuestions <= 6)).toBe(true);
    expect(plan.totalQuestions).toBe(summed);
  });

  it("clamps unsafe daily caps into the supported five-to-twenty range", () => {
    const progress = normalizeLearnerProgress({ answered: 0, correct: 0, mastery: {} });
    expect(buildStudyPlan(progress, 1).maxDailyQuestions).toBe(5);
    expect(buildStudyPlan(progress, 100).maxDailyQuestions).toBe(20);
  });
});
