import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { enterScore } from "../src/lib/gradebook-service";
import { createTeacherAcademicWork, publishTeacherAcademicWork } from "../src/lib/teacher-academic-workspace-service";
import { finalizeGuardianSubmission, retryGuardianSubmission, startGuardianSubmission } from "../src/lib/teacher-academic-submission-service";

async function setup(policy: "highest" | "latest" = "highest", attemptLimit = 3) {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async tx => {
    const year = await tx.academicYear.create({ data: { schoolId: fixture.schoolId, name: "Attempt year", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    const term = await tx.term.create({ data: { schoolId: fixture.schoolId, academicYearId: year.id, name: "Attempt term", startDate: year.startDate, endDate: year.endDate } });
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Attempt class", classTeacherId: fixture.ownerId } });
    const subject = await tx.subject.create({ data: { schoolId: fixture.schoolId, name: "Attempt subject" } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Attempt guardian" } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: `AT-${policy}-${attemptLimit}`, name: "Attempt learner" } });
    await tx.$executeRawUnsafe(
      `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
      `attempt-enrol-${student.id}`,
      fixture.schoolId,
      student.id,
      year.id,
      term.id,
      classroom.id,
      fixture.ownerId,
    );
    await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent" } });
    return { termId: term.id, classId: classroom.id, subjectId: subject.id, guardianId: guardian.id, studentId: student.id };
  });
  const f = { ...fixture, ...ids };
  const work = await withTenant(f.schoolId, tx => createTeacherAcademicWork(tx, {
    schoolId: f.schoolId, teacherId: f.ownerId, termId: f.termId, classId: f.classId, subjectId: f.subjectId,
    kind: "Quiz", title: `Retry quiz ${policy}`, instructions: "Choose the correct answer.", workDate: "2026-09-09", weekNumber: 4, workNumber: 1,
    maxScore: 10, markingMode: "auto", attemptLimit, attemptScorePolicy: policy, dueAt: "2026-09-30T23:59:59.000Z",
    questionList: [{ type: "multiple_choice", prompt: "Choose yes", points: 10, options: ["yes", "no"], acceptedAnswers: ["yes"] }]
  }));
  await withTenant(f.schoolId, tx => publishTeacherAcademicWork(tx, { schoolId: f.schoolId, teacherId: f.ownerId, workId: work.id }));
  return { ...f, workId: work.id };
}

function context(f: Awaited<ReturnType<typeof setup>>) {
  return { schoolId: f.schoolId, guardianId: f.guardianId, studentId: f.studentId, workId: f.workId };
}

async function submitAnswer(f: Awaited<ReturnType<typeof setup>>, value: "yes" | "no") {
  const opened = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, context(f)));
  const questionId = String(opened.questions[0].id);
  return withTenant(f.schoolId, tx => finalizeGuardianSubmission(tx, { ...context(f), answers: [{ questionId, responseText: value }] }));
}

async function scoreValue(f: Awaited<ReturnType<typeof setup>>) {
  const score = await withTenant(f.schoolId, tx => tx.score.findFirstOrThrow({ where: { studentId: f.studentId } }));
  return Number(score.value);
}

describe("academic attempt policy", () => {
  it("preserves all attempts and keeps the highest graded result", async () => {
    const f = await setup("highest", 3);
    expect((await submitAnswer(f, "no")).totalAwarded).toBe(0);
    await withTenant(f.schoolId, tx => retryGuardianSubmission(tx, context(f)));
    expect((await submitAnswer(f, "yes")).totalAwarded).toBe(10);
    await withTenant(f.schoolId, tx => retryGuardianSubmission(tx, context(f)));
    expect((await submitAnswer(f, "no")).totalAwarded).toBe(0);
    expect(await scoreValue(f)).toBe(10);

    const submissions = await withTenant(f.schoolId, tx => tx.$queryRawUnsafe<Array<{ attemptNumber: number; totalAwarded: unknown }>>(`SELECT "attemptNumber","totalAwarded" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 ORDER BY "attemptNumber"`, f.schoolId, f.workId, f.studentId));
    expect(submissions.map(item => [item.attemptNumber, Number(item.totalAwarded)])).toEqual([[1, 0], [2, 10], [3, 0]]);
    const history = await withTenant(f.schoolId, tx => tx.$queryRawUnsafe<Array<{ attemptNumber: number; answers: unknown }>>(`SELECT "attemptNumber","answers" FROM "TeacherAcademicAttemptHistory" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 ORDER BY "attemptNumber"`, f.schoolId, f.workId, f.studentId));
    expect(history.map(item => item.attemptNumber)).toEqual([1, 2]);
    expect(JSON.stringify(history[0].answers)).toContain("no");
    expect(JSON.stringify(history[1].answers)).toContain("yes");

    const first = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, { ...context(f), attemptNumber: 1 }));
    expect(first.submission.attemptNumber).toBe(1);
    expect(first.answers[0].responseText).toBe("no");
    await expect(withTenant(f.schoolId, tx => retryGuardianSubmission(tx, context(f)))).rejects.toMatchObject({ code: "ATTEMPT_LIMIT_REACHED" });
  });

  it("uses the latest graded attempt when that policy is selected", async () => {
    const f = await setup("latest", 2);
    await submitAnswer(f, "yes");
    expect(await scoreValue(f)).toBe(10);
    await withTenant(f.schoolId, tx => retryGuardianSubmission(tx, context(f)));
    await submitAnswer(f, "no");
    expect(await scoreValue(f)).toBe(0);
  });

  it("preserves a later manual gradebook correction instead of overwriting it on retry", async () => {
    const f = await setup("highest", 2);
    await submitAnswer(f, "yes");
    const link = await withTenant(f.schoolId, tx => tx.$queryRawUnsafe<Array<{ assessmentId: string }>>(`SELECT "assessmentId" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "id"=$2`, f.schoolId, f.workId));
    await withTenant(f.schoolId, tx => enterScore(tx, { schoolId: f.schoolId, actorId: f.ownerId, studentId: f.studentId, assessmentId: link[0].assessmentId, value: 7, status: "present" }));
    await withTenant(f.schoolId, tx => retryGuardianSubmission(tx, context(f)));
    const result = await submitAnswer(f, "no");
    expect(result.status).toBe("graded");
    expect(result.gradebookSync).toMatchObject({ synced: false, reason: "manual_override" });
    expect(await scoreValue(f)).toBe(7);
    const latest = await withTenant(f.schoolId, tx => startGuardianSubmission(tx, context(f)));
    expect(latest.submission.attemptNumber).toBe(2);
    expect(Number(latest.submission.totalAwarded)).toBe(0);
  });

  it("serializes concurrent retry clicks and creates only one next attempt", async () => {
    const f = await setup("highest", 3);
    await submitAnswer(f, "yes");
    const results = await Promise.allSettled([
      withTenant(f.schoolId, tx => retryGuardianSubmission(tx, context(f))),
      withTenant(f.schoolId, tx => retryGuardianSubmission(tx, context(f))),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected).toBeDefined();
    if (rejected?.status === "rejected") expect(rejected.reason).toMatchObject({ code: "ATTEMPT_NOT_READY" });
    const attempts = await withTenant(f.schoolId, tx => tx.$queryRawUnsafe<Array<{ attemptNumber: number; status: string }>>(`SELECT "attemptNumber","status" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 ORDER BY "attemptNumber"`, f.schoolId, f.workId, f.studentId));
    expect(attempts).toEqual([{ attemptNumber: 1, status: "graded" }, { attemptNumber: 2, status: "in_progress" }]);
  });
});