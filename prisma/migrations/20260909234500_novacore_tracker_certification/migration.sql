-- Certified hardware should prove reliable telemetry before it can power a live family trip.
ALTER TABLE "P3TrackerDevice" ADD CONSTRAINT "P3TrackerDevice_status_check" CHECK ("status" IN ('provisioning','testing','active','blocked','retired'));

CREATE TABLE "P3TrackerCertification" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "trackerDeviceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "acceptedPackets" INTEGER NOT NULL DEFAULT 0,
  "rejectedPackets" INTEGER NOT NULL DEFAULT 0,
  "acceptedRatio" DECIMAL(6,5),
  "maxHeartbeatGapSeconds" DECIMAL(10,2),
  "latestPacketAgeSeconds" DECIMAL(10,2),
  "failureReasons" JSONB NOT NULL DEFAULT '[]',
  "algorithmVersion" TEXT NOT NULL DEFAULT 'tracker-cert-v1.0.0',
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3TrackerCertification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "P3TrackerCertification_status_check" CHECK ("status" IN ('running','passed','failed','cancelled'))
);

CREATE UNIQUE INDEX "P3TrackerCertification_id_schoolId_key" ON "P3TrackerCertification"("id","schoolId");
CREATE INDEX "P3TrackerCertification_schoolId_trackerDeviceId_startedAt_idx" ON "P3TrackerCertification"("schoolId","trackerDeviceId","startedAt");
CREATE UNIQUE INDEX "P3TrackerCertification_one_running_per_tracker" ON "P3TrackerCertification"("schoolId","trackerDeviceId") WHERE "status"='running';

ALTER TABLE "P3TrackerCertification" ADD CONSTRAINT "P3TrackerCertification_tracker_fkey"
  FOREIGN KEY ("trackerDeviceId","schoolId") REFERENCES "P3TrackerDevice"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "P3TrackerCertification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "P3TrackerCertification" FORCE ROW LEVEL SECURITY;
CREATE POLICY "P3TrackerCertification_tenant_isolation" ON "P3TrackerCertification"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
