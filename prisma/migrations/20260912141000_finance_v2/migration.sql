-- SukuuNova Finance V2
-- Additive accounting structures around the existing Invoice / Payment ledger.

CREATE TABLE "FinanceFeeCategory" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "required" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceFeeCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceFeeCategory_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinanceFeeCategory_kind_check" CHECK ("kind" IN ('tuition','transport','canteen','boarding','books','exam','pta','activity','uniform','technology','other'))
);
CREATE UNIQUE INDEX "FinanceFeeCategory_id_school_key" ON "FinanceFeeCategory"("id","schoolId");
CREATE UNIQUE INDEX "FinanceFeeCategory_school_code_key" ON "FinanceFeeCategory"("schoolId","code");
CREATE INDEX "FinanceFeeCategory_school_active_idx" ON "FinanceFeeCategory"("schoolId","active","sortOrder");

CREATE TABLE "FinanceFeeStructure" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "publishedAt" TIMESTAMP(3),
  "publishedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceFeeStructure_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceFeeStructure_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinanceFeeStructure_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceFeeStructure_class_fkey" FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceFeeStructure_creator_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceFeeStructure_publisher_fkey" FOREIGN KEY ("publishedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceFeeStructure_status_check" CHECK ("status" IN ('draft','published','archived')),
  CONSTRAINT "FinanceFeeStructure_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "FinanceFeeStructure_id_school_key" ON "FinanceFeeStructure"("id","schoolId");
CREATE UNIQUE INDEX "FinanceFeeStructure_school_term_class_version_key" ON "FinanceFeeStructure"("schoolId","termId","classId","version");
CREATE INDEX "FinanceFeeStructure_school_status_idx" ON "FinanceFeeStructure"("schoolId","status","termId","classId");

CREATE TABLE "FinanceFeeStructureLine" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "structureId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "label" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "dueDate" DATE,
  "optional" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "FinanceFeeStructureLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceFeeStructureLine_structure_fkey" FOREIGN KEY ("structureId","schoolId") REFERENCES "FinanceFeeStructure"("id","schoolId") ON DELETE CASCADE,
  CONSTRAINT "FinanceFeeStructureLine_category_fkey" FOREIGN KEY ("categoryId","schoolId") REFERENCES "FinanceFeeCategory"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceFeeStructureLine_amount_check" CHECK ("amount" >= 0)
);
CREATE UNIQUE INDEX "FinanceFeeStructureLine_id_school_key" ON "FinanceFeeStructureLine"("id","schoolId");
CREATE UNIQUE INDEX "FinanceFeeStructureLine_structure_category_key" ON "FinanceFeeStructureLine"("structureId","categoryId");
CREATE INDEX "FinanceFeeStructureLine_school_idx" ON "FinanceFeeStructureLine"("schoolId","structureId","sortOrder");

CREATE TABLE "FinanceStudentCharge" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "structureId" TEXT NOT NULL,
  "structureLineId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "feeItemId" TEXT NOT NULL,
  "originalAmount" DECIMAL(14,2) NOT NULL,
  "scholarshipAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(14,2) NOT NULL,
  "dueDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceStudentCharge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStudentCharge_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceStudentCharge_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceStudentCharge_structure_fkey" FOREIGN KEY ("structureId","schoolId") REFERENCES "FinanceFeeStructure"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceStudentCharge_line_fkey" FOREIGN KEY ("structureLineId","schoolId") REFERENCES "FinanceFeeStructureLine"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceStudentCharge_category_fkey" FOREIGN KEY ("categoryId","schoolId") REFERENCES "FinanceFeeCategory"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceStudentCharge_invoice_fkey" FOREIGN KEY ("invoiceId","schoolId") REFERENCES "Invoice"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceStudentCharge_fee_item_fkey" FOREIGN KEY ("feeItemId","schoolId") REFERENCES "FeeItem"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceStudentCharge_amount_check" CHECK ("originalAmount" >= 0 AND "scholarshipAmount" >= 0 AND "netAmount" >= 0 AND "netAmount" <= "originalAmount"),
  CONSTRAINT "FinanceStudentCharge_status_check" CHECK ("status" IN ('open','partial','paid','waived','cancelled'))
);
CREATE UNIQUE INDEX "FinanceStudentCharge_id_school_key" ON "FinanceStudentCharge"("id","schoolId");
CREATE UNIQUE INDEX "FinanceStudentCharge_student_line_key" ON "FinanceStudentCharge"("schoolId","studentId","structureLineId");
CREATE INDEX "FinanceStudentCharge_student_term_idx" ON "FinanceStudentCharge"("schoolId","studentId","termId","status");
CREATE INDEX "FinanceStudentCharge_invoice_idx" ON "FinanceStudentCharge"("schoolId","invoiceId");

