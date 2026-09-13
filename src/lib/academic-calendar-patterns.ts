export type AcademicCalendarPatternKey = "three_terms" | "two_semesters" | "three_trimesters" | "four_quarters" | "custom";
export type AcademicSessionKind = "term" | "semester" | "trimester" | "quarter" | "custom";
export type SchoolCalendarDayType = "instructional" | "weekend" | "vacation" | "public_holiday" | "mid_term_break" | "staff_only" | "exam" | "closure" | "makeup" | "special";

export type AcademicCalendarPattern = {
  key: AcademicCalendarPatternKey;
  name: string;
  description: string;
  sessionKind: AcademicSessionKind;
  labels: string[];
  yearEndSequence: number | null;
};

export type AcademicSessionDraft = {
  name: string;
  sequence: number;
  startDate: string | Date;
  endDate: string | Date;
  teachingWeeks: number;
  isYearEnd?: boolean;
};

export type CalendarDayDraft = {
  date: string;
  dayType: SchoolCalendarDayType;
  label: string | null;
  isInstructional: boolean;
  affectsAttendance: boolean;
  affectsTransport: boolean;
};

export const ACADEMIC_CALENDAR_PATTERNS: AcademicCalendarPattern[] = [
  {
    key: "three_terms",
    name: "3 Terms",
    description: "Ghana-standard three-term year with the third term as year-end by default.",
    sessionKind: "term",
    labels: ["Term 1", "Term 2", "Term 3"],
    yearEndSequence: 3,
  },
  {
    key: "two_semesters",
    name: "2 Semesters",
    description: "Two-semester academic year; the second semester is year-end by default.",
    sessionKind: "semester",
    labels: ["Semester 1", "Semester 2"],
    yearEndSequence: 2,
  },
  {
    key: "three_trimesters",
    name: "3 Trimesters",
    description: "Three-trimester academic year; the third trimester is year-end by default.",
    sessionKind: "trimester",
    labels: ["Trimester 1", "Trimester 2", "Trimester 3"],
    yearEndSequence: 3,
  },
  {
    key: "four_quarters",
    name: "4 Quarters",
    description: "Four-quarter academic year; the fourth quarter is year-end by default.",
    sessionKind: "quarter",
    labels: ["Quarter 1", "Quarter 2", "Quarter 3", "Quarter 4"],
    yearEndSequence: 4,
  },
  {
    key: "custom",
    name: "Custom",
    description: "School-defined sessions, dates and year-end session.",
    sessionKind: "custom",
    labels: [],
    yearEndSequence: null,
  },
];

export function getAcademicCalendarPattern(key: AcademicCalendarPatternKey) {
  const pattern = ACADEMIC_CALENDAR_PATTERNS.find((item) => item.key === key);
  if (!pattern) throw new Error(`Unknown academic calendar pattern: ${key}`);
  return pattern;
}

