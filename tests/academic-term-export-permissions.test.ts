import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const exportRoute = readFileSync(new URL("../src/app/api/school/terms/[id]/export/route.ts", import.meta.url), "utf8");
const termRoute = readFileSync(new URL("../src/app/api/school/terms/[id]/route.ts", import.meta.url), "utf8");

describe("academic term export permissions", () => {
  it("requires a category-specific permission instead of one broad report permission", () => {
    expect(exportRoute).toContain('academic: "reports:generate"');
    expect(exportRoute).toContain('lesson_plans: "lesson_plans:review"');
    expect(exportRoute).toContain('attendance: "exports:attendance"');
    expect(exportRoute).toContain('finance: "exports:finance"');
    expect(exportRoute).toContain("categoryPermission[category]");
  });

  it("does not calculate term finance readiness for roles without finance read access", () => {
    expect(termRoute).toContain('hasPermission(tx, session.userId, "finance:read")');
    expect(termRoute).toContain("if (canViewFinance)");
    expect(termRoute).toContain("finance,");
  });

  it("audits exports and protects CSV cells from spreadsheet formulas", () => {
    expect(exportRoute).toContain('action: "academic.term_exported"');
    expect(exportRoute).toContain("/^[=+\\-@]/");
  });
});