CREATE TABLE "FinancePaymentAllocation" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "chargeId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancePaymentAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePaymentAllocation_payment_fkey" FOREIGN KEY ("paymentId","schoolId") REFERENCES "Payment"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinancePaymentAllocation_charge_fkey" FOREIGN KEY ("chargeId","schoolId") REFERENCES "FinanceStudentCharge"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinancePaymentAllocation_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "FinancePaymentAllocation_id_school_key" ON "FinancePaymentAllocation"("id","schoolId");
CREATE UNIQUE INDEX "FinancePaymentAllocation_payment_charge_key" ON "FinancePaymentAllocation"("paymentId","chargeId");
CREATE INDEX "FinancePaymentAllocation_charge_idx" ON "FinancePaymentAllocation"("schoolId","chargeId");

CREATE TABLE "FinanceScholarshipProgram" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sponsor" TEXT,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceScholarshipProgram_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceScholarshipProgram_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinanceScholarshipProgram_creator_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceScholarshipProgram_status_check" CHECK ("status" IN ('active','inactive','archived'))
);
CREATE UNIQUE INDEX "FinanceScholarshipProgram_id_school_key" ON "FinanceScholarshipProgram"("id","schoolId");
CREATE UNIQUE INDEX "FinanceScholarshipProgram_school_name_key" ON "FinanceScholarshipProgram"("schoolId","name");

CREATE TABLE "FinanceScholarshipAward" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "categoryId" TEXT,
  "mode" TEXT NOT NULL,
  "value" DECIMAL(14,2) NOT NULL,
  "capAmount" DECIMAL(14,2),
  "status" TEXT NOT NULL DEFAULT 'active',
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  CONSTRAINT "FinanceScholarshipAward_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceScholarshipAward_program_fkey" FOREIGN KEY ("programId","schoolId") REFERENCES "FinanceScholarshipProgram"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceScholarshipAward_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceScholarshipAward_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceScholarshipAward_category_fkey" FOREIGN KEY ("categoryId","schoolId") REFERENCES "FinanceFeeCategory"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceScholarshipAward_creator_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceScholarshipAward_revoker_fkey" FOREIGN KEY ("revokedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceScholarshipAward_mode_check" CHECK ("mode" IN ('percentage','fixed')),
  CONSTRAINT "FinanceScholarshipAward_value_check" CHECK ("value" > 0 AND ("mode" <> 'percentage' OR "value" <= 100) AND ("capAmount" IS NULL OR "capAmount" >= 0)),
  CONSTRAINT "FinanceScholarshipAward_status_check" CHECK ("status" IN ('active','revoked','expired'))
);
CREATE UNIQUE INDEX "FinanceScholarshipAward_id_school_key" ON "FinanceScholarshipAward"("id","schoolId");
CREATE INDEX "FinanceScholarshipAward_student_term_idx" ON "FinanceScholarshipAward"("schoolId","studentId","termId","status");

CREATE TABLE "FinanceExpense" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "expenseDate" DATE NOT NULL,
  "category" TEXT NOT NULL,
  "vendor" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "reference" TEXT,
  "description" TEXT,
  "evidenceUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'recorded',
  "enteredBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "reversedBy" TEXT,
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceExpense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceExpense_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinanceExpense_entered_by_fkey" FOREIGN KEY ("enteredBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceExpense_approved_by_fkey" FOREIGN KEY ("approvedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceExpense_reversed_by_fkey" FOREIGN KEY ("reversedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT,
  CONSTRAINT "FinanceExpense_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "FinanceExpense_status_check" CHECK ("status" IN ('recorded','approved','reversed'))
);
CREATE UNIQUE INDEX "FinanceExpense_id_school_key" ON "FinanceExpense"("id","schoolId");
CREATE INDEX "FinanceExpense_school_date_idx" ON "FinanceExpense"("schoolId","expenseDate","status");
CREATE INDEX "FinanceExpense_school_category_idx" ON "FinanceExpense"("schoolId","category","expenseDate");

CREATE TABLE "PayrollSalaryComponent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "salaryStructureId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "componentType" TEXT NOT NULL,
  "calculationType" TEXT NOT NULL DEFAULT 'fixed',
  "value" DECIMAL(14,2) NOT NULL,
  "taxable" BOOLEAN NOT NULL DEFAULT false,
  "pensionable" BOOLEAN NOT NULL DEFAULT false,
  "employerOnly" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollSalaryComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollSalaryComponent_structure_fkey" FOREIGN KEY ("salaryStructureId","schoolId") REFERENCES "SalaryStructure"("id","schoolId") ON DELETE CASCADE,
  CONSTRAINT "PayrollSalaryComponent_type_check" CHECK ("componentType" IN ('earning','allowance','benefit','deduction','tax','employer_contribution')),
  CONSTRAINT "PayrollSalaryComponent_calc_check" CHECK ("calculationType" IN ('fixed','percentage')),
  CONSTRAINT "PayrollSalaryComponent_value_check" CHECK ("value" >= 0)
);
CREATE UNIQUE INDEX "PayrollSalaryComponent_id_school_key" ON "PayrollSalaryComponent"("id","schoolId");
CREATE INDEX "PayrollSalaryComponent_structure_idx" ON "PayrollSalaryComponent"("schoolId","salaryStructureId","sortOrder");

ALTER TABLE "SalaryStructure"
  ADD COLUMN IF NOT EXISTS "effectiveFrom" DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_status_v2_check" CHECK ("status" IN ('active','inactive'));

