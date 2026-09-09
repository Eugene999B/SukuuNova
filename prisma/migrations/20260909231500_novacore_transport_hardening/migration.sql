-- Hardening follow-up for the NovaCore transport model.
-- Geofence progression is per child/trip; notification fan-out is per linked guardian.
ALTER TABLE "P3GeofenceState" DROP COLUMN "guardianId";

-- Diagnostics should not duplicate the plaintext hardware identifier in every event row.
ALTER TABLE "P3TrackerEvent" RENAME COLUMN "imei" TO "imeiHash";

-- Fail at the database boundary if a future code path attempts to invent unsupported transport states.
ALTER TABLE "P3TransportTrip" ADD CONSTRAINT "P3TransportTrip_direction_check" CHECK ("direction" IN ('morning','afternoon'));
ALTER TABLE "P3TransportTrip" ADD CONSTRAINT "P3TransportTrip_status_check" CHECK ("status" IN ('scheduled','active','completed','cancelled'));
ALTER TABLE "P3PickupPoint" ADD CONSTRAINT "P3PickupPoint_direction_check" CHECK ("direction" IN ('morning','afternoon'));
ALTER TABLE "P3PickupPoint" ADD CONSTRAINT "P3PickupPoint_status_check" CHECK ("status" IN ('pending','approved','rejected','superseded'));
ALTER TABLE "P3PickupPoint" ADD CONSTRAINT "P3PickupPoint_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "P3PickupPoint" ADD CONSTRAINT "P3PickupPoint_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
ALTER TABLE "P3GeofenceState" ADD CONSTRAINT "P3GeofenceState_state_check" CHECK ("state" IN ('outside','approaching','arriving','arrived','passed'));
ALTER TABLE "P3StudentTransportAssignment" ADD CONSTRAINT "P3StudentTransportAssignment_status_check" CHECK ("status" IN ('active','inactive','cancelled'));

-- One vehicle cannot truthfully be on two live school trips at the same time.
CREATE UNIQUE INDEX "P3TransportTrip_one_active_per_vehicle" ON "P3TransportTrip"("schoolId","vehicleId") WHERE "status"='active';

-- A learner has one current route assignment; historical assignments remain available through effectiveTo/status.
CREATE UNIQUE INDEX "P3StudentTransportAssignment_one_current_per_student" ON "P3StudentTransportAssignment"("schoolId","studentId") WHERE "status"='active' AND "effectiveTo" IS NULL;
