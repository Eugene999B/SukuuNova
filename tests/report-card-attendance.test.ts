import type { TenantDb } from "../src/lib/db";
import { describe, expect, it, vi } from "vitest";
import { expectedSchoolDays, reportAttendanceForTerm } from "../src/lib/report-card-attendance";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("report-card expected school days", () => {
  it("counts Monday to Friday and excludes Saturday and Sunday", () => {
    expect(expectedSchoolDays(day("2026-09-07"), day("2026-09-13"))).toBe(5);
  });

  it("subtracts attendance-blocking school calendar holidays", () => {
    expect(expectedSchoolDays(day("2026-09-07"), day("2026-09-13"), [
      { startDate: day("2026-09-09"), endDate: day("2026-09-09") },
    ])).toBe(4);
  });

  it("subtracts only school days inside a multi-day closure", () => {
    expect(expectedSchoolDays(day("2026-09-07"), day("2026-09-14"), [
      { startDate: day("2026-09-11"), endDate: day("2026-09-14") },
    ])).toBe(4);
  });

  it("does not double-subtract overlapping calendar events", () => {
    expect(expectedSchoolDays(day("2026-09-07"), day("2026-09-11"), [
      { startDate: day("2026-09-08"), endDate: day("2026-09-10") },
      { startDate: day("2026-09-09"), endDate: day("2026-09-11") },
    ])).toBe(1);
  });
});

it("does not count future term dates as absences on an interim report",async()=>{
 const attendance=vi.fn(async()=>[{attendanceDate:day("2026-09-07"),isLate:false}]);
 const tx={attendanceEvent:{findMany:attendance},calendarEvent:{findMany:vi.fn(async()=>[])}} as unknown as TenantDb;
 const result=await reportAttendanceForTerm(tx,{schoolId:"s",studentId:"learner",startDate:day("2026-09-07"),endDate:day("2026-12-18"),asOf:day("2026-09-09")});
 expect(result.expectedDays).toBe(3);
 expect(result.absent).toBe(2);

});
