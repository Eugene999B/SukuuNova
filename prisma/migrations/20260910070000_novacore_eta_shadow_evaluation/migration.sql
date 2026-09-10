-- Measure ETA shadow accuracy against actual pickup arrival time before any promotion to an enforced algorithm.
CREATE TABLE "NovaCoreEtaPrediction" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "pickupPointId" TEXT NOT NULL,
  "predictionBucket" BIGINT NOT NULL,
  "predictedAt" TIMESTAMP(3) NOT NULL,
  "predictedMinutes" INTEGER NOT NULL,
  "confidenceMinutes" INTEGER,
  "distanceMode" TEXT NOT NULL,
  "routeRemainingMeters" DECIMAL(12,2),
  "algorithmVersion" TEXT NOT NULL,
  "actualArrivalAt" TIMESTAMP(3),
  "absoluteErrorMinutes" DECIMAL(10,3),
  "evaluatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NovaCoreEtaPrediction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NovaCoreEtaPrediction_predicted_minutes_check" CHECK ("predictedMinutes" >= 0),
  CONSTRAINT "NovaCoreEtaPrediction_confidence_minutes_check" CHECK ("confidenceMinutes" IS NULL OR "confidenceMinutes" >= 0),
  CONSTRAINT "NovaCoreEtaPrediction_distance_mode_check" CHECK ("distanceMode" IN ('route','direct')),
  CONSTRAINT "NovaCoreEtaPrediction_absolute_error_check" CHECK ("absoluteErrorMinutes" IS NULL OR "absoluteErrorMinutes" >= 0)
);

CREATE UNIQUE INDEX "NovaCoreEtaPrediction_school_trip_pickup_bucket_version_key"
  ON "NovaCoreEtaPrediction"("schoolId","tripId","pickupPointId","predictionBucket","algorithmVersion");
CREATE INDEX "NovaCoreEtaPrediction_school_trip_predicted_idx"
  ON "NovaCoreEtaPrediction"("schoolId","tripId","predictedAt");
CREATE INDEX "NovaCoreEtaPrediction_school_version_evaluated_idx"
  ON "NovaCoreEtaPrediction"("schoolId","algorithmVersion","evaluatedAt");

ALTER TABLE "NovaCoreEtaPrediction" ADD CONSTRAINT "NovaCoreEtaPrediction_trip_fkey"
  FOREIGN KEY ("tripId","schoolId") REFERENCES "P3TransportTrip"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NovaCoreEtaPrediction" ADD CONSTRAINT "NovaCoreEtaPrediction_pickup_fkey"
  FOREIGN KEY ("pickupPointId","schoolId") REFERENCES "P3PickupPoint"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NovaCoreEtaPrediction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NovaCoreEtaPrediction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "NovaCoreEtaPrediction_tenant_isolation" ON "NovaCoreEtaPrediction"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
