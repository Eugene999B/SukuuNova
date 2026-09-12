-- Wave 2: separate the curriculum fact (a class studies a subject) from
-- staffing (which teacher teaches that subject to that class).
CREATE TABLE "ClassSubjectOffering" (
  "schoolId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassSubjectOffering_pkey" PRIMARY KEY ("classId", "subjectId"),
  CONSTRAINT "ClassSubjectOffering_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSubjectOffering_classId_schoolId_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "Class"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClassSubjectOffering_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ClassSubjectOffering_schoolId_idx" ON "ClassSubjectOffering"("schoolId");
CREATE INDEX "ClassSubjectOffering_schoolId_classId_idx" ON "ClassSubjectOffering"("schoolId", "classId");
CREATE INDEX "ClassSubjectOffering_schoolId_subjectId_idx" ON "ClassSubjectOffering"("schoolId", "subjectId");

-- Preserve the curriculum implied by every existing academic path. A subject can
-- therefore remain part of a class even when its teacher is temporarily removed.
INSERT INTO "ClassSubjectOffering" ("schoolId", "classId", "subjectId")
SELECT DISTINCT "schoolId", "classId", "subjectId"
FROM "ClassSubjectTeacher"
ON CONFLICT ("classId", "subjectId") DO NOTHING;

INSERT INTO "ClassSubjectOffering" ("schoolId", "classId", "subjectId")
SELECT DISTINCT "schoolId", "classId", "subjectId"
FROM "Assessment"
ON CONFLICT ("classId", "subjectId") DO NOTHING;

INSERT INTO "ClassSubjectOffering" ("schoolId", "classId", "subjectId")
SELECT DISTINCT "schoolId", "classId", "subjectId"
FROM "TimetableSlot"
ON CONFLICT ("classId", "subjectId") DO NOTHING;

ALTER TABLE "ClassSubjectOffering" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassSubjectOffering" FORCE ROW LEVEL SECURITY;
CREATE POLICY "class_subject_offering_tenant" ON "ClassSubjectOffering"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

-- During the transition, keep old writers compatible. Any legacy teacher link,
-- assessment or timetable slot automatically guarantees the curriculum offering
-- exists. New class-first screens write the offering before staffing it.
CREATE OR REPLACE FUNCTION "ensure_class_subject_offering"()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "ClassSubjectOffering" ("schoolId", "classId", "subjectId")
  VALUES (NEW."schoolId", NEW."classId", NEW."subjectId")
  ON CONFLICT ("classId", "subjectId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClassSubjectTeacher_ensure_offering"
AFTER INSERT OR UPDATE OF "schoolId", "classId", "subjectId" ON "ClassSubjectTeacher"
FOR EACH ROW EXECUTE FUNCTION "ensure_class_subject_offering"();

CREATE TRIGGER "Assessment_ensure_offering"
AFTER INSERT OR UPDATE OF "schoolId", "classId", "subjectId" ON "Assessment"
FOR EACH ROW EXECUTE FUNCTION "ensure_class_subject_offering"();

CREATE TRIGGER "TimetableSlot_ensure_offering"
AFTER INSERT OR UPDATE OF "schoolId", "classId", "subjectId" ON "TimetableSlot"
FOR EACH ROW EXECUTE FUNCTION "ensure_class_subject_offering"();
