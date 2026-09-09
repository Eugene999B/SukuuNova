-- Attendance Control Center
-- Keeps school attendance rules and hardware profile metadata tenant-scoped
-- without storing raw biometric templates or card credentials.

CREATE TABLE "AttendanceControlConfig" (
  "schoolId" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceControlConfig_pkey" PRIMARY KEY ("schoolId"),
  CONSTRAINT "AttendanceControlConfig_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AttendanceDeviceProfile" (
  "deviceId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "vendor" TEXT NOT NULL DEFAULT 'generic',
  "model" TEXT NOT NULL DEFAULT 'generic_https',
  "connectionMode" TEXT NOT NULL DEFAULT 'https_push',
  "capabilities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "locationLabel" TEXT,
  "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "lastHeartbeatAt" TIMESTAMP(3),
  "firmwareVersion" TEXT,
  "bridgeVersion" TEXT,
  "statusMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceDeviceProfile_pkey" PRIMARY KEY ("deviceId"),
  CONSTRAINT "AttendanceDeviceProfile_device_school_fkey"
    FOREIGN KEY ("deviceId", "schoolId") REFERENCES "Device"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AttendanceDeviceProfile_schoolId_idx" ON "AttendanceDeviceProfile"("schoolId");
CREATE INDEX "AttendanceDeviceProfile_schoolId_lastHeartbeatAt_idx" ON "AttendanceDeviceProfile"("schoolId", "lastHeartbeatAt");

ALTER TABLE "AttendanceControlConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceControlConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AttendanceControlConfig_tenant" ON "AttendanceControlConfig"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "AttendanceDeviceProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceDeviceProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AttendanceDeviceProfile_tenant" ON "AttendanceDeviceProfile"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
