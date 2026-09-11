-- Release C: one canonical school-finance obligation chain.
-- InvoiceLine remains the immutable gross fee snapshot. Approved P3FinanceAdjustment rows
-- become the governed reduction layer. Invoice.totalAmount is the net payable projection.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "classId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "grossAmount" DECIMAL(14,2);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "adjustmentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "P3FinanceAdjustment" ADD COLUMN IF NOT EXISTS "termId" TEXT;
ALTER TABLE "P3FinanceAdjustment" ADD COLUMN IF NOT EXISTS "fundingSource" TEXT;
ALTER TABLE "P3FinanceAdjustment" ADD COLUMN IF NOT EXISTS "fundingReference" TEXT;
ALTER TABLE "P3FinanceAdjustment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Migration backfill needs to see every tenant row. These tables are immediately restored to
-- ENABLE + FORCE RLS before the migration finishes.
ALTER TABLE "Invoice" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeItem" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReversal" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "P3FinanceAdjustment" DISABLE ROW LEVEL SECURITY;

UPDATE "P3FinanceAdjustment" SET "mode"='amount' WHERE "mode"='fixed';
UPDATE "P3FinanceAdjustment" SET "kind"='waiver' WHERE "kind"='discount';
UPDATE "P3FinanceAdjustment" a
   SET "termId"=i."termId"
  FROM "Invoice" i
 WHERE a."invoiceId"=i."id"
   AND a."schoolId"=i."schoolId"
   AND a."termId" IS NULL;
UPDATE "P3FinanceAdjustment"
   SET "fundingSource"='Legacy school scholarship programme'
 WHERE "kind"='scholarship'
   AND "status"='approved'
   AND NULLIF(BTRIM("fundingSource"),'') IS NULL;
UPDATE "P3FinanceAdjustment" SET "updatedAt"=COALESCE("approvedAt","createdAt",CURRENT_TIMESTAMP);

UPDATE "Invoice" i
   SET "grossAmount"=COALESCE(
     (SELECT SUM(il."amount") FROM "InvoiceLine" il WHERE il."schoolId"=i."schoolId" AND il."invoiceId"=i."id"),
     i."totalAmount"
   )
 WHERE i."grossAmount" IS NULL;

UPDATE "Invoice" i
   SET "classId"=(
     SELECT e."classId"
       FROM "Enrollment" e
      WHERE e."schoolId"=i."schoolId"
        AND e."studentId"=i."studentId"
        AND e."termId"=i."termId"
        AND e."status" IN ('ready','confirmed')
      ORDER BY CASE e."status" WHEN 'confirmed' THEN 0 ELSE 1 END, e."createdAt" DESC
      LIMIT 1
   )
 WHERE i."classId" IS NULL;

UPDATE "Invoice" i
   SET "classId"=(
     SELECT fi."classId"
       FROM "InvoiceLine" il
       JOIN "FeeItem" fi ON fi."id"=il."feeItemId" AND fi."schoolId"=il."schoolId"
      WHERE il."schoolId"=i."schoolId"
        AND il."invoiceId"=i."id"
        AND fi."classId" IS NOT NULL
      GROUP BY fi."classId"
      ORDER BY COUNT(*) DESC, fi."classId"
      LIMIT 1
   )
 WHERE i."classId" IS NULL;

