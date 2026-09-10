-- Platform-owned, append-only pilot certification evidence.
CREATE TABLE IF NOT EXISTS "PilotCertificationEvidence" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "checkKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "evidenceSummary" TEXT NOT NULL,
  "evidenceRef" TEXT,
  "commitSha" TEXT,
  "ciRun" TEXT,
  "expiresAt" TIMESTAMP(3),
  "reviewedByAdminId" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotCertificationEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PilotCertificationEvidence_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PilotCertificationEvidence_admin_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PilotCertificationEvidence_status_check" CHECK ("status" IN ('in_review','passed','failed','waived')),
  CONSTRAINT "PilotCertificationEvidence_environment_check" CHECK ("environment" IN ('ci','staging','production','hardware_lab')),
  CONSTRAINT "PilotCertificationEvidence_summary_check" CHECK (char_length("evidenceSummary") BETWEEN 1 AND 2000),
  CONSTRAINT "PilotCertificationEvidence_check_key_check" CHECK (char_length("checkKey") BETWEEN 3 AND 120)
);

CREATE INDEX IF NOT EXISTS "PilotCertificationEvidence_school_reviewed_idx"
  ON "PilotCertificationEvidence"("schoolId","reviewedAt" DESC);
CREATE INDEX IF NOT EXISTS "PilotCertificationEvidence_school_check_reviewed_idx"
  ON "PilotCertificationEvidence"("schoolId","checkKey","reviewedAt" DESC);
CREATE INDEX IF NOT EXISTS "PilotCertificationEvidence_status_reviewed_idx"
  ON "PilotCertificationEvidence"("status","reviewedAt" DESC);

-- Evidence is append-only. Corrections/retests create a new review row so history remains auditable.
CREATE OR REPLACE FUNCTION sukuunova_reject_certification_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PILOT_CERTIFICATION_EVIDENCE_APPEND_ONLY' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS sukuunova_pilot_certification_no_update ON "PilotCertificationEvidence";
CREATE TRIGGER sukuunova_pilot_certification_no_update
BEFORE UPDATE OR DELETE ON "PilotCertificationEvidence"
FOR EACH ROW EXECUTE FUNCTION sukuunova_reject_certification_evidence_mutation();
