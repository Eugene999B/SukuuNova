-- Academic calendar guard hardening.

-- Composite tenant foreign keys must never null the schoolId on actor deletion.
ALTER TABLE "AcademicYearPlan" DROP CONSTRAINT IF EXISTS "AcademicYearPlan_createdBy_fkey";
ALTER TABLE "AcademicYearPlan"
  ADD CONSTRAINT "AcademicYearPlan_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolCalendarDay" DROP CONSTRAINT IF EXISTS "SchoolCalendarDay_overriddenBy_fkey";
ALTER TABLE "SchoolCalendarDay"
  ADD CONSTRAINT "SchoolCalendarDay_overriddenBy_fkey" FOREIGN KEY ("overriddenBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Newly planned sessions cannot bypass closing validation through the legacy
-- Term lock endpoint. Backfilled legacy plans have createdBy=NULL and retain
-- their old locking behavior until deliberately adopted into the planner.
CREATE OR REPLACE FUNCTION sukuunova_guard_planned_term_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE close_state TEXT; plan_creator TEXT;
BEGIN
  IF NEW."isLocked" = true AND OLD."isLocked" = false THEN
    SELECT asp."closingStatus", ayp."createdBy"
      INTO close_state, plan_creator
      FROM "AcademicSessionPolicy" asp
      JOIN "AcademicYearPlan" ayp ON ayp."id"=asp."academicYearPlanId" AND ayp."schoolId"=asp."schoolId"
     WHERE asp."schoolId"=NEW."schoolId" AND asp."termId"=NEW."id"
     LIMIT 1;
    IF FOUND AND plan_creator IS NOT NULL AND close_state <> 'ready' THEN
      RAISE EXCEPTION 'Validate term closing before locking this planned academic session' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS "Term_guard_planned_lock" ON "Term";
CREATE TRIGGER "Term_guard_planned_lock" BEFORE UPDATE OF "isLocked" ON "Term" FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_planned_term_lock();

-- Once academic leadership confirms a recommendation, a class-teacher write
-- must not silently demote it back to draft. A later administrative correction
-- can remain confirmed through the normal promotion-decision service.
CREATE OR REPLACE FUNCTION sukuunova_guard_promotion_confirmation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" IN ('confirmed','applied') AND NEW."status" = 'draft' THEN
    RAISE EXCEPTION 'A confirmed/applied promotion decision cannot be returned to draft' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS "PromotionDecision_confirmation_guard" ON "PromotionDecision";
CREATE TRIGGER "PromotionDecision_confirmation_guard" BEFORE UPDATE OF "status" ON "PromotionDecision" FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_promotion_confirmation();
