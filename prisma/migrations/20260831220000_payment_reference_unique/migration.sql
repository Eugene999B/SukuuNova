-- Prevent duplicate external transaction/reference numbers within a school.
-- PostgreSQL unique constraints allow multiple NULL values, so cash payments
-- without a reference remain valid while supplied references are unique.
CREATE UNIQUE INDEX "Payment_schoolId_reference_key"
  ON "Payment" ("schoolId", "reference");
