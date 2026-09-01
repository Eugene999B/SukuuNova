CREATE OR REPLACE FUNCTION enforce_admission_enrolment_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW."stage" = 'converted') <> (NEW."convertedStudentId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Admission enquiry cannot be marked converted without a linked student';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admission_enquiry_enrolment_invariant ON "AdmissionEnquiry";

CREATE TRIGGER admission_enquiry_enrolment_invariant
BEFORE INSERT OR UPDATE OF "stage", "convertedStudentId"
ON "AdmissionEnquiry"
FOR EACH ROW
EXECUTE FUNCTION enforce_admission_enrolment_invariant();
