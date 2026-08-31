-- DropForeignKey
ALTER TABLE "AdmissionEnquiry" DROP CONSTRAINT "AdmissionEnquiry_owner_fkey";

-- DropForeignKey
ALTER TABLE "AdmissionEnquiry" DROP CONSTRAINT "AdmissionEnquiry_school_fkey";

-- DropForeignKey
ALTER TABLE "AdmissionEnquiry" DROP CONSTRAINT "AdmissionEnquiry_student_fkey";

-- DropForeignKey
ALTER TABLE "AiDraft" DROP CONSTRAINT "AiDraft_school_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_class_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_school_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_student_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_term_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_year_fkey";

-- DropForeignKey
ALTER TABLE "Homework" DROP CONSTRAINT "Homework_class_fkey";

-- DropForeignKey
ALTER TABLE "Homework" DROP CONSTRAINT "Homework_school_fkey";

-- DropForeignKey
ALTER TABLE "Homework" DROP CONSTRAINT "Homework_subject_fkey";

-- DropForeignKey
ALTER TABLE "Homework" DROP CONSTRAINT "Homework_teacher_fkey";

-- DropForeignKey
ALTER TABLE "Homework" DROP CONSTRAINT "Homework_term_fkey";

-- DropForeignKey
ALTER TABLE "ImpersonationLog" DROP CONSTRAINT "ImpersonationLog_school_fkey";

-- DropForeignKey
ALTER TABLE "ImpersonationLog" DROP CONSTRAINT "ImpersonationLog_user_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_termId_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "LessonPlan" DROP CONSTRAINT "LessonPlan_class_fkey";

-- DropForeignKey
ALTER TABLE "LessonPlan" DROP CONSTRAINT "LessonPlan_school_fkey";

-- DropForeignKey
ALTER TABLE "LessonPlan" DROP CONSTRAINT "LessonPlan_subject_fkey";

-- DropForeignKey
ALTER TABLE "LessonPlan" DROP CONSTRAINT "LessonPlan_teacher_fkey";

-- DropForeignKey
ALTER TABLE "LessonPlan" DROP CONSTRAINT "LessonPlan_term_fkey";

-- DropForeignKey
ALTER TABLE "P3Applicant" DROP CONSTRAINT "P3Applicant_posting_fkey";

-- DropForeignKey
ALTER TABLE "P3Applicant" DROP CONSTRAINT "P3Applicant_staffUser_fkey";

-- DropForeignKey
ALTER TABLE "P3Asset" DROP CONSTRAINT "P3Asset_school_fkey";

-- DropForeignKey
ALTER TABLE "P3Asset" DROP CONSTRAINT "P3Asset_user_fkey";

-- DropForeignKey
ALTER TABLE "P3BoardingEvent" DROP CONSTRAINT "P3BoardingEvent_route_fkey";

-- DropForeignKey
ALTER TABLE "P3BoardingEvent" DROP CONSTRAINT "P3BoardingEvent_stop_fkey";

-- DropForeignKey
ALTER TABLE "P3BoardingEvent" DROP CONSTRAINT "P3BoardingEvent_student_fkey";

-- DropForeignKey
ALTER TABLE "P3BoardingEvent" DROP CONSTRAINT "P3BoardingEvent_vehicle_fkey";

-- DropForeignKey
ALTER TABLE "P3Exam" DROP CONSTRAINT "P3Exam_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "P3ExamAttempt" DROP CONSTRAINT "P3ExamAttempt_exam_fkey";

-- DropForeignKey
ALTER TABLE "P3ExamAttempt" DROP CONSTRAINT "P3ExamAttempt_student_fkey";

-- DropForeignKey
ALTER TABLE "P3ExamQuestion" DROP CONSTRAINT "P3ExamQuestion_exam_fkey";

-- DropForeignKey
ALTER TABLE "P3FeedingBudget" DROP CONSTRAINT "P3FeedingBudget_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "P3FeedingInvoiceItem" DROP CONSTRAINT "P3FeedingInvoiceItem_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "P3FeedingInvoiceItem" DROP CONSTRAINT "P3FeedingInvoiceItem_invoice_fkey";

-- DropForeignKey
ALTER TABLE "P3FeedingLog" DROP CONSTRAINT "P3FeedingLog_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "P3FeedingLog" DROP CONSTRAINT "P3FeedingLog_menu_fkey";

-- DropForeignKey
ALTER TABLE "P3FeedingMenu" DROP CONSTRAINT "P3FeedingMenu_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "P3FinanceAdjustment" DROP CONSTRAINT "P3FinanceAdjustment_invoice_fkey";

-- DropForeignKey
ALTER TABLE "P3FinanceAdjustment" DROP CONSTRAINT "P3FinanceAdjustment_student_fkey";

-- DropForeignKey
ALTER TABLE "P3LibraryBook" DROP CONSTRAINT "P3LibraryBook_school_fkey";

