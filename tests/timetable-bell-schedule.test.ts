import { describe, expect, it } from "vitest";
import { breaksForTimetableDay, safeDayBlocks, validateTimetableBellSchedule } from "../src/lib/timetable-bell-schedule";

const base = {
  days: [
    { dayOfWeek: 1, name: "Monday", enabled: true, start: "08:00", end: "15:00" },
    { dayOfWeek: 5, name: "Friday", enabled: true, start: "08:00", end: "12:00" },
  ],
  periodMinutes: 40,
  periodsPerDay: 8,
  published: false,
  breaks: [
    { name: "Break", start: "10:00", end: "10:20" },
    { name: "Lunch", start: "12:20", end: "13:00" },
  ],
};

describe("timetable bell schedule safety", () => {
  it("ignores a school-wide break that is completely outside a shortened teaching day", () => {
    const friday = base.days[1];
    expect(breaksForTimetableDay(friday, base).map((item) => item.name)).toEqual(["Break"]);
    expect(() => safeDayBlocks(friday, base)).not.toThrow();
    expect(() => validateTimetableBellSchedule(base)).not.toThrow();
  });

  it("rejects a break that partly crosses the end of a teaching day", () => {
    const config = { ...base, breaks: [{ name: "Late break", start: "11:50", end: "12:10" }] };
    expect(() => safeDayBlocks(config.days[1], config)).toThrow(/partly falls outside Friday/i);
  });

  it("rejects overlapping breaks on an enabled day", () => {
    const config = {
      ...base,
      breaks: [
        { name: "Break one", start: "10:00", end: "10:30" },
        { name: "Break two", start: "10:20", end: "10:40" },
      ],
    };
    expect(() => validateTimetableBellSchedule(config)).toThrow(/overlap/i);
  });
});
