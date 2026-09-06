export type TimetableDisplaySlot = {
  dayOfWeek: number;
  period: number;
  subject: string;
  teacher: string;
  className?: string;
  venue?: string | null;
  kind: "lesson" | "break";
};

export function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function getScheduleRange(start: string, end: string) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function buildGridKey(dayOfWeek: number, period: number) {
  return `${dayOfWeek}:${period}`;
}