-- DropForeignKey
ALTER TABLE "P3LibraryLoan" DROP CONSTRAINT "P3LibraryLoan_book_fkey";

-- DropForeignKey
ALTER TABLE "P3LibraryLoan" DROP CONSTRAINT "P3LibraryLoan_student_fkey";

-- DropForeignKey
ALTER TABLE "P3ParentLocation" DROP CONSTRAINT "P3ParentLocation_guardian_fkey";

-- DropForeignKey
ALTER TABLE "P3ParentLocation" DROP CONSTRAINT "P3ParentLocation_route_fkey";

-- DropForeignKey
ALTER TABLE "P3RecruitmentPosting" DROP CONSTRAINT "P3RecruitmentPosting_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "P3RouteStop" DROP CONSTRAINT "P3RouteStop_route_fkey";

-- DropForeignKey
ALTER TABLE "P3RouteStop" DROP CONSTRAINT "P3RouteStop_stop_fkey";

-- DropForeignKey
ALTER TABLE "P3VehicleComplianceReminder" DROP CONSTRAINT "P3VehicleComplianceReminder_vehicle_fkey";

-- DropForeignKey
ALTER TABLE "P3VehicleLocation" DROP CONSTRAINT "P3VehicleLocation_route_fkey";

-- DropForeignKey
ALTER TABLE "P3VehicleLocation" DROP CONSTRAINT "P3VehicleLocation_vehicle_fkey";

-- DropForeignKey
ALTER TABLE "PickupEvent" DROP CONSTRAINT "PickupEvent_collectedByGuardianId_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "PickupEvent" DROP CONSTRAINT "PickupEvent_studentId_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformAdminMeta" DROP CONSTRAINT "PlatformAdminMeta_admin_fkey";

-- DropForeignKey
ALTER TABLE "PlatformAdminPermission" DROP CONSTRAINT "PlatformAdminPermission_admin_fkey";

-- DropForeignKey
ALTER TABLE "PlatformAdminSchoolAccess" DROP CONSTRAINT "PlatformAdminSchoolAccess_admin_fkey";

-- DropForeignKey
ALTER TABLE "PlatformInvoice" DROP CONSTRAINT "PlatformInvoice_school_fkey";

-- DropForeignKey
ALTER TABLE "PlatformPayment" DROP CONSTRAINT "PlatformPayment_invoice_fkey";

-- DropForeignKey
ALTER TABLE "PublicInquiry" DROP CONSTRAINT "PublicInquiry_admin_fkey";

-- DropForeignKey
ALTER TABLE "ReportCard" DROP CONSTRAINT "ReportCard_termId_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "SchoolGroupMembership" DROP CONSTRAINT "SchoolGroupMembership_group_fkey";

-- DropForeignKey
ALTER TABLE "SchoolGroupMembership" DROP CONSTRAINT "SchoolGroupMembership_school_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_houseId_fkey";

-- DropForeignKey
ALTER TABLE "StudentRiskFlag" DROP CONSTRAINT "StudentRiskFlag_school_fkey";

-- DropForeignKey
ALTER TABLE "StudentRiskFlag" DROP CONSTRAINT "StudentRiskFlag_student_fkey";

-- DropForeignKey
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_raisedBy_fkey";

-- DropForeignKey
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_school_fkey";

-- DropForeignKey
ALTER TABLE "SupportTicketMessage" DROP CONSTRAINT "SupportTicketMessage_ticket_school_fkey";

-- AlterTable
ALTER TABLE "AttendanceEvent" ALTER COLUMN "recordedBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "House" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SchoolSettings" DROP COLUMN "behaviorRatingFields",
DROP COLUMN "positionBandLabels",
DROP COLUMN "positionScope",
DROP COLUMN "promotionRule",
DROP COLUMN "remarkSource",
DROP COLUMN "showOverallPosition";

-- AlterTable
ALTER TABLE "Score" DROP COLUMN "remarks";

-- DropTable
DROP TABLE "AdmissionEnquiry";

-- DropTable
DROP TABLE "AiDraft";

-- DropTable
DROP TABLE "Enrollment";

-- DropTable
DROP TABLE "Homework";

-- DropTable
DROP TABLE "ImpersonationLog";

-- DropTable
DROP TABLE "LessonPlan";

-- DropTable
DROP TABLE "P3Applicant";

-- DropTable
DROP TABLE "P3Asset";

-- DropTable
DROP TABLE "P3BoardingEvent";

-- DropTable
DROP TABLE "P3BusRoute";

-- DropTable
DROP TABLE "P3BusStop";

-- DropTable
DROP TABLE "P3Exam";

-- DropTable
DROP TABLE "P3ExamAttempt";

-- DropTable
DROP TABLE "P3ExamQuestion";

-- DropTable
DROP TABLE "P3FeedingBudget";

-- DropTable
DROP TABLE "P3FeedingInvoiceItem";

