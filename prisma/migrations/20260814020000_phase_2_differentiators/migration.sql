ALTER TABLE "SchoolSettings"
  ADD COLUMN "faceMatchThreshold" DECIMAL(65,30) NOT NULL DEFAULT 95,
  ADD COLUMN "substituteLateMinutes" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "notificationChannels" JSONB,
  ADD COLUMN "whatsappTemplateConfig" JSONB,
  ADD COLUMN "reportCardWatermark" TEXT;

ALTER TABLE "AttendanceEvent"
  ADD COLUMN "confidenceScore" DECIMAL(65,30),
  ADD COLUMN "deviceId" TEXT;
ALTER TABLE "AttendanceEvent" DROP CONSTRAINT "AttendanceEvent_method_check";
ALTER TABLE "AttendanceEvent"
  ADD CONSTRAINT "AttendanceEvent_method_check"
  CHECK ("method" IN ('manual', 'qr', 'face'));

ALTER TABLE "Message"
  ADD COLUMN "templateKey" TEXT,
  ADD COLUMN "templateVariables" JSONB,
  ADD COLUMN "mediaUrl" TEXT;
ALTER TABLE "Message" DROP CONSTRAINT "Message_channel_check";
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_channel_check"
  CHECK ("channel" IN ('sms', 'whatsapp'));

ALTER TABLE "ReportCard" ADD COLUMN "templateId" TEXT;

CREATE TABLE "TimetableSlot" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "period" INTEGER NOT NULL,
  CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimetableSlot_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  CONSTRAINT "TimetableSlot_period_check" CHECK ("period" > 0)
);

CREATE TABLE "SubstituteAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "timetableSlotId" TEXT NOT NULL,
  "substituteTeacherId" TEXT NOT NULL,
  "assignedBy" TEXT NOT NULL,
  "assignmentDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubstituteAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FaceEnrollment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT,
  "staffId" TEXT,
  "embeddingRef" TEXT NOT NULL,
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consentByGuardianId" TEXT,
  CONSTRAINT "FaceEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaceEnrollment_target_consent_check" CHECK (
    ("studentId" IS NOT NULL AND "staffId" IS NULL AND "consentByGuardianId" IS NOT NULL)
    OR
    ("studentId" IS NULL AND "staffId" IS NOT NULL AND "consentByGuardianId" IS NULL)
  )
);

CREATE TABLE "FaceMatchReview" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "candidateStudentId" TEXT,
  "candidateStaffId" TEXT,
  "confidenceScore" DECIMAL(65,30),
  "deviceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaceMatchReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaceMatchReview_candidate_check" CHECK (
    NOT ("candidateStudentId" IS NOT NULL AND "candidateStaffId" IS NOT NULL)
  ),
  CONSTRAINT "FaceMatchReview_status_check" CHECK (
    "status" IN ('pending', 'confirmed', 'rejected')
  )
);

CREATE TABLE "ApprovedPickup" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "guardianId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovedPickup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PickupApprovalRequest" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "collectedByGuardianId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "approvedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PickupApprovalRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PickupApprovalRequest_status_check" CHECK (
    "status" IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT "PickupApprovalRequest_checker_check" CHECK (
    "approvedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId"
  )
);

CREATE TABLE "PickupEvent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "collectedByGuardianId" TEXT NOT NULL,
  "wasPreApproved" BOOLEAN NOT NULL,
  "approvedByUserId" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PickupEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PickupEvent_approval_check" CHECK (
    "wasPreApproved" OR "approvedByUserId" IS NOT NULL
  )
);

CREATE TABLE "SalaryStructure" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "grossSalary" DECIMAL(65,30) NOT NULL,
  "deductions" JSONB NOT NULL,
  CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryStructure_gross_check" CHECK ("grossSalary" > 0)
);

CREATE TABLE "PayrollRun" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "processedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollRun_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "PayrollRun_status_check" CHECK ("status" IN ('draft', 'processed', 'paid'))
);

