import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { addClassSubjectOffering, listClassSubjectOfferings } from "../src/lib/class-subject-offerings";
import { withTenant } from "../src/lib/db";
import { createTenantFixture, rawDb, setRawTenant } from "./helpers";

async function createClassAndSubject(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const classroom = await tx.class.create({ data: { schoolId, name: `Class ${createId()}`, level: "Basic 4" } });
    const subject = await tx.subject.create({ data: { schoolId, name: `Subject ${createId()}` } });
    return { classroom, subject };
  });
}

describe("class-first subject offerings", () => {
  it("keeps a subject in the class curriculum after its teacher is removed", async () => {
    const fixture = await createTenantFixture();
    const { classroom, subject } = await createClassAndSubject(fixture.schoolId);

    await withTenant(fixture.schoolId, async (tx) => {
      await tx.classSubjectTeacher.create({
        data: {
          schoolId: fixture.schoolId,
          classId: classroom.id,
          subjectId: subject.id,
          teacherId: fixture.ownerId,
        },
      });
      const before = await listClassSubjectOfferings(tx, fixture.schoolId, classroom.id);
      expect(before).toHaveLength(1);
      expect(before[0].subjectId).toBe(subject.id);
      expect(before[0].teachers.map((teacher) => teacher.id)).toEqual([fixture.ownerId]);

      await tx.classSubjectTeacher.delete({
        where: {
          classId_subjectId_teacherId: {
            classId: classroom.id,
            subjectId: subject.id,
            teacherId: fixture.ownerId,
          },
        },
      });
      const after = await listClassSubjectOfferings(tx, fixture.schoolId, classroom.id);
      expect(after).toHaveLength(1);
      expect(after[0].teachers).toEqual([]);
    });
  });

  it("allows an unstaffed subject to exist before any teacher assignment", async () => {
    const fixture = await createTenantFixture();
    const { classroom, subject } = await createClassAndSubject(fixture.schoolId);

    await withTenant(fixture.schoolId, async (tx) => {
      const inserted = await addClassSubjectOffering(tx, {
        schoolId: fixture.schoolId,
        classId: classroom.id,
        subjectId: subject.id,
      });
      expect(inserted).toBe(true);
      const offerings = await listClassSubjectOfferings(tx, fixture.schoolId, classroom.id);
      expect(offerings.map((item) => item.subjectId)).toEqual([subject.id]);
      expect(offerings[0].teachers).toEqual([]);
    });
  });

  it("enforces tenant RLS on the curriculum offering table", async () => {
    const first = await createTenantFixture();
    const second = await createTenantFixture();
    const { classroom, subject } = await createClassAndSubject(first.schoolId);

    await withTenant(first.schoolId, (tx) => addClassSubjectOffering(tx, {
      schoolId: first.schoolId,
      classId: classroom.id,
      subjectId: subject.id,
    }));

    const rows = await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, second.schoolId);
      return tx.$queryRaw<Array<{ schoolId: string }>>`
        SELECT "schoolId" FROM "ClassSubjectOffering" WHERE "schoolId" = ${first.schoolId}
      `;
    });
    expect(rows).toEqual([]);
  });
});
