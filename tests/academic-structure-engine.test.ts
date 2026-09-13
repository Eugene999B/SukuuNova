import { describe, expect, it } from "vitest";
import {
  ACADEMIC_STRUCTURE_TEMPLATES,
  getAcademicStructureTemplate,
  validateAcademicStructureTemplate,
} from "../src/lib/academic-structure-templates";
import { planAcademicYearRollover } from "../src/lib/academic-rollover-planner";

describe("academic structure templates", () => {
  it("starts the Ghana default with the real early-years structure before KG and Basic", () => {
    const ghana = getAcademicStructureTemplate("ghana_standard");
    expect(ghana.levels.slice(0, 7).map((item) => item.name)).toEqual([
      "Creche",
      "Nursery 1",
      "Nursery 2",
      "KG 1",
      "KG 2",
      "Basic 1",
      "Basic 2",
    ]);
    expect(ghana.levels.at(-1)).toMatchObject({ name: "SHS 3", isTerminal: true, pathwayRequired: true });
    expect(ghana.pathways.map((item) => item.name)).toContain("General Science");
    expect(ghana.pathways.map((item) => item.name)).toContain("Technical / Vocational");
  });

  it("ships validated Ghana, British, American, Cambridge, Montessori, TVET and IB presets", () => {
    expect(ACADEMIC_STRUCTURE_TEMPLATES.map((item) => item.key)).toEqual([
      "ghana_standard",
      "british",
      "american",
      "cambridge",
      "montessori",
      "tvet",
      "ib",
    ]);
    for (const template of ACADEMIC_STRUCTURE_TEMPLATES) expect(() => validateAcademicStructureTemplate(template)).not.toThrow();
  });

  it("rejects cyclic default progression", () => {
    expect(() => validateAcademicStructureTemplate({
      key: "ghana_standard",
      name: "Broken",
      description: "Broken test",
      pathways: [],
      levels: [
        { key: "a", name: "A", phase: "Test", sequence: 1, kind: "grade" },
        { key: "b", name: "B", phase: "Test", sequence: 2, kind: "grade" },
      ],
      progression: [
        { from: "a", to: "b", outcome: "advance", isDefault: true },
        { from: "b", to: "a", outcome: "advance", isDefault: true },
      ],
    })).toThrow(/cycle/i);
  });
});

