import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { createTeacherAcademicWork, publishTeacherAcademicWork, saveTeacherWorkMarks, createTeacherAcademicNote, publishTeacherAcademicNote, getTeacherAcademicRoster } from "../src/lib/teacher-academic-workspace-service";
import { startGuardianSubmission, saveGuardianSubmission, submitGuardianSubmission, reviewTeacherSubmission } from "../src/lib/teacher-academic-submission-service";
import { validateAcademicQuestions } from "../src/lib/academic-work-validation";

async function setup() {
  const fixture = await createTenantFixture();
  const workId = createId(), questionId = createId();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const year = await tx.academicYear.create({ data: { schoolId: fixture.schoolId, name: "Guardian year", startDate: new Date("2026-01-01"), endDate: new Date("2099-12-31") } });
    const term = await tx.term.create({ data: { schoolId: fixture.schoolId, academicYearId: year.id, name: "Guardian term", startDate: year.startDate, endDate: year.endDate } });
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Guardian class", classTeacherId: fixture.ownerId } });
    const subject = await tx.subject.create({ data: { schoolId: fixture.schoolId, name: "Guardian subject" } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Linked guardian" } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: "one", name: "Linked child" } });
    const sibling = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: "two", name: "Linked sibling" } });
    const unrelated = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: "three", name: "Unrelated child" } });
    for (const child of [student, sibling]) await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, studentId: child.id, guardianId: guardian.id, relationship: "Parent" } });
    const assessment = await tx.assessment.create({ data: { schoolId: fixture.schoolId, termId: term.id, classId: classroom.id, subjectId: subject.id, name: "Guardian work", type: "ca", weight: 100, maxScore: 10 } });
    await tx.$executeRaw`INSERT INTO "TeacherAcademicWork" ("id","schoolId","termId","classId","subjectId","teacherId","kind","title","workDate","weekNumber","maxScore","markingMode","answerGuide","dueAt","status") VALUES (${workId},${fixture.schoolId},${term.id},${classroom.id},${subject.id},${fixture.ownerId},'homework','Guardian work','2026-09-01',1,10,'auto','["teacher-private-guide"]'::jsonb,${new Date(Date.now()+86400000)},'published')`;
    await tx.$executeRaw`INSERT INTO "TeacherAcademicQuestion" ("id","schoolId","workId","position","type","prompt","points","options","acceptedAnswers") VALUES (${questionId},${fixture.schoolId},${workId},1,'multiple_choice','Choose the answer',10,'["3","4"]'::jsonb,'["4"]'::jsonb)`;
    return { classId: classroom.id, subjectId: subject.id, termId: term.id, studentId: student.id, siblingId: sibling.id, unrelatedId: unrelated.id, guardianId: guardian.id, assessmentId: assessment.id };
  });
  return { ...fixture, ...ids, workId, questionId };
}
function context(fixture: Awaited<ReturnType<typeof setup>>) {
  return { schoolId: fixture.schoolId, guardianId: fixture.guardianId, studentId: fixture.studentId, workId: fixture.workId };
}

