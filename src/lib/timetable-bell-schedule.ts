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

function minutesTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
    const configuredStart = timeMinutes(item.start);
    const configuredEnd = timeMinutes(item.end);
    if (configuredEnd <= configuredStart) throw new AppError(`${item.name || "Break"} must end after it starts.`, 400, "INVALID_BREAK_TIME");

    // School-wide breaks can sit outside, or cross the edge of, a shortened day.
    // Treat the day boundary as authoritative instead of making the whole timetable unreadable.
    if (configuredEnd <= dayStart || configuredStart >= dayEnd) continue;
    const startMinutes = Math.max(configuredStart, dayStart);
    const endMinutes = Math.min(configuredEnd, dayEnd);
    if (endMinutes <= startMinutes) continue;
    visible.push({
      ...item,
      start: minutesTime(startMinutes),
      end: minutesTime(endMinutes),
      startMinutes,
      endMinutes,
    });
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
