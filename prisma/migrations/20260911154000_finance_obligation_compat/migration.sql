-- Release C compatibility guard for legacy invoice/adjustment writers.

CREATE OR REPLACE FUNCTION sukuunova_invoice_finance_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."adjustmentAmount" IS NULL THEN NEW."adjustmentAmount":=0; END IF;
  IF NEW."grossAmount" IS NULL OR (NEW."grossAmount"=0 AND NEW."totalAmount">0 AND NEW."adjustmentAmount"=0) THEN
    NEW."grossAmount":=NEW."totalAmount";
  END IF;
  IF NEW."classId" IS NULL THEN
    SELECT e."classId" INTO NEW."classId"
      FROM "Enrollment" e
     WHERE e."schoolId"=NEW."schoolId"
       AND e."studentId"=NEW."studentId"
       AND e."termId"=NEW."termId"
       AND e."status" IN ('ready','confirmed')
     ORDER BY CASE e."status" WHEN 'confirmed' THEN 0 ELSE 1 END, e."createdAt" DESC
     LIMIT 1;
  END IF;
  NEW."totalAmount":=GREATEST(NEW."grossAmount"-NEW."adjustmentAmount",0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Invoice_finance_defaults" ON "Invoice";
CREATE TRIGGER "Invoice_finance_defaults"
BEFORE INSERT ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION sukuunova_invoice_finance_defaults();

CREATE OR REPLACE FUNCTION sukuunova_validate_finance_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_student TEXT;
  linked_term TEXT;
  linked_invoice TEXT;
BEGIN
  IF NEW."mode"='fixed' THEN NEW."mode":='amount'; END IF;
  IF NEW."kind"='discount' THEN NEW."kind":='waiver'; END IF;
  NEW."updatedAt":=CURRENT_TIMESTAMP;

  IF NEW."invoiceId" IS NULL AND NEW."termId" IS NOT NULL THEN
    SELECT i."id" INTO linked_invoice
      FROM "Invoice" i
     WHERE i."schoolId"=NEW."schoolId"
       AND i."studentId"=NEW."studentId"
       AND i."termId"=NEW."termId"
     LIMIT 1;
    IF linked_invoice IS NOT NULL THEN NEW."invoiceId":=linked_invoice; END IF;
  END IF;

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
