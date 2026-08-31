import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { createFeeItem, generateInvoice, recordPayment } from "../src/lib/finance-service";

describe("finance payment integrity", () => {
  it("treats the same payment reference as an idempotent retry and rejects reuse for a different transaction", async () => {
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
      const student = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: "FIN-" + fixture.schoolId,
          name: "Finance Test Student"
        }
      });

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
        amount: 125,
        method: "momo",
        reference: "MOMO-FIN-001"
      });
      const retry = await recordPayment(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        invoiceId: invoice.id,
        amount: 125,
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
      ).toEqual(new Prisma.Decimal(125));
    });
  });
});
