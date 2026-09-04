-- Restore Phase 4 platform tables removed by the 20260831081000 biometric migration.
-- Keep this repair migration idempotent so fresh databases and existing Railway
-- databases converge on the same runtime contract.

CREATE TABLE IF NOT EXISTS "PlatformAdminPermission" (
  "adminId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  CONSTRAINT "PlatformAdminPermission_pkey" PRIMARY KEY ("adminId","permission")
);
CREATE INDEX IF NOT EXISTS "PlatformAdminPermission_permission_idx" ON "PlatformAdminPermission"("permission");

CREATE TABLE IF NOT EXISTS "PlatformAdminSchoolAccess" (
  "adminId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  CONSTRAINT "PlatformAdminSchoolAccess_pkey" PRIMARY KEY ("adminId","schoolId")
);
CREATE INDEX IF NOT EXISTS "PlatformAdminSchoolAccess_school_idx" ON "PlatformAdminSchoolAccess"("schoolId");
CREATE INDEX IF NOT EXISTS "PlatformAdminSchoolAccess_admin_idx" ON "PlatformAdminSchoolAccess"("adminId");

CREATE TABLE IF NOT EXISTS "PlatformInvoice" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unpaid',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformInvoice_id_schoolId_key" ON "PlatformInvoice"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformInvoice_schoolId_period_key" ON "PlatformInvoice"("schoolId","period");
CREATE INDEX IF NOT EXISTS "PlatformInvoice_schoolId_status_idx" ON "PlatformInvoice"("schoolId","status");

CREATE TABLE IF NOT EXISTS "PlatformPayment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "platformInvoiceId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "reconciledBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformPayment_id_schoolId_key" ON "PlatformPayment"("id","schoolId");
CREATE INDEX IF NOT EXISTS "PlatformPayment_schoolId_invoice_idx" ON "PlatformPayment"("schoolId","platformInvoiceId");

CREATE TABLE IF NOT EXISTS "SchoolGroup" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolGroup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SchoolGroup_owner_idx" ON "SchoolGroup"("ownerId");

CREATE TABLE IF NOT EXISTS "SchoolGroupMembership" (
  "groupId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolGroupMembership_pkey" PRIMARY KEY ("groupId","schoolId")
);
CREATE INDEX IF NOT EXISTS "SchoolGroupMembership_school_idx" ON "SchoolGroupMembership"("schoolId");

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "raisedByUserId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupportTicket_school_status_idx" ON "SupportTicket"("schoolId","status");

CREATE TABLE IF NOT EXISTS "SupportTicketMessage" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupportTicketMessage_school_ticket_idx" ON "SupportTicketMessage"("schoolId","ticketId");

