-- SukuuNova Clinic: compact school health centre foundation.
-- Clinical records remain isolated by school through the same transaction-local RLS boundary used by core school data.

CREATE TABLE "ClinicSettings" (
  "schoolId" TEXT NOT NULL,
  "clinicName" TEXT,
  "phone" TEXT,
  "room" TEXT,
  "emergencyContact" TEXT,
  "referralHospital" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicSettings_pkey" PRIMARY KEY ("schoolId")
);

CREATE TABLE "ClinicNurseProfile" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "photoUrl" TEXT,
  "title" TEXT NOT NULL DEFAULT 'School Nurse',
  "qualification" TEXT,
  "licenseNo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicNurseProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicNurseProfile_status_check" CHECK ("status" IN ('active','suspended'))
);

CREATE TABLE "ClinicHealthProfile" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "patientType" TEXT NOT NULL,
  "studentId" TEXT,
  "staffId" TEXT,
  "bloodGroup" TEXT,
  "allergies" JSONB,
  "conditions" JSONB,
  "currentMedications" JSONB,
  "emergencyNotes" TEXT,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicHealthProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicHealthProfile_patient_type_check" CHECK ("patientType" IN ('student','staff')),
  CONSTRAINT "ClinicHealthProfile_patient_check" CHECK (
    ("patientType"='student' AND "studentId" IS NOT NULL AND "staffId" IS NULL) OR
    ("patientType"='staff' AND "staffId" IS NOT NULL AND "studentId" IS NULL)
  )
);

CREATE TABLE "ClinicVisit" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "patientType" TEXT NOT NULL,
  "studentId" TEXT,
  "staffId" TEXT,
  "nurseId" TEXT NOT NULL,
  "complaint" TEXT NOT NULL,
  "vitals" JSONB,
  "tests" JSONB,
  "assessment" TEXT,
  "treatment" TEXT,
  "prescriptions" JSONB,
  "notes" TEXT,
  "parentAdvice" TEXT,
  "disposition" TEXT NOT NULL DEFAULT 'returned_to_class',
  "status" TEXT NOT NULL DEFAULT 'completed',
  "referralFacility" TEXT,
  "referralReason" TEXT,
  "followUpAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicVisit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicVisit_patient_type_check" CHECK ("patientType" IN ('student','staff')),
  CONSTRAINT "ClinicVisit_patient_check" CHECK (
    ("patientType"='student' AND "studentId" IS NOT NULL AND "staffId" IS NULL) OR
    ("patientType"='staff' AND "staffId" IS NOT NULL AND "studentId" IS NULL)
  ),
  CONSTRAINT "ClinicVisit_disposition_check" CHECK ("disposition" IN ('returned_to_class','resting_in_clinic','sent_home','referred','emergency_transfer')),
  CONSTRAINT "ClinicVisit_status_check" CHECK ("status" IN ('open','completed','amended'))
);

CREATE TABLE "ClinicMedication" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "strength" TEXT,
  "form" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'units',
  "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "minimumStock" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "batchNo" TEXT,
  "expiryDate" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicMedication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicMedication_quantity_check" CHECK ("quantity" >= 0),
  CONSTRAINT "ClinicMedication_minimum_check" CHECK ("minimumStock" >= 0)
);

CREATE TABLE "ClinicStockMovement" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "medicationId" TEXT NOT NULL,
  "visitId" TEXT,
  "type" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "recordedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicStockMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicStockMovement_type_check" CHECK ("type" IN ('received','dispensed','adjusted_in','adjusted_out','expired','damaged','returned')),
  CONSTRAINT "ClinicStockMovement_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "ClinicNurseProfile_id_schoolId_key" ON "ClinicNurseProfile"("id","schoolId");
