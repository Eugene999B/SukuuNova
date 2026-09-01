-- The admissions workflow is still live, but an older schema cleanup migration
-- removed AdmissionEnquiry even though the application continues to use it.
-- Restore the table here so existing production installations can recover safely.
CREATE TABLE IF NOT EXISTS "AdmissionEnquiry" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "guardianName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "intendedClass" TEXT,
  "source" TEXT NOT NULL DEFAULT 'walk_in',
  "stage" TEXT NOT NULL DEFAULT 'new',
  "ownerId" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "lastContactAt" TIMESTAMP(3),
  "visitAt" TIMESTAMP(3),
  "notes" TEXT,
  "lostReason" TEXT,
  "convertedStudentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdmissionEnquiry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionEnquiry_id_schoolId_key"
  ON "AdmissionEnquiry"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionEnquiry_schoolId_reference_key"
  ON "AdmissionEnquiry"("schoolId","reference");
CREATE INDEX IF NOT EXISTS "AdmissionEnquiry_schoolId_stage_idx"
  ON "AdmissionEnquiry"("schoolId","stage");
CREATE INDEX IF NOT EXISTS "AdmissionEnquiry_schoolId_nextFollowUpAt_idx"
  ON "AdmissionEnquiry"("schoolId","nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "AdmissionEnquiry_schoolId_createdAt_idx"
  ON "AdmissionEnquiry"("schoolId","createdAt");
CREATE INDEX IF NOT EXISTS "AdmissionEnquiry_schoolId_source_idx"
  ON "AdmissionEnquiry"("schoolId","source");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdmissionEnquiry_school_fkey'
  ) THEN
    ALTER TABLE "AdmissionEnquiry"
      ADD CONSTRAINT "AdmissionEnquiry_school_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdmissionEnquiry_owner_fkey'
  ) THEN
    ALTER TABLE "AdmissionEnquiry"
      ADD CONSTRAINT "AdmissionEnquiry_owner_fkey"
      FOREIGN KEY ("ownerId","schoolId") REFERENCES "User"("id","schoolId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdmissionEnquiry_student_fkey'
  ) THEN
    ALTER TABLE "AdmissionEnquiry"
      ADD CONSTRAINT "AdmissionEnquiry_student_fkey"
      FOREIGN KEY ("convertedStudentId","schoolId") REFERENCES "Student"("id","schoolId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_admission_enrolment_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW."stage" = 'converted') <> (NEW."convertedStudentId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Admission enquiry cannot be marked converted without a linked student';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admission_enquiry_enrolment_invariant ON "AdmissionEnquiry";

CREATE TRIGGER admission_enquiry_enrolment_invariant
BEFORE INSERT OR UPDATE OF "stage", "convertedStudentId"
ON "AdmissionEnquiry"
FOR EACH ROW
EXECUTE FUNCTION enforce_admission_enrolment_invariant();