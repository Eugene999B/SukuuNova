import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import {
  calculateAdjustmentReduction,
  decideFinanceAdjustment,
  generateInvoice,
  recordPayment,
  requestFinanceAdjustment,
  reversePayment,
} from "../src/lib/finance-service";

type ProjectionRow = {
  id: string;
  classId: string | null;
  grossAmount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  status: string;
};

describe("canonical finance obligation ledger", () => {
  it("calculates approved amount and percentage reductions exactly and ignores pending rows", () => {
    expect(calculateAdjustmentReduction(1000, [
      { status: "approved", mode: "percent", value: 10 },
      { status: "approved", mode: "amount", value: 125.5 },
      { status: "pending", mode: "amount", value: 900 },
    ])).toEqual(new Prisma.Decimal("225.50"));
  });

  it("keeps historical class, scholarships, payments and reversals on one payable balance", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      const adjustPermissionId = fixture.permissionIds.get("fees:adjust");
      expect(adjustPermissionId).toBeTruthy();
      await tx.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId: fixture.memberId, permissionId: adjustPermissionId! } },
        update: { granted: true },
        create: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId: adjustPermissionId!, granted: true },
      });

      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: `2026/2027 Finance Ledger ${fixture.schoolId}`,
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2027-07-31T00:00:00.000Z"),
        },
      });
      const term = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Finance Ledger Term 1",
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-12-18T00:00:00.000Z"),
        },
      });
      const historicalClass = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: `Finance Historical ${fixture.schoolId}` },
      });
      const currentClass = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: `Finance Current ${fixture.schoolId}` },
      });
      const student = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: `FIN-LEDGER-${fixture.schoolId}`,
          name: "Finance Ledger Learner",
          classId: currentClass.id,
          status: "active",
        },
      });
      await tx.$executeRawUnsafe(
        `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
        `fin-ledger-enrol-${student.id}`,
        fixture.schoolId,
        student.id,
        year.id,
        term.id,
        historicalClass.id,
        fixture.ownerId,
      );
      await tx.feeItem.create({
        data: { schoolId: fixture.schoolId, termId: term.id, classId: historicalClass.id, name: "Historical tuition", amount: 1000 },
      });
      await tx.feeItem.create({
        data: { schoolId: fixture.schoolId, termId: term.id, classId: currentClass.id, name: "Wrong current-class tuition", amount: 9000 },
      });

      const scholarship = await requestFinanceAdjustment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        studentId: student.id,
        termId: term.id,
        kind: "scholarship",
        mode: "amount",
        value: 200,
        reason: "Merit scholarship",
        fundingSource: "Alumni Scholarship Fund",
        fundingReference: "ALUMNI-2026-001",
      });
      expect(scholarship.status).toBe("pending");
      expect(scholarship.invoiceId).toBeNull();

      const approvedScholarship = await decideFinanceAdjustment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        adjustmentId: scholarship.id,
        decision: "approve",
      });
      expect(approvedScholarship.status).toBe("approved");

      const invoice = await generateInvoice(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: student.id,
        termId: term.id,
      });
      expect(invoice).toBeTruthy();

      const projection = (await tx.$queryRawUnsafe<ProjectionRow[]>(
        `SELECT "id","classId","grossAmount","adjustmentAmount","totalAmount","status" FROM "Invoice" WHERE "schoolId"=$1 AND "id"=$2`,
        fixture.schoolId,
        invoice!.id,
      ))[0];
      expect(projection.classId).toBe(historicalClass.id);
      expect(projection.grossAmount).toEqual(new Prisma.Decimal(1000));
      expect(projection.adjustmentAmount).toEqual(new Prisma.Decimal(200));
      expect(projection.totalAmount).toEqual(new Prisma.Decimal(800));
      expect(projection.status).toBe("unpaid");

      const attached = await tx.$queryRawUnsafe<Array<{ invoiceId: string | null; fundingSource: string | null }>>(
        `SELECT "invoiceId","fundingSource" FROM "P3FinanceAdjustment" WHERE "schoolId"=$1 AND "id"=$2`,
        fixture.schoolId,
        scholarship.id,
      );
      expect(attached[0]).toEqual({ invoiceId: invoice!.id, fundingSource: "Alumni Scholarship Fund" });

      const excessive = await requestFinanceAdjustment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        studentId: student.id,
        invoiceId: invoice!.id,
        kind: "waiver",
        mode: "percent",
        value: 90,
        reason: "Would exceed the gross obligation",
      });
      await expect(decideFinanceAdjustment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        adjustmentId: excessive.id,
        decision: "approve",
      })).rejects.toMatchObject({ code: "ADJUSTMENTS_EXCEED_GROSS" });

      const payment = await recordPayment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        invoiceId: invoice!.id,
        amount: 800,
        method: "cash",
        reference: `FIN-LEDGER-${fixture.schoolId}`,
      });
      const paid = (await tx.$queryRawUnsafe<ProjectionRow[]>(
        `SELECT "id","classId","grossAmount","adjustmentAmount","totalAmount","status" FROM "Invoice" WHERE "schoolId"=$1 AND "id"=$2`,
        fixture.schoolId,
        invoice!.id,
      ))[0];
      expect(paid.totalAmount).toEqual(new Prisma.Decimal(800));
      expect(paid.status).toBe("paid");

      await reversePayment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        paymentId: payment.id,
        amount: 100,
        reason: "Cashier correction",
        idempotencyKey: `fin-ledger-reversal-${fixture.schoolId}`,
      });
      const reversed = (await tx.$queryRawUnsafe<ProjectionRow[]>(
        `SELECT "id","classId","grossAmount","adjustmentAmount","totalAmount","status" FROM "Invoice" WHERE "schoolId"=$1 AND "id"=$2`,
        fixture.schoolId,
        invoice!.id,
      ))[0];
      expect(reversed.classId).toBe(historicalClass.id);
      expect(reversed.totalAmount).toEqual(new Prisma.Decimal(800));
      expect(reversed.status).toBe("partial");

      const currentStudent = await tx.student.findUniqueOrThrow({ where: { id: student.id }, select: { classId: true } });
      expect(currentStudent.classId).toBe(currentClass.id);
    });
  });
});