ALTER TABLE "PayrollRun"
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_created_by_v2_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approved_by_v2_fkey" FOREIGN KEY ("approvedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT;

ALTER TABLE "Payslip"
  ADD COLUMN IF NOT EXISTS "componentSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "earningsTotal" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "deductionsTotal" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "taxTotal" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "employerContributionTotal" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentReference" TEXT,
  ADD COLUMN IF NOT EXISTS "markedPaidBy" TEXT;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_status_v2_check" CHECK ("status" IN ('draft','processed','paid'));
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_marked_paid_by_v2_fkey" FOREIGN KEY ("markedPaidBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT;

-- New capability keys. Existing role grants are applied below so live schools do not
-- lose expected access while still allowing custom overrides.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('perm_fin_fee_struct_v2','finance:fee_structures_manage','Create, revise and publish class fee structures'),
  ('perm_fin_scholar_v2','finance:scholarships_manage','Create and manage scholarships and fee relief'),
  ('perm_fin_expense_write_v2','finance:expenses_write','Record school purchases and operating expenses'),
  ('perm_fin_expense_approve_v2','finance:expenses_approve','Approve or reverse recorded school expenses'),
  ('perm_fin_export_v2','finance:export','Export finance reports and transaction histories'),
  ('perm_payroll_view_all_v2','payroll:view_all','View school-wide payroll and staff salary results'),
  ('perm_payroll_salary_v2','payroll:salary_manage','Create and maintain staff salary structures'),
  ('perm_payroll_run_v2','payroll:run','Create and process monthly payroll runs'),
  ('perm_payroll_paid_v2','payroll:mark_paid','Mark payroll runs or payslips paid')
ON CONFLICT ("key") DO NOTHING;

-- Owners / Administrators / Principals receive the full Finance V2 operating set.
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" IN ('Owner','Administrator','Principal')
  AND p."key" IN ('finance:fee_structures_manage','finance:scholarships_manage','finance:expenses_write','finance:expenses_approve','finance:export','payroll:view_all','payroll:salary_manage','payroll:run','payroll:mark_paid')
ON CONFLICT DO NOTHING;

-- Accountants run operational finance/payroll but cannot silently redesign salaries,
-- grant scholarships or approve their own expenses by default.
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name"='Accountant'
  AND p."key" IN ('finance:fee_structures_manage','finance:expenses_write','finance:export','payroll:view_all','payroll:run','payroll:mark_paid')
ON CONFLICT DO NOTHING;

-- HR can maintain salary structures and prepare payroll; payment confirmation remains
-- with Accounts/leadership unless explicitly overridden.
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name"='HR Officer'
  AND p."key" IN ('payroll:view_all','payroll:salary_manage','payroll:run')
ON CONFLICT DO NOTHING;

-- Forced tenant isolation for every new school-owned Finance V2 table.
ALTER TABLE "FinanceFeeCategory" ENABLE ROW LEVEL SECURITY; ALTER TABLE "FinanceFeeCategory" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FinanceFeeStructure" ENABLE ROW LEVEL SECURITY; ALTER TABLE "FinanceFeeStructure" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FinanceFeeStructureLine" ENABLE ROW LEVEL SECURITY; ALTER TABLE "FinanceFeeStructureLine" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FinanceStudentCharge" ENABLE ROW LEVEL SECURITY; ALTER TABLE "FinanceStudentCharge" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FinancePaymentAllocation" ENABLE ROW LEVEL SECURITY; ALTER TABLE "FinancePaymentAllocation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FinanceScholarshipProgram" ENABLE ROW LEVEL SECURITY; ALTER TABLE "FinanceScholarshipProgram" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FinanceScholarshipAward" ENABLE ROW LEVEL SECURITY; ALTER TABLE "FinanceScholarshipAward" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FinanceExpense" ENABLE ROW LEVEL SECURITY; ALTER TABLE "FinanceExpense" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PayrollSalaryComponent" ENABLE ROW LEVEL SECURITY; ALTER TABLE "PayrollSalaryComponent" FORCE ROW LEVEL SECURITY;

CREATE POLICY "FinanceFeeCategory_tenant" ON "FinanceFeeCategory" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
CREATE POLICY "FinanceFeeStructure_tenant" ON "FinanceFeeStructure" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
CREATE POLICY "FinanceFeeStructureLine_tenant" ON "FinanceFeeStructureLine" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
CREATE POLICY "FinanceStudentCharge_tenant" ON "FinanceStudentCharge" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
CREATE POLICY "FinancePaymentAllocation_tenant" ON "FinancePaymentAllocation" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
CREATE POLICY "FinanceScholarshipProgram_tenant" ON "FinanceScholarshipProgram" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
CREATE POLICY "FinanceScholarshipAward_tenant" ON "FinanceScholarshipAward" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
CREATE POLICY "FinanceExpense_tenant" ON "FinanceExpense" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
CREATE POLICY "PayrollSalaryComponent_tenant" ON "PayrollSalaryComponent" USING ("schoolId" = current_setting('app.current_school_id', true)) WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));