-- Capture identity at payment time. Existing payments retain historical enrollment fallback.
CREATE TABLE "PaymentReceiptSnapshot" (
  "paymentId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("paymentId","schoolId"),
  FOREIGN KEY ("paymentId","schoolId") REFERENCES "Payment"("id","schoolId") ON DELETE RESTRICT
);
ALTER TABLE "PaymentReceiptSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReceiptSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentReceiptSnapshot"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));

CREATE FUNCTION capture_payment_receipt_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "PaymentReceiptSnapshot" ("paymentId","schoolId","snapshot")
  SELECT NEW."id",NEW."schoolId",jsonb_build_object(
    'studentName',s."name",'admissionNo',s."admissionNo",
    'className',c."name",'termName',t."name",'version',1)
  FROM "Invoice" i
  JOIN "Student" s ON s."id"=i."studentId" AND s."schoolId"=i."schoolId"
  JOIN "Term" t ON t."id"=i."termId" AND t."schoolId"=i."schoolId"
  LEFT JOIN "Enrollment" en ON en."schoolId"=i."schoolId" AND en."studentId"=i."studentId" AND en."termId"=i."termId"
  LEFT JOIN "Class" c ON c."id"=en."classId" AND c."schoolId"=i."schoolId"
  WHERE i."id"=NEW."invoiceId" AND i."schoolId"=NEW."schoolId";
  RETURN NEW;
END $$;
CREATE TRIGGER payment_receipt_snapshot AFTER INSERT ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION capture_payment_receipt_snapshot();

CREATE FUNCTION protect_payment_receipt_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RECEIPT_SNAPSHOT_APPEND_ONLY';
END $$;
CREATE TRIGGER protect_payment_receipt_snapshot BEFORE UPDATE OR DELETE ON "PaymentReceiptSnapshot"
  FOR EACH ROW EXECUTE FUNCTION protect_payment_receipt_snapshot();
