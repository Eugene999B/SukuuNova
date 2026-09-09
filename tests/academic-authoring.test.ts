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
  return { id: fixture.id, expectedUpdatedAt: fixture.updatedAt, title: "Revised lesson",
    content: "Revised teaching activities", plannedDate: new Date("2026-09-15"), status: "submitted" as const };
}

describe("connected academic authoring", () => {
  it("lets an author correct and resubmit a returned lesson while rejecting stale edits", async () => {
    const fixture = await setup("lesson", "changes_requested");
    const actor = { schoolId: fixture.schoolId, actorId: fixture.ownerId };
    await withTenant(fixture.schoolId, (tx) => editLessonPlan(tx, actor, lessonInput(fixture)));
    await expect(withTenant(fixture.schoolId, (tx) => editLessonPlan(tx, actor, lessonInput(fixture))))
      .rejects.toMatchObject({ code: "CONCURRENT_UPDATE" });
    const rows = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ title: string; status: string }>>`SELECT "title","status" FROM "LessonPlan" WHERE "id"=${fixture.id} AND "schoolId"=${fixture.schoolId}`);
    expect(rows[0]).toMatchObject({ title: "Revised lesson", status: "submitted" });
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

  it("allows an approved lesson's author to mark it completed", async () => {
    const fixture = await setup("lesson", "approved");
    session.schoolId = fixture.schoolId;
    session.userId = fixture.ownerId;
    const response = await transitionLesson(new Request("http://localhost/api/school/lesson-plans", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: fixture.id, status: "completed" })
    }));
    expect(response.status).toBe(200);
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
