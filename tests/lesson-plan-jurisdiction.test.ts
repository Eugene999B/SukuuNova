import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it, vi } from "vitest";
import { withTenant } from "../src/lib/db";
import { editHomework, editLessonPlan } from "../src/lib/academic-authoring-service";
import { createTenantFixture } from "./helpers";

const session = vi.hoisted(() => ({ schoolId: "", userId: "" }));
vi.mock("@/lib/school-auth", () => ({ requireSchoolSession: vi.fn(async () => session) }));
vi.mock("@/lib/authorization", () => ({
  getSchoolAuthorization: vi.fn(async () => ({ workspace: "teacher", isTeacher: true })),
}));

import { GET as getLessonStudio } from "../src/app/api/teacher/lesson-studio/route";
import { GET as getLessonFiles } from "../src/app/api/teacher/lesson-files/route";

async function setupJurisdiction() {
  const fixture = await createTenantFixture();
  const result = await withTenant(fixture.schoolId, async (tx) => {
    for (const key of ["lesson_plans:manage", "homework:manage_assigned"] as const) {
      await tx.userPermissionOverride.create({
        data: {
          schoolId: fixture.schoolId,
          userId: fixture.memberId,
          permissionId: fixture.permissionIds.get(key)!,
          granted: true,
        },
      });
    }

    const year = await tx.academicYear.create({
      data: {
        schoolId: fixture.schoolId,
        name: `Jurisdiction year ${createId()}`,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
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
    await tx.classSubjectTeacher.create({
      data: {
        schoolId: fixture.schoolId,
        classId: classroom.id,
        subjectId: subject.id,
        teacherId: fixture.ownerId,
      },
    });

    const lessonId = createId();
    const homeworkId = createId();
    const workDate = new Date("2026-09-15T00:00:00.000Z");
    await tx.$executeRaw`
      INSERT INTO "LessonPlan" ("id","schoolId","teacherId","classId","subjectId","termId","title","content","plannedDate","status","updatedAt")
      VALUES (${lessonId},${fixture.schoolId},${fixture.memberId},${classroom.id},${subject.id},${term.id},'Jurisdiction lesson','Original lesson notes',${workDate},'draft',${workDate})
    `;
    await tx.$executeRaw`
      INSERT INTO "Homework" ("id","schoolId","teacherId","classId","subjectId","termId","title","instructions","dueDate","assignmentStatus","updatedAt")
      VALUES (${homeworkId},${fixture.schoolId},${fixture.memberId},${classroom.id},${subject.id},${term.id},'Jurisdiction homework','Original homework instructions',${workDate},'draft',${workDate})
    `;
    const lessonVersion = await tx.$queryRaw<Array<{ updatedAt: Date }>>`
      SELECT "updatedAt" FROM "LessonPlan" WHERE "schoolId"=${fixture.schoolId} AND "id"=${lessonId}
    `;
    const homeworkVersion = await tx.$queryRaw<Array<{ updatedAt: Date }>>`
      SELECT "updatedAt" FROM "Homework" WHERE "schoolId"=${fixture.schoolId} AND "id"=${homeworkId}
    `;

    return {
      classId: classroom.id,
      subjectId: subject.id,
      lessonId,
      lessonUpdatedAt: lessonVersion[0].updatedAt.toISOString(),
      homeworkId,
      homeworkUpdatedAt: homeworkVersion[0].updatedAt.toISOString(),
    };
  });

  session.schoolId = fixture.schoolId;
  session.userId = fixture.memberId;
  return { ...fixture, ...result };
}

async function assignSubjectToMember(f: Awaited<ReturnType<typeof setupJurisdiction>>) {
  await withTenant(f.schoolId, async (tx) => {
    await tx.classSubjectTeacher.deleteMany({
      where: {
        schoolId: f.schoolId,
        classId: f.classId,
        subjectId: f.subjectId,
        teacherId: f.ownerId,
      },
    });
    await tx.classSubjectTeacher.create({
      data: {
        schoolId: f.schoolId,
        classId: f.classId,
        subjectId: f.subjectId,
        teacherId: f.memberId,
      },
    });
  });
}

function lessonInput(f: Awaited<ReturnType<typeof setupJurisdiction>>) {
  return {
    id: f.lessonId,
    expectedUpdatedAt: f.lessonUpdatedAt,
    title: "Revised jurisdiction lesson",
    objective: "Learners will demonstrate the target skill accurately.",
    content: "Revised lesson content with enough detail for validation.",
    topic: "Jurisdiction topic",
    subTopic: "Jurisdiction sub-topic",
    curriculumObjective: "Apply the target curriculum objective.",
    learningOutcomes: "Learners demonstrate and explain the target skill.",
    priorKnowledge: "Learners know the prerequisite concept.",
    materials: "Board and learner materials.",
    introduction: "Activate prior knowledge.",
    development: "Model, practise and independently apply the target skill.",
    differentiatedActivities: "Provide support and extension tasks.",
    assessment: "Use an exit task to check the intended outcome.",
    conclusion: "Review the success criteria.",
    homework: "Complete a short reinforcement task.",
    resources: [],
    plannedDate: new Date("2026-09-15T00:00:00.000Z"),
    status: "submitted" as const,
  };
}

describe("lesson-plan subject jurisdiction", () => {
  it("does not expose another teacher's subject merely because the actor is the class teacher", async () => {
    const f = await setupJurisdiction();

    const studioBefore = await getLessonStudio();
    expect(studioBefore.status).toBe(200);
    const studioBeforeBody = await studioBefore.json();
    expect(studioBeforeBody.assignments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: f.classId, subjectId: f.subjectId }),
    ]));

    const filesBefore = await getLessonFiles();
    expect(filesBefore.status).toBe(200);
    const filesBeforeBody = await filesBefore.json();
    expect(filesBeforeBody.assignments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: f.classId, subjectId: f.subjectId }),
    ]));

    await assignSubjectToMember(f);

    const studioAfter = await getLessonStudio();
    const studioAfterBody = await studioAfter.json();
    expect(studioAfterBody.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: f.classId, subjectId: f.subjectId }),
    ]));

    const filesAfter = await getLessonFiles();
    const filesAfterBody = await filesAfter.json();
    expect(filesAfterBody.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: f.classId, subjectId: f.subjectId }),
    ]));
  });

  it("requires an exact subject assignment for legacy lesson and homework edits", async () => {
    const f = await setupJurisdiction();
    const actor = { schoolId: f.schoolId, actorId: f.memberId };

    await expect(withTenant(f.schoolId, (tx) => editLessonPlan(tx, actor, lessonInput(f))))
      .rejects.toMatchObject({ status: 403 });
    await expect(withTenant(f.schoolId, (tx) => editHomework(tx, actor, {
      id: f.homeworkId,
      expectedUpdatedAt: f.homeworkUpdatedAt,
      title: "Revised jurisdiction homework",
      instructions: "Complete the revised jurisdiction homework instructions.",
      dueDate: new Date("2026-09-16T00:00:00.000Z"),
      points: null,
      assignmentStatus: "draft",
    })))
      .rejects.toMatchObject({ status: 403 });

    await assignSubjectToMember(f);

    await expect(withTenant(f.schoolId, (tx) => editLessonPlan(tx, actor, lessonInput(f))))
      .resolves.toEqual({ ok: true });
    await expect(withTenant(f.schoolId, (tx) => editHomework(tx, actor, {
      id: f.homeworkId,
      expectedUpdatedAt: f.homeworkUpdatedAt,
      title: "Revised jurisdiction homework",
      instructions: "Complete the revised jurisdiction homework instructions.",
      dueDate: new Date("2026-09-16T00:00:00.000Z"),
      points: null,
      assignmentStatus: "draft",
    })))
      .resolves.toMatchObject({ ok: true });
  });
});
