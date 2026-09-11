import { AppError } from "./errors";
import { dayBlocks } from "./timetable-engine-v2";

type DayConfig = Parameters<typeof dayBlocks>[0];
type TimetableConfig = Parameters<typeof dayBlocks>[1];
type BreakConfig = TimetableConfig["breaks"][number];

function timeMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new AppError(`Invalid time: ${value}`, 400, "INVALID_TIME");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new AppError(`Invalid time: ${value}`, 400, "INVALID_TIME");
  return hour * 60 + minute;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && a.end > b.start;
}

export function breaksForTimetableDay(day: DayConfig, config: TimetableConfig): BreakConfig[] {
  const dayStart = timeMinutes(day.start);
  const dayEnd = timeMinutes(day.end);
  if (dayEnd <= dayStart) throw new AppError(`${day.name} must end after it starts.`, 400, "INVALID_DAY_HOURS");

  const visible: Array<BreakConfig & { startMinutes: number; endMinutes: number }> = [];
  for (const item of config.breaks ?? []) {
    const start = timeMinutes(item.start);
    const end = timeMinutes(item.end);
    if (end <= start) throw new AppError(`${item.name || "Break"} must end after it starts.`, 400, "INVALID_BREAK_TIME");

    // A school-wide break can legitimately sit outside a shortened day (for example Friday).
    // Ignore it for that day. If it crosses the day's boundary, require the school to fix it.
    if (end <= dayStart || start >= dayEnd) continue;
    if (start < dayStart || end > dayEnd) {
      throw new AppError(`${item.name || "Break"} partly falls outside ${day.name}'s school hours. Adjust the break or that day's hours.`, 400, "BREAK_CROSSES_DAY_BOUNDARY");
    }
    visible.push({ ...item, startMinutes: start, endMinutes: end });
  }

  visible.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  for (let index = 1; index < visible.length; index += 1) {
    const previous = visible[index - 1];
    const current = visible[index];
    if (overlaps(
      { start: previous.startMinutes, end: previous.endMinutes },
      { start: current.startMinutes, end: current.endMinutes },
    )) {
      throw new AppError(`Breaks overlap on ${day.name}.`, 400, "OVERLAPPING_BREAKS");
    }
  }

  return visible.map((item) => ({ name: item.name, start: item.start, end: item.end }));
}

export function safeDayBlocks(day: DayConfig, config: TimetableConfig) {
  return dayBlocks(day, { ...config, breaks: breaksForTimetableDay(day, config) });
}

export function validateTimetableBellSchedule(config: TimetableConfig) {
  const enabledDays = config.days.filter((day) => day.enabled);
  if (!enabledDays.length) throw new AppError("Enable at least one school day before saving the timetable setup.", 400, "NO_SCHOOL_DAYS");

  const seenDays = new Set<number>();
  for (const day of config.days) {
    if (seenDays.has(day.dayOfWeek)) throw new AppError(`Day ${day.dayOfWeek} is configured more than once.`, 400, "DUPLICATE_TIMETABLE_DAY");
    seenDays.add(day.dayOfWeek);
    if (!day.enabled) continue;

    const built = safeDayBlocks(day, config);
    if (!built.periods.length) {
      throw new AppError(`${day.name} has no usable teaching periods after breaks.`, 400, "NO_USABLE_PERIODS");
    }
    const periodNumbers = new Set<number>();
    for (const period of built.periods) {
      if (periodNumbers.has(period.period)) {
        throw new AppError(`${day.name} contains period ${period.period} more than once.`, 400, "DUPLICATE_PERIOD_NUMBER");
      }
      periodNumbers.add(period.period);
    }
  }

  return true;
}
