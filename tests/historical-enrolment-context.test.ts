import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { resolveStudentTermClass } from "../src/lib/student-term-context";
import { enterScore } from "../src/lib/gradebook-service";
import { generateInvoice } from "../src/lib/finance-service";
import { getClassSubjectIntelligence } from "../src/lib/performance-intelligence";
import { calculateIntelligentReportCard } from "../src/lib/report-card-intelligence";
import { approveAndQueuePublicReportCard } from "../src/lib/report-card-release-service";
import { rulesFor } from "../src/lib/report-card-ranking";

describe("historical enrolment context", () => {
  it("keeps an older term bound to its enrolled class after the learner moves", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: {
          allowPartialReportCards: true,
          gradingScale: [
            { min: 80, max: 100, grade: "A", label: "Excellent" },
            { min: 70, max: 79.99, grade: "B", label: "Very Good" },
            { min: 60, max: 69.99, grade: "C", label: "Good" },
            { min: 50, max: 59.99, grade: "D", label: "Pass" },
            { min: 40, max: 49.99, grade: "E", label: "Needs Improvement" },
            { min: 0, max: 39.99, grade: "F", label: "Below Standard" },
          ],
        },
      });

      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: "2025/2026 Historical Context",
          startDate: new Date("2025-09-01T00:00:00.000Z"),
          endDate: new Date("2026-07-31T00:00:00.000Z"),
        },
      });
      const term = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Historical Term 1",
          startDate: new Date("2025-09-01T00:00:00.000Z"),
          endDate: new Date("2025-12-19T00:00:00.000Z"),
        },
      });

      const teacherRole = await tx.role.create({
        data: { schoolId: fixture.schoolId, name: "Historical Teacher", key: "teacher", isSystem: true },
      });
      const teacher = await tx.user.create({
        data: { schoolId: fixture.schoolId, name: "Historical Teacher", email: `historical-teacher-${fixture.schoolId}@test.invalid`, passwordHash: "test-only" },
      });
      await tx.userRole.create({ data: { schoolId: fixture.schoolId, userId: teacher.id, roleId: teacherRole.id } });

      const classA = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: "Primary 5 Historical", level: "Primary 5", classTeacherId: fixture.ownerId },
      });
      const classB = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: "Primary 6 Current", level: "Primary 6", classTeacherId: fixture.ownerId },
      });
      const subject = await tx.subject.create({ data: { schoolId: fixture.schoolId, name: "Historical Mathematics" } });
      await tx.classSubjectTeacher.create({ data: { schoolId: fixture.schoolId, classId: classA.id, subjectId: subject.id, teacherId: teacher.id } });

      const student = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: `HIST-${fixture.schoolId}`,
          name: "Promoted Learner",
          classId: classB.id,
          status: "active",
        },
      });
      await tx.$executeRawUnsafe(
        `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
        `hist-enrol-${student.id}`,
        fixture.schoolId,
        student.id,
        year.id,
        term.id,
        classA.id,
        fixture.ownerId,
      );

      const classAAssessment = await tx.assessment.create({
        data: { schoolId: fixture.schoolId, termId: term.id, classId: classA.id, subjectId: subject.id, name: "Historical CA", type: "ca", weight: 40, maxScore: 40 },
      });
      const classAExam = await tx.assessment.create({
        data: { schoolId: fixture.schoolId, termId: term.id, classId: classA.id, subjectId: subject.id, name: "Historical Exam", type: "exam", weight: 60, maxScore: 60 },
      });
      const wrongClassAssessment = await tx.assessment.create({
        data: { schoolId: fixture.schoolId, termId: term.id, classId: classB.id, subjectId: subject.id, name: "Wrong Current-Class Test", type: "ca", weight: 100, maxScore: 100 },
      });

      const context = await resolveStudentTermClass(tx, { schoolId: fixture.schoolId, studentId: student.id, termId: term.id });
      expect(context.classId).toBe(classA.id);
      expect(context.source).toBe("enrollment");

      await expect(enterScore(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: student.id,
        assessmentId: classAAssessment.id,
        value: 32,
      })).resolves.toMatchObject({ studentId: student.id, assessmentId: classAAssessment.id });
      await enterScore(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: student.id,
        assessmentId: classAExam.id,
        value: 48,
      });
      await expect(enterScore(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: student.id,
        assessmentId: wrongClassAssessment.id,
        value: 70,
      })).rejects.toMatchObject({ code: "INVALID_STUDENT_CLASS" });

      const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { schoolId: fixture.schoolId } });
      const intelligence = await getClassSubjectIntelligence(tx, {
        classId: classA.id,
        subjectId: subject.id,
        termId: term.id,
        rules: rulesFor(settings),
        scope: "class",
      });
      expect(intelligence.rows.map((row) => row.studentId)).toContain(student.id);
      expect(intelligence.rows.find((row) => row.studentId === student.id)?.total).not.toBeNull();

      const classAFee = await tx.feeItem.create({
        data: { schoolId: fixture.schoolId, termId: term.id, classId: classA.id, name: "Historical Class A Fee", amount: 100 },
      });
      const classBFee = await tx.feeItem.create({
        data: { schoolId: fixture.schoolId, termId: term.id, classId: classB.id, name: "Current Class B Fee", amount: 900 },
      });
      const invoice = await generateInvoice(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, studentId: student.id, termId: term.id });
      expect(invoice).not.toBeNull();
      const lines = await tx.invoiceLine.findMany({ where: { schoolId: fixture.schoolId, invoiceId: invoice!.id }, select: { feeItemId: true } });
      expect(lines.map((line) => line.feeItemId)).toContain(classAFee.id);
      expect(lines.map((line) => line.feeItemId)).not.toContain(classBFee.id);
      expect(Number(invoice!.totalAmount)).toBe(100);

      const report = await tx.reportCard.create({
        data: {
          schoolId: fixture.schoolId,
          studentId: student.id,
          termId: term.id,
          pdfData: Buffer.from("historical-report"),
          status: "submitted",
          submittedBy: fixture.memberId,
          submittedAt: new Date(),
        },
      });
      const calculated = await calculateIntelligentReportCard(tx, { schoolId: fixture.schoolId, reportId: report.id });
      expect(calculated.student.classId).toBe(classA.id);
      expect(calculated.student.className).toBe(classA.name);
      expect(calculated.results.map((row) => row.subject)).toContain(subject.name);

      await approveAndQueuePublicReportCard(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        reportCardId: report.id,
        origin: "https://school.example.test",
      });
      const approved = await tx.reportCard.findUniqueOrThrow({ where: { id: report.id }, select: { calculationSnapshot: true, status: true } });
      const snapshot = approved.calculationSnapshot as Record<string, unknown>;
      expect(approved.status).toBe("approved");
      expect(snapshot.classId).toBe(classA.id);
      expect(snapshot.className).toBe(classA.name);

      const current = await tx.student.findUniqueOrThrow({ where: { id: student.id }, select: { classId: true } });
      expect(current.classId).toBe(classB.id);
    });
  });
});
