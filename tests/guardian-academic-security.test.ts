import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "../src/lib/db";
import { createTenantFixture, rawDb } from "./helpers";
import { finalizeGuardianSubmission, getGuardianAcademicOverview, startGuardianSubmission, saveGuardianSubmission, submitGuardianSubmission, reviewTeacherSubmission } from "../src/lib/teacher-academic-submission-service";

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

describe("guardian assignment security", () => {
  it("does not expose answer keys or teacher guidance", async () => {
    const fixture = await setup();
    const result = await withTenant(fixture.schoolId, (tx) => startGuardianSubmission(tx, context(fixture)));
    expect(result.questions[0]).not.toHaveProperty("acceptedAnswers");
    expect(result.work).not.toHaveProperty("answerGuide");
    expect(JSON.stringify(result)).not.toContain("teacher-private-guide");
    for (const subjectId of [undefined, fixture.subjectId]) {
      const overview = await withTenant(fixture.schoolId, (tx) => getGuardianAcademicOverview(tx, { ...context(fixture), subjectId }));
      expect(overview.works.map((work) => work.id)).toEqual([fixture.workId]);
      expect(overview.students).toHaveLength(2);
    }
  });

  it("makes concurrent starts idempotent and keeps sibling attempts separate", async () => {
    const fixture = await setup();
    const attempts = await Promise.all([1, 2].map(() => withTenant(fixture.schoolId, (tx) => startGuardianSubmission(tx, context(fixture)))));
    expect(attempts[0].submission?.id).toBe(attempts[1].submission?.id);
    const sibling = await withTenant(fixture.schoolId, (tx) => startGuardianSubmission(tx, { ...context(fixture), studentId: fixture.siblingId }));
    expect(sibling.submission?.id).not.toBe(attempts[0].submission?.id);
    await expect(withTenant(fixture.schoolId, (tx) => startGuardianSubmission(tx, { ...context(fixture), studentId: fixture.unrelatedId }))).rejects.toMatchObject({ status: 403 });
  });

  it("freezes submitted answers and rejects mathematical sign changes as correct answers", async () => {
    const fixture = await setup();
    await withTenant(fixture.schoolId, (tx) => saveGuardianSubmission(tx, { ...context(fixture), answers: [{ questionId: fixture.questionId, responseData: "-4" }] }));
    const result = await withTenant(fixture.schoolId, (tx) => submitGuardianSubmission(tx, context(fixture)));
    expect(result.totalAwarded).toBe(0);
    const reopened = await withTenant(fixture.schoolId, (tx) => startGuardianSubmission(tx, context(fixture)));
    expect(reopened.answers[0].responseData).toBe("-4");
    await expect(withTenant(fixture.schoolId, (tx) => saveGuardianSubmission(tx, { ...context(fixture), answers: [{ questionId: fixture.questionId, responseData: "4" }] }))).rejects.toMatchObject({ code: "SUBMISSION_CLOSED" });
  });

  it("withholds provisional marks until teacher review is complete", async () => {
    const fixture = await setup();
    await withTenant(fixture.schoolId, (tx) => tx.$executeRaw`UPDATE "TeacherAcademicWork" SET "markingMode"='review' WHERE "id"=${fixture.workId} AND "schoolId"=${fixture.schoolId}`);
    await withTenant(fixture.schoolId, (tx) => saveGuardianSubmission(tx, { ...context(fixture), answers: [{ questionId: fixture.questionId, responseData: "4" }] }));
    const result = await withTenant(fixture.schoolId, (tx) => submitGuardianSubmission(tx, context(fixture)));
    expect(result.totalAwarded).toBeNull();
    const reopened = await withTenant(fixture.schoolId, (tx) => startGuardianSubmission(tx, context(fixture)));
    expect(reopened.submission?.totalAwarded).toBeNull();
    expect(reopened.answers[0]).not.toHaveProperty("awardedScore");
    expect(reopened.answers[0]).not.toHaveProperty("markerComment");
  });

  it("applies tenant RLS even to raw queries without a school filter", async () => {
    const fixture = await setup();
    const other = await createTenantFixture();
    const rows = await withTenant(other.schoolId, (tx) => tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "TeacherAcademicWork" WHERE "id"=${fixture.workId}`);
    expect(rows).toEqual([]);
    const policies = await rawDb.$queryRawUnsafe<Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>>(
      "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('TeacherAcademicWork','TeacherAcademicQuestion','TeacherAcademicSubmission','TeacherAcademicAnswer','TeacherAcademicNote')"
    );
    expect(policies).toHaveLength(5);
    expect(policies.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    await expect(withTenant(other.schoolId, (tx) => tx.$executeRaw`INSERT INTO "TeacherAcademicQuestion" ("id","schoolId","workId","position","type","prompt") VALUES (${createId()},${other.schoolId},${fixture.workId},2,'short_answer','Cross-school question')`)).rejects.toThrow();
  });

  it("uses gradebook term protections when a teacher reviews a submitted attempt", async () => {
    const fixture = await setup();
    await withTenant(fixture.schoolId, (tx) => tx.$executeRaw`UPDATE "TeacherAcademicWork" SET "markingMode"='review' WHERE "id"=${fixture.workId} AND "schoolId"=${fixture.schoolId}`);
    await withTenant(fixture.schoolId, (tx) => saveGuardianSubmission(tx, { ...context(fixture), answers: [{ questionId: fixture.questionId, responseData: "4" }] }));
    const submitted = await withTenant(fixture.schoolId, (tx) => submitGuardianSubmission(tx, context(fixture)));
    await withTenant(fixture.schoolId, (tx) => tx.term.update({ where: { id: fixture.termId }, data: { isLocked: true } }));
    await expect(withTenant(fixture.schoolId, (tx) => reviewTeacherSubmission(tx, {
      schoolId: fixture.schoolId, teacherId: fixture.ownerId, submissionId: String(submitted.submissionId),
      answers: [{ questionId: fixture.questionId, awardedScore: 10 }]
    }))).rejects.toMatchObject({ code: "TERM_LOCKED" });
    expect(await withTenant(fixture.schoolId, (tx) => tx.score.count({ where: { assessmentId: fixture.assessmentId } }))).toBe(0);
  });
  it("atomically saves the final visible answer before submission", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => saveGuardianSubmission(tx, { ...context(f), answers: [{ questionId: f.questionId, responseText: "3" }] }));
    const result = await withTenant(f.schoolId, tx => finalizeGuardianSubmission(tx, { ...context(f), answers: [{ questionId: f.questionId, responseText: "4" }] }));
    expect(result.status).toBe("graded");
    expect(result.totalAwarded).toBe(10);
    const reopened = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, context(f)));
    expect(reopened.answers[0].responseText).toBe("4");
    expect(reopened.work.weekNumber).toBe(1);
    expect(reopened.work.workNumber).toBe(1);
  });

  it("does not submit or partially save when final-answer validation fails", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => saveGuardianSubmission(tx, { ...context(f), answers: [{ questionId: f.questionId, responseText: "3" }] }));
    await expect(withTenant(f.schoolId, tx => finalizeGuardianSubmission(tx, {
      ...context(f), answers: [{ questionId: f.questionId, responseText: "4" }, { questionId: createId(), responseText: "Invalid question" }]
    }))).rejects.toMatchObject({ code: "INVALID_QUESTION" });
    const reopened = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, context(f)));
    expect(reopened.submission?.status).toBe("in_progress");
    expect(reopened.answers[0].responseText).toBe("3");
  });

  it("keeps finalization and progress isolated between linked siblings", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => finalizeGuardianSubmission(tx, { ...context(f), answers: [{ questionId: f.questionId, responseText: "4" }] }));
    const sibling = await withTenant(f.schoolId, tx => getGuardianAcademicOverview(tx, { ...context(f), studentId: f.siblingId }));
    expect(sibling.works[0].submissionStatus).toBe("not_started");
    expect(sibling.works[0].totalAwarded).toBeNull();
    const first = await withTenant(f.schoolId, tx => getGuardianAcademicOverview(tx, context(f)));
    expect(first.works[0].submissionStatus).toBe("graded");
    expect(Number(first.works[0].totalAwarded)).toBe(10);
    await expect(withTenant(f.schoolId, tx => getGuardianAcademicOverview(tx, { ...context(f), studentId: f.unrelatedId }))).rejects.toMatchObject({ status: 403 });
  });

  it("includes published note-only subjects and applies their filter", async () => {
    const f = await setup();
    const noteSubject = await withTenant(f.schoolId, async tx => {
      const subject = await tx.subject.create({ data: { schoolId: f.schoolId, name: "Notes only" } });
      await tx.$executeRaw`INSERT INTO "TeacherAcademicNote" ("id","schoolId","termId","classId","subjectId","teacherId","title","content","status") VALUES (${createId()},${f.schoolId},${f.termId},${f.classId},${subject.id},${f.ownerId},'Published note','{"blocks":[]}'::jsonb,'published')`;
      return subject;
    });
    const overview = await withTenant(f.schoolId, tx => getGuardianAcademicOverview(tx, { ...context(f), subjectId: noteSubject.id }));
    expect(overview.subjects.map(subject => subject.id)).toContain(noteSubject.id);
    expect(overview.works).toEqual([]);
    expect(overview.notes).toHaveLength(1);
    expect(overview.notes[0].title).toBe("Published note");
  });

  it("allows reading released results after the term closes without exposing keys", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => finalizeGuardianSubmission(tx, { ...context(f), answers: [{ questionId: f.questionId, responseText: "4" }] }));
    await withTenant(f.schoolId, tx => tx.term.update({ where: { id: f.termId }, data: { isLocked: true } }));
    const reopened = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, context(f)));
    expect(Number(reopened.submission?.totalAwarded)).toBe(10);
    expect(reopened.questions[0]).not.toHaveProperty("acceptedAnswers");
    expect(reopened.work).not.toHaveProperty("answerGuide");
    await expect(withTenant(f.schoolId, tx => finalizeGuardianSubmission(tx, { ...context(f), answers: [{ questionId: f.questionId, responseText: "3" }] }))).rejects.toThrow();
  });

});