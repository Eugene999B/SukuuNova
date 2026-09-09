-- Preserve raw tracker evidence while storing NovaCore's separately-derived live position and route intelligence.
ALTER TABLE "P3VehicleLocation" ADD COLUMN "normalizedLatitude" DECIMAL(10,7);
ALTER TABLE "P3VehicleLocation" ADD COLUMN "normalizedLongitude" DECIMAL(10,7);
ALTER TABLE "P3VehicleLocation" ADD COLUMN "routeDistanceMeters" DECIMAL(12,2);
ALTER TABLE "P3VehicleLocation" ADD COLUMN "routeProgressMeters" DECIMAL(12,2);
ALTER TABLE "P3VehicleLocation" ADD COLUMN "routeRemainingMeters" DECIMAL(12,2);
ALTER TABLE "P3VehicleLocation" ADD COLUMN "routeMatchConfidence" DECIMAL(6,5);
ALTER TABLE "P3VehicleLocation" ADD COLUMN "routeDeviation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "P3VehicleLocation" ADD COLUMN "algorithmVersion" TEXT;

-- A real school route can use different roads in the morning and afternoon; never assume one is the reverse of the other.
ALTER TABLE "P3RouteShapePoint" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'morning';
ALTER TABLE "P3RouteShapePoint" ADD CONSTRAINT "P3RouteShapePoint_direction_check" CHECK ("direction" IN ('morning','afternoon'));
DROP INDEX "P3RouteShapePoint_schoolId_routeId_sequence_key";
CREATE UNIQUE INDEX "P3RouteShapePoint_schoolId_routeId_direction_sequence_key" ON "P3RouteShapePoint"("schoolId","routeId","direction","sequence");
CREATE INDEX "P3RouteShapePoint_schoolId_routeId_direction_idx" ON "P3RouteShapePoint"("schoolId","routeId","direction");

ALTER TABLE "P3GeofenceState" ADD COLUMN "etaMinutes" INTEGER;
ALTER TABLE "P3GeofenceState" ADD COLUMN "etaConfidenceMinutes" INTEGER;
ALTER TABLE "P3GeofenceState" ADD COLUMN "routeRemainingMeters" DECIMAL(12,2);
ALTER TABLE "P3GeofenceState" ADD COLUMN "predictionVersion" TEXT;