WITH gross AS (
  SELECT i."id",i."schoolId",COALESCE(i."grossAmount",i."totalAmount",0)::numeric AS amount
    FROM "Invoice" i
), reductions AS (
  SELECT a."invoiceId",a."schoolId",
         SUM(CASE WHEN a."mode"='percent' THEN g.amount * LEAST(a."value",100) / 100 ELSE a."value" END)::numeric AS amount
    FROM "P3FinanceAdjustment" a
    JOIN gross g ON g."id"=a."invoiceId" AND g."schoolId"=a."schoolId"
   WHERE a."status"='approved' AND a."invoiceId" IS NOT NULL
   GROUP BY a."invoiceId",a."schoolId"
), reversed AS (
  SELECT r."paymentId",r."schoolId",SUM(r."amount")::numeric AS amount
    FROM "PaymentReversal" r GROUP BY r."paymentId",r."schoolId"
), paid AS (
  SELECT p."invoiceId",p."schoolId",SUM(p."amount"-COALESCE(r.amount,0))::numeric AS amount
    FROM "Payment" p LEFT JOIN reversed r ON r."paymentId"=p."id" AND r."schoolId"=p."schoolId"
   GROUP BY p."invoiceId",p."schoolId"
)
UPDATE "Invoice" i
   SET "adjustmentAmount"=LEAST(g.amount,GREATEST(COALESCE(red.amount,0),0)),
       "totalAmount"=GREATEST(g.amount-LEAST(g.amount,GREATEST(COALESCE(red.amount,0),0)),0),
       "status"=CASE
         WHEN COALESCE(p.amount,0) >= GREATEST(g.amount-LEAST(g.amount,GREATEST(COALESCE(red.amount,0),0)),0) THEN 'paid'
         WHEN COALESCE(p.amount,0) > 0 THEN 'partial'
         ELSE 'unpaid'
       END
  FROM gross g
  LEFT JOIN reductions red ON red."invoiceId"=g."id" AND red."schoolId"=g."schoolId"
  LEFT JOIN paid p ON p."invoiceId"=g."id" AND p."schoolId"=g."schoolId"
 WHERE i."id"=g."id" AND i."schoolId"=g."schoolId";

UPDATE "Invoice" SET "grossAmount"=COALESCE("grossAmount","totalAmount",0);
ALTER TABLE "Invoice" ALTER COLUMN "grossAmount" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "grossAmount" SET DEFAULT 0;

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FeeItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReversal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReversal" FORCE ROW LEVEL SECURITY;
ALTER TABLE "P3FinanceAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "P3FinanceAdjustment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_finance_projection_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_finance_projection_check"
  CHECK ("grossAmount">=0 AND "adjustmentAmount">=0 AND "adjustmentAmount"<="grossAmount" AND "totalAmount"=("grossAmount"-"adjustmentAmount"));
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_class_snapshot_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_class_snapshot_fkey"
  FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Invoice_schoolId_classId_termId_idx" ON "Invoice"("schoolId","classId","termId");

ALTER TABLE "P3FinanceAdjustment" DROP CONSTRAINT IF EXISTS "P3FinanceAdjustment_kind_check";
ALTER TABLE "P3FinanceAdjustment" ADD CONSTRAINT "P3FinanceAdjustment_kind_check" CHECK ("kind" IN ('waiver','scholarship','sibling_discount'));
ALTER TABLE "P3FinanceAdjustment" DROP CONSTRAINT IF EXISTS "P3FinanceAdjustment_mode_check";
ALTER TABLE "P3FinanceAdjustment" ADD CONSTRAINT "P3FinanceAdjustment_mode_check" CHECK ("mode" IN ('amount','percent'));
ALTER TABLE "P3FinanceAdjustment" DROP CONSTRAINT IF EXISTS "P3FinanceAdjustment_status_check";
ALTER TABLE "P3FinanceAdjustment" ADD CONSTRAINT "P3FinanceAdjustment_status_check" CHECK ("status" IN ('pending','approved','rejected'));
ALTER TABLE "P3FinanceAdjustment" DROP CONSTRAINT IF EXISTS "P3FinanceAdjustment_value_check";
ALTER TABLE "P3FinanceAdjustment" ADD CONSTRAINT "P3FinanceAdjustment_value_check" CHECK ("value">0 AND ("mode"<>'percent' OR "value"<=100));
ALTER TABLE "P3FinanceAdjustment" DROP CONSTRAINT IF EXISTS "P3FinanceAdjustment_term_fkey";
ALTER TABLE "P3FinanceAdjustment" ADD CONSTRAINT "P3FinanceAdjustment_term_fkey"
  FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "P3FinanceAdjustment_schoolId_termId_studentId_idx" ON "P3FinanceAdjustment"("schoolId","termId","studentId");

