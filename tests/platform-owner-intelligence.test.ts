import { describe, expect, it } from "vitest";
import { evaluateSchoolIntelligence, type PlatformSchoolMetrics } from "../src/lib/platform-owner-intelligence";

const healthy: PlatformSchoolMetrics = {
  schoolStatus: "active",
  directoryStatus: "active",
  activeStudents: 120,
  studentsWithoutClass: 0,
  studentsWithoutGuardian: 0,
  activeUsers: 18,
  usersWithoutRoles: 0,
  usersNeedingPasswordChange: 0,
  classCount: 6,
  classesWithoutTeacher: 0,
  subjectCount: 10,
  teachingAssignments: 24,
  hasSchoolSettings: true,
  currentAcademicYear: true,
  currentTerm: true,
  assessmentsInCurrentTerm: 18,
  reportsInCurrentTerm: 0,
  expectedSchoolDay: true,
  studentsPresentToday: 105,
  unpaidInvoices: 0,
};

describe("platform owner intelligence", () => {
  it("keeps a connected school healthy and fully ready", () => {
    const result = evaluateSchoolIntelligence(healthy);
    expect(result.health).toBe("healthy");
    expect(result.attentionScore).toBe(0);
    expect(result.readinessScore).toBe(100);
    expect(result.issues).toEqual([]);
  });

  it("raises critical access and operating issues with an explainable priority", () => {
    const result = evaluateSchoolIntelligence({
      ...healthy,
      schoolStatus: "suspended",
      directoryStatus: "suspended",
      activeUsers: 0,
      usersWithoutRoles: 0,
    });
    expect(result.health).toBe("critical");
    expect(result.attentionScore).toBeGreaterThanOrEqual(70);
    expect(result.issues.map((issue) => issue.code)).toContain("school_access_disabled");
    expect(result.issues.map((issue) => issue.code)).toContain("no_active_accounts");
    expect(result.recommendedAction.length).toBeGreaterThan(20);
  });

  it("does not treat weekends or school holidays as missing attendance", () => {
    const result = evaluateSchoolIntelligence({ ...healthy, expectedSchoolDay: false, studentsPresentToday: 0 });
    expect(result.issues.some((issue) => issue.code === "no_attendance_today")).toBe(false);
  });

  it("detects broken learner, teacher, guardian and teaching connections", () => {
    const result = evaluateSchoolIntelligence({
      ...healthy,
      studentsWithoutClass: 7,
      studentsWithoutGuardian: 12,
      classesWithoutTeacher: 4,
      teachingAssignments: 0,
      usersWithoutRoles: 3,
    });
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain("students_without_class");
    expect(codes).toContain("students_without_guardian");
    expect(codes).toContain("classes_without_class_teacher");
    expect(codes).toContain("no_teaching_assignments");
    expect(codes).toContain("accounts_without_roles");
    expect(result.readinessScore).toBeLessThan(50);
  });

  it("separates commercial attention from setup readiness", () => {
    const result = evaluateSchoolIntelligence({ ...healthy, unpaidInvoices: 4 });
    expect(result.health).toBe("critical");
    expect(result.attentionScore).toBeGreaterThan(0);
    expect(result.readinessScore).toBe(100);
    expect(result.issues[0]?.category).toBe("commercial");
  });
});