CREATE TABLE "Payslip" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "gross" DECIMAL(65,30) NOT NULL,
  "deductions" JSONB NOT NULL,
  "net" DECIMAL(65,30) NOT NULL,
  "pdfUrl" TEXT,
  "pdfData" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payslip_amount_check" CHECK ("gross" > 0 AND "net" >= 0 AND "net" <= "gross")
);

CREATE TABLE "VisitorLog" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "purpose" TEXT NOT NULL,
  "hostStaffId" TEXT,
  "timeIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "timeOut" TIMESTAMP(3),
  CONSTRAINT "VisitorLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitorLog_time_check" CHECK ("timeOut" IS NULL OR "timeOut" >= "timeIn")
);

CREATE TABLE "ReportCardTemplate" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT,
  "name" TEXT NOT NULL,
  "layoutConfig" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportCardTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimetableSlot_id_schoolId_key" ON "TimetableSlot"("id", "schoolId");
CREATE UNIQUE INDEX "TimetableSlot_schoolId_classId_dayOfWeek_period_key" ON "TimetableSlot"("schoolId", "classId", "dayOfWeek", "period");
CREATE INDEX "TimetableSlot_schoolId_idx" ON "TimetableSlot"("schoolId");
CREATE INDEX "TimetableSlot_schoolId_teacherId_dayOfWeek_period_idx" ON "TimetableSlot"("schoolId", "teacherId", "dayOfWeek", "period");

CREATE UNIQUE INDEX "SubstituteAssignment_id_schoolId_key" ON "SubstituteAssignment"("id", "schoolId");
CREATE UNIQUE INDEX "SubstituteAssignment_schoolId_timetableSlotId_assignmentDate_key" ON "SubstituteAssignment"("schoolId", "timetableSlotId", "assignmentDate");
CREATE INDEX "SubstituteAssignment_schoolId_idx" ON "SubstituteAssignment"("schoolId");

CREATE UNIQUE INDEX "FaceEnrollment_id_schoolId_key" ON "FaceEnrollment"("id", "schoolId");
CREATE UNIQUE INDEX "FaceEnrollment_schoolId_studentId_key" ON "FaceEnrollment"("schoolId", "studentId");
CREATE UNIQUE INDEX "FaceEnrollment_schoolId_staffId_key" ON "FaceEnrollment"("schoolId", "staffId");
CREATE INDEX "FaceEnrollment_schoolId_idx" ON "FaceEnrollment"("schoolId");

CREATE UNIQUE INDEX "FaceMatchReview_id_schoolId_key" ON "FaceMatchReview"("id", "schoolId");
CREATE INDEX "FaceMatchReview_schoolId_idx" ON "FaceMatchReview"("schoolId");
CREATE INDEX "FaceMatchReview_schoolId_status_createdAt_idx" ON "FaceMatchReview"("schoolId", "status", "createdAt");

CREATE UNIQUE INDEX "ApprovedPickup_id_schoolId_key" ON "ApprovedPickup"("id", "schoolId");
CREATE UNIQUE INDEX "ApprovedPickup_schoolId_studentId_guardianId_key" ON "ApprovedPickup"("schoolId", "studentId", "guardianId");
CREATE INDEX "ApprovedPickup_schoolId_idx" ON "ApprovedPickup"("schoolId");

CREATE UNIQUE INDEX "PickupApprovalRequest_id_schoolId_key" ON "PickupApprovalRequest"("id", "schoolId");
CREATE INDEX "PickupApprovalRequest_schoolId_idx" ON "PickupApprovalRequest"("schoolId");
CREATE INDEX "PickupApprovalRequest_schoolId_status_createdAt_idx" ON "PickupApprovalRequest"("schoolId", "status", "createdAt");

CREATE UNIQUE INDEX "PickupEvent_id_schoolId_key" ON "PickupEvent"("id", "schoolId");
CREATE INDEX "PickupEvent_schoolId_idx" ON "PickupEvent"("schoolId");
CREATE INDEX "PickupEvent_schoolId_studentId_timestamp_idx" ON "PickupEvent"("schoolId", "studentId", "timestamp");

