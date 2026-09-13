import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "../src/lib/db";
import { clearScore, createAssessment, enterScore } from "../src/lib/gradebook-service";
import { createTenantFixture } from "./helpers";

async function setupGradebookJurisdiction() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const assignedPermissionId = fixture.permissionIds.get("scores:write:assigned");
    if (!assignedPermissionId) throw new Error("scores:write:assigned permission is missing from the default permission registry");

    await tx.userPermissionOverride.create({
      data: {
        schoolId: fixture.schoolId,
        userId: fixture.memberId,
        permissionId: assignedPermissionId,
        granted: true,
      },
    });

    const year = await tx.academicYear.create({
      data: {
        schoolId: fixture.schoolId,
        name: `Jurisdiction ${createId()}`,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2099-12-31T00:00:00.000Z"),
      },
    });
    const term = await tx.term.create({
      data: {
        schoolId: fixture.schoolId,
        academicYearId: year.id,
        name: "Jurisdiction term",
        startDate: year.startDate,
        endDate: year.endDate,
      },
    });
    const classroom = await tx.class.create({
      data: {
        schoolId: fixture.schoolId,
        name: `Jurisdiction class ${createId()}`,
        classTeacherId: fixture.memberId,
      },
    });
    const subject = await tx.subject.create({
      data: { schoolId: fixture.schoolId, name: `Jurisdiction subject ${createId()}` },
    });
    const student = await tx.student.create({
      data: {
        schoolId: fixture.schoolId,
        classId: classroom.id,
        admissionNo: `J-${createId()}`,
        name: "Jurisdiction learner",
      },
    });
    await tx.$executeRawUnsafe(
      `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
      `gradebook-jurisdiction-${createId()}`,
      fixture.schoolId,
      student.id,
      year.id,
      term.id,
      classroom.id,
      fixture.ownerId,
    );
    const assessment = await tx.assessment.create({
      data: {
        schoolId: fixture.schoolId,
        termId: term.id,
        classId: classroom.id,
        subjectId: subject.id,
        name: "Existing subject assessment",
        type: "ca",
        weight: 100,
        maxScore: 10,
      },
    });
    return { yearId: year.id, termId: term.id, classId: classroom.id, subjectId: subject.id, studentId: student.id, assessmentId: assessment.id };
  });
  return { ...fixture, ...ids };
}

describe("gradebook subject jurisdiction", () => {
  it("does not treat class-teacher status as permission to author or change another subject teacher's marks", async () => {
    const f = await setupGradebookJurisdiction();

    await expect(withTenant(f.schoolId, (tx) => createAssessment(tx, {
      schoolId: f.schoolId,
      actorId: f.memberId,
      termId: f.termId,
      classId: f.classId,
      subjectId: f.subjectId,
      name: "Unauthorized assessment",
      type: "ca",
      weight: 20,
      maxScore: 10,
    }))).rejects.toMatchObject({ status: 403 });

    await expect(withTenant(f.schoolId, (tx) => enterScore(tx, {
      schoolId: f.schoolId,
      actorId: f.memberId,
      studentId: f.studentId,
      assessmentId: f.assessmentId,
      value: 7,
    }))).rejects.toMatchObject({ status: 403 });

    const ownerScore = await withTenant(f.schoolId, (tx) => enterScore(tx, {
      schoolId: f.schoolId,
      actorId: f.ownerId,
      studentId: f.studentId,
      assessmentId: f.assessmentId,
      value: 8,
    }));

    await expect(withTenant(f.schoolId, (tx) => clearScore(tx, {
      schoolId: f.schoolId,
      actorId: f.memberId,
      studentId: f.studentId,
      assessmentId: f.assessmentId,
      expected: {
        id: ownerScore.id,
        value: 8,
        status: ownerScore.status,
        enteredAt: ownerScore.enteredAt.toISOString(),
      },
    }))).rejects.toMatchObject({ status: 403 });
  });

  it("allows an assigned subject teacher to create assessments, enter marks and clear marks", async () => {
    const f = await setupGradebookJurisdiction();
    await withTenant(f.schoolId, (tx) => tx.classSubjectTeacher.create({
      data: {
        schoolId: f.schoolId,
        classId: f.classId,
        subjectId: f.subjectId,
        teacherId: f.memberId,
      },
    }));

    const created = await withTenant(f.schoolId, (tx) => createAssessment(tx, {
      schoolId: f.schoolId,
      actorId: f.memberId,
      termId: f.termId,
      classId: f.classId,
      subjectId: f.subjectId,
      name: "Assigned teacher assessment",
      type: "ca",
      weight: 20,
      maxScore: 10,
    }));
    expect(created.subjectId).toBe(f.subjectId);

    const score = await withTenant(f.schoolId, (tx) => enterScore(tx, {
      schoolId: f.schoolId,
      actorId: f.memberId,
      studentId: f.studentId,
      assessmentId: f.assessmentId,
      value: 9,
    }));
    expect(Number(score.value)).toBe(9);

    await expect(withTenant(f.schoolId, (tx) => clearScore(tx, {
      schoolId: f.schoolId,
      actorId: f.memberId,
      studentId: f.studentId,
      assessmentId: f.assessmentId,
      expected: {
        id: score.id,
        value: 9,
        status: score.status,
        enteredAt: score.enteredAt.toISOString(),
      },
    }))).resolves.toEqual({ cleared: true });
  });

  it("preserves the explicit scores:write:all override for leadership", async () => {
    const f = await setupGradebookJurisdiction();
    const score = await withTenant(f.schoolId, (tx) => enterScore(tx, {
      schoolId: f.schoolId,
      actorId: f.ownerId,
      studentId: f.studentId,
      assessmentId: f.assessmentId,
      value: 6,
    }));
    expect(Number(score.value)).toBe(6);
  });
});