CREATE TABLE IF NOT EXISTS "ImpersonationLog" (
  "id" TEXT NOT NULL,
  "platformAdminId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "impersonatedUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "ImpersonationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ImpersonationLog_school_started_idx" ON "ImpersonationLog"("schoolId","startedAt");

CREATE TABLE IF NOT EXISTS "StudentRiskFlag" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "StudentRiskFlag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StudentRiskFlag_school_student_reason_idx" ON "StudentRiskFlag"("schoolId","studentId","reason");
CREATE INDEX IF NOT EXISTS "StudentRiskFlag_school_resolved_idx" ON "StudentRiskFlag"("schoolId","resolvedAt");

CREATE TABLE IF NOT EXISTS "AiDraft" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "context" JSONB NOT NULL,
  "draftText" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'suggested',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiDraft_school_type_status_idx" ON "AiDraft"("schoolId","type","status");

CREATE TABLE IF NOT EXISTS "PlatformPublicSettings" (
  "id" TEXT NOT NULL,
  "brandName" TEXT NOT NULL DEFAULT 'SukuuNova',
  "tagline" TEXT NOT NULL DEFAULT 'A calmer, more connected way to run a school.',
  "supportEmail" TEXT,
  "supportPhone" TEXT,
  "whatsappNumber" TEXT,
  "tiktokHandle" TEXT,
  "instagramHandle" TEXT,
  "facebookHandle" TEXT,
  "linkedinHandle" TEXT,
  "youtubeHandle" TEXT,
  "xHandle" TEXT,
  "websiteUrl" TEXT,
  "showSocialLinks" BOOLEAN NOT NULL DEFAULT true,
  "showLeadChat" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformPublicSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PublicInquiry" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'website',
  "subject" TEXT,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "assignedToAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "repliedAt" TIMESTAMP(3),
  "repliedVia" TEXT,
  CONSTRAINT "PublicInquiry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PublicInquiry_status_createdAt_idx" ON "PublicInquiry"("status","createdAt");
CREATE INDEX IF NOT EXISTS "PublicInquiry_email_idx" ON "PublicInquiry"("email");
CREATE INDEX IF NOT EXISTS "PublicInquiry_phone_idx" ON "PublicInquiry"("phone");

INSERT INTO "PlatformPublicSettings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformAdminPermission_admin_fkey') THEN
    ALTER TABLE "PlatformAdminPermission" ADD CONSTRAINT "PlatformAdminPermission_admin_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformAdminSchoolAccess_admin_fkey') THEN
    ALTER TABLE "PlatformAdminSchoolAccess" ADD CONSTRAINT "PlatformAdminSchoolAccess_admin_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformInvoice_school_fkey') THEN
    ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformPayment_invoice_fkey') THEN
    ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_invoice_fkey" FOREIGN KEY ("platformInvoiceId","schoolId") REFERENCES "PlatformInvoice"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchoolGroupMembership_group_fkey') THEN
    ALTER TABLE "SchoolGroupMembership" ADD CONSTRAINT "SchoolGroupMembership_group_fkey" FOREIGN KEY ("groupId") REFERENCES "SchoolGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchoolGroupMembership_school_fkey') THEN
    ALTER TABLE "SchoolGroupMembership" ADD CONSTRAINT "SchoolGroupMembership_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicket_school_fkey') THEN
    ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicket_raisedBy_fkey') THEN
    ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_raisedBy_fkey" FOREIGN KEY ("raisedByUserId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicketMessage_ticket_fkey') THEN
    ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticket_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicketMessage_sender_fkey') THEN
    ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_sender_fkey" FOREIGN KEY ("senderId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImpersonationLog_school_fkey') THEN
    ALTER TABLE "ImpersonationLog" ADD CONSTRAINT "ImpersonationLog_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImpersonationLog_user_fkey') THEN
    ALTER TABLE "ImpersonationLog" ADD CONSTRAINT "ImpersonationLog_user_fkey" FOREIGN KEY ("impersonatedUserId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentRiskFlag_school_fkey') THEN
    ALTER TABLE "StudentRiskFlag" ADD CONSTRAINT "StudentRiskFlag_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentRiskFlag_student_fkey') THEN
    ALTER TABLE "StudentRiskFlag" ADD CONSTRAINT "StudentRiskFlag_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiDraft_school_fkey') THEN
    ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PublicInquiry_admin_fkey') THEN
    ALTER TABLE "PublicInquiry" ADD CONSTRAINT "PublicInquiry_admin_fkey" FOREIGN KEY ("assignedToAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT unnest(ARRAY['PlatformInvoice','PlatformPayment','SupportTicket','SupportTicketMessage','ImpersonationLog','StudentRiskFlag','AiDraft']) AS table_name LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = r.table_name || '_tenant_isolation') THEN
      EXECUTE format('CREATE POLICY %I ON %I USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id())', r.table_name || '_tenant_isolation', r.table_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO "PlatformAdminPermission" ("adminId","permission")
SELECT a."id", p."permission"
FROM "PlatformAdmin" a
CROSS JOIN (VALUES
  ('schools.view'),('schools.manage'),('schools.suspend'),('schools.impersonate'),
  ('billing.view'),('billing.manage'),('plans.manage'),('analytics.view'),
  ('support.view'),('support.manage'),('admins.view'),('admins.manage'),
  ('audit.view'),('security.manage'),('settings.manage')
) AS p(permission)
WHERE a."role"='super_admin'
ON CONFLICT DO NOTHING;