CREATE UNIQUE INDEX "SalaryStructure_id_schoolId_key" ON "SalaryStructure"("id", "schoolId");
CREATE UNIQUE INDEX "SalaryStructure_schoolId_staffId_key" ON "SalaryStructure"("schoolId", "staffId");
CREATE INDEX "SalaryStructure_schoolId_idx" ON "SalaryStructure"("schoolId");

CREATE UNIQUE INDEX "PayrollRun_id_schoolId_key" ON "PayrollRun"("id", "schoolId");
CREATE UNIQUE INDEX "PayrollRun_schoolId_period_key" ON "PayrollRun"("schoolId", "period");
CREATE INDEX "PayrollRun_schoolId_idx" ON "PayrollRun"("schoolId");

CREATE UNIQUE INDEX "Payslip_id_schoolId_key" ON "Payslip"("id", "schoolId");
CREATE UNIQUE INDEX "Payslip_schoolId_payrollRunId_staffId_key" ON "Payslip"("schoolId", "payrollRunId", "staffId");
CREATE INDEX "Payslip_schoolId_idx" ON "Payslip"("schoolId");
CREATE INDEX "Payslip_schoolId_staffId_idx" ON "Payslip"("schoolId", "staffId");

CREATE UNIQUE INDEX "VisitorLog_id_schoolId_key" ON "VisitorLog"("id", "schoolId");
CREATE INDEX "VisitorLog_schoolId_idx" ON "VisitorLog"("schoolId");
CREATE INDEX "VisitorLog_schoolId_timeIn_idx" ON "VisitorLog"("schoolId", "timeIn");

