import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import {
  commitAcademicYearRollover,
  getAcademicStructureState,
  installAcademicStructureTemplate,
  mapClassSection,
  prepareAcademicYearRollover,
  previewAcademicYearRollover,
  recordPromotionDecision,
} from "../src/lib/academic-structure-service";

describe("academic structure year-end lifecycle", () => {
  it("backfills an existing learner grade, promotes by grade, places into a next-year section, and preserves the current class projection", async () => {
    const fixture = await createTenantFixture();
    const ids = await withTenant(fixture.schoolId, async (tx) => {
      const sourceYear = await tx.academicYear.create({
        data: { schoolId: fixture.schoolId, name: "2026/27 structure test", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31") },
      });
      const sourceTerm = await tx.term.create({
        data: { schoolId: fixture.schoolId, academicYearId: sourceYear.id, name: "Term 1", startDate: sourceYear.startDate, endDate: new Date("2026-12-18") },
      });
      const sourceClass = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Structure Basic 1B", level: "Basic 1" } });
      const student = await tx.student.create({ data: { schoolId: fixture.schoolId, admissionNo: "STRUCT-001", name: "Structure Learner", classId: sourceClass.id } });

      // Deliberately create official term history before the class has any new
      // GradeLevel/ClassSection mapping. Mapping must reconstruct year context.
      await tx.$executeRawUnsafe(
        `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
        `structure-source-${student.id}`,
        fixture.schoolId,
        student.id,
        sourceYear.id,
        sourceTerm.id,
        sourceClass.id,
        fixture.ownerId,
      );

      const installed = await installAcademicStructureTemplate(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        templateKey: "ghana_standard",
        name: "Ghana Structure Test",
        makeDefault: true,
      });
      const state = await getAcademicStructureState(tx, fixture.schoolId);
      const basic1 = state.grades.find((grade) => grade.frameworkId === installed.id && grade.key === "basic_1");
      const basic2 = state.grades.find((grade) => grade.frameworkId === installed.id && grade.key === "basic_2");
      expect(basic1).toBeTruthy();
      expect(basic2).toBeTruthy();

      await mapClassSection(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        academicYearId: sourceYear.id,
        gradeLevelId: basic1!.id,
        classId: sourceClass.id,
        sectionCode: "B",
        displayName: "Basic 1B",
        capacity: 30,
      });

      const backfilled = await tx.$queryRawUnsafe<Array<{ gradeLevelId: string; status: string }>>(
        `SELECT "gradeLevelId","status" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "studentId"=$2 AND "academicYearId"=$3`,
        fixture.schoolId,
        student.id,
        sourceYear.id,
      );
      expect(backfilled).toEqual([{ gradeLevelId: basic1!.id, status: "active" }]);

      await recordPromotionDecision(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: student.id,
        sourceAcademicYearId: sourceYear.id,
        outcome: "promoted",
      });

      const targetYear = await tx.academicYear.create({
        data: { schoolId: fixture.schoolId, name: "2027/28 structure test", startDate: new Date("2027-09-01"), endDate: new Date("2028-07-31") },
      });
      const targetTerm = await tx.term.create({
        data: { schoolId: fixture.schoolId, academicYearId: targetYear.id, name: "Term 1", startDate: targetYear.startDate, endDate: new Date("2027-12-17") },
      });
      const targetA = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Structure Basic 2A", level: "Basic 2" } });
      const targetB = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Structure Basic 2B", level: "Basic 2" } });
      await mapClassSection(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, academicYearId: targetYear.id, gradeLevelId: basic2!.id, classId: targetA.id, sectionCode: "A", displayName: "Basic 2A", capacity: 30 });
      await mapClassSection(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, academicYearId: targetYear.id, gradeLevelId: basic2!.id, classId: targetB.id, sectionCode: "B", displayName: "Basic 2B", capacity: 30 });

      const preview = await previewAcademicYearRollover(tx, {
        schoolId: fixture.schoolId,
        sourceAcademicYearId: sourceYear.id,
        targetAcademicYearId: targetYear.id,
        frameworkId: installed.id,
      });
      expect(preview.summary).toMatchObject({ total: 1, ready: 1, blocked: 0, promoted: 1 });
      expect(preview.items[0]).toMatchObject({ targetGradeLevelId: basic2!.id, targetClassId: targetA.id, status: "ready" });

      const prepared = await prepareAcademicYearRollover(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        sourceAcademicYearId: sourceYear.id,
        targetAcademicYearId: targetYear.id,
        frameworkId: installed.id,
      });
      expect(prepared.status).toBe("validated");
      const committed = await commitAcademicYearRollover(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, rolloverId: prepared.id });
      expect(committed).toMatchObject({ status: "committed", alreadyCommitted: false, summary: { promoted: 1 } });

      const [sourceAfter, targetAfter, targetTermEnrollment, studentAfter] = await Promise.all([
        tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "studentId"=$2 AND "academicYearId"=$3`, fixture.schoolId, student.id, sourceYear.id),
        tx.$queryRawUnsafe<Array<{ gradeLevelId: string; status: string }>>(`SELECT "gradeLevelId","status" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "studentId"=$2 AND "academicYearId"=$3`, fixture.schoolId, student.id, targetYear.id),
        tx.$queryRawUnsafe<Array<{ classId: string; status: string }>>(`SELECT "classId","status" FROM "Enrollment" WHERE "schoolId"=$1 AND "studentId"=$2 AND "termId"=$3`, fixture.schoolId, student.id, targetTerm.id),
        tx.student.findFirstOrThrow({ where: { id: student.id, schoolId: fixture.schoolId }, select: { classId: true } }),
      ]);
      expect(sourceAfter).toEqual([{ status: "completed" }]);
      expect(targetAfter).toEqual([{ gradeLevelId: basic2!.id, status: "planned" }]);
      expect(targetTermEnrollment).toEqual([{ classId: targetA.id, status: "draft" }]);
      expect(studentAfter.classId).toBe(sourceClass.id);

      return { sourceClassId: sourceClass.id, studentId: student.id };
    });
    expect(ids.sourceClassId).toBeTruthy();
    expect(ids.studentId).toBeTruthy();
  });
});
