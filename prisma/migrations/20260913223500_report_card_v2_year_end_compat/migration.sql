-- Keep historical/backfilled academic years compatible with the legacy final-term setting
-- until a school explicitly marks an AcademicSessionPolicy row as the year-end session.
-- Once any session in the year has isYearEnd=true, AcademicSessionPolicy is authoritative.

CREATE OR REPLACE FUNCTION sukuunova_report_term_is_year_end(p_school_id TEXT, p_term_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  year_id TEXT;
  explicit_year_end_term TEXT;
  configured_final_text TEXT;
  configured_final_number INTEGER := 3;
  legacy_final_term TEXT;
BEGIN
  SELECT t."academicYearId" INTO year_id
    FROM "Term" t
   WHERE t."schoolId"=p_school_id AND t."id"=p_term_id
   LIMIT 1;
  IF year_id IS NULL THEN RETURN false; END IF;

  SELECT p."termId" INTO explicit_year_end_term
    FROM "AcademicSessionPolicy" p
   WHERE p."schoolId"=p_school_id AND p."academicYearId"=year_id AND p."isYearEnd"=true
   ORDER BY p."sequence", p."termId"
   LIMIT 1;
  IF explicit_year_end_term IS NOT NULL THEN
    RETURN explicit_year_end_term=p_term_id;
  END IF;

  SELECT ss."reportCardConfig"->>'finalTermNumber' INTO configured_final_text
    FROM "SchoolSettings" ss
   WHERE ss."schoolId"=p_school_id;
  IF configured_final_text ~ '^[1-6]$' THEN
    configured_final_number := configured_final_text::integer;
  END IF;

  SELECT ordered."id" INTO legacy_final_term
    FROM (
      SELECT t."id", row_number() OVER (ORDER BY t."startDate",t."endDate",t."id") AS seq
        FROM "Term" t
       WHERE t."schoolId"=p_school_id AND t."academicYearId"=year_id
    ) ordered
   WHERE ordered.seq=configured_final_number
   LIMIT 1;
  RETURN legacy_final_term=p_term_id;
END; $$;

CREATE OR REPLACE FUNCTION sukuunova_freeze_report_card_year_end_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  year_id TEXT;
  effective_year_end BOOLEAN := false;
  promotion_context JSONB;
BEGIN
  IF NEW."status"='approved' AND OLD."status" IS DISTINCT FROM 'approved' THEN
    SELECT t."academicYearId" INTO year_id
      FROM "Term" t
     WHERE t."schoolId"=NEW."schoolId" AND t."id"=NEW."termId"
     LIMIT 1;
    effective_year_end := sukuunova_report_term_is_year_end(NEW."schoolId",NEW."termId");

    IF effective_year_end AND year_id IS NOT NULL THEN
      SELECT jsonb_strip_nulls(jsonb_build_object(
        'outcome',pd."outcome",
        'status',pd."status",
        'reason',pd."reason",
        'targetGradeLevelId',pd."targetGradeLevelId",
        'targetGradeName',gl."name",
        'targetPathwayId',pd."targetPathwayId",
        'targetPathwayName',ap."name"
      )) INTO promotion_context
      FROM "PromotionDecision" pd
      LEFT JOIN "GradeLevel" gl ON gl."id"=pd."targetGradeLevelId" AND gl."schoolId"=pd."schoolId"
      LEFT JOIN "AcademicPathway" ap ON ap."id"=pd."targetPathwayId" AND ap."schoolId"=pd."schoolId"
      WHERE pd."schoolId"=NEW."schoolId" AND pd."studentId"=NEW."studentId"
        AND pd."sourceAcademicYearId"=year_id
        AND pd."status" IN ('draft','confirmed','applied')
      LIMIT 1;
    END IF;

    NEW."calculationSnapshot" := COALESCE(NEW."calculationSnapshot",'{}'::jsonb)
      || jsonb_build_object('yearEndSession',effective_year_end,'structuredPromotion',promotion_context);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS "ReportCard_year_end_authority_v2" ON "ReportCard";
CREATE TRIGGER "ReportCard_year_end_authority_v2"
BEFORE UPDATE OF "status" ON "ReportCard"
FOR EACH ROW EXECUTE FUNCTION sukuunova_freeze_report_card_year_end_authority();
