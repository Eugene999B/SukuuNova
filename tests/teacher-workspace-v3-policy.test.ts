import { describe, expect, it } from "vitest";
import { assertAcademicWorkWindowOpen } from "../src/lib/academic-work-window";
import { selectAcademicTerm, termLifecycle } from "../src/lib/term-date";
import { schoolWorkspaceRedirect, teacherWorkspaceRedirect } from "../src/lib/workspace-boundary";

const date = (value: string) => new Date(`${value}T12:00:00.000Z`);
function codeOf(action: () => void) {
  try { action(); return null; }
  catch (error) { return error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN"; }
}

describe("Teacher Workspace V3 policy", () => {
  it("hard-routes pure teacher identities away from the school administration universe", () => {
    expect(schoolWorkspaceRedirect("teacher")).toBe("/teacher");
    expect(schoolWorkspaceRedirect("school")).toBeNull();
    expect(teacherWorkspaceRedirect("teacher", true)).toBeNull();
    expect(teacherWorkspaceRedirect("school", true)).toBe("/dashboard");
    expect(teacherWorkspaceRedirect("teacher", false)).toBe("/dashboard");
  });

  it("drives a term through upcoming, active, ended and locked states from dates", () => {
    const term = { startDate: date("2026-09-01"), endDate: date("2026-12-18"), isLocked: false };
    expect(termLifecycle(term, date("2026-08-31"), "Africa/Accra").state).toBe("upcoming");
    expect(termLifecycle(term, date("2026-09-10"), "Africa/Accra")).toMatchObject({ state: "active", isWritable: true, shouldPromptLock: false });
    expect(termLifecycle(term, date("2026-12-19"), "Africa/Accra")).toMatchObject({ state: "ended", isWritable: false, shouldPromptLock: true });
    expect(termLifecycle({ ...term, isLocked: true }, date("2026-09-10"), "Africa/Accra")).toMatchObject({ state: "locked", isWritable: false });
  });

  it("automatically selects exactly one active unlocked term and never guesses between overlaps", () => {
    const terms = [
      { id: "old", startDate: date("2026-01-01"), endDate: date("2026-04-01"), isLocked: true },
      { id: "current", startDate: date("2026-09-01"), endDate: date("2026-12-18"), isLocked: false },
      { id: "future", startDate: date("2027-01-10"), endDate: date("2027-04-30"), isLocked: false },
    ];
    expect(selectAcademicTerm(terms, undefined, date("2026-09-10"), "Africa/Accra")?.id).toBe("current");
    expect(selectAcademicTerm(terms, "old", date("2026-09-10"), "Africa/Accra")?.id).toBe("old");
    expect(selectAcademicTerm([...terms, { id: "overlap", startDate: date("2026-09-05"), endDate: date("2026-10-01"), isLocked: false }], undefined, date("2026-09-10"), "Africa/Accra")).toBeNull();
  });

  it("blocks learner work before opening time and at or after closing time", () => {
    const opensAt = new Date("2026-09-10T08:00:00.000Z");
    const dueAt = new Date("2026-09-10T09:00:00.000Z");
    const work = { status: "published", opensAt, dueAt };
    expect(codeOf(() => assertAcademicWorkWindowOpen(work, new Date("2026-09-10T07:59:59.000Z")))).toBe("WORK_NOT_OPEN");
    expect(() => assertAcademicWorkWindowOpen(work, new Date("2026-09-10T08:30:00.000Z"))).not.toThrow();
    expect(codeOf(() => assertAcademicWorkWindowOpen(work, dueAt))).toBe("WORK_EXPIRED");
    expect(codeOf(() => assertAcademicWorkWindowOpen({ ...work, status: "draft" }, new Date("2026-09-10T08:30:00.000Z")))).toBe("WORK_NOT_PUBLISHED");
  });
});
