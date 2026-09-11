import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Release D legacy writer retirement", () => {
  it("retires the legacy MVP learner writer in favor of canonical onboarding", () => {
    const route = source("src/app/api/mvp/setup/route.ts");
    expect(route).toContain("LEGACY_STUDENT_WRITER_RETIRED");
    expect(route).not.toContain("registerStudent({...common,...input})");
  });

  it("keeps legacy Phase 3 assets read-only and routes finance decisions through Release C", () => {
    const route = source("src/app/api/phase3/[module]/route.ts");
    expect(route).toContain("LEGACY_ASSET_WRITER_RETIRED");
    expect(route).toContain("requestFinanceAdjustment");
    expect(route).toContain("decideFinanceAdjustment");
    expect(route).toContain("readBoundedJson");
    expect(route).not.toContain("await request.json()");
  });

  it("protects all persisted timetable writers at the database boundary", () => {
    const migration = source("prisma/migrations/20260911164000_system_integrity_release_d_guards/migration.sql");
    expect(migration).toContain("sukuunova_guard_timetable_collision");
    expect(migration).toContain("TimetableSlot_collision_guard");
    expect(migration).toContain('t."teacherId" = NEW."teacherId"');
    expect(migration).toContain("normalized_venue");
  });
});