function workInput(fixture: Awaited<ReturnType<typeof setup>>, workNumber = 1) {
  return { schoolId: fixture.schoolId, teacherId: fixture.ownerId, classId: fixture.classId, subjectId: fixture.subjectId, termId: fixture.termId, kind: "Homework" as const, title: "Weekly practice", workDate: "2026-09-09", weekNumber: 2, workNumber, maxScore: 10, markingMode: "manual" as const, questionList: [{ type: "short_answer", prompt: "What is two plus two?", points: 10, acceptedAnswers: ["4"] }] };
}
describe("connected teacher academic workflow", () => {
  it("links same-title activities to distinct valid gradebook assessments", async () => {
    const f = await setup();
    const first = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    const second = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f, 2)));
    const marks = [{ studentId: f.studentId, value: 7 }];
    const saved = await Promise.all([first, second].map(work => withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id, marks }))));
    expect(saved[0].assessmentId).not.toBe(saved[1].assessmentId);
    const again = await withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { schoolId: f.schoolId, teacherId: f.ownerId, workId: first.id, marks }));
    expect(again.assessmentId).toBe(saved[0].assessmentId);
    const assessments = await withTenant(f.schoolId, tx => tx.assessment.findMany({ where: { id: { in: saved.map(item => item.assessmentId) } } }));
    expect(assessments.map(item => item.type)).toEqual(["ca", "ca"]);
  });

  it("publishes, receives a child answer and records a complete teacher review without pre-saving marks", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    await withTenant(f.schoolId, tx => publishTeacherAcademicWork(tx, { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id }));
    const child = { ...context(f), workId: work.id };
    const opened = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, child));
    const questionId = opened.questions[0].id;
    await withTenant(f.schoolId, tx => saveGuardianSubmission(tx, { ...child, answers: [{ questionId, responseText: "4" }] }));
    const submitted = await withTenant(f.schoolId, tx => submitGuardianSubmission(tx, child));
    expect(submitted.status).toBe("review_required");
    expect(submitted.totalAwarded).toBeNull();
    const review = { schoolId: f.schoolId, teacherId: f.ownerId, submissionId: String(submitted.submissionId) };
    await expect(withTenant(f.schoolId, tx => reviewTeacherSubmission(tx, { ...review, answers: [] }))).rejects.toMatchObject({ code: "INCOMPLETE_REVIEW" });
    await withTenant(f.schoolId, tx => reviewTeacherSubmission(tx, { ...review, answers: [{ questionId, awardedScore: 10 }] }));
    const scores = await withTenant(f.schoolId, tx => tx.score.findMany({ where: { studentId: f.studentId } }));
    expect(scores).toHaveLength(1);
    expect(Number(scores[0].value)).toBe(10);
    const released = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, child));
    expect(Number(released.submission?.totalAwarded)).toBe(10);
  });

  it("records an explicit zero for an unanswered question during full review", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    await withTenant(f.schoolId, tx => publishTeacherAcademicWork(tx, { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id }));
    const child = { ...context(f), workId: work.id };
    const opened = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, child));
    const submitted = await withTenant(f.schoolId, tx => submitGuardianSubmission(tx, child));
    await withTenant(f.schoolId, tx => reviewTeacherSubmission(tx, { schoolId: f.schoolId, teacherId: f.ownerId, submissionId: String(submitted.submissionId), answers: [{ questionId: opened.questions[0].id, awardedScore: 0 }] }));
    const released = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, child));
    expect(released.answers).toHaveLength(1);
    expect(Number((released.answers[0] as Record<string, unknown>).awardedScore)).toBe(0);
  });

  it("protects finalized reports and rolls back the whole marks batch", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    await withTenant(f.schoolId, tx => tx.reportCard.create({ data: { schoolId: f.schoolId, studentId: f.siblingId, termId: f.termId, status: "approved" } }));
    await expect(withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id, marks: [{ studentId: f.studentId, value: 5 }, { studentId: f.siblingId, value: 6 }] }))).rejects.toMatchObject({ code: "REPORT_FINALIZED" });
    expect(await withTenant(f.schoolId, tx => tx.score.count({}))).toBe(0);
  });

  it("blocks publishing and marks in locked terms while preserving read access", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    const note = await withTenant(f.schoolId, tx => createTeacherAcademicNote(tx, { ...workInput(f), content: { blocks: [{ type: "paragraph", text: "Read this" }] } }));
    await withTenant(f.schoolId, tx => tx.term.update({ where: { id: f.termId }, data: { isLocked: true } }));
    const actor = { schoolId: f.schoolId, teacherId: f.ownerId };
    await expect(withTenant(f.schoolId, tx => publishTeacherAcademicWork(tx, { ...actor, workId: work.id }))).rejects.toMatchObject({ code: "TERM_LOCKED" });
    await expect(withTenant(f.schoolId, tx => publishTeacherAcademicNote(tx, { ...actor, noteId: note.id }))).rejects.toMatchObject({ code: "TERM_LOCKED" });
    await expect(withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...actor, workId: work.id, marks: [{ studentId: f.studentId, value: 5 }] }))).rejects.toMatchObject({ code: "TERM_LOCKED" });
    const roster = await withTenant(f.schoolId, tx => getTeacherAcademicRoster(tx, { ...actor, classId: f.classId, subjectId: f.subjectId, termId: f.termId }));
    expect(roster.works.some(item => item.id === work.id)).toBe(true);
  });

  it("enforces permission revocation even for a class teacher", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => tx.class.update({ where: { id: f.classId }, data: { classTeacherId: f.memberId } }));
    await expect(withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, { ...workInput(f), teacherId: f.memberId }))).rejects.toMatchObject({ status: 403 });
  });

  it("rejects inconsistent question points and invalid automatic answer keys", () => {
    const valid = { type: "multiple_choice", prompt: "Choose", points: 10, options: ["A", "B"], acceptedAnswers: ["A"] };
    expect(() => validateAcademicQuestions([valid], 10, "auto")).not.toThrow();
    expect(() => validateAcademicQuestions([valid], 5, "auto")).toThrow(/total/);
    expect(() => validateAcademicQuestions([{ ...valid, acceptedAnswers: ["C"] }], 10, "auto")).toThrow(/accepted answer/);
    expect(() => validateAcademicQuestions([{ ...valid, options: ["A", "a"] }], 10, "auto")).toThrow(/distinct/);
    expect(() => validateAcademicQuestions([{ ...valid, type: "long_answer" }], 10, "auto")).toThrow(/objective/);
    expect(() => validateAcademicQuestions([], 10, "auto")).toThrow(/questions/);
  });
});
