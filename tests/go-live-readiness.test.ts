import { describe, expect, it } from "vitest";
import { evaluateGoLiveReadiness, type GoLiveMetrics } from "../src/lib/go-live-readiness";

const ready: GoLiveMetrics = {
  schoolActive: true,
  hasName: true,
  hasUniqueCode: true,
  hasLogo: true,
  hasBrandColors: true,
  hasSettings: true,
  hasCurrentAcademicYear: true,
  hasCurrentTerm: true,
  classCount: 8,
  subjectCount: 12,
  activeStaff: 20,
  staffWithoutRole: 0,
  staffNeedingPasswordChange: 0,
  teachingAssignments: 18,
  activeStudents: 240,
  studentsWithoutClass: 0,
  studentsWithoutGuardian: 0,
  feeItemCount: 5,
  communicationConfigured: true,
};

describe("school go-live readiness", () => {
  it("certifies a school only when the score is high and no hard blockers remain", () => {
    const result = evaluateGoLiveReadiness(ready);
    expect(result.score).toBe(100);
    expect(result.blockerCount).toBe(0);
    expect(result.readyToLaunch).toBe(true);
  });

  it("blocks launch when the current term is missing even if most other setup is complete", () => {
    const result = evaluateGoLiveReadiness({ ...ready, hasCurrentTerm: false });
    expect(result.steps.find((step) => step.key === "calendar")?.status).toBe("blocked");
    expect(result.blockerCount).toBeGreaterThan(0);
    expect(result.readyToLaunch).toBe(false);
  });

  it("scores learner and guardian coverage proportionally instead of treating partial setup as complete", () => {
    const result = evaluateGoLiveReadiness({
      ...ready,
      activeStudents: 100,
      studentsWithoutClass: 20,
      studentsWithoutGuardian: 30,
    });
    const learners = result.steps.find((step) => step.key === "students")!;
    const guardians = result.steps.find((step) => step.key === "guardians")!;
    expect(learners.status).toBe("attention");
    expect(learners.score).toBeLessThan(learners.weight);
    expect(guardians.status).toBe("blocked");
    expect(guardians.score).toBeLessThan(guardians.weight);
    expect(result.readyToLaunch).toBe(false);
  });

  it("does not make branding or communications hard blockers by themselves", () => {
    const result = evaluateGoLiveReadiness({
      ...ready,
      hasLogo: false,
      hasBrandColors: false,
      communicationConfigured: false,
    });
    expect(result.steps.find((step) => step.key === "profile")?.status).toBe("attention");
    expect(result.steps.find((step) => step.key === "communications")?.status).toBe("attention");
    expect(result.blockerCount).toBe(0);
    expect(result.readyToLaunch).toBe(false);
  });
});
