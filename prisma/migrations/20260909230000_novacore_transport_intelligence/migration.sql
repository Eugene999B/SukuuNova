-- NovaCore transport intelligence foundation.
-- Additive only: preserves all existing Phase 3 transport records and adds the state needed for certified live tracking.

ALTER TABLE "P3VehicleLocation" ADD COLUMN "trackerDeviceId" TEXT;
ALTER TABLE "P3VehicleLocation" ADD COLUMN "tripId" TEXT;
ALTER TABLE "P3VehicleLocation" ADD COLUMN "accuracyMeters" DECIMAL(8,2);
ALTER TABLE "P3VehicleLocation" ADD COLUMN "quality" TEXT NOT NULL DEFAULT 'accepted';
ALTER TABLE "P3VehicleLocation" ADD COLUMN "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Global gateway routing contains no location data and no plaintext IMEI. It exists only so a raw TCP connection
-- can be resolved to one tenant before the gateway enters the normal withTenant/RLS transaction.
CREATE TABLE "TrackerGatewayBinding" (
  "id" TEXT NOT NULL,
  "imeiHash" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "trackerDeviceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackerGatewayBinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrackerGatewayBinding_imeiHash_key" ON "TrackerGatewayBinding"("imeiHash");
CREATE UNIQUE INDEX "TrackerGatewayBinding_schoolId_trackerDeviceId_key" ON "TrackerGatewayBinding"("schoolId","trackerDeviceId");
CREATE INDEX "TrackerGatewayBinding_schoolId_status_idx" ON "TrackerGatewayBinding"("schoolId","status");

CREATE TABLE "P3TrackerDevice" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "imei" TEXT NOT NULL,
  "manufacturer" TEXT NOT NULL DEFAULT 'Teltonika',
  "model" TEXT NOT NULL,
  "codec" TEXT NOT NULL DEFAULT '8E',
  "status" TEXT NOT NULL DEFAULT 'provisioning',
  "simIccid" TEXT,
  "simMsisdn" TEXT,
  "apn" TEXT,
  "firmwareVersion" TEXT,
  "provisioningKeyHash" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "lastConfigAt" TIMESTAMP(3),
  "lastPowerState" TEXT,
  "lastNetworkState" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3TrackerDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "P3RouteShapePoint" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3RouteShapePoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "P3TransportTrip" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "trackerDeviceId" TEXT,
  "direction" TEXT NOT NULL,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "plannedStartAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "lastLocationAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3TransportTrip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "P3StudentTransportAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "morningEnabled" BOOLEAN NOT NULL DEFAULT true,
  "afternoonEnabled" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3StudentTransportAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "P3PickupPoint" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "guardianId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "routeId" TEXT,
  "direction" TEXT NOT NULL,
  "label" TEXT,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "isTemporary" BOOLEAN NOT NULL DEFAULT false,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3PickupPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "P3GeofenceState" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "guardianId" TEXT NOT NULL,
  "pickupPointId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'outside',
  "previousDistanceMeters" DECIMAL(12,2),
  "consecutiveSamples" INTEGER NOT NULL DEFAULT 0,
  "approachingAt" TIMESTAMP(3),
  "arrivingAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3),
  "passedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3GeofenceState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "P3TransportAlert" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "guardianId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "P3TransportAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "P3TrackerEvent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "trackerDeviceId" TEXT NOT NULL,
  "imei" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "reportedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted" BOOLEAN NOT NULL DEFAULT true,
  "rejectionReason" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "P3TrackerEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "P3TrackerDevice_id_schoolId_key" ON "P3TrackerDevice"("id","schoolId");
CREATE UNIQUE INDEX "P3TrackerDevice_schoolId_imei_key" ON "P3TrackerDevice"("schoolId","imei");
CREATE INDEX "P3TrackerDevice_schoolId_status_lastSeenAt_idx" ON "P3TrackerDevice"("schoolId","status","lastSeenAt");
CREATE UNIQUE INDEX "P3RouteShapePoint_id_schoolId_key" ON "P3RouteShapePoint"("id","schoolId");
CREATE UNIQUE INDEX "P3RouteShapePoint_schoolId_routeId_sequence_key" ON "P3RouteShapePoint"("schoolId","routeId","sequence");
CREATE UNIQUE INDEX "P3TransportTrip_id_schoolId_key" ON "P3TransportTrip"("id","schoolId");
CREATE INDEX "P3TransportTrip_schoolId_status_serviceDate_idx" ON "P3TransportTrip"("schoolId","status","serviceDate");
CREATE INDEX "P3TransportTrip_schoolId_vehicleId_startedAt_idx" ON "P3TransportTrip"("schoolId","vehicleId","startedAt");
CREATE UNIQUE INDEX "P3StudentTransportAssignment_id_schoolId_key" ON "P3StudentTransportAssignment"("id","schoolId");
CREATE INDEX "P3StudentTransportAssignment_schoolId_studentId_status_idx" ON "P3StudentTransportAssignment"("schoolId","studentId","status");
CREATE UNIQUE INDEX "P3PickupPoint_id_schoolId_key" ON "P3PickupPoint"("id","schoolId");
CREATE INDEX "P3PickupPoint_schoolId_studentId_direction_status_idx" ON "P3PickupPoint"("schoolId","studentId","direction","status");
CREATE UNIQUE INDEX "P3PickupPoint_one_current_approved_per_direction" ON "P3PickupPoint"("schoolId","studentId","direction") WHERE "status"='approved' AND "effectiveTo" IS NULL;
CREATE UNIQUE INDEX "P3GeofenceState_id_schoolId_key" ON "P3GeofenceState"("id","schoolId");
CREATE UNIQUE INDEX "P3GeofenceState_schoolId_tripId_studentId_key" ON "P3GeofenceState"("schoolId","tripId","studentId");
CREATE UNIQUE INDEX "P3TransportAlert_id_schoolId_key" ON "P3TransportAlert"("id","schoolId");
CREATE UNIQUE INDEX "P3TransportAlert_schoolId_idempotencyKey_key" ON "P3TransportAlert"("schoolId","idempotencyKey");
CREATE INDEX "P3TransportAlert_schoolId_tripId_status_idx" ON "P3TransportAlert"("schoolId","tripId","status");
CREATE UNIQUE INDEX "P3TrackerEvent_id_schoolId_key" ON "P3TrackerEvent"("id","schoolId");
CREATE INDEX "P3TrackerEvent_schoolId_trackerDeviceId_receivedAt_idx" ON "P3TrackerEvent"("schoolId","trackerDeviceId","receivedAt");
CREATE INDEX "P3VehicleLocation_schoolId_tripId_reportedAt_idx" ON "P3VehicleLocation"("schoolId","tripId","reportedAt");

-- Composite tenant foreign keys use RESTRICT rather than SET NULL so deleting a related row can never null the non-null schoolId.
ALTER TABLE "P3TrackerDevice" ADD CONSTRAINT "P3TrackerDevice_vehicle_fkey" FOREIGN KEY ("vehicleId","schoolId") REFERENCES "P3Vehicle"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3RouteShapePoint" ADD CONSTRAINT "P3RouteShapePoint_route_fkey" FOREIGN KEY ("routeId","schoolId") REFERENCES "P3BusRoute"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "P3TransportTrip" ADD CONSTRAINT "P3TransportTrip_route_fkey" FOREIGN KEY ("routeId","schoolId") REFERENCES "P3BusRoute"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3TransportTrip" ADD CONSTRAINT "P3TransportTrip_vehicle_fkey" FOREIGN KEY ("vehicleId","schoolId") REFERENCES "P3Vehicle"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3TransportTrip" ADD CONSTRAINT "P3TransportTrip_tracker_fkey" FOREIGN KEY ("trackerDeviceId","schoolId") REFERENCES "P3TrackerDevice"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3StudentTransportAssignment" ADD CONSTRAINT "P3StudentTransportAssignment_route_fkey" FOREIGN KEY ("routeId","schoolId") REFERENCES "P3BusRoute"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3StudentTransportAssignment" ADD CONSTRAINT "P3StudentTransportAssignment_vehicle_fkey" FOREIGN KEY ("vehicleId","schoolId") REFERENCES "P3Vehicle"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3PickupPoint" ADD CONSTRAINT "P3PickupPoint_route_fkey" FOREIGN KEY ("routeId","schoolId") REFERENCES "P3BusRoute"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3GeofenceState" ADD CONSTRAINT "P3GeofenceState_trip_fkey" FOREIGN KEY ("tripId","schoolId") REFERENCES "P3TransportTrip"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "P3GeofenceState" ADD CONSTRAINT "P3GeofenceState_pickup_fkey" FOREIGN KEY ("pickupPointId","schoolId") REFERENCES "P3PickupPoint"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3TransportAlert" ADD CONSTRAINT "P3TransportAlert_trip_fkey" FOREIGN KEY ("tripId","schoolId") REFERENCES "P3TransportTrip"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "P3TrackerEvent" ADD CONSTRAINT "P3TrackerEvent_tracker_fkey" FOREIGN KEY ("trackerDeviceId","schoolId") REFERENCES "P3TrackerDevice"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "P3VehicleLocation" ADD CONSTRAINT "P3VehicleLocation_tracker_fkey" FOREIGN KEY ("trackerDeviceId","schoolId") REFERENCES "P3TrackerDevice"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P3VehicleLocation" ADD CONSTRAINT "P3VehicleLocation_trip_fkey" FOREIGN KEY ("tripId","schoolId") REFERENCES "P3TransportTrip"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'P3TrackerDevice','P3RouteShapePoint','P3TransportTrip','P3StudentTransportAssignment',
    'P3PickupPoint','P3GeofenceState','P3TransportAlert','P3TrackerEvent'
  ]) AS table_name LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id())', r.table_name || '_tenant_isolation', r.table_name);
  END LOOP;
END $$;