-- DropTable
DROP TABLE "P3FeedingLog";

-- DropTable
DROP TABLE "P3FeedingMenu";

-- DropTable
DROP TABLE "P3FinanceAdjustment";

-- DropTable
DROP TABLE "P3LibraryBook";

-- DropTable
DROP TABLE "P3LibraryLoan";

-- DropTable
DROP TABLE "P3OfflineSyncQueue";

-- DropTable
DROP TABLE "P3ParentLocation";

-- DropTable
DROP TABLE "P3RecruitmentPosting";

-- DropTable
DROP TABLE "P3RouteStop";

-- DropTable
DROP TABLE "P3Vehicle";

-- DropTable
DROP TABLE "P3VehicleComplianceReminder";

-- DropTable
DROP TABLE "P3VehicleLocation";

-- DropTable
DROP TABLE "PlatformAdminMeta";

-- DropTable
DROP TABLE "PlatformAdminPermission";

-- DropTable
DROP TABLE "PlatformAdminSchoolAccess";

-- DropTable
DROP TABLE "PlatformInvoice";

-- DropTable
DROP TABLE "PlatformPayment";

-- DropTable
DROP TABLE "PlatformPublicSettings";

-- DropTable
DROP TABLE "PublicInquiry";

-- DropTable
DROP TABLE "SchoolGroup";

-- DropTable
DROP TABLE "SchoolGroupMembership";

-- DropTable
DROP TABLE "StudentRiskFlag";

-- DropTable
DROP TABLE "SupportTicket";

-- DropTable
DROP TABLE "SupportTicketMessage";

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "deviceSerial" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceIdentity" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "deviceKind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "studentId" TEXT,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAttendanceReceipt" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceAttendanceReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_schoolId_idx" ON "Device"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_id_schoolId_key" ON "Device"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_schoolId_deviceSerial_key" ON "Device"("schoolId", "deviceSerial");

-- CreateIndex
CREATE INDEX "DeviceIdentity_schoolId_idx" ON "DeviceIdentity"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceIdentity_id_schoolId_key" ON "DeviceIdentity"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceIdentity_schoolId_deviceKind_externalId_key" ON "DeviceIdentity"("schoolId", "deviceKind", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceIdentity_schoolId_deviceKind_studentId_key" ON "DeviceIdentity"("schoolId", "deviceKind", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceIdentity_schoolId_deviceKind_staffId_key" ON "DeviceIdentity"("schoolId", "deviceKind", "staffId");

-- CreateIndex
CREATE INDEX "DeviceAttendanceReceipt_schoolId_idx" ON "DeviceAttendanceReceipt"("schoolId");

-- CreateIndex
CREATE INDEX "DeviceAttendanceReceipt_schoolId_deviceId_createdAt_idx" ON "DeviceAttendanceReceipt"("schoolId", "deviceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAttendanceReceipt_id_schoolId_key" ON "DeviceAttendanceReceipt"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAttendanceReceipt_schoolId_deviceId_idempotencyKey_key" ON "DeviceAttendanceReceipt"("schoolId", "deviceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAttendanceReceipt_schoolId_deviceId_nonce_key" ON "DeviceAttendanceReceipt"("schoolId", "deviceId", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "House_id_schoolId_key" ON "House"("id", "schoolId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_houseId_schoolId_fkey" FOREIGN KEY ("houseId", "schoolId") REFERENCES "House"("id", "schoolId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_deviceId_schoolId_fkey" FOREIGN KEY ("deviceId", "schoolId") REFERENCES "Device"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupEvent" ADD CONSTRAINT "PickupEvent_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupEvent" ADD CONSTRAINT "PickupEvent_collectedByGuardianId_schoolId_fkey" FOREIGN KEY ("collectedByGuardianId", "schoolId") REFERENCES "Guardian"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIdentity" ADD CONSTRAINT "DeviceIdentity_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIdentity" ADD CONSTRAINT "DeviceIdentity_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIdentity" ADD CONSTRAINT "DeviceIdentity_staffId_schoolId_fkey" FOREIGN KEY ("staffId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAttendanceReceipt" ADD CONSTRAINT "DeviceAttendanceReceipt_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAttendanceReceipt" ADD CONSTRAINT "DeviceAttendanceReceipt_deviceId_schoolId_fkey" FOREIGN KEY ("deviceId", "schoolId") REFERENCES "Device"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "SubstituteAssignment_schoolId_timetableSlotId_assignmentDate_ke" RENAME TO "SubstituteAssignment_schoolId_timetableSlotId_assignmentDat_key";

ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Device" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Device_tenant_isolation" ON "Device" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "DeviceIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceIdentity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DeviceIdentity_tenant_isolation" ON "DeviceIdentity" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "DeviceAttendanceReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceAttendanceReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DeviceAttendanceReceipt_tenant_isolation" ON "DeviceAttendanceReceipt" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
