#!/usr/bin/env bash
set -euo pipefail

: "${UPGRADE_DATABASE_URL:?UPGRADE_DATABASE_URL is required}"

migration_root="prisma/migrations"
stash_dir="$(mktemp -d)"
later_migrations=(
  "20260911153500_finance_obligation_ledger"
  "20260911154000_finance_obligation_compat"
  "20260911154500_finance_projection_authority"
)

restore_migrations() {
  for name in "${later_migrations[@]}"; do
    if [ -d "${stash_dir}/${name}" ] && [ ! -e "${migration_root}/${name}" ]; then
      mv "${stash_dir}/${name}" "${migration_root}/${name}"
    fi
  done
  rm -rf "${stash_dir}"
}
trap restore_migrations EXIT

for name in "${later_migrations[@]}"; do
  mv "${migration_root}/${name}" "${stash_dir}/${name}"
done

# Build an authentic database at the exact pre-Release-C migration boundary.
DATABASE_URL="${UPGRADE_DATABASE_URL}" npx prisma migrate deploy

# Seed historical finance data that forces Release C to change totalAmount: a GHS 100
# invoice with an already-approved legacy GHS 20 discount. This reproduces Railway's
# production-only collision with the original Phase 1 invoice immutability trigger.
psql "${UPGRADE_DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
SELECT set_config('app.current_school_id', 'upgrade-school', false);
INSERT INTO "School" ("id","uniqueCode","name")
VALUES ('upgrade-school','upgrade-school','Upgrade Rehearsal School');
INSERT INTO "User" ("id","schoolId","name","email","passwordHash")
VALUES
  ('upgrade-requester','upgrade-school','Requester','requester@upgrade.invalid','not-a-real-password-hash'),
  ('upgrade-approver','upgrade-school','Approver','approver@upgrade.invalid','not-a-real-password-hash');
INSERT INTO "AcademicYear" ("id","schoolId","name","startDate","endDate")
VALUES ('upgrade-year','upgrade-school','2026/2027','2026-09-01','2027-07-31');
INSERT INTO "Term" ("id","schoolId","academicYearId","name","startDate","endDate")
VALUES ('upgrade-term','upgrade-school','upgrade-year','Term 1','2026-09-01','2026-12-15');
INSERT INTO "Student" ("id","schoolId","admissionNo","name","status")
VALUES ('upgrade-student','upgrade-school','UP-001','Upgrade Learner','active');
INSERT INTO "FeeItem" ("id","schoolId","name","amount","termId")
VALUES ('upgrade-fee','upgrade-school','Tuition',100,'upgrade-term');
INSERT INTO "Invoice" ("id","schoolId","studentId","termId","totalAmount","status")
VALUES ('upgrade-invoice','upgrade-school','upgrade-student','upgrade-term',100,'unpaid');
INSERT INTO "InvoiceLine" ("schoolId","invoiceId","feeItemId","amount")
VALUES ('upgrade-school','upgrade-invoice','upgrade-fee',100);
INSERT INTO "P3FinanceAdjustment"
  ("id","schoolId","studentId","invoiceId","kind","mode","value","reason","status","requestedBy","approvedBy","approvedAt")
VALUES
  ('upgrade-adjustment','upgrade-school','upgrade-student','upgrade-invoice','discount','fixed',20,'Legacy approved discount','approved','upgrade-requester','upgrade-approver',CURRENT_TIMESTAMP);
SQL

restore_migrations
trap - EXIT

# Prove the original production path fails for the same reason Railway reported.
set +e
DATABASE_URL="${UPGRADE_DATABASE_URL}" npx prisma migrate deploy
raw_status=$?
set -e
if [ "${raw_status}" -eq 0 ]; then
  echo "Expected raw Release C migration to fail against an adjusted historical invoice, but it succeeded." >&2
  exit 1
fi

# The guarded production deployer must recover the failed migration in one run.
DATABASE_URL="${UPGRADE_DATABASE_URL}" npm run db:migrate

# Certify that migration state, finance projection, invoice protection and tenant RLS all
# ended in the safe final state.
psql "${UPGRADE_DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  latest_finished BOOLEAN;
  protection_exists BOOLEAN;
  unsafe_rls_count INTEGER;
  projected RECORD;
BEGIN
  SELECT ("finished_at" IS NOT NULL AND "rolled_back_at" IS NULL)
    INTO latest_finished
    FROM "_prisma_migrations"
   WHERE "migration_name"='20260911153500_finance_obligation_ledger'
   ORDER BY "started_at" DESC
   LIMIT 1;
  IF latest_finished IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Release C migration was not recovered successfully';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname='Invoice_protected'
       AND tgrelid='"Invoice"'::regclass
       AND NOT tgisinternal
  ) INTO protection_exists;
  IF NOT protection_exists THEN
    RAISE EXCEPTION 'Invoice protection trigger was not restored';
  END IF;

  SELECT COUNT(*) INTO unsafe_rls_count
    FROM pg_class
   WHERE oid IN (
     '"Invoice"'::regclass,
     '"InvoiceLine"'::regclass,
     '"FeeItem"'::regclass,
     '"Enrollment"'::regclass,
     '"Payment"'::regclass,
     '"PaymentReversal"'::regclass,
     '"P3FinanceAdjustment"'::regclass
   )
     AND (NOT relrowsecurity OR NOT relforcerowsecurity);
  IF unsafe_rls_count <> 0 THEN
    RAISE EXCEPTION 'One or more finance tables lost ENABLE/FORCE RLS';
  END IF;

  PERFORM set_config('app.current_school_id', 'upgrade-school', true);
  SELECT "grossAmount","adjustmentAmount","totalAmount","status"
    INTO projected
    FROM "Invoice"
   WHERE "id"='upgrade-invoice' AND "schoolId"='upgrade-school';
  IF projected."grossAmount" <> 100
     OR projected."adjustmentAmount" <> 20
     OR projected."totalAmount" <> 80
     OR projected."status" <> 'unpaid' THEN
    RAISE EXCEPTION 'Recovered invoice projection is incorrect';
  END IF;
END;
$$;
SQL

echo "Release C migration recovery rehearsal passed."
