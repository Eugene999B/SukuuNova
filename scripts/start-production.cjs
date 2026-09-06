const { PrismaClient } = require("@prisma/client");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROLE = "sukuunova_app";
const ROLE_SECRET_ENV = "SCHOOL_AUTH_SECRET";

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function buildAppDatabaseUrl(adminUrl, password) {
  const url = new URL(adminUrl);
  url.username = ROLE;
  url.password = password;
  return url.toString();
}

async function ensureAppRole() {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("DATABASE_URL is required in production.");

  const secret = process.env[ROLE_SECRET_ENV];
  if (!secret) throw new Error(`${ROLE_SECRET_ENV} is required to derive the application DB password.`);

  const adminDb = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const roles = await adminDb.$queryRawUnsafe(
      'SELECT current_user AS "currentUser", rolbypassrls AS "bypass", rolsuper AS "superuser" FROM pg_roles WHERE rolname = current_user'
    );
    const current = roles[0];
    if (!current) throw new Error("Unable to inspect the current PostgreSQL role.");

    if (!current.superuser && !current.bypass) {
      return { databaseUrl: adminUrl, changedRole: false };
    }

    const password = crypto.createHash("sha256").update(`${secret}|${ROLE}|${adminUrl}`).digest("hex");
    const roleIdent = quoteIdent(ROLE);
    const roleLiteral = password.replaceAll("'", "''");
    const currentIdent = quoteIdent(current.currentUser);

    await adminDb.$executeRawUnsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
           CREATE ROLE ${roleIdent} LOGIN PASSWORD '${roleLiteral}';
         ELSE
           ALTER ROLE ${roleIdent} LOGIN PASSWORD '${roleLiteral}';
         END IF;
       END $$;`
    );

    await adminDb.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${quoteIdent(new URL(adminUrl).pathname.replace(/^\//, ""))} TO ${roleIdent};`);
    await adminDb.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${roleIdent};`);
    await adminDb.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${roleIdent};`);
    await adminDb.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${roleIdent};`);
    await adminDb.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ${roleIdent};`);
    await adminDb.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${currentIdent} IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${roleIdent};`);
    await adminDb.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${currentIdent} IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${roleIdent};`);
    await adminDb.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${currentIdent} IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO ${roleIdent};`);

    return { databaseUrl: buildAppDatabaseUrl(adminUrl, password), changedRole: true };
  } finally {
    await adminDb.$disconnect();
  }
}

async function main() {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("scripts/start-production.cjs is production-only.");
  }

  const result = await ensureAppRole();
  const childEnv = { ...process.env, DATABASE_URL: result.databaseUrl };

  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", process.env.PORT || "3000", "--hostname", "0.0.0.0"], {
    env: childEnv,
    stdio: "inherit",
  });

  const shutdown = (signal) => {
    next.kill(signal);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  next.on("exit", (code, signal) => {
    process.exit(signal ? 1 : code ?? 1);
  });

  console.log(`[production-db] application role ${ROLE} ${result.changedRole ? "provisioned/updated" : "already safe"}`);
}

main().catch((error) => {
  console.error("[production-start] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