CREATE OR REPLACE FUNCTION sukuunova_validate_finance_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_student TEXT;
  linked_term TEXT;
BEGIN
  -- Normalize historic synonyms at the canonical database boundary too.
  IF NEW."mode"='fixed' THEN NEW."mode":='amount'; END IF;
  IF NEW."kind"='discount' THEN NEW."kind":='waiver'; END IF;
  NEW."updatedAt":=CURRENT_TIMESTAMP;

  IF NEW."invoiceId" IS NOT NULL THEN
    SELECT i."studentId",i."termId" INTO linked_student,linked_term
      FROM "Invoice" i
     WHERE i."id"=NEW."invoiceId" AND i."schoolId"=NEW."schoolId";
    IF linked_student IS NULL THEN
      RAISE EXCEPTION 'Finance adjustment invoice is not in this school' USING ERRCODE='23514';
    END IF;
    IF NEW."studentId"<>linked_student THEN
      RAISE EXCEPTION 'Finance adjustment student does not match its invoice' USING ERRCODE='23514';
    END IF;
    IF NEW."termId" IS NULL THEN NEW."termId":=linked_term;
    ELSIF NEW."termId"<>linked_term THEN
      RAISE EXCEPTION 'Finance adjustment term does not match its invoice' USING ERRCODE='23514';
    END IF;
  ELSIF NEW."status"='approved' AND NEW."termId" IS NULL THEN
    RAISE EXCEPTION 'Approved finance adjustments require an invoice or term context' USING ERRCODE='23514';
  END IF;

  IF NEW."status"='approved' AND NEW."requestedBy"=NEW."approvedBy" THEN
    RAISE EXCEPTION 'Finance adjustment requester cannot approve the same adjustment' USING ERRCODE='23514';
  END IF;
  IF NEW."status"='approved' AND NEW."kind"='scholarship' AND NULLIF(BTRIM(NEW."fundingSource"),'') IS NULL THEN
    NEW."fundingSource":='School scholarship programme';
  END IF;

  IF TG_OP='UPDATE' AND OLD."status" IN ('approved','rejected') THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
       OR NEW."termId" IS DISTINCT FROM OLD."termId"
       OR NEW."kind" IS DISTINCT FROM OLD."kind"
       OR NEW."mode" IS DISTINCT FROM OLD."mode"
       OR NEW."value" IS DISTINCT FROM OLD."value"
       OR NEW."reason" IS DISTINCT FROM OLD."reason"
       OR NEW."siblingGroupKey" IS DISTINCT FROM OLD."siblingGroupKey"
       OR NEW."fundingSource" IS DISTINCT FROM OLD."fundingSource"
       OR NEW."fundingReference" IS DISTINCT FROM OLD."fundingReference"
       OR NEW."requestedBy" IS DISTINCT FROM OLD."requestedBy"
       OR NEW."approvedBy" IS DISTINCT FROM OLD."approvedBy"
       OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
       OR (OLD."invoiceId" IS NOT NULL AND NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId") THEN
      RAISE EXCEPTION 'Decided finance adjustments are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "P3FinanceAdjustment_canonical_guard" ON "P3FinanceAdjustment";
CREATE TRIGGER "P3FinanceAdjustment_canonical_guard"
BEFORE INSERT OR UPDATE ON "P3FinanceAdjustment"
FOR EACH ROW EXECUTE FUNCTION sukuunova_validate_finance_adjustment();

CREATE OR REPLACE FUNCTION sukuunova_refresh_invoice_financial_projection(p_school_id TEXT,p_invoice_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  gross NUMERIC(14,2);
  reduction NUMERIC(14,2);
  paid NUMERIC(14,2);
  payable NUMERIC(14,2);
BEGIN
  SELECT COALESCE(SUM(il."amount"),i."grossAmount",i."totalAmount",0)
    INTO gross
    FROM "Invoice" i
    LEFT JOIN "InvoiceLine" il ON il."invoiceId"=i."id" AND il."schoolId"=i."schoolId"
   WHERE i."id"=p_invoice_id AND i."schoolId"=p_school_id
   GROUP BY i."id",i."grossAmount",i."totalAmount";
  IF gross IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(CASE WHEN a."mode"='percent' THEN gross*LEAST(a."value",100)/100 ELSE a."value" END),0)
    INTO reduction
    FROM "P3FinanceAdjustment" a
   WHERE a."schoolId"=p_school_id AND a."invoiceId"=p_invoice_id AND a."status"='approved';
  reduction:=LEAST(gross,GREATEST(reduction,0));
  payable:=GREATEST(gross-reduction,0);

  SELECT COALESCE(SUM(p."amount"-COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."schoolId"=p."schoolId" AND r."paymentId"=p."id"),0)),0)
    INTO paid
    FROM "Payment" p
   WHERE p."schoolId"=p_school_id AND p."invoiceId"=p_invoice_id;

  UPDATE "Invoice"
     SET "grossAmount"=gross,
         "adjustmentAmount"=reduction,
         "totalAmount"=payable,
         "status"=CASE WHEN paid>=payable THEN 'paid' WHEN paid>0 THEN 'partial' ELSE 'unpaid' END
   WHERE "id"=p_invoice_id AND "schoolId"=p_school_id;
