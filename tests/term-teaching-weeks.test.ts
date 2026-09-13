import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTeachingWeekRanges, maxTeachingWeeksForRange } from "../src/lib/term-teaching-weeks";

const migration = readFileSync(new URL("../prisma/migrations/20260913081500_term_weeks/migration.sql", import.meta.url), "utf8");
const termsRoute = readFileSync(new URL("../src/app/api/school/terms/route.ts", import.meta.url), "utf8");
const termDetailRoute = readFileSync(new URL("../src/app/api/school/terms/[id]/route.ts", import.meta.url), "utf8");
const teacherRoute = readFileSync(new URL("../src/app/api/school/teacher-academic-workspace/route.ts", import.meta.url), "utf8");

describe("first-class teaching weeks", () => {
  it("materializes contiguous week ranges and gives the final week the remaining term days", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-03-31T00:00:00.000Z");
    const weeks = buildTeachingWeekRanges(start, end, 13);

    expect(weeks).toHaveLength(13);
    expect(weeks[0]).toMatchObject({ weekNumber: 1, startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2026-01-07T00:00:00.000Z") });
    expect(weeks[1]).toMatchObject({ weekNumber: 2, startDate: new Date("2026-01-08T00:00:00.000Z"), endDate: new Date("2026-01-14T00:00:00.000Z") });
    expect(weeks[12]).toMatchObject({ weekNumber: 13, startDate: new Date("2026-03-26T00:00:00.000Z"), endDate: end });
  });

  it("rejects a teaching-week count that cannot physically start inside the term", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-01-14T00:00:00.000Z");
    expect(maxTeachingWeeksForRange(start, end)).toBe(2);
    expect(() => buildTeachingWeekRanges(start, end, 3)).toThrow(/at most 2 teaching weeks/i);
  });

  it("creates a tenant-scoped calendar table and backfills existing terms", () => {
    expect(migration).toContain('CREATE TABLE "TermWeek"');
    expect(migration).toContain('PRIMARY KEY ("termId", "weekNumber")');
    expect(migration).toContain('REFERENCES "Term"("id", "schoolId")');
    expect(migration).toContain('ALTER TABLE "TermWeek" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY "term_week_tenant"');
    expect(migration).toContain('generate_series(1, n."effectiveWeeks")');
  });

  it("keeps term counts and durable week rows in the same transaction", () => {
    expect(termsRoute).toContain("assertTeachingWeeksFitTerm(input.startDate, input.endDate, input.teachingWeeks)");
    expect(termsRoute).toContain("await syncTermWeeks(tx");
    expect(termDetailRoute).toContain("assertTeachingWeeksFitTerm(input.startDate, input.endDate, nextWeeks)");
    expect(termDetailRoute).toContain("await syncTermWeeks(tx");
    expect(termDetailRoute).toContain("weeks: termWeeks");
  });

  it("rejects teacher work whose date does not belong to its selected week", () => {
    expect(teacherRoute).toContain("assertTeachingWeekDate");
    expect(teacherRoute.match(/await assertTeachingWeekDate\(/g)?.length).toBe(2);
    expect(teacherRoute).toContain("getTermWeeks(tx, session.schoolId, termId)");
  });
});
