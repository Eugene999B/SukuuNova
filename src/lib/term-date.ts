function dateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function schoolLocalDateKey(value: Date, timezone: string) {
  return dateParts(value, timezone);
}

export function isTermActive(term: { startDate: Date; endDate: Date }, now = new Date(), timezone = "Africa/Accra") {
  const current = dateParts(now, timezone);
  const start = dateParts(term.startDate, "UTC");
  const end = dateParts(term.endDate, "UTC");
  return current >= start && current <= end;
}
