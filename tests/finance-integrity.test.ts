import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { withTenant, type TenantDb } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { createFeeItem, generateInvoice, recordPayment } from "../src/lib/finance-service";

async function createConfirmedFinanceStudent(
  tx: TenantDb,
  fixture: Awaited<ReturnType<typeof createTenantFixture>>,
  input: { yearId: string; termId: string; suffix: string },
) {
  const classroom = await tx.class.create({
    data: { schoolId: fixture.schoolId, name: `Finance Class ${input.suffix}` },
  });
  const student = await tx.student.create({
    data: {
      schoolId: fixture.schoolId,
      admissionNo: `FIN-${input.suffix}-${fixture.schoolId}`,
      name: `Finance Test Student ${input.suffix}`,
      classId: classroom.id,
    },
  });
  await tx.$executeRawUnsafe(
    `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy")
     VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
    `fin-enrol-${student.id}`,
    fixture.schoolId,
    student.id,
    input.yearId,
    input.termId,
    classroom.id,
    fixture.ownerId,
  );
  return student;
}

describe("finance payment integrity", () => {
  it("treats the same payment reference as an idempotent retry even after full settlement and rejects reuse for a different transaction", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: "2026/2027",
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2027-07-31T00:00:00.000Z")
        }
      });
      const term = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Term 1",
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-12-18T00:00:00.000Z")
        }
      });
      const student = await createConfirmedFinanceStudent(tx, fixture, { yearId: year.id, termId: term.id, suffix: "ONE" });

      await createFeeItem(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        termId: term.id,
        name: "Tuition",
        amount: 500
      });
      const invoice = await generateInvoice(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: student.id,
        termId: term.id
      });

      const first = await recordPayment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        invoiceId: invoice.id,
        amount: 500,
        method: "momo",
        reference: "MOMO-FIN-001"
      });
      const retry = await recordPayment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        invoiceId: invoice.id,
        amount: 500,
        method: "momo",
        reference: "MOMO-FIN-001"
      });

      expect(retry.id).toBe(first.id);
      expect(await tx.payment.count({ where: { reference: "MOMO-FIN-001" } })).toBe(1);

      await expect(recordPayment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        invoiceId: invoice.id,
        amount: 200,
        method: "momo",
        reference: "MOMO-FIN-001"
      })).rejects.toMatchObject({ code: "DUPLICATE_PAYMENT_REFERENCE" });

      expect(
        (await tx.payment.findUnique({ where: { id: first.id }, select: { amount: true } }))?.amount
      ).toEqual(new Prisma.Decimal(500));
    });
  });

  it("serializes concurrent payments so the invoice cannot be over-collected", async () => {
    const fixture = await createTenantFixture();
    let invoiceId = "";

    await withTenant(fixture.schoolId, async (tx) => {
      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: "2026/2027 Concurrent",
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2027-07-31T00:00:00.000Z")
        }
      });
      const term = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Term 1 Concurrent",
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-12-18T00:00:00.000Z")
        }
      });
      const student = await createConfirmedFinanceStudent(tx, fixture, { yearId: year.id, termId: term.id, suffix: "CONCURRENT" });

      await createFeeItem(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        termId: term.id,
        name: "Tuition",
        amount: 300
      });
      const invoice = await generateInvoice(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: student.id,
        termId: term.id
      });
      invoiceId = invoice.id;
    });

    const attempts = await Promise.allSettled([
      withTenant(fixture.schoolId, (tx) => recordPayment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        invoiceId,
        amount: 200,
        method: "cash",
        reference: "CONCURRENT-CASH-001"
      })),
      withTenant(fixture.schoolId, (tx) => recordPayment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        invoiceId,
        amount: 200,
        method: "cash",
        reference: "CONCURRENT-CASH-002"
      }))
    ]);

    const fulfilled = attempts.filter((result) => result.status === "fulfilled");
    const rejected = attempts.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: expect.objectContaining({ code: "OVERPAYMENT_REQUIRES_REVIEW" }) });

    await withTenant(fixture.schoolId, async (tx) => {
      const payments = await tx.payment.findMany({ where: { invoiceId }, select: { amount: true } });
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toEqual(new Prisma.Decimal(200));
    });
  });
});