END;
$$;

CREATE OR REPLACE FUNCTION sukuunova_invoice_line_projection_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM sukuunova_refresh_invoice_financial_projection(COALESCE(NEW."schoolId",OLD."schoolId"),COALESCE(NEW."invoiceId",OLD."invoiceId"));
  RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS "InvoiceLine_refresh_projection" ON "InvoiceLine";
CREATE TRIGGER "InvoiceLine_refresh_projection" AFTER INSERT OR UPDATE OR DELETE ON "InvoiceLine"
FOR EACH ROW EXECUTE FUNCTION sukuunova_invoice_line_projection_trigger();

CREATE OR REPLACE FUNCTION sukuunova_finance_adjustment_projection_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD."invoiceId" IS NOT NULL AND OLD."invoiceId" IS DISTINCT FROM NEW."invoiceId" THEN
    PERFORM sukuunova_refresh_invoice_financial_projection(OLD."schoolId",OLD."invoiceId");
  END IF;
  IF COALESCE(NEW."invoiceId",OLD."invoiceId") IS NOT NULL THEN
    PERFORM sukuunova_refresh_invoice_financial_projection(COALESCE(NEW."schoolId",OLD."schoolId"),COALESCE(NEW."invoiceId",OLD."invoiceId"));
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS "P3FinanceAdjustment_refresh_projection" ON "P3FinanceAdjustment";
CREATE TRIGGER "P3FinanceAdjustment_refresh_projection" AFTER INSERT OR UPDATE OR DELETE ON "P3FinanceAdjustment"
FOR EACH ROW EXECUTE FUNCTION sukuunova_finance_adjustment_projection_trigger();

CREATE OR REPLACE FUNCTION sukuunova_payment_projection_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target_invoice TEXT;
BEGIN
  IF TG_TABLE_NAME='Payment' THEN
    target_invoice:=COALESCE(NEW."invoiceId",OLD."invoiceId");
  ELSE
    SELECT p."invoiceId" INTO target_invoice FROM "Payment" p
     WHERE p."id"=COALESCE(NEW."paymentId",OLD."paymentId") AND p."schoolId"=COALESCE(NEW."schoolId",OLD."schoolId");
  END IF;
  IF target_invoice IS NOT NULL THEN
    PERFORM sukuunova_refresh_invoice_financial_projection(COALESCE(NEW."schoolId",OLD."schoolId"),target_invoice);
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS "Payment_refresh_projection" ON "Payment";
CREATE TRIGGER "Payment_refresh_projection" AFTER INSERT OR UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION sukuunova_payment_projection_trigger();
DROP TRIGGER IF EXISTS "PaymentReversal_refresh_projection" ON "PaymentReversal";
CREATE TRIGGER "PaymentReversal_refresh_projection" AFTER INSERT OR UPDATE OR DELETE ON "PaymentReversal"
FOR EACH ROW EXECUTE FUNCTION sukuunova_payment_projection_trigger();