describe("academic year rollover planner", () => {
  const grades = [
    { id: "basic1", pathwayRequired: false },
    { id: "basic2", pathwayRequired: false },
    { id: "shs1", pathwayRequired: true },
    { id: "shs3", pathwayRequired: true },
  ];

  it("promotes to the next grade and separately balances section placement", () => {
    const plan = planAcademicYearRollover({
      learners: [
        { studentId: "ama", sourceYearEnrollmentId: "y1", sourceGradeLevelId: "basic1", sourcePathwayId: null, decision: null },
        { studentId: "kojo", sourceYearEnrollmentId: "y2", sourceGradeLevelId: "basic1", sourcePathwayId: null, decision: null },
      ],
      grades,
      rules: [{ fromGradeLevelId: "basic1", toGradeLevelId: "basic2", targetPathwayId: null, outcome: "advance", priority: 100, isDefault: true }],
      sections: [
        { id: "2a", gradeLevelId: "basic2", pathwayId: null, displayName: "Basic 2A", capacity: 30, classId: "class2a" },
        { id: "2b", gradeLevelId: "basic2", pathwayId: null, displayName: "Basic 2B", capacity: 30, classId: "class2b" },
      ],
      existingLoads: { "2a": 12, "2b": 10 },
    });
    expect(plan.items.map((item) => item.targetGradeLevelId)).toEqual(["basic2", "basic2"]);
    expect(plan.items.map((item) => item.targetClassSectionId)).toEqual(["2b", "2b"]);
    expect(plan.summary).toMatchObject({ ready: 2, blocked: 0, promoted: 2 });
  });

  it("requires a pathway before placing a learner into a pathway-based level", () => {
    const plan = planAcademicYearRollover({
      learners: [{ studentId: "esi", sourceYearEnrollmentId: "y3", sourceGradeLevelId: "basic2", sourcePathwayId: null, decision: { id: "d1", outcome: "promoted", targetGradeLevelId: "shs1", targetPathwayId: null } }],
      grades,
      rules: [],
      sections: [{ id: "science-a", gradeLevelId: "shs1", pathwayId: "science", displayName: "SHS 1 Science A", capacity: 30, classId: "science-class" }],
    });
    expect(plan.items[0]).toMatchObject({ status: "blocked", targetGradeLevelId: "shs1" });
    expect(plan.items[0].blockers).toContain("PATHWAY_REQUIRED");
  });

  it("keeps retention at the same grade while section placement remains independent", () => {
    const plan = planAcademicYearRollover({
      learners: [{ studentId: "yaw", sourceYearEnrollmentId: "y4", sourceGradeLevelId: "basic1", sourcePathwayId: null, decision: { id: "d2", outcome: "retained", targetGradeLevelId: null, targetPathwayId: null } }],
      grades,
      rules: [],
      sections: [{ id: "1c", gradeLevelId: "basic1", pathwayId: null, displayName: "Basic 1C", capacity: 30, classId: "class1c" }],
    });
    expect(plan.items[0]).toMatchObject({ outcome: "retained", targetGradeLevelId: "basic1", targetClassSectionId: "1c", status: "ready" });
  });

  it("graduates terminal learners without inventing a target section", () => {
    const plan = planAcademicYearRollover({
      learners: [{ studentId: "akos", sourceYearEnrollmentId: "y5", sourceGradeLevelId: "shs3", sourcePathwayId: "science", decision: null }],
      grades,
      rules: [{ fromGradeLevelId: "shs3", toGradeLevelId: null, targetPathwayId: null, outcome: "complete", priority: 100, isDefault: true }],
      sections: [],
    });
    expect(plan.items[0]).toMatchObject({ outcome: "graduated", targetGradeLevelId: null, targetClassSectionId: null, status: "ready" });
    expect(plan.summary.graduated).toBe(1);
  });

  it("blocks when every valid section is at capacity", () => {
    const plan = planAcademicYearRollover({
      learners: [{ studentId: "kwame", sourceYearEnrollmentId: "y6", sourceGradeLevelId: "basic1", sourcePathwayId: null, decision: null }],
      grades,
      rules: [{ fromGradeLevelId: "basic1", toGradeLevelId: "basic2", targetPathwayId: null, outcome: "advance", priority: 100, isDefault: true }],
      sections: [{ id: "2a", gradeLevelId: "basic2", pathwayId: null, displayName: "Basic 2A", capacity: 30, classId: "class2a" }],
      existingLoads: { "2a": 30 },
    });
    expect(plan.items[0].status).toBe("blocked");
    expect(plan.items[0].blockers).toContain("SECTION_CAPACITY_EXCEEDED");
  });

  it("refuses to roll a learner who already has a target-year enrollment", () => {
    const plan = planAcademicYearRollover({
      learners: [{ studentId: "adwoa", sourceYearEnrollmentId: "y7", sourceGradeLevelId: "basic1", sourcePathwayId: null, decision: null, targetYearAlreadyEnrolled: true }],
      grades,
      rules: [{ fromGradeLevelId: "basic1", toGradeLevelId: "basic2", targetPathwayId: null, outcome: "advance", priority: 100, isDefault: true }],
      sections: [{ id: "2a", gradeLevelId: "basic2", pathwayId: null, displayName: "Basic 2A", capacity: null, classId: "class2a" }],
    });
    expect(plan.items[0].status).toBe("blocked");
    expect(plan.items[0].blockers).toContain("TARGET_YEAR_ALREADY_ENROLLED");
  });
});
