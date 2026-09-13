import { describe, expect, it } from "vitest";
import {
  ACADEMIC_CALENDAR_PATTERNS,
  buildSchoolCalendarDays,
  getAcademicCalendarPattern,
  validateAcademicYearSessions,
  vacationWindows,
} from "../src/lib/academic-calendar-patterns";

describe("academic calendar patterns", () => {
  it("ships Ghana-friendly three terms without hardcoding every school to terms", () => {
    expect(ACADEMIC_CALENDAR_PATTERNS.map((item) => item.key)).toEqual([
      "three_terms",
      "two_semesters",
      "three_trimesters",
      "four_quarters",
      "custom",
    ]);
    const ghana = getAcademicCalendarPattern("three_terms");
    expect(ghana.labels).toEqual(["Term 1", "Term 2", "Term 3"]);
    expect(ghana.yearEndSequence).toBe(3);
    expect(getAcademicCalendarPattern("two_semesters").yearEndSequence).toBe(2);
  });

  it("requires exactly one explicit year-end session and rejects overlap", () => {
    expect(() => validateAcademicYearSessions({
      yearStart: "2026-09-01",
      yearEnd: "2027-07-31",
      sessions: [
        { name: "Term 1", sequence: 1, startDate: "2026-09-01", endDate: "2026-12-18", teachingWeeks: 13 },
        { name: "Term 2", sequence: 2, startDate: "2026-12-18", endDate: "2027-04-09", teachingWeeks: 13, isYearEnd: true },
      ],
    })).toThrow(/overlap/i);
    expect(() => validateAcademicYearSessions({
      yearStart: "2026-09-01",
      yearEnd: "2027-07-31",
      sessions: [
        { name: "Term 1", sequence: 1, startDate: "2026-09-01", endDate: "2026-12-18", teachingWeeks: 13 },
        { name: "Term 2", sequence: 2, startDate: "2027-01-11", endDate: "2027-04-09", teachingWeeks: 13 },
      ],
    })).toThrow(/exactly one/i);
  });
});

describe("school calendar materialization", () => {
  it("treats gaps between sessions as vacation instead of teaching time", () => {
    const days = buildSchoolCalendarDays({
      yearStart: "2026-12-17",
      yearEnd: "2027-01-12",
      sessions: [
        { name: "Term 1", startDate: "2026-12-17", endDate: "2026-12-18" },
        { name: "Term 2", startDate: "2027-01-11", endDate: "2027-01-12" },
      ],
    });
    expect(days.find((item) => item.date === "2026-12-19")?.dayType).toBe("vacation");
    expect(days.find((item) => item.date === "2027-01-10")?.dayType).toBe("vacation");
    expect(vacationWindows(days)).toEqual([{ startDate: "2026-12-19", endDate: "2027-01-10", days: 23 }]);
  });

  it("uses calendar events to turn an ordinary weekday into a non-instructional holiday", () => {
    const days = buildSchoolCalendarDays({
      yearStart: "2027-03-05",
      yearEnd: "2027-03-08",
      sessions: [{ name: "Term 2", startDate: "2027-03-05", endDate: "2027-03-08" }],
      events: [{ name: "Independence Day observed", type: "public_holiday", startDate: "2027-03-08", endDate: "2027-03-08" }],
    });
    expect(days.find((item) => item.date === "2027-03-08")).toMatchObject({ dayType: "public_holiday", isInstructional: false, label: "Independence Day observed" });
  });

  it("can turn a weekend into a make-up instructional day", () => {
    const days = buildSchoolCalendarDays({
      yearStart: "2027-02-06",
      yearEnd: "2027-02-06",
      sessions: [{ name: "Term 2", startDate: "2027-02-06", endDate: "2027-02-06" }],
      events: [{ name: "Recovery class", type: "makeup", startDate: "2027-02-06", endDate: "2027-02-06", affectsAttendance: false }],
    });
    expect(days[0]).toMatchObject({ dayType: "makeup", isInstructional: true, label: "Recovery class" });
  });
});
