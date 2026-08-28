-- SukuuNova Phase 4: platform maturity, billing, groups, support, risk and AI safeguards.

CREATE TABLE "PlatformInvoice" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unpaid',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlatformPayment" (
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
CREATE TABLE "SchoolGroup" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SchoolGroupMembership" (
  "groupId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolGroupMembership_pkey" PRIMARY KEY ("groupId","schoolId")
);
CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "raisedByUserId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupportTicketMessage" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ImpersonationLog" (
  "id" TEXT NOT NULL,
  "platformAdminId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "impersonatedUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "ImpersonationLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StudentRiskFlag" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "StudentRiskFlag_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiDraft" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "context" JSONB NOT NULL,
  "draftText" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'suggested',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformInvoice_id_schoolId_key" ON "PlatformInvoice"("id","schoolId");
CREATE UNIQUE INDEX "PlatformInvoice_schoolId_period_key" ON "PlatformInvoice"("schoolId","period");
CREATE INDEX "PlatformInvoice_schoolId_status_idx" ON "PlatformInvoice"("schoolId","status");
CREATE UNIQUE INDEX "PlatformPayment_id_schoolId_key" ON "PlatformPayment"("id","schoolId");
CREATE INDEX "PlatformPayment_schoolId_invoice_idx" ON "PlatformPayment"("schoolId","platformInvoiceId");
CREATE INDEX "SchoolGroup_owner_idx" ON "SchoolGroup"("ownerId");
CREATE INDEX "SchoolGroupMembership_school_idx" ON "SchoolGroupMembership"("schoolId");
CREATE INDEX "SupportTicket_school_status_idx" ON "SupportTicket"("schoolId","status");
CREATE INDEX "SupportTicketMessage_school_ticket_idx" ON "SupportTicketMessage"("schoolId","ticketId");
CREATE INDEX "ImpersonationLog_school_started_idx" ON "ImpersonationLog"("schoolId","startedAt");
CREATE INDEX "StudentRiskFlag_school_student_reason_idx" ON "StudentRiskFlag"("schoolId","studentId","reason");
CREATE INDEX "StudentRiskFlag_school_resolved_idx" ON "StudentRiskFlag"("schoolId","resolvedAt");
CREATE INDEX "AiDraft_school_type_status_idx" ON "AiDraft"("schoolId","type","status");

ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_invoice_fkey" FOREIGN KEY ("platformInvoiceId","schoolId") REFERENCES "PlatformInvoice"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_raisedBy_fkey" FOREIGN KEY ("raisedByUserId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticket_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_sender_fkey" FOREIGN KEY ("senderId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImpersonationLog" ADD CONSTRAINT "ImpersonationLog_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImpersonationLog" ADD CONSTRAINT "ImpersonationLog_user_fkey" FOREIGN KEY ("impersonatedUserId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentRiskFlag" ADD CONSTRAINT "StudentRiskFlag_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentRiskFlag" ADD CONSTRAINT "StudentRiskFlag_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolGroupMembership" ADD CONSTRAINT "SchoolGroupMembership_group_fkey" FOREIGN KEY ("groupId") REFERENCES "SchoolGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolGroupMembership" ADD CONSTRAINT "SchoolGroupMembership_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT unnest(ARRAY['PlatformInvoice','PlatformPayment','SupportTicket','SupportTicketMessage','ImpersonationLog','StudentRiskFlag','AiDraft']) AS table_name LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id())', r.table_name || '_tenant_isolation', r.table_name);
  END LOOP;
END $$;

INSERT INTO "Permission" ("id","key","description") VALUES
 ('p4-broadcast','broadcast:emergency_send','Send confirmed school-wide emergency broadcasts'),
 ('p4-risk','risk_flags:view','View student early-warning risk flags'),
 ('p4-ai-accept','ai_drafts:accept','Accept or discard AI-generated drafts after human review')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE p."key"='broadcast:emergency_send' AND r."name" IN ('Owner','Principal') ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE p."key"='risk_flags:view' AND r."name" IN ('Owner','Principal','Vice Principal','Class Teacher') ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE p."key"='ai_drafts:accept' AND r."name" IN ('Owner','Principal','Vice Principal','Class Teacher','Subject Teacher') ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE p."key" IN ('risk_flags:view','ai_drafts:accept') AND r."name"='Owner' ON CONFLICT DO NOTHING;

UPDATE "SubscriptionPlan"
SET "featureFlags"='["face_recognition","payroll","transport","feeding","cbt","library","assets","recruitment"]'::jsonb
WHERE "name"='Foundation' AND ("featureFlags"='[]'::jsonb OR "featureFlags" IS NULL);

INSERT INTO "SubscriptionPlan" ("id","name","price","featureFlags")
VALUES
 ('p4-plan-growth','Growth',250,'["payroll","transport","feeding","cbt","library","assets","recruitment"]'::jsonb),
 ('p4-plan-enterprise','Enterprise',500,'["face_recognition","payroll","transport","feeding","cbt","library","assets","recruitment"]'::jsonb)
ON CONFLICT ("name") DO NOTHING;
