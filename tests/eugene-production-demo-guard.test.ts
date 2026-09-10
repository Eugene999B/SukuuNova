import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve("scripts/seed-eugene-academy-production-demo.cjs");

function run(extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH || "",
      NODE_ENV: "test",
      ...extraEnv,
    },
  });
}

describe("Eugene Academy permanent production demo seed guard", () => {
  it("refuses to run without the exact production acknowledgement", () => {
    const result = run();
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED=EUGENE_ACADEMY_ONLY",
    );
  });

  it("refuses a Railway environment other than production before touching the database", () => {
    const result = run({
      ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED: "EUGENE_ACADEMY_ONLY",
      DATABASE_URL: "postgresql://example.invalid/sukuunova",
      EUGENE_ACADEMY_DEMO_PASSWORD: "SyntheticDemoPassword!2026",
      RAILWAY_ENVIRONMENT_NAME: "staging",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Expected 'production'");
  });

  it("requires a strong demo password before database access", () => {
    const result = run({
      ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED: "EUGENE_ACADEMY_ONLY",
      DATABASE_URL: "postgresql://example.invalid/sukuunova",
      EUGENE_ACADEMY_DEMO_PASSWORD: "short",
      RAILWAY_ENVIRONMENT_NAME: "production",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "EUGENE_ACADEMY_DEMO_PASSWORD must be at least 12 characters",
    );
  });
});
