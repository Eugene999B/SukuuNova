import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import {
  closeHomeworkAcademicDelivery,
  ensureHomeworkAcademicDelivery,
  publishHomeworkAcademicDelivery,
  syncHomeworkAcademicDelivery,
} from "../src/lib/homework-academic-bridge";
import { getGuardianAcademicOverview, startGuardianSubmission } from "../src/lib/teacher-academic-submission-service";

async function setup() {
  const fixture = await createTenantFixture();
  const related = await withTenant(fixture.schoolId, async (tx) => {
    const year = await tx.academicYear.create({
      data: {
        schoolId: fixture.schoolId,
        name: "Homework bridge year",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
      },
    });
    const term = await tx.term.create({
      data: {
        schoolId: fixture.schoolId,
        academicYearId: year.id,
        name: "Homework bridge term",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-12-15T00:00:00.000Z"),
      },
    });
    const classroom = await tx.class.create({
      data: { schoolId: fixture.schoolId, name: "Bridge class", classTeacherId: fixture.ownerId },
    });
    const subject = await tx.subject.create({
      data: { schoolId: fixture.schoolId, name: "Bridge subject" },
    });
    const guardian = await tx.guardian.create({
      data: { schoolId: fixture.schoolId, name: "Bridge guardian" },
    });
    const student = await tx.student.create({
      data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: `bridge-${fixture.ownerId}`, name: "Bridge learner" },
    });
    await tx.studentGuardian.create({
      data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent" },
    });
    return { termId: term.id, classId: classroom.id, subjectId: subject.id, guardianId: guardian.id, studentId: student.id };
  });
  return { ...fixture, ...related };
}

function deliveryInput(fixture: Awaited<ReturnType<typeof setup>>, points = 10) {
  return {
    schoolId: fixture.schoolId,
    actorId: fixture.ownerId,
    termId: fixture.termId,
    classId: fixture.classId,
    subjectId: fixture.subjectId,
    title: "Fractions practice",
    instructions: "Complete the fraction problems and explain your working.",
    dueDate: new Date("2026-10-01T00:00:00.000Z"),
    points,
  };
}

describe("homework academic delivery bridge", () => {
  it("keeps a linked draft private until publication, then exposes a safe learner submission activity", async () => {
    const fixture = await setup();
    const workId = await withTenant(fixture.schoolId, (tx) => ensureHomeworkAcademicDelivery(tx, deliveryInput(fixture)));
    expect(workId).toMatch(/^taw_/);

    const hidden = await withTenant(fixture.schoolId, (tx) => getGuardianAcademicOverview(tx, {
      schoolId: fixture.schoolId,
      guardianId: fixture.guardianId,
      studentId: fixture.studentId,
    }));
    expect(hidden.works).toHaveLength(0);

    await withTenant(fixture.schoolId, (tx) => publishHomeworkAcademicDelivery(tx, fixture.schoolId, fixture.ownerId, workId!));
    const visible = await withTenant(fixture.schoolId, (tx) => getGuardianAcademicOverview(tx, {
      schoolId: fixture.schoolId,
      guardianId: fixture.guardianId,
      studentId: fixture.studentId,
    }));
    expect(visible.works.some((work) => work.id === workId)).toBe(true);

    const opened = await withTenant(fixture.schoolId, (tx) => startGuardianSubmission(tx, {
      schoolId: fixture.schoolId,
      guardianId: fixture.guardianId,
      studentId: fixture.studentId,
      workId: workId!,
    }));
    expect(opened.questions).toHaveLength(1);
    expect(opened.questions[0].type).toBe("long_answer");
    expect(opened.questions[0]).not.toHaveProperty("acceptedAnswers");
  });

  it("synchronizes an editable linked draft before gradebook publication", async () => {
    const fixture = await setup();
    const workId = await withTenant(fixture.schoolId, (tx) => ensureHomeworkAcademicDelivery(tx, deliveryInput(fixture)));
    await withTenant(fixture.schoolId, (tx) => syncHomeworkAcademicDelivery(tx, {
      ...deliveryInput(fixture, 20),
      academicWorkId: workId!,
      title: "Fractions practice revised",
      instructions: "Show every step and submit one complete written response.",
    }));
    const rows = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ title: string; maxScore: unknown; questionPoints: unknown }>>`
      SELECT w."title",w."maxScore",q."points" AS "questionPoints"
      FROM "TeacherAcademicWork" w
      JOIN "TeacherAcademicQuestion" q ON q."workId"=w."id" AND q."schoolId"=w."schoolId"
      WHERE w."schoolId"=${fixture.schoolId} AND w."id"=${workId} AND q."position"=1
    `);
    expect(rows[0].title).toBe("Fractions practice revised");
    expect(Number(rows[0].maxScore)).toBe(20);
    expect(Number(rows[0].questionPoints)).toBe(20);
  });

  it("closes learner access without deleting the academic or review history", async () => {
    const fixture = await setup();
    const workId = await withTenant(fixture.schoolId, (tx) => ensureHomeworkAcademicDelivery(tx, deliveryInput(fixture)));
    await withTenant(fixture.schoolId, (tx) => publishHomeworkAcademicDelivery(tx, fixture.schoolId, fixture.ownerId, workId!));
    await withTenant(fixture.schoolId, (tx) => closeHomeworkAcademicDelivery(tx, fixture.schoolId, fixture.ownerId, workId!));

    const overview = await withTenant(fixture.schoolId, (tx) => getGuardianAcademicOverview(tx, {
      schoolId: fixture.schoolId,
      guardianId: fixture.guardianId,
      studentId: fixture.studentId,
    }));
    expect(overview.works).toHaveLength(0);
    const rows = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "TeacherAcademicWork" WHERE "schoolId"=${fixture.schoolId} AND "id"=${workId}
    `);
    expect(rows[0].status).toBe("closed");
  });

  it("does not invent learner delivery for an unscored or unscoped planning draft", async () => {
    const fixture = await setup();
    const noPoints = await withTenant(fixture.schoolId, (tx) => ensureHomeworkAcademicDelivery(tx, { ...deliveryInput(fixture), points: null }));
    const noTerm = await withTenant(fixture.schoolId, (tx) => ensureHomeworkAcademicDelivery(tx, { ...deliveryInput(fixture), termId: null }));
    expect(noPoints).toBeNull();
    expect(noTerm).toBeNull();
  });
});
