-- Bridge Finance V2 scholarship rules into the existing audited adjustment engine.
ALTER TABLE "P3FinanceAdjustment"
  ADD COLUMN IF NOT EXISTS "financeCategoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "financeScholarshipAwardId" TEXT;

ALTER TABLE "P3FinanceAdjustment"
  ADD CONSTRAINT "P3FinanceAdjustment_finance_category_fkey"
  FOREIGN KEY ("financeCategoryId","schoolId") REFERENCES "FinanceFeeCategory"("id","schoolId") ON DELETE RESTRICT;
ALTER TABLE "P3FinanceAdjustment"
  ADD CONSTRAINT "P3FinanceAdjustment_finance_award_fkey"
  FOREIGN KEY ("financeScholarshipAwardId","schoolId") REFERENCES "FinanceScholarshipAward"("id","schoolId") ON DELETE RESTRICT;
CREATE INDEX "P3FinanceAdjustment_finance_award_idx" ON "P3FinanceAdjustment"("schoolId","financeScholarshipAwardId");
