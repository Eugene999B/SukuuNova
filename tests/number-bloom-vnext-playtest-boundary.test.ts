import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "src", "app");
const PLAYTEST_COMPONENT = "NumberBloomVNextPlaytest";

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (/\.(?:ts|tsx|js|jsx)$/.test(entry)) files.push(path);
  }
  return files;
}

describe("Number Bloom greybox promotion boundary", () => {
  it("keeps the local playtest harness out of every app route", () => {
    const routed = sourceFiles(APP_ROOT).filter((path) =>
      readFileSync(path, "utf8").includes(PLAYTEST_COMPONENT),
    );
    expect(routed).toEqual([]);
  });

  it("keeps Number Bloom out of the production vNext adapter registry", () => {
    const registry = readFileSync(
      join(ROOT, "src", "lib", "arcade-vnext", "registry.ts"),
      "utf8",
    );
    expect(registry).not.toContain("number-bloom");
    expect(registry).not.toContain("numberBloomArcadeAdapter");
  });

  it("keeps the playtest harness client-local instead of wiring production sessions", () => {
    const harness = readFileSync(
      join(ROOT, "src", "components", "NumberBloomVNextPlaytest.tsx"),
      "utf8",
    );
    expect(harness).toContain('"use client"');
    expect(harness).not.toContain("session-service");
    expect(harness).not.toContain("guardian/arcade");
    expect(harness).not.toContain("fetch(");
  });
});
