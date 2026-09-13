import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "../src/lib/db";
import { resolveYearEndAuthority } from "../src/lib/academic-session-authority";
import { OFFICIAL_REPORT_CARD_STYLES } from "../src/lib/official-report-card-styles";
import { createTenantFixture } from "./helpers";

async function createThreeTermYear(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const year = await tx.academicYear.create({
      data: {
        schoolId,
        name: `Report V2 ${createId()}`,
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2027-07-31T00:00:00.000Z"),
      },
    });
    const term1 = await tx.term.create({
      data: { schoolId, academicYearId: year.id, name: "Term 1", startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-12-18T00:00:00.000Z") },
    });
    const term2 = await tx.term.create({
      data: { schoolId, academicYearId: year.id, name: "Term 2", startDate: new Date("2027-01-11T00:00:00.000Z"), endDate: new Date("2027-04-09T00:00:00.000Z") },
    });
    const term3 = await tx.term.create({
      data: { schoolId, academicYearId: year.id, name: "Term 3", startDate: new Date("2027-05-03T00:00:00.000Z"), endDate: new Date("2027-07-23T00:00:00.000Z") },
    });
    return { year, term1, term2, term3 };
  });
}

describe("Report Card V2 year-end authority", () => {
  it("keeps the legacy final-term number only as a compatibility bridge", async () => {
    const fixture = await createTenantFixture();
    const { term2, term3 } = await createThreeTermYear(fixture.schoolId);

    const second = await withTenant(fixture.schoolId, (tx) => resolveYearEndAuthority(tx, {
      schoolId: fixture.schoolId,
      termId: term2.id,
      legacyFinalTermNumber: 3,
    }));
    const third = await withTenant(fixture.schoolId, (tx) => resolveYearEndAuthority(tx, {
      schoolId: fixture.schoolId,
      termId: term3.id,
      legacyFinalTermNumber: 3,
    }));

    expect(second.source).toBe("legacy_term_number");
    expect(second.isYearEnd).toBe(false);
    expect(third.source).toBe("legacy_term_number");
    expect(third.isYearEnd).toBe(true);
  });

  it("uses the configured academic-calendar year-end instead of a term-name or term-number assumption", async () => {
    const fixture = await createTenantFixture();
    const { year, term1, term2, term3 } = await createThreeTermYear(fixture.schoolId);

    await withTenant(fixture.schoolId, async (tx) => {
      const planId = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "AcademicYearPlan" ("id","schoolId","academicYearId","patternKey","status","createdBy") VALUES ($1,$2,$3,'three_terms','active',$4)`,
        planId, fixture.schoolId, year.id, fixture.ownerId,
      );
      for (const [sequence, term] of [term1, term2, term3].entries()) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "AcademicSessionPolicy" ("id","schoolId","academicYearPlanId","academicYearId","termId","sequence","sessionKind","isYearEnd","closingStatus") VALUES ($1,$2,$3,$4,$5,$6,'term',$7,'open')`,
          createId(), fixture.schoolId, planId, year.id, term.id, sequence + 1, term.id === term2.id,
        );
      }
    });

    const configured = await withTenant(fixture.schoolId, (tx) => resolveYearEndAuthority(tx, {
      schoolId: fixture.schoolId,
      termId: term2.id,
      legacyFinalTermNumber: 3,
    }));
    const oldThirdTermAssumption = await withTenant(fixture.schoolId, (tx) => resolveYearEndAuthority(tx, {
      schoolId: fixture.schoolId,
      termId: term3.id,
      legacyFinalTermNumber: 3,
    }));

    expect(configured.source).toBe("academic_calendar");
    expect(configured.isYearEnd).toBe(true);
    expect(oldThirdTermAssumption.source).toBe("academic_calendar");
    expect(oldThirdTermAssumption.isYearEnd).toBe(false);
  });
});

describe("Report Card V2 print safety", () => {
  it("keeps the footer in normal document flow and repeats the results header across printed pages", () => {
    expect(OFFICIAL_REPORT_CARD_STYLES).not.toContain("position:fixed");
    expect(OFFICIAL_REPORT_CARD_STYLES).toContain(".rc-results thead{display:table-header-group}");
    expect(OFFICIAL_REPORT_CARD_STYLES).toContain(".rc-results tr{break-inside:avoid;page-break-inside:avoid}");
    expect(OFFICIAL_REPORT_CARD_STYLES).toContain(".rc-footer{position:static");
  });
});