function dateKey(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid academic calendar date: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

function dayNumber(value: string | Date) {
  return Date.parse(`${dateKey(value)}T00:00:00.000Z`);
}

export function validateAcademicYearSessions(input: {
  yearStart: string | Date;
  yearEnd: string | Date;
  sessions: AcademicSessionDraft[];
}) {
  const yearStart = dayNumber(input.yearStart);
  const yearEnd = dayNumber(input.yearEnd);
  if (yearEnd < yearStart) throw new Error("Academic year end must be on or after its start date.");
  if (!input.sessions.length) throw new Error("Create at least one academic session.");
  const sequences = new Set<number>();
  let previousEnd = -Infinity;
  let yearEndCount = 0;
  for (const session of [...input.sessions].sort((a, b) => a.sequence - b.sequence)) {
    if (!session.name.trim()) throw new Error("Every academic session needs a name.");
    if (!Number.isInteger(session.sequence) || session.sequence <= 0) throw new Error("Academic session sequence must be a positive whole number.");
    if (sequences.has(session.sequence)) throw new Error("Academic session sequences must be unique.");
    sequences.add(session.sequence);
    if (!Number.isInteger(session.teachingWeeks) || session.teachingWeeks <= 0 || session.teachingWeeks > 30) throw new Error("Teaching weeks must be between 1 and 30.");
    const start = dayNumber(session.startDate);
    const end = dayNumber(session.endDate);
    if (end < start) throw new Error(`${session.name} ends before it starts.`);
    if (start < yearStart || end > yearEnd) throw new Error(`${session.name} must sit inside the academic year.`);
    if (start <= previousEnd) throw new Error(`${session.name} overlaps the previous academic session.`);
    previousEnd = end;
    if (session.isYearEnd) yearEndCount += 1;
  }
  if (yearEndCount !== 1) throw new Error("Exactly one academic session must be marked as the year-end/promotion session.");
  return true;
}

function addDay(date: Date) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function eventType(value: string): SchoolCalendarDayType {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["public_holiday", "holiday"].includes(normalized)) return "public_holiday";
  if (["mid_term_break", "midterm_break", "midterm"].includes(normalized)) return "mid_term_break";
  if (["staff_only", "staff_day", "inset"].includes(normalized)) return "staff_only";
  if (["exam", "examination", "exam_day"].includes(normalized)) return "exam";
  if (["closure", "school_closure", "closed"].includes(normalized)) return "closure";
  if (["makeup", "make_up", "makeup_day"].includes(normalized)) return "makeup";
  if (normalized === "vacation") return "vacation";
  return "special";
}

export function buildSchoolCalendarDays(input: {
  yearStart: string | Date;
  yearEnd: string | Date;
  sessions: Array<{ name: string; startDate: string | Date; endDate: string | Date }>;
  events?: Array<{ name: string; type: string; startDate: string | Date; endDate: string | Date; affectsAttendance?: boolean; affectsTransport?: boolean }>;
}) {
  const start = new Date(`${dateKey(input.yearStart)}T00:00:00.000Z`);
  const end = new Date(`${dateKey(input.yearEnd)}T00:00:00.000Z`);
  const sessions = input.sessions.map((session) => ({ ...session, start: dayNumber(session.startDate), end: dayNumber(session.endDate) }));
  const events = (input.events ?? []).map((event) => ({ ...event, start: dayNumber(event.startDate), end: dayNumber(event.endDate) }));
  const days: CalendarDayDraft[] = [];
  for (let cursor = start; cursor <= end; cursor = addDay(cursor)) {
    const date = cursor.toISOString().slice(0, 10);
    const stamp = cursor.getTime();
    const session = sessions.find((item) => stamp >= item.start && stamp <= item.end);
    const event = events.find((item) => stamp >= item.start && stamp <= item.end);
    let dayType: SchoolCalendarDayType;
    let label: string | null = null;
    let isInstructional = false;
    let affectsAttendance = true;
    let affectsTransport = false;
    if (!session) {
      dayType = "vacation";
      label = "Vacation";
    } else if (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
      dayType = "weekend";
      label = "Weekend";
    } else {
      dayType = "instructional";
      label = session.name;
      isInstructional = true;
    }
    if (event) {
      dayType = eventType(event.type);
      label = event.name;
      isInstructional = dayType === "makeup" || dayType === "exam";
      affectsAttendance = event.affectsAttendance ?? !isInstructional;
      affectsTransport = event.affectsTransport ?? false;
    }
    days.push({ date, dayType, label, isInstructional, affectsAttendance, affectsTransport });
  }
  return days;
}

export function vacationWindows(days: CalendarDayDraft[]) {
  const windows: Array<{ startDate: string; endDate: string; days: number }> = [];
  let active: { startDate: string; endDate: string; days: number } | null = null;
  for (const day of days) {
    if (day.dayType === "vacation") {
      if (!active) active = { startDate: day.date, endDate: day.date, days: 1 };
      else { active.endDate = day.date; active.days += 1; }
    } else if (active) {
      windows.push(active);
      active = null;
    }
  }
  if (active) windows.push(active);
  return windows;
}
