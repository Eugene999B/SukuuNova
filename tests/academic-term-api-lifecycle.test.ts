import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const termsRoute = readFileSync(new URL("../src/app/api/school/terms/route.ts", import.meta.url), "utf8");
const termDetailRoute = readFileSync(new URL("../src/app/api/school/terms/[id]/route.ts", import.meta.url), "utf8");

describe("academic term API lifecycle", () => {
  it("derives list and detail lifecycle from the school timezone helper", () => {
    expect(termsRoute).toContain('import { termLifecycle } from "@/lib/term-date"');
    expect(termDetailRoute).toContain('import { termLifecycle } from "@/lib/term-date"');
    expect(termsRoute).toContain('settings?.timezone || "Africa/Accra"');
    expect(termDetailRoute).toContain('settings?.timezone || "Africa/Accra"');
    expect(termDetailRoute).not.toContain("new Date() > term.endDate");
    expect(termDetailRoute).not.toContain("new Date() > result.term.endDate");
  });

  it("does not silently rewrite an existing academic year when adding a term", () => {
    expect(termsRoute).toContain("ACADEMIC_YEAR_DATES_MISMATCH");
    expect(termsRoute).toContain("existingYear ?? await tx.academicYear.create");
    expect(termsRoute).not.toContain("academicYear.upsert");
  });

  it("treats academic years and terms as inclusive date ranges at the API boundary", () => {
    expect(termsRoute).toContain("ACADEMIC_YEAR_OVERLAP");
    expect(termsRoute).toContain("startDate: { lte: input.academicYearEnd }");
    expect(termsRoute).toContain("endDate: { gte: input.academicYearStart }");
    expect(termsRoute).toContain("startDate: { lte: input.endDate }");
    expect(termsRoute).toContain("endDate: { gte: input.startDate }");
    expect(termDetailRoute).toContain("startDate: { lte: input.endDate }");
    expect(termDetailRoute).toContain("endDate: { gte: input.startDate }");
    expect(termsRoute).not.toContain("startDate: { lt: input.endDate }");
    expect(termsRoute).not.toContain("endDate: { gt: input.startDate }");
    expect(termDetailRoute).not.toContain("startDate: { lt: input.endDate }");
    expect(termDetailRoute).not.toContain("endDate: { gt: input.startDate }");
  });
});
