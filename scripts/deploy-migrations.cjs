const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const FAILED_MIGRATION = "20260911153500_finance_obligation_ledger";
const RLS_TABLES = [
  "Invoice",
  "InvoiceLine",
  "FeeItem",
  "Enrollment",
  "Payment",
  "PaymentReversal",
  "P3FinanceAdjustment",
];

function runPrisma(args) {
  const result = spawnSync("npx", ["prisma", ...args], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

async function tableExists(client, table) {
  const rows = await client.$queryRawUnsafe(
    `SELECT to_regclass($1)::text AS "name"`,
    `public.${table}`
  );
  return Boolean(rows[0]?.name);
}

async function restoreRls(client) {
  for (const table of RLS_TABLES) {
    if (!(await tableExists(client, `"${table}"`))) continue;
    await client.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await client.$executeRawUnsafe(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
  }
}

async function ensureInvoiceProtection(client) {
  if (!(await tableExists(client, '"Invoice"'))) return;
  const functionRows = await client.$queryRawUnsafe(`
    SELECT to_regprocedure('sukuunova_protect_invoice()')::text AS "name"
  `);
  if (!functionRows[0]?.name) return;

  const rows = await client.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'Invoice_protected'
        AND tgrelid = '"Invoice"'::regclass
        AND NOT tgisinternal
    ) AS "exists"
  `);
  if (!rows[0]?.exists) {
    await client.$executeRawUnsafe(`
      CREATE TRIGGER "Invoice_protected"
      BEFORE UPDATE OR DELETE ON "Invoice"
      FOR EACH ROW EXECUTE FUNCTION sukuunova_protect_invoice()
    `);
  }
}

async function failedReleaseCMigration(client) {
  if (!(await tableExists(client, '"_prisma_migrations"'))) return false;
  const rows = await client.$queryRawUnsafe(`
    SELECT "migration_name"
    FROM "_prisma_migrations"
    WHERE "migration_name" = '${FAILED_MIGRATION}'
      AND "finished_at" IS NULL
      AND "rolled_back_at" IS NULL
    ORDER BY "started_at" DESC
    LIMIT 1
  `);
  return rows.length > 0;
}

async function restoreSafetyBoundaries(client) {
  await restoreRls(client);
  await ensureInvoiceProtection(client);
}

async function main() {
  const client = new PrismaClient();

  try {
    const recoveryMode = await failedReleaseCMigration(client);

    if (recoveryMode) {
      console.warn(`[db:migrate] Recovering failed ${FAILED_MIGRATION} safely.`);

      // The failed Release C migration disables RLS before invoice backfill. Restore the
      // tenant boundary immediately, then remove only the old Phase 1 trigger that blocks
      // the canonical Release C backfill.
      await restoreRls(client);
      await client.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "Invoice_protected" ON "Invoice"`);
      await client.$disconnect();

      runPrisma(["migrate", "resolve", "--rolled-back", FAILED_MIGRATION]);
    } else {
      await client.$disconnect();
    }

    runPrisma(["migrate", "deploy"]);

    const verifier = new PrismaClient();
    try {
      // Recovery temporarily removes the old trigger. The later Release C migration
      // upgrades sukuunova_protect_invoice(); attach protection again and FORCE RLS.
      await restoreSafetyBoundaries(verifier);

      if (await failedReleaseCMigration(verifier)) {
        throw new Error(`${FAILED_MIGRATION} is still recorded as failed after deployment.`);
      }
    } finally {
      await verifier.$disconnect();
    }
  } catch (error) {
    // Fail closed: if any recovery/deploy step aborts, make a best effort to restore both
    // FORCE RLS and invoice mutation protection before the pre-deploy container stops.
    const emergency = new PrismaClient();
    try {
      await restoreSafetyBoundaries(emergency);
    } catch (safetyError) {
      console.error("[db:migrate] CRITICAL: failed to restore database safety boundaries", safetyError);
    } finally {
      await emergency.$disconnect().catch(() => undefined);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("[db:migrate] Migration deployment failed", error);
  process.exit(1);
});
