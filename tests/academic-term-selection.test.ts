import { describe, expect, it } from "vitest";
import { selectAcademicTerm } from "../src/lib/term-date";

const term = (id: string, start: string, end: string, isLocked = false) => ({ id, name: id, startDate: new Date(start), endDate: new Date(end), isLocked });
const current = term("current", "2026-09-01", "2026-12-20");
const future = term("future", "2027-01-01", "2027-04-01");
const past = term("past", "2026-01-01", "2026-04-01", true);
const now = new Date("2026-09-09T12:00:00Z");

describe("safe gradebook academic term selection", () => {
  it("selects the active term even when a future term is listed first", () => {
    expect(selectAcademicTerm([future, current, past], undefined, now)).toBe(current);
  });
  it("honors an explicitly selected historical or future term", () => {
    expect(selectAcademicTerm([future, current, past], past.id, now)).toBe(past);
    expect(selectAcademicTerm([future, current, past], future.id, now)).toBe(future);
  });
  it("does not fall back when an explicit term is invalid or belongs to another school", () => {
    expect(selectAcademicTerm([current], "other-school-term", now)).toBeNull();
    expect(selectAcademicTerm([current], "deleted-term", now)).toBeNull();
  });
  it("requires explicit selection when active terms overlap", () => {
    const overlapping = term("overlap", "2026-09-05", "2026-09-20");
    expect(selectAcademicTerm([current, overlapping], undefined, now)).toBeNull();
    expect(selectAcademicTerm([current, overlapping], overlapping.id, now)).toBe(overlapping);
  });
  it("returns no default during calendar gaps or when no terms exist", () => {
    expect(selectAcademicTerm([future, past], undefined, now)).toBeNull();
    expect(selectAcademicTerm([], undefined, now)).toBeNull();
  });
  it("uses the school local day at the start and end boundaries", () => {
    const oneDay = term("one-day", "2026-09-09", "2026-09-09");
    expect(selectAcademicTerm([oneDay], undefined, new Date("2026-09-08T12:00:00Z"), "Pacific/Kiritimati")).toBe(oneDay);
    expect(selectAcademicTerm([oneDay], undefined, new Date("2026-09-09T23:00:00Z"), "Pacific/Kiritimati")).toBeNull();
    expect(selectAcademicTerm([oneDay], undefined, new Date("2026-09-10T02:00:00Z"), "America/Los_Angeles")).toBe(oneDay);
  });
  it("preserves locked-term metadata for read-only sheets", () => {
    const locked = { ...current, isLocked: true };
    expect(selectAcademicTerm([locked], undefined, now)).toBe(locked);
    expect(selectAcademicTerm([locked], locked.id, now)?.isLocked).toBe(true);
  });
});
