-- Hardening follow-up for the NovaCore transport model.
-- Geofence progression is per child/trip; notification fan-out is per linked guardian.
ALTER TABLE "P3GeofenceState" DROP COLUMN "guardianId";

-- Diagnostics should not duplicate the plaintext hardware identifier in every event row.
ALTER TABLE "P3TrackerEvent" RENAME COLUMN "imei" TO "imeiHash";
