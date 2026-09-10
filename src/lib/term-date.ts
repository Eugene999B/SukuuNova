function dateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function schoolLocalDateKey(value: Date, timezone: string) {
  return dateParts(value, timezone);
}

export type TermLifecycleState = "upcoming" | "active" | "ended" | "locked";

export function termLifecycle(term: { startDate: Date; endDate: Date; isLocked?: boolean }, now = new Date(), timezone = "Africa/Accra") {
  const current = dateParts(now, timezone);
  const start = dateParts(term.startDate, "UTC");
  const end = dateParts(term.endDate, "UTC");
  const state: TermLifecycleState = term.isLocked ? "locked" : current < start ? "upcoming" : current > end ? "ended" : "active";
  const currentDay = Date.parse(current + "T00:00:00.000Z");
  const startDay = Date.parse(start + "T00:00:00.000Z");
  const endDay = Date.parse(end + "T00:00:00.000Z");
  return {
    state,
    currentDate: current,
    startDate: start,
    endDate: end,
    daysUntilStart: Math.max(0, Math.ceil((startDay - currentDay) / 86400000)),
    daysUntilEnd: Math.max(0, Math.ceil((endDay - currentDay) / 86400000)),
    endedDaysAgo: Math.max(0, Math.floor((currentDay - endDay) / 86400000)),
    shouldPromptLock: state === "ended",
    isWritable: state === "active",
  };
}

export function isTermActive(term: { startDate: Date; endDate: Date; isLocked?: boolean }, now = new Date(), timezone = "Africa/Accra") {
  return termLifecycle(term, now, timezone).state === "active";
}

function isCalendarActive(term: { startDate: Date; endDate: Date }, now: Date, timezone: string) {
  const current = dateParts(now, timezone);
  const start = dateParts(term.startDate, "UTC");
  const end = dateParts(term.endDate, "UTC");
  return current >= start && current <= end;
}

/**
 * Explicit IDs never fall back to another term. Automatic selection requires
 * exactly one calendar-active term. A locked active term is still returned so
 * read-only sheets preserve its metadata; mutation callers must enforce
 * termLifecycle(...).isWritable before changing academic records.
 */
export function selectAcademicTerm<T extends { id: string; startDate: Date; endDate: Date; isLocked?: boolean }>(
  terms: readonly T[], requestedId?: string, now = new Date(), timezone = "Africa/Accra",
): T | null {
  if (requestedId) return terms.find(term => term.id === requestedId) ?? null;
  const active = terms.filter(term => isCalendarActive(term, now, timezone));
  return active.length === 1 ? active[0] : null;
}
