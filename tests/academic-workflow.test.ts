import { getClassSubjectPerformance } from "../src/lib/academic-engine";
import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { createTeacherAcademicWork, publishTeacherAcademicWork, saveTeacherWorkMarks, createTeacherAcademicNote, publishTeacherAcademicNote, getTeacherAcademicRoster } from "../src/lib/teacher-academic-workspace-service";
import { startGuardianSubmission, saveGuardianSubmission, submitGuardianSubmission, reviewTeacherSubmission } from "../src/lib/teacher-academic-submission-service";
import { enterScore, clearScore, saveGradebookChanges } from "../src/lib/gradebook-service";
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
    for (const [index, child] of [student, sibling, unrelated].entries()) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
        `academic-work-enrol-${index}-${child.id}`,
        fixture.schoolId,
        child.id,
        year.id,
        term.id,
        classroom.id,
        fixture.ownerId,
      );
    }
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
  it("rejects stale marks after another canonical gradebook writer changes the score", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    const input = { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id };
    const saved = await withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...input, marks: [{ studentId: f.studentId, value: 5, expected: null }] }));
    const score = await withTenant(f.schoolId, tx => tx.score.findFirstOrThrow({ where: { assessmentId: saved.assessmentId, studentId: f.studentId } }));
    const expected = { id: score.id, value: Number(score.value), status: score.status, enteredAt: score.enteredAt.toISOString() };
    await withTenant(f.schoolId, tx => enterScore(tx, { schoolId: f.schoolId, actorId: f.ownerId, assessmentId: saved.assessmentId, studentId: f.studentId, value: 8 }));
    await expect(withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...input, marks: [{ studentId: f.studentId, value: 6, expected }] }))).rejects.toMatchObject({ code: "SCORE_CONFLICT", status: 409 });
    const current = await withTenant(f.schoolId, tx => tx.score.findFirstOrThrow({ where: { id: score.id } }));
    expect(Number(current.value)).toBe(8);
  });

  it("serializes simultaneous writes to a previously blank cell", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    const results = await Promise.allSettled([6, 9].map(value => withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, {
      schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id, marks: [{ studentId: f.studentId, value, expected: null }]
    }))));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected && rejected.status === "rejected" ? rejected.reason : null).toMatchObject({ code: "SCORE_CONFLICT" });
  });

  it("rolls back earlier rows when a later row has a snapshot conflict", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    const input = { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id };
    await withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...input, marks: [{ studentId: f.siblingId, value: 8 }] }));
    await expect(withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...input, marks: [
      { studentId: f.studentId, value: 5, expected: null }, { studentId: f.siblingId, value: 6, expected: null }
    ] }))).rejects.toMatchObject({ code: "SCORE_CONFLICT" });
    expect(await withTenant(f.schoolId, tx => tx.score.count({ where: { studentId: f.studentId } }))).toBe(0);
  });

  it("saves absent and excused states and detects status-only changes", async () => {
    const f = await setup();
    const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, workInput(f)));
    const input = { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id };
    const saved = await withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...input, marks: [{ studentId: f.studentId, value: 0, status: "absent", expected: null }] }));
    const before = await withTenant(f.schoolId, tx => tx.score.findFirstOrThrow({ where: { assessmentId: saved.assessmentId, studentId: f.studentId } }));
    const expected = { id: before.id, value: 0, status: before.status, enteredAt: before.enteredAt.toISOString() };
    await withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...input, marks: [{ studentId: f.studentId, value: 0, status: "excused", expected }] }));
    await expect(withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...input, marks: [{ studentId: f.studentId, value: 1, status: "present", expected }] }))).rejects.toMatchObject({ code: "SCORE_CONFLICT" });
    await expect(withTenant(f.schoolId, tx => saveTeacherWorkMarks(tx, { ...input, marks: [{ studentId: f.siblingId, value: 4, status: "absent" }] }))).rejects.toMatchObject({ code: "INVALID_SCORE" });
  });

});