CREATE UNIQUE INDEX "ReportCardTemplate_id_schoolId_key" ON "ReportCardTemplate"("id", "schoolId");
CREATE INDEX "ReportCardTemplate_schoolId_idx" ON "ReportCardTemplate"("schoolId");

ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_classId_schoolId_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "Class"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_teacherId_schoolId_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubstituteAssignment" ADD CONSTRAINT "SubstituteAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubstituteAssignment" ADD CONSTRAINT "SubstituteAssignment_timetableSlotId_schoolId_fkey" FOREIGN KEY ("timetableSlotId", "schoolId") REFERENCES "TimetableSlot"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubstituteAssignment" ADD CONSTRAINT "SubstituteAssignment_substituteTeacherId_schoolId_fkey" FOREIGN KEY ("substituteTeacherId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubstituteAssignment" ADD CONSTRAINT "SubstituteAssignment_assignedBy_schoolId_fkey" FOREIGN KEY ("assignedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FaceEnrollment" ADD CONSTRAINT "FaceEnrollment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FaceEnrollment" ADD CONSTRAINT "FaceEnrollment_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FaceEnrollment" ADD CONSTRAINT "FaceEnrollment_staffId_schoolId_fkey" FOREIGN KEY ("staffId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FaceEnrollment" ADD CONSTRAINT "FaceEnrollment_consentByGuardianId_schoolId_fkey" FOREIGN KEY ("consentByGuardianId", "schoolId") REFERENCES "Guardian"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FaceMatchReview" ADD CONSTRAINT "FaceMatchReview_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FaceMatchReview" ADD CONSTRAINT "FaceMatchReview_candidateStudentId_schoolId_fkey" FOREIGN KEY ("candidateStudentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FaceMatchReview" ADD CONSTRAINT "FaceMatchReview_candidateStaffId_schoolId_fkey" FOREIGN KEY ("candidateStaffId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FaceMatchReview" ADD CONSTRAINT "FaceMatchReview_reviewedBy_schoolId_fkey" FOREIGN KEY ("reviewedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApprovedPickup" ADD CONSTRAINT "ApprovedPickup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovedPickup" ADD CONSTRAINT "ApprovedPickup_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovedPickup" ADD CONSTRAINT "ApprovedPickup_guardianId_schoolId_fkey" FOREIGN KEY ("guardianId", "schoolId") REFERENCES "Guardian"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PickupApprovalRequest" ADD CONSTRAINT "PickupApprovalRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupApprovalRequest" ADD CONSTRAINT "PickupApprovalRequest_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupApprovalRequest" ADD CONSTRAINT "PickupApprovalRequest_collectedByGuardianId_schoolId_fkey" FOREIGN KEY ("collectedByGuardianId", "schoolId") REFERENCES "Guardian"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupApprovalRequest" ADD CONSTRAINT "PickupApprovalRequest_requestedByUserId_schoolId_fkey" FOREIGN KEY ("requestedByUserId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupApprovalRequest" ADD CONSTRAINT "PickupApprovalRequest_approvedByUserId_schoolId_fkey" FOREIGN KEY ("approvedByUserId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PickupEvent" ADD CONSTRAINT "PickupEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupEvent" ADD CONSTRAINT "PickupEvent_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupEvent" ADD CONSTRAINT "PickupEvent_collectedByGuardianId_schoolId_fkey" FOREIGN KEY ("collectedByGuardianId", "schoolId") REFERENCES "Guardian"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupEvent" ADD CONSTRAINT "PickupEvent_approvedByUserId_schoolId_fkey" FOREIGN KEY ("approvedByUserId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_staffId_schoolId_fkey" FOREIGN KEY ("staffId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_schoolId_fkey" FOREIGN KEY ("payrollRunId", "schoolId") REFERENCES "PayrollRun"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_staffId_schoolId_fkey" FOREIGN KEY ("staffId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VisitorLog" ADD CONSTRAINT "VisitorLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitorLog" ADD CONSTRAINT "VisitorLog_hostStaffId_schoolId_fkey" FOREIGN KEY ("hostStaffId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportCardTemplate" ADD CONSTRAINT "ReportCardTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportCardTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'TimetableSlot', 'SubstituteAssignment', 'FaceEnrollment', 'FaceMatchReview',
    'ApprovedPickup', 'PickupApprovalRequest', 'PickupEvent', 'SalaryStructure',
    'PayrollRun', 'Payslip', 'VisitorLog'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id())',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END;
$$;

INSERT INTO "ReportCardTemplate" ("id", "schoolId", "name", "layoutConfig")
VALUES
  ('preset-classic-blue', NULL, 'Classic Blue', '{"style":"classic","primary":"#1d4ed8","accent":"#dbeafe","watermark":"SUKUUNOVA"}'::jsonb),
  ('preset-modern-emerald', NULL, 'Modern Emerald', '{"style":"modern","primary":"#047857","accent":"#d1fae5","watermark":"EXCELLENCE"}'::jsonb),
  ('preset-formal-mono', NULL, 'Formal Monochrome', '{"style":"formal","primary":"#111827","accent":"#e5e7eb","watermark":"OFFICIAL"}'::jsonb);

ALTER TABLE "ReportCardTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportCardTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ReportCardTemplate_tenant_and_presets"
  ON "ReportCardTemplate"
  USING ("schoolId" IS NULL OR "schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

CREATE OR REPLACE FUNCTION sukuunova_reject_safety_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SukuuNova safety and payroll event rows are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "PickupEvent_append_only"
  BEFORE UPDATE OR DELETE ON "PickupEvent"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_safety_event_mutation();

CREATE TRIGGER "Payslip_append_only"
  BEFORE UPDATE OR DELETE ON "Payslip"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_safety_event_mutation();

CREATE OR REPLACE FUNCTION sukuunova_payroll_run_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" <> OLD."status" AND NOT (
    (OLD."status" = 'draft' AND NEW."status" = 'processed') OR
    (OLD."status" = 'processed' AND NEW."status" = 'paid')
  ) THEN
    RAISE EXCEPTION 'Invalid payroll-run transition' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PayrollRun_status_gate"
  BEFORE UPDATE ON "PayrollRun"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_payroll_run_gate();
