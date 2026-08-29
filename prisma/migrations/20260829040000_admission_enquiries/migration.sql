CREATE TABLE "AdmissionEnquiry" (
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

CREATE UNIQUE INDEX "AdmissionEnquiry_id_schoolId_key" ON "AdmissionEnquiry"("id","schoolId");
CREATE UNIQUE INDEX "AdmissionEnquiry_schoolId_reference_key" ON "AdmissionEnquiry"("schoolId","reference");
CREATE INDEX "AdmissionEnquiry_schoolId_stage_idx" ON "AdmissionEnquiry"("schoolId","stage");
CREATE INDEX "AdmissionEnquiry_schoolId_nextFollowUpAt_idx" ON "AdmissionEnquiry"("schoolId","nextFollowUpAt");
CREATE INDEX "AdmissionEnquiry_schoolId_createdAt_idx" ON "AdmissionEnquiry"("schoolId","createdAt");
CREATE INDEX "AdmissionEnquiry_schoolId_source_idx" ON "AdmissionEnquiry"("schoolId","source");

ALTER TABLE "AdmissionEnquiry"
  ADD CONSTRAINT "AdmissionEnquiry_school_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdmissionEnquiry"
  ADD CONSTRAINT "AdmissionEnquiry_owner_fkey"
  FOREIGN KEY ("ownerId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdmissionEnquiry"
  ADD CONSTRAINT "AdmissionEnquiry_student_fkey"
  FOREIGN KEY ("convertedStudentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
