import { describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { editLessonPlan, editHomework } from "../src/lib/academic-authoring-service";
const session = vi.hoisted(() => ({ schoolId: "", userId: "" }));
vi.mock("@/lib/school-auth", () => ({ requireSchoolSession: vi.fn(async () => session) }));
import { PATCH as transitionLesson } from "../src/app/api/school/lesson-plans/route";

async function setup(kind: "lesson" | "homework", status = "draft") {
  const fixture = await createTenantFixture();
  const id = createId();
  const result = await withTenant(fixture.schoolId, async (tx) => {
    const year = await tx.academicYear.create({ data: { schoolId: fixture.schoolId, name: "Authoring year", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    const term = await tx.term.create({ data: { schoolId: fixture.schoolId, academicYearId: year.id, name: "Authoring term", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Authoring class", classTeacherId: fixture.ownerId } });
    const subject = await tx.subject.create({ data: { schoolId: fixture.schoolId, name: "Authoring subject" } });
    const date = new Date("2026-09-15");
    if (kind === "lesson") {
      await tx.$executeRaw`INSERT INTO "LessonPlan" ("id","schoolId","teacherId","classId","subjectId","termId","title","content","plannedDate","status") VALUES (${id},${fixture.schoolId},${fixture.ownerId},${classroom.id},${subject.id},${term.id},'Original lesson','Original teaching notes',${date},${status})`;
      const rows = await tx.$queryRaw<Array<{ updatedAt: Date }>>`SELECT "updatedAt" FROM "LessonPlan" WHERE "id"=${id} AND "schoolId"=${fixture.schoolId}`;
      return { termId: term.id, updatedAt: rows[0].updatedAt.toISOString() };
    }
    await tx.$executeRaw`INSERT INTO "Homework" ("id","schoolId","teacherId","classId","subjectId","termId","title","instructions","dueDate","assignmentStatus") VALUES (${id},${fixture.schoolId},${fixture.ownerId},${classroom.id},${subject.id},${term.id},'Original homework','Original instructions',${date},${status})`;
    const rows = await tx.$queryRaw<Array<{ updatedAt: Date }>>`SELECT "updatedAt" FROM "Homework" WHERE "id"=${id} AND "schoolId"=${fixture.schoolId}`;
    return { termId: term.id, updatedAt: rows[0].updatedAt.toISOString() };
  });
  return { ...fixture, ...result, id };
}
function lessonInput(fixture: { id: string; updatedAt: string }) {
  return {
    id: fixture.id,
    expectedUpdatedAt: fixture.updatedAt,
    title: "Revised lesson",
    objective: "Learners will apply the concept accurately.",
    content: "Revised teaching activities and pacing notes.",
    topic: "Fractions",
    subTopic: "Equivalent fractions",
    curriculumObjective: "Use models to identify equivalent fractions.",
    learningOutcomes: "Learners can identify and explain equivalent fractions using models.",
    priorKnowledge: "Learners can name numerator and denominator.",
    materials: "Fraction strips and learner workbooks.",
    introduction: "Review halves and quarters with a quick visual warm-up.",
    development: "Model equivalent fractions, guide paired practice, then complete independent examples.",
    differentiatedActivities: "Use pre-cut strips for support and open-ended equivalence challenges for extension.",
    assessment: "Check exit tickets and two independent equivalent-fraction examples.",
    conclusion: "Learners explain one equivalence relationship to a partner.",
    homework: "Find three examples of equivalent fractions.",
    resources: [{ label: "Fraction guide", url: "https://example.com/fractions" }],
    plannedDate: new Date("2026-09-15"),
    status: "submitted" as const,
  };
}
async function grantReview(fixture: Awaited<ReturnType<typeof setup>>) {
  await withTenant(fixture.schoolId, (tx) => tx.userPermissionOverride.create({ data: {
    schoolId: fixture.schoolId,
    userId: fixture.memberId,
    permissionId: fixture.permissionIds.get("lesson_plans:review")!,
    granted: true,
  } }));
}
async function patchAs(fixture: Awaited<ReturnType<typeof setup>>, userId: string, body: Record<string, unknown>) {
  session.schoolId = fixture.schoolId;
  session.userId = userId;
  return transitionLesson(new Request("http://localhost/api/school/lesson-plans", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("connected academic authoring", () => {
  it("lets an author correct and resubmit a returned structured lesson while rejecting stale edits", async () => {
    const fixture = await setup("lesson", "changes_requested");
    const actor = { schoolId: fixture.schoolId, actorId: fixture.ownerId };
    await withTenant(fixture.schoolId, (tx) => editLessonPlan(tx, actor, lessonInput(fixture)));
    await expect(withTenant(fixture.schoolId, (tx) => editLessonPlan(tx, actor, lessonInput(fixture))))
      .rejects.toMatchObject({ code: "CONCURRENT_UPDATE" });
    const rows = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ title: string; topic: string | null; status: string; submittedAt: Date | null }>>`SELECT "title","topic","status","submittedAt" FROM "LessonPlan" WHERE "id"=${fixture.id} AND "schoolId"=${fixture.schoolId}`);
    expect(rows[0]).toMatchObject({ title: "Revised lesson", topic: "Fractions", status: "submitted" });
    expect(rows[0].submittedAt).toBeInstanceOf(Date);
  });

  it("requires the core professional sections before a lesson can be submitted", async () => {
    const fixture = await setup("lesson");
    const actor = { schoolId: fixture.schoolId, actorId: fixture.ownerId };
    await expect(withTenant(fixture.schoolId, (tx) => editLessonPlan(tx, actor, { ...lessonInput(fixture), assessment: "" })))
      .rejects.toMatchObject({ code: "LESSON_PLAN_INCOMPLETE", status: 400 });
    const row = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "LessonPlan" WHERE "id"=${fixture.id}`);
    expect(row[0].status).toBe("draft");
  });

  it("rejects another author's edits and cross-school IDs", async () => {
    const fixture = await setup("lesson");
    await withTenant(fixture.schoolId, (tx) => tx.userPermissionOverride.create({ data: {
      schoolId: fixture.schoolId, userId: fixture.memberId,
      permissionId: fixture.permissionIds.get("lesson_plans:manage")!, granted: true
    } }));
    await expect(withTenant(fixture.schoolId, (tx) => editLessonPlan(tx, { schoolId: fixture.schoolId, actorId: fixture.memberId }, lessonInput(fixture))))
      .rejects.toMatchObject({ status: 403 });
    const other = await createTenantFixture();
    await expect(withTenant(other.schoolId, (tx) => editLessonPlan(tx, { schoolId: other.schoolId, actorId: other.ownerId }, lessonInput(fixture))))
      .rejects.toMatchObject({ status: 404 });
  });

  it("protects locked terms and approved lesson content", async () => {
    const fixture = await setup("lesson");
    await withTenant(fixture.schoolId, (tx) => tx.term.update({ where: { id: fixture.termId }, data: { isLocked: true } }));
    await expect(withTenant(fixture.schoolId, (tx) => editLessonPlan(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId }, lessonInput(fixture))))
      .rejects.toMatchObject({ code: "TERM_LOCKED" });
    const approved = await setup("lesson", "approved");
    await expect(withTenant(approved.schoolId, (tx) => editLessonPlan(tx, { schoolId: approved.schoolId, actorId: approved.ownerId }, lessonInput(approved))))
      .rejects.toMatchObject({ code: "WORK_NOT_EDITABLE" });
  });

  it("requires reviewer reasons for returned work and preserves every review decision", async () => {
    const fixture = await setup("lesson", "submitted");
    await grantReview(fixture);
    const missingReason = await patchAs(fixture, fixture.memberId, { id: fixture.id, status: "changes_requested", reviewNote: "Strengthen the assessment evidence." });
    expect(missingReason.status).toBe(400);

    const returned = await patchAs(fixture, fixture.memberId, { id: fixture.id, status: "changes_requested", reviewReason: "assessment", reviewNote: "Strengthen the assessment evidence." });
    expect(returned.status).toBe(200);

    const forbiddenApproval = await patchAs(fixture, fixture.memberId, { id: fixture.id, status: "approved", reviewNote: "Approved without resubmission." });
    expect(forbiddenApproval.status).toBe(409);

    const changed = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ updatedAt: Date }>>`SELECT "updatedAt" FROM "LessonPlan" WHERE "id"=${fixture.id}`);
    await withTenant(fixture.schoolId, (tx) => editLessonPlan(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId }, lessonInput({ id: fixture.id, updatedAt: changed[0].updatedAt.toISOString() })));

    const approved = await patchAs(fixture, fixture.memberId, { id: fixture.id, status: "approved", reviewNote: "The revised assessment now matches the outcomes." });
    expect(approved.status).toBe(200);
    const history = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ decision: string; reasonCode: string | null; note: string | null }>>`SELECT "decision","reasonCode","note" FROM "LessonPlanReview" WHERE "schoolId"=${fixture.schoolId} AND "lessonPlanId"=${fixture.id} ORDER BY "createdAt" ASC`);
    expect(history).toEqual([
      { decision: "changes_requested", reasonCode: "assessment", note: "Strengthen the assessment evidence." },
      { decision: "approved", reasonCode: null, note: "The revised assessment now matches the outcomes." },
    ]);
  });

  it("requires reflection before completion and allows the author to archive completed evidence", async () => {
    const fixture = await setup("lesson", "approved");
    const missingReflection = await patchAs(fixture, fixture.ownerId, { id: fixture.id, status: "completed" });
    expect(missingReflection.status).toBe(400);
    const completed = await patchAs(fixture, fixture.ownerId, { id: fixture.id, status: "completed", reflection: "Most learners met the outcome; reteach the final example to the support group." });
    expect(completed.status).toBe(200);
    const archived = await patchAs(fixture, fixture.ownerId, { id: fixture.id, status: "archived" });
    expect(archived.status).toBe(200);
    const row = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ status: string; reflection: string | null; completedAt: Date | null; archivedAt: Date | null }>>`SELECT "status","reflection","completedAt","archivedAt" FROM "LessonPlan" WHERE "id"=${fixture.id}`);
    expect(row[0].status).toBe("archived");
    expect(row[0].reflection).toContain("Most learners met the outcome");
    expect(row[0].completedAt).toBeInstanceOf(Date);
    expect(row[0].archivedAt).toBeInstanceOf(Date);
  });

  it("edits and publishes a homework draft without permitting later content mutation", async () => {
    const fixture = await setup("homework");
    const actor = { schoolId: fixture.schoolId, actorId: fixture.ownerId };
    const input = { id: fixture.id, expectedUpdatedAt: fixture.updatedAt, title: "Updated exercise",
      instructions: "Complete the revised exercise", dueDate: new Date("2026-09-16"), points: 20, assignmentStatus: "assigned" as const };
    await withTenant(fixture.schoolId, (tx) => editHomework(tx, actor, input));
    const rows = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ updatedAt: Date; assignmentStatus: string }>>`SELECT "updatedAt","assignmentStatus" FROM "Homework" WHERE "id"=${fixture.id} AND "schoolId"=${fixture.schoolId}`);
    expect(rows[0].assignmentStatus).toBe("assigned");
    await expect(withTenant(fixture.schoolId, (tx) => editHomework(tx, actor, { ...input, expectedUpdatedAt: rows[0].updatedAt.toISOString() })))
      .rejects.toMatchObject({ code: "WORK_NOT_EDITABLE" });
  });
});
