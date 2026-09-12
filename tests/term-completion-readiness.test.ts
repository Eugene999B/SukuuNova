import { describe, expect, it } from "vitest";
import { buildTermCompletionReadiness } from "../src/lib/term-completion-readiness";

const validPolicy = { categories: [{ name: "Classwork", weight: 60 }, { name: "Exam", weight: 40 }] };

describe("term completion readiness", () => {
  it("treats excused scores as resolved and allows approved reports to await release", () => {
    const result = buildTermCompletionReadiness({
      classes: [{ id: "c1", name: "JHS 1" }],
      students: [{ id: "s1", termClassId: "c1" }, { id: "s2", termClassId: "c1" }],
      offerings: [
        { classId: "c1", className: "JHS 1", subjectId: "math", subjectName: "Mathematics" },
        { classId: "c1", className: "JHS 1", subjectId: "eng", subjectName: "English" },
      ],
      assignments: [
        { classId: "c1", subjectId: "math", teacherId: "t1" },
        { classId: "c1", subjectId: "eng", teacherId: "t2" },
      ],
      assessments: [
        { id: "a1", classId: "c1", subjectId: "math" },
        { id: "a2", classId: "c1", subjectId: "eng" },
      ],
      scores: [
        { assessmentId: "a1", studentId: "s1", status: "present" },
        { assessmentId: "a1", studentId: "s2", status: "excused" },
        { assessmentId: "a2", studentId: "s1", status: "present" },
        { assessmentId: "a2", studentId: "s2", status: "absent" },
      ],
      reports: [{ studentId: "s1", status: "approved" }, { studentId: "s2", status: "sent" }],
      assessmentConfig: validPolicy,
    });

    expect(result.summary.missingScoreEntries).toBe(0);
    expect(result.summary.excusedEntries).toBe(1);
    expect(result.blockers.approvedAwaitingRelease).toBe(1);
    expect(result.blockers.releasedReports).toBe(1);
    expect(result.blockers.missingReports).toBe(0);
    expect(result.blockers.assessmentWeightsValid).toBe(true);
    expect(result.readyForClose).toBe(true);
  });

  it("flags class curriculum, staffing, assessment, mark, placement and report gaps", () => {
    const result = buildTermCompletionReadiness({
      classes: [{ id: "c1", name: "Primary 5" }, { id: "c2", name: "Primary 6" }],
      students: [
        { id: "s1", termClassId: "c1" },
        { id: "s2", termClassId: "c2" },
        { id: "s3", termClassId: null },
      ],
      offerings: [
        { classId: "c1", className: "Primary 5", subjectId: "math", subjectName: "Mathematics" },
        { classId: "c1", className: "Primary 5", subjectId: "eng", subjectName: "English" },
      ],
      assignments: [{ classId: "c1", subjectId: "math", teacherId: "t1" }],
      assessments: [{ id: "a1", classId: "c1", subjectId: "math" }],
      scores: [],
      reports: [{ studentId: "s1", status: "draft" }],
      assessmentConfig: { categories: [{ name: "Classwork", weight: 50 }, { name: "Exam", weight: 40 }] },
    });

    expect(result.blockers.classesWithoutCurriculum).toEqual([{ classId: "c2", className: "Primary 6" }]);
    expect(result.blockers.unstaffedSubjects.map((item) => item.subjectId)).toEqual(["eng"]);
    expect(result.blockers.subjectsWithoutAssessments.map((item) => item.subjectId)).toEqual(["eng"]);
    expect(result.blockers.missingScores).toEqual([{ classId: "c1", className: "Primary 5", count: 1 }]);
    expect(result.blockers.unplacedStudents).toBe(1);
    expect(result.blockers.missingReports).toBe(1);
    expect(result.blockers.draftReports).toBe(1);
    expect(result.blockers.assessmentWeightTotal).toBe(90);
    expect(result.blockers.assessmentWeightsValid).toBe(false);
    expect(result.readyForClose).toBe(false);
  });

  it("ignores curriculum gaps in classes with no learners in the selected term", () => {
    const result = buildTermCompletionReadiness({
      classes: [{ id: "c1", name: "JHS 2" }, { id: "c2", name: "JHS 3" }],
      students: [{ id: "s1", termClassId: "c1" }],
      offerings: [
        { classId: "c1", className: "JHS 2", subjectId: "math", subjectName: "Mathematics" },
        { classId: "c2", className: "JHS 3", subjectId: "science", subjectName: "Science" },
      ],
      assignments: [{ classId: "c1", subjectId: "math", teacherId: "t1" }],
      assessments: [{ id: "a1", classId: "c1", subjectId: "math" }],
      scores: [{ assessmentId: "a1", studentId: "s1", status: "present" }],
      reports: [{ studentId: "s1", status: "sent" }],
      assessmentConfig: validPolicy,
    });

    expect(result.summary.activeClasses).toBe(1);
    expect(result.blockers.unstaffedSubjects).toHaveLength(0);
    expect(result.blockers.subjectsWithoutAssessments).toHaveLength(0);
    expect(result.readyForClose).toBe(true);
  });

  it("fails closed instead of crashing when legacy assessment policy JSON is incomplete", () => {
    const result = buildTermCompletionReadiness({
      classes: [{ id: "c1", name: "KG 2" }],
      students: [{ id: "s1", termClassId: "c1" }],
      offerings: [{ classId: "c1", className: "KG 2", subjectId: "lit", subjectName: "Literacy" }],
      assignments: [{ classId: "c1", subjectId: "lit", teacherId: "t1" }],
      assessments: [{ id: "a1", classId: "c1", subjectId: "lit" }],
      scores: [{ assessmentId: "a1", studentId: "s1", status: "present" }],
      reports: [{ studentId: "s1", status: "approved" }],
      assessmentConfig: {},
    });

    expect(result.blockers.assessmentWeightTotal).toBe(0);
    expect(result.blockers.assessmentWeightsValid).toBe(false);
    expect(result.readyForClose).toBe(false);
  });
});
