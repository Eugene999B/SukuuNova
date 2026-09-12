import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_ROOT = join(ROOT, "prisma", "migrations");
const OWNERSHIP_MIGRATION = "20260912190000_arcade_vnext_sessions";
const OWNED_TABLES = [
  "ArcadeGameSession",
  "ArcadeGameEvent",
  "ArcadeGameSnapshot",
  "ArcadeGameArtifact",
  "ArcadeGameAssessment",
] as const;

const prismaSchema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
const ownershipSql = readFileSync(
  join(MIGRATIONS_ROOT, OWNERSHIP_MIGRATION, "migration.sql"),
  "utf8",
);

function laterMigrationSql() {
  return readdirSync(MIGRATIONS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name > OWNERSHIP_MIGRATION)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      name: entry.name,
      sql: readFileSync(join(MIGRATIONS_ROOT, entry.name, "migration.sql"), "utf8"),
    }));
}

describe("Arcade vNext persistence ownership", () => {
  it("keeps the five raw-SQL-owned tables intentionally outside the Prisma datamodel", () => {
    for (const table of OWNED_TABLES) {
      expect(prismaSchema).not.toMatch(new RegExp(`\\bmodel\\s+${table}\\b`));
    }
  });

  it("creates every owned table with FORCE RLS in the ownership migration", () => {
    for (const table of OWNED_TABLES) {
      expect(ownershipSql).toContain(`CREATE TABLE "${table}"`);
      expect(ownershipSql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(ownershipSql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(ownershipSql).toMatch(
        new RegExp(`CREATE\\s+POLICY\\s+"[^"]+"\\s+ON\\s+"${table}"`, "i"),
      );
    }
  });

  it("requires an explicit contract change before later migrations can remove the tables or weaken RLS", () => {
    const violations: string[] = [];

    for (const migration of laterMigrationSql()) {
      for (const table of OWNED_TABLES) {
        const forbidden = [
          ["drop table", new RegExp(`DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?\\s+"${table}"`, "i")],
          ["rename table", new RegExp(`ALTER\\s+TABLE\\s+"${table}"[\\s\\S]*?\\bRENAME\\s+TO\\b`, "i")],
          ["disable RLS", new RegExp(`ALTER\\s+TABLE\\s+"${table}"\\s+DISABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i")],
          ["remove FORCE RLS", new RegExp(`ALTER\\s+TABLE\\s+"${table}"\\s+NO\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i")],
          ["drop tenant policy", new RegExp(`DROP\\s+POLICY[\\s\\S]*?\\s+ON\\s+"${table}"`, "i")],
        ] as const;

        for (const [rule, pattern] of forbidden) {
          if (pattern.test(migration.sql)) {
            violations.push(`${migration.name}: ${rule} on ${table}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
