CREATE TABLE "PlatformAdminSchoolAccess" (
  "adminId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  CONSTRAINT "PlatformAdminSchoolAccess_pkey" PRIMARY KEY ("adminId","schoolId"),
  CONSTRAINT "PlatformAdminSchoolAccess_admin_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PlatformAdminSchoolAccess_school_idx" ON "PlatformAdminSchoolAccess"("schoolId");
CREATE INDEX "PlatformAdminSchoolAccess_admin_idx" ON "PlatformAdminSchoolAccess"("adminId");
