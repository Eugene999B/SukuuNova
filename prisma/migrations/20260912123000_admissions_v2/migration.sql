-- Admissions V2: separate prospective applications from the official student register.
-- A learner becomes an official Student only after an accepted application is enrolled.

CREATE TABLE "AdmissionApplication" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "enquiryId" TEXT,
  "studentName" TEXT NOT NULL,
  "dob" TIMESTAMP(3),
  "gender" TEXT,
  "guardianName" TEXT NOT NULL,
  "guardianPhone" TEXT NOT NULL,
  "guardianEmail" TEXT,
  "guardianRelationship" TEXT NOT NULL DEFAULT 'Parent/Guardian',
  "residentialAddress" TEXT,
  "previousSchool" TEXT,
  "intendedClassId" TEXT,
  "intendedClassName" TEXT,
  "academicYearId" TEXT,
  "termId" TEXT,
  "admissionDate" TIMESTAMP(3),
  "entryType" TEXT NOT NULL DEFAULT 'New enrollment',
  "photoData" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "decisionNote" TEXT,
  "offerIssuedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "enrolledAt" TIMESTAMP(3),
  "convertedStudentId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdmissionApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdmissionApplication_status_check" CHECK ("status" IN ('draft','submitted','under_review','offered','accepted','declined','enrolled')),
  CONSTRAINT "AdmissionApplication_entry_type_check" CHECK ("entryType" IN ('New enrollment','Transfer in','Re-enrollment','Returning learner')),
  CONSTRAINT "AdmissionApplication_enrolled_student_check" CHECK (("status" = 'enrolled') = ("convertedStudentId" IS NOT NULL))
);

CREATE UNIQUE INDEX "AdmissionApplication_id_schoolId_key" ON "AdmissionApplication"("id","schoolId");
CREATE UNIQUE INDEX "AdmissionApplication_school_reference_key" ON "AdmissionApplication"("schoolId","reference");
CREATE UNIQUE INDEX "AdmissionApplication_school_enquiry_key" ON "AdmissionApplication"("schoolId","enquiryId") WHERE "enquiryId" IS NOT NULL;
CREATE INDEX "AdmissionApplication_school_status_created_idx" ON "AdmissionApplication"("schoolId","status","createdAt");
CREATE INDEX "AdmissionApplication_school_student_idx" ON "AdmissionApplication"("schoolId","convertedStudentId");
CREATE INDEX "AdmissionApplication_school_class_idx" ON "AdmissionApplication"("schoolId","intendedClassId");

ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_school_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_enquiry_fkey"
  FOREIGN KEY ("enquiryId","schoolId") REFERENCES "AdmissionEnquiry"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_class_fkey"
  FOREIGN KEY ("intendedClassId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_year_fkey"
  FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_term_fkey"
  FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_student_fkey"
  FOREIGN KEY ("convertedStudentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_creator_fkey"
  FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AdmissionApplicationEvent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdmissionApplicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdmissionApplicationEvent_id_schoolId_key" ON "AdmissionApplicationEvent"("id","schoolId");
CREATE INDEX "AdmissionApplicationEvent_application_created_idx" ON "AdmissionApplicationEvent"("schoolId","applicationId","createdAt");

ALTER TABLE "AdmissionApplicationEvent" ADD CONSTRAINT "AdmissionApplicationEvent_application_fkey"
  FOREIGN KEY ("applicationId","schoolId") REFERENCES "AdmissionApplication"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplicationEvent" ADD CONSTRAINT "AdmissionApplicationEvent_actor_fkey"
  FOREIGN KEY ("actorId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION sukuunova_enforce_admission_application_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  term_year TEXT;
BEGIN
  IF NEW."termId" IS NOT NULL THEN
    SELECT t."academicYearId" INTO term_year
      FROM "Term" t
     WHERE t."id" = NEW."termId" AND t."schoolId" = NEW."schoolId";
    IF term_year IS NULL THEN
      RAISE EXCEPTION 'Admission application term does not belong to the school' USING ERRCODE = '23514';
    END IF;
    IF NEW."academicYearId" IS NULL OR NEW."academicYearId" <> term_year THEN
      RAISE EXCEPTION 'Admission application academic year must match its term' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."status" IN ('offered','accepted','enrolled') AND (
    NEW."intendedClassId" IS NULL OR NEW."academicYearId" IS NULL OR NEW."termId" IS NULL OR NEW."admissionDate" IS NULL
  ) THEN
    RAISE EXCEPTION 'An admission offer requires class, academic year, term and admission date' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'enrolled' THEN
    IF NEW."status" <> 'enrolled'
       OR NEW."convertedStudentId" IS DISTINCT FROM OLD."convertedStudentId"
       OR NEW."intendedClassId" IS DISTINCT FROM OLD."intendedClassId"
       OR NEW."academicYearId" IS DISTINCT FROM OLD."academicYearId"
       OR NEW."termId" IS DISTINCT FROM OLD."termId" THEN
      RAISE EXCEPTION 'An enrolled admission application is historical and cannot be reopened or re-placed' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdmissionApplication_context_guard"
BEFORE INSERT OR UPDATE OF "status","convertedStudentId","intendedClassId","academicYearId","termId","admissionDate"
ON "AdmissionApplication"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_admission_application_context();

ALTER TABLE "AdmissionApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdmissionApplication" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AdmissionApplication_tenant" ON "AdmissionApplication"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "AdmissionApplicationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdmissionApplicationEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AdmissionApplicationEvent_tenant" ON "AdmissionApplicationEvent"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
