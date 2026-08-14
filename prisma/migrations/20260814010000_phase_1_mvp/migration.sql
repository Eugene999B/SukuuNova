-- SukuuNova Phase 1 MVP: calendar, SIS, attendance, gradebook, finance,
-- report cards, asynchronous SMS outbox, and assignment scoping.

ALTER TABLE "SchoolSettings"
  ADD COLUMN "expectedResumptionTime" TEXT,
  ADD COLUMN "attendanceGraceMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
  ADD COLUMN "gradeCaWeight" DECIMAL(65,30) NOT NULL DEFAULT 40,
  ADD COLUMN "gradeExamWeight" DECIMAL(65,30) NOT NULL DEFAULT 60,
  ADD COLUMN "allowPartialReportCards" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "smsSenderId" TEXT;

CREATE TABLE "AcademicYear" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicYear_dates_check" CHECK ("endDate" >= "startDate")
);

CREATE TABLE "CalendarEvent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "affectsAttendance" BOOLEAN NOT NULL DEFAULT true,
  "affectsTransport" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarEvent_dates_check" CHECK ("endDate" >= "startDate"),
  CONSTRAINT "CalendarEvent_type_check" CHECK ("type" IN ('holiday', 'vacation', 'exam_week', 'closure'))
);

CREATE TABLE "Term" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Term_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Term_dates_check" CHECK ("endDate" >= "startDate")
);

CREATE TABLE "Class" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "level" TEXT,
  "classTeacherId" TEXT,
  CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subject" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Student" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "admissionNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dob" TIMESTAMP(3),
  "classId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "photoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Guardian" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentGuardian" (
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "guardianId" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "StudentGuardian_pkey" PRIMARY KEY ("studentId", "guardianId")
);

CREATE TABLE "ClassSubjectTeacher" (
  "schoolId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  CONSTRAINT "ClassSubjectTeacher_pkey" PRIMARY KEY ("classId", "subjectId", "teacherId")
);

CREATE TABLE "AttendanceEvent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT,
  "staffId" TEXT,
  "type" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "isLate" BOOLEAN,
  "recordedBy" TEXT NOT NULL,
  CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceEvent_subject_check" CHECK (
    ("studentId" IS NOT NULL AND "staffId" IS NULL) OR
    ("studentId" IS NULL AND "staffId" IS NOT NULL)
  ),
  CONSTRAINT "AttendanceEvent_type_check" CHECK ("type" IN ('in', 'out')),
  CONSTRAINT "AttendanceEvent_method_check" CHECK ("method" IN ('manual', 'qr'))
);

CREATE TABLE "Assessment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "weight" DECIMAL(65,30) NOT NULL,
  "maxScore" DECIMAL(65,30) NOT NULL DEFAULT 100,
  CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Assessment_type_check" CHECK ("type" IN ('ca', 'exam', 'participation')),
  CONSTRAINT "Assessment_weight_check" CHECK ("weight" > 0 AND "weight" <= 100),
  CONSTRAINT "Assessment_max_score_check" CHECK ("maxScore" > 0)
);

CREATE TABLE "Score" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "value" DECIMAL(65,30) NOT NULL,
  "enteredBy" TEXT NOT NULL,
  "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Score_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Score_value_check" CHECK ("value" >= 0)
);

CREATE TABLE "ReportCard" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "generatedPdfUrl" TEXT,
  "pdfData" BYTEA,
  "remarks" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "submittedBy" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReportCard_status_check" CHECK ("status" IN ('draft', 'submitted', 'approved', 'sent'))
);

CREATE TABLE "FeeItem" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "termId" TEXT NOT NULL,
  "classId" TEXT,
  CONSTRAINT "FeeItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeeItem_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "totalAmount" DECIMAL(65,30) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unpaid',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_amount_check" CHECK ("totalAmount" >= 0),
  CONSTRAINT "Invoice_status_check" CHECK ("status" IN ('unpaid', 'partial', 'paid'))
);

