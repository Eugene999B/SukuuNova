import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { createTeacherAcademicWork, publishTeacherAcademicWork } from "../src/lib/teacher-academic-workspace-service";
import { finalizeGuardianSubmission, startGuardianSubmission } from "../src/lib/teacher-academic-submission-service";

async function setup() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async tx => {
    const year = await tx.academicYear.create({ data: { schoolId: fixture.schoolId, name: "Question year", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    const term = await tx.term.create({ data: { schoolId: fixture.schoolId, academicYearId: year.id, name: "Question term", startDate: year.startDate, endDate: year.endDate } });
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Question class", classTeacherId: fixture.ownerId } });
    const subject = await tx.subject.create({ data: { schoolId: fixture.schoolId, name: "Question subject" } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Question guardian" } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: "Q-1", name: "Question child" } });
    await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent" } });
    return { termId: term.id, classId: classroom.id, subjectId: subject.id, guardianId: guardian.id, studentId: student.id };
  });
  return { ...fixture, ...ids };
}

describe("broader question types in the connected learner flow", () => {
  it("keeps answer keys private and auto-grades structured responses", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, {
      schoolId: f.schoolId,
      teacherId: f.ownerId,
      termId: f.termId,
      classId: f.classId,
      subjectId: f.subjectId,
      kind: "Homework",
      title: "Mixed objective practice",
      instructions: "Complete every item.",
      workDate: "2026-09-09",
      weekNumber: 3,
      workNumber: 1,
      maxScore: 10,
      markingMode: "auto",
      dueAt: "2026-09-30T23:59:59.000Z",
      questionList: [
        { type: "multiple_select", prompt: "Choose the primes", points: 2, options: ["2", "3", "4"], acceptedAnswers: ["2", "3"] },
        { type: "numeric", prompt: "2.5 + 2.5", points: 2, acceptedAnswers: ["5"] },
        { type: "fill_blank", prompt: "The capital of Ghana is ___.", points: 2, acceptedAnswers: ["Accra"] },
        { type: "ordering", prompt: "Put these in ascending order", points: 4, options: ["3", "1", "2"], acceptedAnswers: ["1", "2", "3"] },
      ]
    }));
    await withTenant(f.schoolId, tx => publishTeacherAcademicWork(tx, { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id }));
    const context = { schoolId: f.schoolId, guardianId: f.guardianId, studentId: f.studentId, workId: work.id };
    const opened = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, context));
    expect(opened.questions).toHaveLength(4);
    for (const question of opened.questions) expect(question).not.toHaveProperty("acceptedAnswers");
    const byType = new Map(opened.questions.map(question => [String(question.type), String(question.id)]));
    const result = await withTenant(f.schoolId, tx => finalizeGuardianSubmission(tx, {
      ...context,
      answers: [
        { questionId: byType.get("multiple_select")!, responseData: ["3", "2"] },
        { questionId: byType.get("numeric")!, responseText: "5.0" },
        { questionId: byType.get("fill_blank")!, responseText: " accra " },
        { questionId: byType.get("ordering")!, responseData: ["1", "2", "3"] },
      ]
    }));
    expect(result.status).toBe("graded");
    expect(result.totalAwarded).toBe(10);
    const released = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, context));
    expect(released.answers).toHaveLength(4);
    expect(released.answers.every(answer => Number(answer.awardedScore) > 0)).toBe(true);
  });
});
