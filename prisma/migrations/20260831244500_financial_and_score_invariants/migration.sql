DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeeItem_amount_positive') THEN
    ALTER TABLE "FeeItem" ADD CONSTRAINT "FeeItem_amount_positive" CHECK ("amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_total_nonnegative') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_total_nonnegative" CHECK ("totalAmount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_amount_positive') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentReversal_amount_positive') THEN
    ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_amount_positive" CHECK ("amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assessment_weight_nonnegative') THEN
    ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_weight_nonnegative" CHECK ("weight" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assessment_maxScore_positive') THEN
    ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_maxScore_positive" CHECK ("maxScore" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Score_value_nonnegative') THEN
    ALTER TABLE "Score" ADD CONSTRAINT "Score_value_nonnegative" CHECK ("value" >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sukuunova_validate_score_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  max_score NUMERIC;
BEGIN
  SELECT "maxScore" INTO max_score
  FROM "Assessment"
  WHERE "id" = NEW."assessmentId" AND "schoolId" = NEW."schoolId";
  IF max_score IS NULL THEN
    RAISE EXCEPTION 'Assessment not found for score.' USING ERRCODE = '23503';
  END IF;
  IF NEW."value" > max_score THEN
    RAISE EXCEPTION 'Score exceeds assessment maximum.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Score_validate_range" ON "Score";
CREATE TRIGGER "Score_validate_range"
BEFORE INSERT OR UPDATE OF "value","assessmentId"
ON "Score"
FOR EACH ROW
EXECUTE FUNCTION sukuunova_validate_score_range();
