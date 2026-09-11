-- Release C: preserve invoice immutability while allowing only canonical ledger projections.
-- The original Phase 1 guard made totalAmount immutable. Release C derives that
-- amount from immutable invoice lines plus approved adjustments, so the guard
-- now verifies any amount mutation against those source records instead of
-- allowing an unrestricted bypass.

CREATE OR REPLACE FUNCTION sukuunova_protect_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_gross NUMERIC(14,2);
  canonical_reduction NUMERIC(14,2);
  canonical_total NUMERIC(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SukuuNova invoices cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF NEW."id" <> OLD."id"
    OR NEW."schoolId" <> OLD."schoolId"
    OR NEW."studentId" <> OLD."studentId"
    OR NEW."termId" <> OLD."termId"
    OR NEW."createdAt" <> OLD."createdAt"
    OR (OLD."classId" IS NOT NULL AND NEW."classId" IS DISTINCT FROM OLD."classId") THEN
    RAISE EXCEPTION 'SukuuNova invoice identity and historical class are immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW."grossAmount" IS DISTINCT FROM OLD."grossAmount"
    OR NEW."adjustmentAmount" IS DISTINCT FROM OLD."adjustmentAmount"
    OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount" THEN

    SELECT COALESCE(SUM(il."amount"), OLD."grossAmount", OLD."totalAmount", 0)
      INTO canonical_gross
      FROM "InvoiceLine" il
     WHERE il."invoiceId" = OLD."id"
       AND il."schoolId" = OLD."schoolId";

    SELECT COALESCE(SUM(
      CASE
        WHEN a."mode" = 'percent' THEN canonical_gross * LEAST(a."value", 100) / 100
        ELSE a."value"
      END
    ), 0)
      INTO canonical_reduction
      FROM "P3FinanceAdjustment" a
     WHERE a."schoolId" = OLD."schoolId"
       AND a."invoiceId" = OLD."id"
       AND a."status" = 'approved';

    canonical_reduction := LEAST(canonical_gross, GREATEST(canonical_reduction, 0));
    canonical_total := GREATEST(canonical_gross - canonical_reduction, 0);

    IF NEW."grossAmount" IS DISTINCT FROM canonical_gross
      OR NEW."adjustmentAmount" IS DISTINCT FROM canonical_reduction
      OR NEW."totalAmount" IS DISTINCT FROM canonical_total THEN
      RAISE EXCEPTION 'SukuuNova invoice amounts may only change to the canonical ledger projection' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Prisma cannot deserialize PostgreSQL VOID returned as a selected column.
-- Recreate the projector with an integer result so both trigger PERFORM calls
-- and explicit service refresh calls share one implementation safely.
DROP FUNCTION sukuunova_refresh_invoice_financial_projection(TEXT,TEXT);
CREATE FUNCTION sukuunova_refresh_invoice_financial_projection(p_school_id TEXT,p_invoice_id TEXT)
RETURNS INTEGER
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
  IF gross IS NULL THEN RETURN 0; END IF;

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

  RETURN 1;
END;
$$;