CREATE UNIQUE INDEX "ClinicNurseProfile_schoolId_userId_key" ON "ClinicNurseProfile"("schoolId","userId");
CREATE INDEX "ClinicNurseProfile_schoolId_status_idx" ON "ClinicNurseProfile"("schoolId","status");
CREATE UNIQUE INDEX "ClinicHealthProfile_id_schoolId_key" ON "ClinicHealthProfile"("id","schoolId");
CREATE UNIQUE INDEX "ClinicHealthProfile_student_key" ON "ClinicHealthProfile"("schoolId","studentId") WHERE "studentId" IS NOT NULL;
CREATE UNIQUE INDEX "ClinicHealthProfile_staff_key" ON "ClinicHealthProfile"("schoolId","staffId") WHERE "staffId" IS NOT NULL;
CREATE INDEX "ClinicHealthProfile_schoolId_idx" ON "ClinicHealthProfile"("schoolId");
CREATE UNIQUE INDEX "ClinicVisit_id_schoolId_key" ON "ClinicVisit"("id","schoolId");
CREATE INDEX "ClinicVisit_schoolId_startedAt_idx" ON "ClinicVisit"("schoolId","startedAt");
CREATE INDEX "ClinicVisit_schoolId_studentId_startedAt_idx" ON "ClinicVisit"("schoolId","studentId","startedAt");
CREATE INDEX "ClinicVisit_schoolId_staffId_startedAt_idx" ON "ClinicVisit"("schoolId","staffId","startedAt");
CREATE INDEX "ClinicVisit_schoolId_disposition_idx" ON "ClinicVisit"("schoolId","disposition");
CREATE UNIQUE INDEX "ClinicMedication_id_schoolId_key" ON "ClinicMedication"("id","schoolId");
CREATE INDEX "ClinicMedication_schoolId_active_idx" ON "ClinicMedication"("schoolId","isActive");
CREATE INDEX "ClinicMedication_schoolId_expiryDate_idx" ON "ClinicMedication"("schoolId","expiryDate");
CREATE UNIQUE INDEX "ClinicStockMovement_id_schoolId_key" ON "ClinicStockMovement"("id","schoolId");
CREATE INDEX "ClinicStockMovement_schoolId_medicationId_createdAt_idx" ON "ClinicStockMovement"("schoolId","medicationId","createdAt");
CREATE INDEX "ClinicStockMovement_schoolId_visitId_idx" ON "ClinicStockMovement"("schoolId","visitId");

ALTER TABLE "ClinicSettings" ADD CONSTRAINT "ClinicSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicNurseProfile" ADD CONSTRAINT "ClinicNurseProfile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicNurseProfile" ADD CONSTRAINT "ClinicNurseProfile_user_school_fkey" FOREIGN KEY ("userId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicHealthProfile" ADD CONSTRAINT "ClinicHealthProfile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicHealthProfile" ADD CONSTRAINT "ClinicHealthProfile_student_school_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicHealthProfile" ADD CONSTRAINT "ClinicHealthProfile_staff_school_fkey" FOREIGN KEY ("staffId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicHealthProfile" ADD CONSTRAINT "ClinicHealthProfile_updated_by_fkey" FOREIGN KEY ("updatedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicVisit" ADD CONSTRAINT "ClinicVisit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicVisit" ADD CONSTRAINT "ClinicVisit_student_school_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicVisit" ADD CONSTRAINT "ClinicVisit_staff_school_fkey" FOREIGN KEY ("staffId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicVisit" ADD CONSTRAINT "ClinicVisit_nurse_school_fkey" FOREIGN KEY ("nurseId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicMedication" ADD CONSTRAINT "ClinicMedication_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicStockMovement" ADD CONSTRAINT "ClinicStockMovement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicStockMovement" ADD CONSTRAINT "ClinicStockMovement_medication_school_fkey" FOREIGN KEY ("medicationId","schoolId") REFERENCES "ClinicMedication"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicStockMovement" ADD CONSTRAINT "ClinicStockMovement_visit_school_fkey" FOREIGN KEY ("visitId","schoolId") REFERENCES "ClinicVisit"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicStockMovement" ADD CONSTRAINT "ClinicStockMovement_recorded_by_fkey" FOREIGN KEY ("recordedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClinicSettings_tenant_isolation" ON "ClinicSettings" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "ClinicNurseProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicNurseProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClinicNurseProfile_tenant_isolation" ON "ClinicNurseProfile" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "ClinicHealthProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicHealthProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClinicHealthProfile_tenant_isolation" ON "ClinicHealthProfile" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "ClinicVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicVisit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClinicVisit_tenant_isolation" ON "ClinicVisit" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "ClinicMedication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicMedication" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClinicMedication_tenant_isolation" ON "ClinicMedication" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "ClinicStockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicStockMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClinicStockMovement_tenant_isolation" ON "ClinicStockMovement" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());

CREATE OR REPLACE FUNCTION sukuunova_reject_clinic_stock_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SukuuNova clinic stock movements are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "ClinicStockMovement_append_only" BEFORE UPDATE OR DELETE ON "ClinicStockMovement" FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_clinic_stock_mutation();

-- Install the global clinic permission catalogue. Role grants are handled by the dedicated RLS-aware backfill migration.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('perm_clinic_overview_v1','clinic:overview','View high-level school clinic intelligence without clinical notes.'),
  ('perm_clinic_nurses_v1','clinic:nurses_manage','Create and manage school nurse accounts.'),
  ('perm_clinic_care_v1','clinic:care','Create and amend clinic consultations.'),
  ('perm_clinic_records_v1','clinic:records','View detailed patient health records.'),
  ('perm_clinic_inventory_v1','clinic:inventory','Manage clinic medication inventory and dispensing.'),
  ('perm_clinic_export_v1','clinic:export','Generate authorised patient clinic documents.')
ON CONFLICT ("key") DO NOTHING;