CREATE TABLE "InvoiceLine" (
  "schoolId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "feeItemId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("invoiceId", "feeItemId"),
  CONSTRAINT "InvoiceLine_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "reconciledBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "Payment_method_check" CHECK ("method" IN ('momo', 'cash', 'card'))
);

CREATE TABLE "PaymentReversal" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "reason" TEXT NOT NULL,
  "reversedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReversal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentReversal_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "recipientType" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Message_channel_check" CHECK ("channel" = 'sms'),
  CONSTRAINT "Message_status_check" CHECK ("status" IN ('queued', 'sending', 'sent', 'delivered', 'failed'))
);

CREATE UNIQUE INDEX "AcademicYear_id_schoolId_key" ON "AcademicYear"("id", "schoolId");
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "AcademicYear"("schoolId", "name");
CREATE INDEX "AcademicYear_schoolId_idx" ON "AcademicYear"("schoolId");
CREATE UNIQUE INDEX "CalendarEvent_id_schoolId_key" ON "CalendarEvent"("id", "schoolId");
CREATE INDEX "CalendarEvent_schoolId_idx" ON "CalendarEvent"("schoolId");
CREATE INDEX "CalendarEvent_schoolId_startDate_endDate_idx" ON "CalendarEvent"("schoolId", "startDate", "endDate");
CREATE UNIQUE INDEX "Term_id_schoolId_key" ON "Term"("id", "schoolId");
CREATE UNIQUE INDEX "Term_schoolId_academicYearId_name_key" ON "Term"("schoolId", "academicYearId", "name");
CREATE INDEX "Term_schoolId_idx" ON "Term"("schoolId");
CREATE UNIQUE INDEX "Class_id_schoolId_key" ON "Class"("id", "schoolId");
CREATE UNIQUE INDEX "Class_schoolId_name_key" ON "Class"("schoolId", "name");
CREATE INDEX "Class_schoolId_idx" ON "Class"("schoolId");
CREATE INDEX "Class_schoolId_classTeacherId_idx" ON "Class"("schoolId", "classTeacherId");
CREATE UNIQUE INDEX "Subject_id_schoolId_key" ON "Subject"("id", "schoolId");
CREATE UNIQUE INDEX "Subject_schoolId_name_key" ON "Subject"("schoolId", "name");
CREATE INDEX "Subject_schoolId_idx" ON "Subject"("schoolId");
CREATE UNIQUE INDEX "Student_id_schoolId_key" ON "Student"("id", "schoolId");
CREATE UNIQUE INDEX "Student_schoolId_admissionNo_key" ON "Student"("schoolId", "admissionNo");
CREATE INDEX "Student_schoolId_idx" ON "Student"("schoolId");
CREATE INDEX "Student_schoolId_classId_idx" ON "Student"("schoolId", "classId");
CREATE UNIQUE INDEX "Guardian_id_schoolId_key" ON "Guardian"("id", "schoolId");
CREATE UNIQUE INDEX "Guardian_schoolId_phone_key" ON "Guardian"("schoolId", "phone");
CREATE UNIQUE INDEX "Guardian_userId_schoolId_key" ON "Guardian"("userId", "schoolId");
CREATE INDEX "Guardian_schoolId_idx" ON "Guardian"("schoolId");
CREATE INDEX "StudentGuardian_schoolId_idx" ON "StudentGuardian"("schoolId");
CREATE INDEX "StudentGuardian_guardianId_idx" ON "StudentGuardian"("guardianId");
CREATE INDEX "ClassSubjectTeacher_schoolId_idx" ON "ClassSubjectTeacher"("schoolId");
CREATE INDEX "ClassSubjectTeacher_schoolId_teacherId_idx" ON "ClassSubjectTeacher"("schoolId", "teacherId");
CREATE UNIQUE INDEX "AttendanceEvent_id_schoolId_key" ON "AttendanceEvent"("id", "schoolId");
CREATE INDEX "AttendanceEvent_schoolId_idx" ON "AttendanceEvent"("schoolId");
CREATE INDEX "AttendanceEvent_schoolId_attendanceDate_idx" ON "AttendanceEvent"("schoolId", "attendanceDate");
CREATE INDEX "AttendanceEvent_schoolId_studentId_attendanceDate_idx" ON "AttendanceEvent"("schoolId", "studentId", "attendanceDate");
CREATE INDEX "AttendanceEvent_schoolId_staffId_attendanceDate_idx" ON "AttendanceEvent"("schoolId", "staffId", "attendanceDate");
CREATE UNIQUE INDEX "Assessment_id_schoolId_key" ON "Assessment"("id", "schoolId");
CREATE UNIQUE INDEX "Assessment_schoolId_termId_classId_subjectId_name_key" ON "Assessment"("schoolId", "termId", "classId", "subjectId", "name");
CREATE INDEX "Assessment_schoolId_idx" ON "Assessment"("schoolId");
CREATE UNIQUE INDEX "Score_id_schoolId_key" ON "Score"("id", "schoolId");
CREATE UNIQUE INDEX "Score_studentId_assessmentId_key" ON "Score"("studentId", "assessmentId");
CREATE INDEX "Score_schoolId_idx" ON "Score"("schoolId");
CREATE INDEX "Score_schoolId_subjectId_idx" ON "Score"("schoolId", "subjectId");
CREATE UNIQUE INDEX "ReportCard_id_schoolId_key" ON "ReportCard"("id", "schoolId");
CREATE UNIQUE INDEX "ReportCard_studentId_termId_key" ON "ReportCard"("studentId", "termId");
CREATE INDEX "ReportCard_schoolId_idx" ON "ReportCard"("schoolId");
CREATE UNIQUE INDEX "FeeItem_id_schoolId_key" ON "FeeItem"("id", "schoolId");
CREATE UNIQUE INDEX "FeeItem_schoolId_termId_classId_name_key" ON "FeeItem"("schoolId", "termId", "classId", "name");
CREATE INDEX "FeeItem_schoolId_idx" ON "FeeItem"("schoolId");
CREATE UNIQUE INDEX "Invoice_id_schoolId_key" ON "Invoice"("id", "schoolId");
CREATE UNIQUE INDEX "Invoice_studentId_termId_key" ON "Invoice"("studentId", "termId");
CREATE INDEX "Invoice_schoolId_idx" ON "Invoice"("schoolId");
CREATE INDEX "InvoiceLine_schoolId_idx" ON "InvoiceLine"("schoolId");
CREATE UNIQUE INDEX "Payment_id_schoolId_key" ON "Payment"("id", "schoolId");
CREATE INDEX "Payment_schoolId_idx" ON "Payment"("schoolId");
CREATE INDEX "Payment_schoolId_invoiceId_idx" ON "Payment"("schoolId", "invoiceId");
CREATE UNIQUE INDEX "PaymentReversal_id_schoolId_key" ON "PaymentReversal"("id", "schoolId");
CREATE INDEX "PaymentReversal_schoolId_idx" ON "PaymentReversal"("schoolId");
CREATE INDEX "PaymentReversal_schoolId_paymentId_idx" ON "PaymentReversal"("schoolId", "paymentId");
CREATE UNIQUE INDEX "Message_id_schoolId_key" ON "Message"("id", "schoolId");
CREATE INDEX "Message_schoolId_idx" ON "Message"("schoolId");
CREATE INDEX "Message_status_nextAttemptAt_idx" ON "Message"("status", "nextAttemptAt");

ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_academicYearId_schoolId_fkey" FOREIGN KEY ("academicYearId", "schoolId") REFERENCES "AcademicYear"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Term" ADD CONSTRAINT "Term_academicYearId_schoolId_fkey" FOREIGN KEY ("academicYearId", "schoolId") REFERENCES "AcademicYear"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Class" ADD CONSTRAINT "Class_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Class" ADD CONSTRAINT "Class_classTeacherId_schoolId_fkey" FOREIGN KEY ("classTeacherId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_schoolId_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "Class"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_userId_schoolId_fkey" FOREIGN KEY ("userId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_guardianId_schoolId_fkey" FOREIGN KEY ("guardianId", "schoolId") REFERENCES "Guardian"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassSubjectTeacher" ADD CONSTRAINT "ClassSubjectTeacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassSubjectTeacher" ADD CONSTRAINT "ClassSubjectTeacher_classId_schoolId_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "Class"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassSubjectTeacher" ADD CONSTRAINT "ClassSubjectTeacher_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassSubjectTeacher" ADD CONSTRAINT "ClassSubjectTeacher_teacherId_schoolId_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_staffId_schoolId_fkey" FOREIGN KEY ("staffId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_recordedBy_schoolId_fkey" FOREIGN KEY ("recordedBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_classId_schoolId_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "Class"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_assessmentId_schoolId_fkey" FOREIGN KEY ("assessmentId", "schoolId") REFERENCES "Assessment"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_enteredBy_schoolId_fkey" FOREIGN KEY ("enteredBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeItem" ADD CONSTRAINT "FeeItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeItem" ADD CONSTRAINT "FeeItem_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeItem" ADD CONSTRAINT "FeeItem_classId_schoolId_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "Class"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_schoolId_fkey" FOREIGN KEY ("invoiceId", "schoolId") REFERENCES "Invoice"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_feeItemId_schoolId_fkey" FOREIGN KEY ("feeItemId", "schoolId") REFERENCES "FeeItem"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_schoolId_fkey" FOREIGN KEY ("invoiceId", "schoolId") REFERENCES "Invoice"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_paymentId_schoolId_fkey" FOREIGN KEY ("paymentId", "schoolId") REFERENCES "Payment"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'AcademicYear', 'CalendarEvent', 'Term', 'Class', 'Subject', 'Student',
    'Guardian', 'StudentGuardian', 'ClassSubjectTeacher', 'AttendanceEvent',
    'Assessment', 'Score', 'ReportCard', 'FeeItem', 'Invoice', 'InvoiceLine',
    'Payment', 'PaymentReversal', 'Message'
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

CREATE OR REPLACE FUNCTION sukuunova_reject_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SukuuNova financial ledger rows are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "InvoiceLine_append_only"
  BEFORE UPDATE OR DELETE ON "InvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_ledger_mutation();
CREATE TRIGGER "Payment_append_only"
  BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_ledger_mutation();
CREATE TRIGGER "PaymentReversal_append_only"
  BEFORE UPDATE OR DELETE ON "PaymentReversal"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_ledger_mutation();

CREATE OR REPLACE FUNCTION sukuunova_protect_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SukuuNova invoices cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW."id" <> OLD."id"
    OR NEW."schoolId" <> OLD."schoolId"
    OR NEW."studentId" <> OLD."studentId"
    OR NEW."termId" <> OLD."termId"
    OR NEW."totalAmount" <> OLD."totalAmount"
    OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'SukuuNova invoice identity and amount are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Invoice_protected"
  BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_protect_invoice();

CREATE OR REPLACE FUNCTION sukuunova_report_card_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" <> OLD."status" THEN
    IF NOT (
      (OLD."status" = 'draft' AND NEW."status" = 'submitted') OR
      (OLD."status" = 'submitted' AND NEW."status" = 'approved') OR
      (OLD."status" = 'approved' AND NEW."status" = 'sent')
    ) THEN
      RAISE EXCEPTION 'Invalid report-card status transition' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW."status" IN ('approved', 'sent') AND (
    NEW."approvedBy" IS NULL OR NEW."approvedAt" IS NULL OR
    NEW."submittedBy" IS NULL OR NEW."submittedBy" = NEW."approvedBy"
  ) THEN
    RAISE EXCEPTION 'Report card requires distinct submitter and approver' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReportCard_maker_checker"
  BEFORE UPDATE ON "ReportCard"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_report_card_gate();
