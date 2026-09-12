-- Finance V2 release hardening.
-- Preserve immutable class/term publication, require positive published fee lines,
-- and align the Payment method constraint with the methods already supported by
-- the canonical finance service and Finance V2 UI.

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_method_check";
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_method_check"
  CHECK ("method" IN ('momo','cash','card','bank','cheque'));

ALTER TABLE "FinanceFeeStructureLine" DROP CONSTRAINT IF EXISTS "FinanceFeeStructureLine_amount_check";
ALTER TABLE "FinanceFeeStructureLine"
  ADD CONSTRAINT "FinanceFeeStructureLine_amount_check"
  CHECK ("amount" > 0);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceFeeStructure_one_published_per_class_term_key"
  ON "FinanceFeeStructure"("schoolId","termId","classId")
  WHERE "status"='published';
