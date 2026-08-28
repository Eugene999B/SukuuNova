-- SukuuNova Phase 0: platform foundation, tenant isolation, RBAC, auth tokens, and audits.

CREATE TABLE "PlatformAdmin" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLogPlatform" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetSchoolId" TEXT,
  "targetEntity" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLogPlatform_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(65,30) NOT NULL,
  "featureFlags" JSONB NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolLoginDirectory" (
  "schoolId" TEXT NOT NULL,
  "uniqueCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolLoginDirectory_pkey" PRIMARY KEY ("schoolId")
);

CREATE TABLE "LoginRateLimit" (
  "identityHash" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginRateLimit_pkey" PRIMARY KEY ("identityHash")
);

CREATE TABLE "PlatformPasswordResetToken" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "School" (
  "id" TEXT NOT NULL,
  "uniqueCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "logoUrl" TEXT,
  "brandColors" JSONB,
  "subscriptionPlanId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolSettings" (
  "schoolId" TEXT NOT NULL,
  "academicYearConfig" JSONB,
  "gradingScale" JSONB,
  "reportCardTemplateId" TEXT,
  CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("schoolId")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "passwordHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Role" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
  "schoolId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "UserRole" (
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE "UserPermissionOverride" (
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL,
  CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("userId", "permissionId")
);

CREATE TABLE "SchoolPasswordResetToken" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLogSchool" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLogSchool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
CREATE INDEX "AuditLogPlatform_actorId_idx" ON "AuditLogPlatform"("actorId");
CREATE INDEX "AuditLogPlatform_targetSchoolId_idx" ON "AuditLogPlatform"("targetSchoolId");
CREATE INDEX "AuditLogPlatform_createdAt_idx" ON "AuditLogPlatform"("createdAt");
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");
CREATE UNIQUE INDEX "SchoolLoginDirectory_uniqueCode_key" ON "SchoolLoginDirectory"("uniqueCode");
CREATE UNIQUE INDEX "PlatformPasswordResetToken_tokenHash_key" ON "PlatformPasswordResetToken"("tokenHash");
CREATE INDEX "PlatformPasswordResetToken_adminId_expiresAt_idx" ON "PlatformPasswordResetToken"("adminId", "expiresAt");
CREATE UNIQUE INDEX "School_uniqueCode_key" ON "School"("uniqueCode");
CREATE UNIQUE INDEX "User_id_schoolId_key" ON "User"("id", "schoolId");
CREATE UNIQUE INDEX "User_schoolId_email_key" ON "User"("schoolId", "email");
CREATE UNIQUE INDEX "User_schoolId_phone_key" ON "User"("schoolId", "phone");
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");
CREATE UNIQUE INDEX "Role_id_schoolId_key" ON "Role"("id", "schoolId");
CREATE UNIQUE INDEX "Role_schoolId_name_key" ON "Role"("schoolId", "name");
CREATE INDEX "Role_schoolId_idx" ON "Role"("schoolId");
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "RolePermission_schoolId_idx" ON "RolePermission"("schoolId");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");
CREATE INDEX "UserRole_schoolId_idx" ON "UserRole"("schoolId");
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");
CREATE INDEX "UserPermissionOverride_schoolId_idx" ON "UserPermissionOverride"("schoolId");
CREATE INDEX "UserPermissionOverride_permissionId_idx" ON "UserPermissionOverride"("permissionId");
CREATE UNIQUE INDEX "SchoolPasswordResetToken_tokenHash_key" ON "SchoolPasswordResetToken"("tokenHash");
CREATE INDEX "SchoolPasswordResetToken_schoolId_idx" ON "SchoolPasswordResetToken"("schoolId");
CREATE INDEX "SchoolPasswordResetToken_userId_expiresAt_idx" ON "SchoolPasswordResetToken"("userId", "expiresAt");
CREATE INDEX "AuditLogSchool_schoolId_idx" ON "AuditLogSchool"("schoolId");
CREATE INDEX "AuditLogSchool_schoolId_actorId_idx" ON "AuditLogSchool"("schoolId", "actorId");
CREATE INDEX "AuditLogSchool_schoolId_createdAt_idx" ON "AuditLogSchool"("schoolId", "createdAt");

ALTER TABLE "PlatformPasswordResetToken"
  ADD CONSTRAINT "PlatformPasswordResetToken_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "School"
  ADD CONSTRAINT "School_subscriptionPlanId_fkey"
  FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchoolSettings"
  ADD CONSTRAINT "SchoolSettings_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD CONSTRAINT "User_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Role"
  ADD CONSTRAINT "Role_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RolePermission"
  ADD CONSTRAINT "RolePermission_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RolePermission"
  ADD CONSTRAINT "RolePermission_roleId_schoolId_fkey"
  FOREIGN KEY ("roleId", "schoolId") REFERENCES "Role"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission"
  ADD CONSTRAINT "RolePermission_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRole"
  ADD CONSTRAINT "UserRole_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserRole"
  ADD CONSTRAINT "UserRole_userId_schoolId_fkey"
  FOREIGN KEY ("userId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole"
  ADD CONSTRAINT "UserRole_roleId_schoolId_fkey"
  FOREIGN KEY ("roleId", "schoolId") REFERENCES "Role"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermissionOverride"
  ADD CONSTRAINT "UserPermissionOverride_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPermissionOverride"
  ADD CONSTRAINT "UserPermissionOverride_userId_schoolId_fkey"
  FOREIGN KEY ("userId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPermissionOverride"
  ADD CONSTRAINT "UserPermissionOverride_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolPasswordResetToken"
  ADD CONSTRAINT "SchoolPasswordResetToken_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPasswordResetToken"
  ADD CONSTRAINT "SchoolPasswordResetToken_userId_schoolId_fkey"
  FOREIGN KEY ("userId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLogSchool"
  ADD CONSTRAINT "AuditLogSchool_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The current tenant is transaction-local. An absent or empty value resolves to NULL,
-- which makes every policy fail closed.
CREATE OR REPLACE FUNCTION sukuunova_current_school_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_school_id', true), '');
$$;

ALTER TABLE "School" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "School" FORCE ROW LEVEL SECURITY;
CREATE POLICY "School_tenant_isolation" ON "School"
  USING ("id" = sukuunova_current_school_id())
  WITH CHECK ("id" = sukuunova_current_school_id());

ALTER TABLE "SchoolSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "SchoolSettings_tenant_isolation" ON "SchoolSettings"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY "User_tenant_isolation" ON "User"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Role_tenant_isolation" ON "Role"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RolePermission_tenant_isolation" ON "RolePermission"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY "UserRole_tenant_isolation" ON "UserRole"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

ALTER TABLE "UserPermissionOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserPermissionOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY "UserPermissionOverride_tenant_isolation" ON "UserPermissionOverride"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

ALTER TABLE "SchoolPasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolPasswordResetToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY "SchoolPasswordResetToken_tenant_isolation" ON "SchoolPasswordResetToken"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

ALTER TABLE "AuditLogSchool" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLogSchool" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AuditLogSchool_tenant_isolation" ON "AuditLogSchool"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

-- Database backstop for append-only audit logs.
CREATE OR REPLACE FUNCTION sukuunova_reject_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SukuuNova audit logs are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "AuditLogSchool_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLogSchool"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_audit_mutation();

CREATE TRIGGER "AuditLogPlatform_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLogPlatform"
  FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_audit_mutation();
