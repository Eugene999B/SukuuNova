import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { refreshInvoiceFinancialProjection } from "./finance-service";
import { requirePermission } from "./rbac";

type StructureRow = {
  id: string;
  schoolId: string;
  termId: string;
  classId: string;
  name: string;
  version: number;
  status: string;
};

type PublishLine = {
  id: string;
  categoryId: string;
  amount: Prisma.Decimal;
  dueDate: Date | null;
  optional: boolean;
  categoryName: string;
};

type AmountRow = { id: string; amount: Prisma.Decimal };

function equalMoney(left: Prisma.Decimal | string | number, right: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(String(left)).toDecimalPlaces(2).equals(new Prisma.Decimal(String(right)).toDecimalPlaces(2));
}

export async function publishFeeStructureV2Safe(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; structureId: string },
) {
  await requirePermission(tx, input.actorId, "finance:fee_structures_manage");

  // Lock the selected structure first, then the school/term/class publication lane.
  // Two different draft versions for the same class therefore serialize before either can publish.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`publish-fees:${input.schoolId}:${input.structureId}`}))`;
  const structures = await tx.$queryRawUnsafe<StructureRow[]>(
    `SELECT "id","schoolId","termId","classId","name","version","status" FROM "FinanceFeeStructure" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`,
    input.schoolId,
    input.structureId,
  );
  const structure = structures[0];
  if (!structure) throw new AppError("Fee structure not found.", 404, "NOT_FOUND");
  if (structure.status === "published") return { id: structure.id, alreadyPublished: true };
  if (structure.status !== "draft") throw new AppError("Only a draft fee structure can be published.", 409, "STRUCTURE_NOT_DRAFT");

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`publish-fees-class:${input.schoolId}:${structure.termId}:${structure.classId}`}))`;
  const published = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "FinanceFeeStructure" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3 AND "status"='published' AND "id"<>$4 LIMIT 1`,
    input.schoolId,
    structure.termId,
    structure.classId,
    structure.id,
  );
  if (published[0]) {
    throw new AppError(
      "This class already has a published fee structure for the term. Posted fees are immutable; use an approved adjustment or reversal for corrections.",
      409,
      "PUBLISHED_STRUCTURE_EXISTS",
    );
  }

  const term = await tx.term.findFirst({ where: { id: structure.termId, schoolId: input.schoolId }, select: { isLocked: true } });
  if (!term || term.isLocked) throw new AppError("The selected term is locked or unavailable.", 409, "TERM_LOCKED");

  const lines = await tx.$queryRawUnsafe<PublishLine[]>(
    `SELECT l."id",l."categoryId",l."amount",l."dueDate",l."optional",c."name" AS "categoryName" FROM "FinanceFeeStructureLine" l JOIN "FinanceFeeCategory" c ON c."id"=l."categoryId" AND c."schoolId"=l."schoolId" WHERE l."schoolId"=$1 AND l."structureId"=$2 ORDER BY l."sortOrder"`,
    input.schoolId,
    structure.id,
  );
  const billableLines = lines.filter((line) => !line.optional);
  if (!billableLines.length) throw new AppError("The fee structure has no required fee lines to publish.", 409, "FEE_LINES_REQUIRED");
  if (billableLines.some((line) => new Prisma.Decimal(String(line.amount)).lessThanOrEqualTo(0))) {
    throw new AppError("Published fee amounts must be greater than zero.", 400, "INVALID_AMOUNT");
  }

  const students = await tx.student.findMany({
    where: { schoolId: input.schoolId, classId: structure.classId, status: "active" },
    select: { id: true },
  });

  let assigned = 0;
  for (const student of students) {
    let invoice = await tx.invoice.findFirst({
      where: { schoolId: input.schoolId, studentId: student.id, termId: structure.termId },
      select: { id: true },
    });
    if (!invoice) {
      invoice = await tx.invoice.create({
        data: { schoolId: input.schoolId, studentId: student.id, termId: structure.termId, totalAmount: new Prisma.Decimal(0), status: "unpaid" },
        select: { id: true },
      });
      // Release C allows the historical class snapshot to be filled once while null.
      await tx.$executeRawUnsafe(
        `UPDATE "Invoice" SET "classId"=$1 WHERE "schoolId"=$2 AND "id"=$3 AND "classId" IS NULL`,
        structure.classId,
        input.schoolId,
        invoice.id,
      );
    }

    for (const line of billableLines) {
      // Version is part of the immutable fee identity. A later draft can never rewrite
      // the FeeItem/InvoiceLine that represented an earlier published structure.
      const feeName = `${line.categoryName} · ${structure.name} · v${structure.version}`;
      const created = await tx.$queryRawUnsafe<AmountRow[]>(
        `INSERT INTO "FeeItem" ("id","schoolId","name","amount","termId","classId") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("schoolId","termId","classId","name") DO NOTHING RETURNING "id","amount"`,
        createId(),
        input.schoolId,
        feeName,
        line.amount,
        structure.termId,
        structure.classId,
      );
      let feeItem = created[0];
      if (!feeItem) {
        const existing = await tx.$queryRawUnsafe<AmountRow[]>(
          `SELECT "id","amount" FROM "FeeItem" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3 AND "name"=$4 LIMIT 1`,
          input.schoolId,
          structure.termId,
          structure.classId,
          feeName,
        );
        feeItem = existing[0];
      }
      if (!feeItem) throw new AppError("Fee item could not be materialized.", 500, "FEE_ITEM_CREATE_FAILED");
      if (!equalMoney(feeItem.amount, line.amount)) {
        throw new AppError("Published fee history conflicts with this draft amount.", 409, "IMMUTABLE_FEE_CONFLICT");
      }

      const insertedLine = await tx.$queryRawUnsafe<Array<{ amount: Prisma.Decimal }>>(
        `INSERT INTO "InvoiceLine" ("schoolId","invoiceId","feeItemId","amount") VALUES ($1,$2,$3,$4) ON CONFLICT ("invoiceId","feeItemId") DO NOTHING RETURNING "amount"`,
        input.schoolId,
        invoice.id,
        feeItem.id,
        line.amount,
      );
      if (!insertedLine[0]) {
        const existingLine = await tx.$queryRawUnsafe<Array<{ amount: Prisma.Decimal }>>(
          `SELECT "amount" FROM "InvoiceLine" WHERE "schoolId"=$1 AND "invoiceId"=$2 AND "feeItemId"=$3 LIMIT 1`,
          input.schoolId,
          invoice.id,
          feeItem.id,
        );
        if (!existingLine[0] || !equalMoney(existingLine[0].amount, line.amount)) {
          throw new AppError("Posted invoice lines are immutable and cannot be rewritten.", 409, "IMMUTABLE_INVOICE_LINE_CONFLICT");
        }
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "FinanceStudentCharge" ("id","schoolId","studentId","termId","structureId","structureLineId","categoryId","invoiceId","feeItemId","originalAmount","netAmount","dueDate") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11) ON CONFLICT ("schoolId","studentId","structureLineId") DO NOTHING`,
        createId(),
        input.schoolId,
        student.id,
        structure.termId,
        structure.id,
        line.id,
        line.categoryId,
        invoice.id,
        feeItem.id,
        line.amount,
        line.dueDate,
      );
      assigned += 1;
    }

    // Invoice totals are always derived by the canonical Release C projector.
    await refreshInvoiceFinancialProjection(tx, input.schoolId, invoice.id);
  }

  await tx.$executeRawUnsafe(
    `UPDATE "FinanceFeeStructure" SET "status"='published',"publishedAt"=CURRENT_TIMESTAMP,"publishedBy"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$2 AND "id"=$3 AND "status"='draft'`,
    input.actorId,
    input.schoolId,
    structure.id,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "finance_v2.fee_structure_published",
    entityType: "FinanceFeeStructure",
    entityId: structure.id,
    after: { students: students.length, charges: assigned, immutableLedger: true },
  });
  return { id: structure.id, students: students.length, charges: assigned };
}
