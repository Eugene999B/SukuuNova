-- Operational transport incidents are distinct from family arrival alerts.
-- They support command-centre safety workflows and trip replay without polluting guardian notification state.
CREATE TABLE "P3TransportIncident" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "trackerDeviceId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'warning',
  "status" TEXT NOT NULL DEFAULT 'open',
  "idempotencyKey" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3TransportIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "P3TransportIncident_type_check" CHECK ("type" IN ('route_deviation','tracker_offline','gps_degraded')),
  CONSTRAINT "P3TransportIncident_severity_check" CHECK ("severity" IN ('info','warning','critical')),
  CONSTRAINT "P3TransportIncident_status_check" CHECK ("status" IN ('open','resolved','dismissed'))
);

CREATE UNIQUE INDEX "P3TransportIncident_id_schoolId_key" ON "P3TransportIncident"("id","schoolId");
CREATE INDEX "P3TransportIncident_schoolId_idempotencyKey_idx" ON "P3TransportIncident"("schoolId","idempotencyKey");
CREATE UNIQUE INDEX "P3TransportIncident_one_open_type_per_trip" ON "P3TransportIncident"("schoolId","tripId","type") WHERE "status"='open';
CREATE INDEX "P3TransportIncident_schoolId_tripId_status_openedAt_idx" ON "P3TransportIncident"("schoolId","tripId","status","openedAt");

ALTER TABLE "P3TransportIncident" ADD CONSTRAINT "P3TransportIncident_trip_fkey"
  FOREIGN KEY ("tripId","schoolId") REFERENCES "P3TransportTrip"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "P3TransportIncident" ADD CONSTRAINT "P3TransportIncident_tracker_fkey"
  FOREIGN KEY ("trackerDeviceId","schoolId") REFERENCES "P3TrackerDevice"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "P3TransportIncident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "P3TransportIncident" FORCE ROW LEVEL SECURITY;
CREATE POLICY "P3TransportIncident_tenant_isolation" ON "P3TransportIncident"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