describe("general gradebook batch and clears", () => {
  const scoreInput = (f: Awaited<ReturnType<typeof setup>>) => ({ schoolId: f.schoolId, actorId: f.ownerId, studentId: f.studentId, assessmentId: f.assessmentId });
  it("saves multiple learners and returns snapshots suitable for a second save", async () => {
    const f = await setup();
    const common = scoreInput(f);
    const changes = [f.studentId, f.siblingId].map(studentId => ({ action: "score" as const, studentId, assessmentId: f.assessmentId, value: 7, status: "present" as const, expected: null }));
    const results = await withTenant(f.schoolId, tx => saveGradebookChanges(tx, { ...common, changes }));
    expect(results).toHaveLength(2);
    const expected = results[0].expected!;
    await withTenant(f.schoolId, tx => saveGradebookChanges(tx, { ...common, changes: [{ ...changes[0], value: 8, expected: { ...expected, status: "present" } }] }));
    expect(Number((await withTenant(f.schoolId, tx => tx.score.findFirstOrThrow({ where: { id: expected.id } }))).value)).toBe(8);
  });

  it("rejects stale clearing without deleting another teacher's changed mark", async () => {
    const f = await setup(), input = scoreInput(f);
    const original = await withTenant(f.schoolId, tx => enterScore(tx, { ...input, value: 5 }));
    const expected = { id: original.id, value: 5, status: original.status, enteredAt: original.enteredAt.toISOString() };
    await withTenant(f.schoolId, tx => enterScore(tx, { ...input, value: 9 }));
    await expect(withTenant(f.schoolId, tx => clearScore(tx, { ...input, expected }))).rejects.toMatchObject({ code: "SCORE_CONFLICT" });
    expect(Number((await withTenant(f.schoolId, tx => tx.score.findFirstOrThrow({ where: { id: original.id } }))).value)).toBe(9);
  });

  it("rolls back a clear when a later batch mark conflicts", async () => {
    const f = await setup(), input = scoreInput(f);
    const original = await withTenant(f.schoolId, tx => enterScore(tx, { ...input, value: 5 }));
    await withTenant(f.schoolId, tx => enterScore(tx, { ...input, studentId: f.siblingId, value: 8 }));
    await expect(withTenant(f.schoolId, tx => saveGradebookChanges(tx, { ...input, changes: [
      { action: "clearScore", studentId: f.studentId, assessmentId: f.assessmentId, expected: { id: original.id, value: 5, status: "present", enteredAt: original.enteredAt.toISOString() } },
      { action: "score", studentId: f.siblingId, assessmentId: f.assessmentId, value: 6, status: "present", expected: null },
    ] }))).rejects.toMatchObject({ code: "SCORE_CONFLICT" });
    expect(await withTenant(f.schoolId, tx => tx.score.count({}))).toBe(2);
  });

  it("rejects duplicate cells and absent marks with a nonzero value", async () => {
    const f = await setup(), input = scoreInput(f);
    const change = { action: "score" as const, studentId: f.studentId, assessmentId: f.assessmentId, value: 5, status: "present" as const, expected: null };
    await expect(withTenant(f.schoolId, tx => saveGradebookChanges(tx, { ...input, changes: [change, change] }))).rejects.toThrow(/only once/);
    await expect(withTenant(f.schoolId, tx => enterScore(tx, { ...input, value: 3, status: "absent" }))).rejects.toMatchObject({ code: "INVALID_SCORE" });
    expect(await withTenant(f.schoolId, tx => tx.score.count({}))).toBe(0);
  });

  it("serializes a clear and update against the same recorded snapshot", async () => {
    const f = await setup(), input = scoreInput(f);
    const score = await withTenant(f.schoolId, tx => enterScore(tx, { ...input, value: 5 }));
    const expected = { id: score.id, value: 5, status: score.status, enteredAt: score.enteredAt.toISOString() };
    const outcomes = await Promise.allSettled([
      withTenant(f.schoolId, tx => clearScore(tx, { ...input, expected })),
      withTenant(f.schoolId, tx => enterScore(tx, { ...input, value: 8, expected })),
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const failed = outcomes.find(outcome => outcome.status === "rejected");
    expect(failed?.status === "rejected" ? failed.reason : null).toMatchObject({ code: "SCORE_CONFLICT" });
  });

  it("denies unauthorized, cross-school, locked and finalized batch writes", async () => {
    const f = await setup(), other = await setup(), input = scoreInput(f);
    const change = { action: "score" as const, studentId: f.studentId, assessmentId: f.assessmentId, value: 5, status: "present" as const, expected: null };
    await expect(withTenant(f.schoolId, tx => saveGradebookChanges(tx, { ...input, actorId: f.memberId, changes: [change] }))).rejects.toMatchObject({ status: 403 });
    await expect(withTenant(f.schoolId, tx => saveGradebookChanges(tx, { ...input, changes: [{ ...change, assessmentId: other.assessmentId }] }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await withTenant(f.schoolId, tx => tx.term.update({ where: { id: f.termId }, data: { isLocked: true } }));
    await expect(withTenant(f.schoolId, tx => saveGradebookChanges(tx, { ...input, changes: [change] }))).rejects.toMatchObject({ code: "TERM_LOCKED" });
    await withTenant(f.schoolId, async tx => {
      await tx.term.update({ where: { id: f.termId }, data: { isLocked: false } });
      await tx.reportCard.create({ data: { schoolId: f.schoolId, studentId: f.studentId, termId: f.termId, status: "approved" } });
    });
    await expect(withTenant(f.schoolId, tx => saveGradebookChanges(tx, { ...input, changes: [change] }))).rejects.toMatchObject({ code: "REPORT_FINALIZED" });
    expect(await withTenant(f.schoolId, tx => tx.score.count({}))).toBe(0);
  });
});

describe("gradebook context and snapshot reads", () => {
  it("returns the stored excused mark snapshot separately from its grading projection", async () => {
    const f = await setup();
    const score = await withTenant(f.schoolId, tx => enterScore(tx, { schoolId: f.schoolId, actorId: f.ownerId, studentId: f.studentId, assessmentId: f.assessmentId, value: 0, status: "excused" }));
    const sheet = await withTenant(f.schoolId, tx => getClassSubjectPerformance(tx, f.classId, f.subjectId, f.termId));
    const cell = sheet.rows.find(row => row.student.id === f.studentId)!.scores[0];
    expect(cell.rawScore).toBeNull();
    expect(cell.expected).toEqual({ id: score.id, value: 0, status: "excused", enteredAt: score.enteredAt.toISOString() });
    expect(sheet.rows.find(row => row.student.id === f.siblingId)!.scores[0].expected).toBeNull();
  });
  it("rejects mixed subject contexts before changing any score", async () => {
    const f = await setup();
    const otherAssessment = await withTenant(f.schoolId, async tx => {
      const subject = await tx.subject.create({ data: { schoolId: f.schoolId, name: "Second subject" } });
      return tx.assessment.create({ data: { schoolId: f.schoolId, termId: f.termId, classId: f.classId, subjectId: subject.id, name: "Second", type: "ca", maxScore: 10, weight: 100 } });
    });
    await expect(withTenant(f.schoolId, tx => saveGradebookChanges(tx, { schoolId: f.schoolId, actorId: f.ownerId, changes: [f.assessmentId, otherAssessment.id].map(assessmentId => ({ action: "score", studentId: f.studentId, assessmentId, value: 7, status: "present", expected: null })) }))).rejects.toMatchObject({ code: "INVALID_CONTEXT" });
    expect(await withTenant(f.schoolId, tx => tx.score.count({}))).toBe(0);
  });
});