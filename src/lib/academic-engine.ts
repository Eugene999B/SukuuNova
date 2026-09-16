import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { currentSchoolId } from "./tenant-context";
import { calculateSubjectResult, validateAssessmentRules, type AssessmentRules } from "./assessment-engine";

type PeriodConfig = { period: number; start: string; end: string };
type DayConfig = { dayOfWeek: number; name: string; enabled: boolean; start: string; end: string; periods?: PeriodConfig[] };
type BreakConfig = { name: string; start: string; end: string };
export type TimetableRoom = { id: string; name: string; type?: string };
export type TimetableConfig = {
  days: DayConfig[];
  periodMinutes: number;
  breaks: BreakConfig[];
  periodsPerDay: number;
  periods?: PeriodConfig[];
  published: boolean;
  weeklyPeriods?: Record<string, number>;
  rooms?: TimetableRoom[];
  teacherUnavailability?: Record<string, string[]>;
  roomRequirements?: Record<string, { roomType?: string; room?: string }>;
  doublePeriodSubjects?: Record<string, number>;
};
type AssessmentConfig = AssessmentRules;
type ReportCardConfig = {
  includePosition: boolean;
  includeSubjectPosition: boolean;
  includeAttendance: boolean;
  includeTeacherRemark: boolean;
  includeHeadRemark: boolean;
  includeSignatures: boolean;
  includeSchoolContacts: boolean;
  rankMethod: "total_average" | "weighted_total";
  showGrades: boolean;
  showClassAverage: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function normalizeTimetable(raw: unknown): TimetableConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_TIMETABLE)) as TimetableConfig;
  if (!isRecord(raw)) return base;
  const daysRaw = Array.isArray(raw.days) ? raw.days as unknown[] : [];
  const days: DayConfig[] = daysRaw.length
    ? daysRaw.filter(isRecord).map((d, i) => {
        const dayOfWeek = Number.isInteger(d.dayOfWeek) ? d.dayOfWeek as number : i + 1;
        return {
          dayOfWeek,
          name: asString(d.name, `Day ${dayOfWeek}`),
          enabled: typeof d.enabled === "boolean" ? d.enabled : true,
          start: /^\d{2}:\d{2}$/.test(String(d.start ?? "")) ? String(d.start) : "08:00",
          end: /^\d{2}:\d{2}$/.test(String(d.end ?? "")) ? String(d.end) : "15:00",
          periods: Array.isArray(d.periods) ? d.periods as PeriodConfig[] : undefined,
        };
      })
    : base.days;
  const breaksRaw = Array.isArray(raw.breaks) ? raw.breaks as unknown[] : [];
  const breaks: BreakConfig[] = breaksRaw.filter(isRecord).map((b) => ({
    name: asString(b.name, "Break"),
    start: /^\d{2}:\d{2}$/.test(String(b.start ?? "")) ? String(b.start) : "10:00",
    end: /^\d{2}:\d{2}$/.test(String(b.end ?? "")) ? String(b.end) : "10:20",
  }));
  const slotKey = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const match = /^([1-6]):([1-9]|1[0-6])$/.exec(value.trim());
    return match ? `${Number(match[1])}:${Number(match[2])}` : null;
  };
  const weeklyRaw = isRecord(raw.weeklyPeriods) ? raw.weeklyPeriods as Record<string, unknown> : {};
  const weeklyPeriods: Record<string, number> = {};
  for (const [key, value] of Object.entries(weeklyRaw)) {
    if (typeof value === "number" && Number.isFinite(value)) weeklyPeriods[key] = Math.max(1, Math.min(10, Math.round(value)));
  }
  const roomsRaw = Array.isArray(raw.rooms) ? raw.rooms as unknown[] : [];
  const rooms: TimetableRoom[] = roomsRaw.filter(isRecord).map((room) => ({
    id: String(room.id ?? "").slice(0, 60),
    name: asString(room.name, "Room"),
    type: typeof room.type === "string" ? String(room.type).slice(0, 60) : undefined,
  })).filter((room) => room.id && room.name);
  const unavailabilityRaw = isRecord(raw.teacherUnavailability) ? raw.teacherUnavailability as Record<string, unknown> : {};
  const teacherUnavailability: Record<string, string[]> = {};
  for (const [teacherId, slots] of Object.entries(unavailabilityRaw)) {
    if (!Array.isArray(slots)) continue;
    const clean = [...new Set(slots.map(slotKey).filter((slot): slot is string => slot !== null))].slice(0, 96);
    if (clean.length) teacherUnavailability[teacherId.slice(0, 100)] = clean;
  }
  const requirementsRaw = isRecord(raw.roomRequirements) ? raw.roomRequirements as Record<string, unknown> : {};
  const roomRequirements: Record<string, { roomType?: string; room?: string }> = {};
  for (const [key, value] of Object.entries(requirementsRaw)) {
    if (!isRecord(value)) continue;
    const entry: { roomType?: string; room?: string } = {};
    if (typeof value.roomType === "string" && value.roomType.trim()) entry.roomType = value.roomType.trim().slice(0, 60);
    if (typeof value.room === "string" && value.room.trim()) entry.room = value.room.trim().slice(0, 60);
    if (entry.roomType || entry.room) roomRequirements[key.slice(0, 160)] = entry;
  }
  const doubleRaw = isRecord(raw.doublePeriodSubjects) ? raw.doublePeriodSubjects as Record<string, unknown> : {};
  const doublePeriodSubjects: Record<string, number> = {};
  for (const [key, value] of Object.entries(doubleRaw)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) doublePeriodSubjects[key.slice(0, 100)] = Math.min(5, Math.floor(value));
  }
  return {
    days,
    periodMinutes: asNumber(raw.periodMinutes, base.periodMinutes),
    breaks,
    periodsPerDay: asNumber(raw.periodsPerDay, base.periodsPerDay),
    periods: Array.isArray(raw.periods) ? raw.periods as PeriodConfig[] : base.periods,
    published: typeof raw.published === "boolean" ? raw.published : false,
    weeklyPeriods: Object.keys(weeklyPeriods).length ? weeklyPeriods : undefined,
    rooms: rooms.length ? rooms : undefined,
    teacherUnavailability: Object.keys(teacherUnavailability).length ? teacherUnavailability : undefined,
    roomRequirements: Object.keys(roomRequirements).length ? roomRequirements : undefined,
    doublePeriodSubjects: Object.keys(doublePeriodSubjects).length ? doublePeriodSubjects : undefined,
  };
}

const DEFAULT_TIMETABLE: TimetableConfig = {
  days: [1, 2, 3, 4, 5].map((day) => ({ dayOfWeek: day, name: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][day], enabled: true, start: "08:00", end: day === 5 ? "14:00" : "15:00" })),
  periodMinutes: 40,
  breaks: [{ name: "Break", start: "10:00", end: "10:20" }, { name: "Lunch", start: "12:20", end: "13:00" }],
  periodsPerDay: 8,
  published: false,
};
const DEFAULT_ASSESSMENT: AssessmentConfig = {
  categories: [{ name: "Classwork", weight: 20 }, { name: "Homework", weight: 10 }, { name: "Exercises", weight: 10 }, { name: "Quizzes", weight: 10 }, { name: "Project", weight: 10 }, { name: "Exam", weight: 40 }],
  rounding: "nearest",
  missingScorePolicy: "blank",
  allowTeacherOverride: false,
};
const DEFAULT_REPORT: ReportCardConfig = {
  includePosition: true,
  includeSubjectPosition: true,
  includeAttendance: true,
  includeTeacherRemark: true,
  includeHeadRemark: true,
  includeSignatures: true,
  includeSchoolContacts: true,
  rankMethod: "total_average",
  showGrades: true,
  showClassAverage: true,
};

function asTimeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) throw new AppError("Time must use HH:MM.", 400, "INVALID_TIME");
  return hours * 60 + minutes;
}
function fmt(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && a.end > b.start;
}
function buildPeriods(day: DayConfig, config: TimetableConfig) {
  const explicit = Array.isArray(day.periods) && day.periods.length ? day.periods : config.periods;
  if (Array.isArray(explicit) && explicit.length) {
    const dayStart = asTimeMinutes(day.start);
    const dayEnd = asTimeMinutes(day.end);
    const normalized = explicit.slice(0, Math.max(1, Math.min(16, config.periodsPerDay))).map((period, index) => ({ period: Number(period.period) || index + 1, start: String(period.start), end: String(period.end) }));
    return normalized.filter((period) => asTimeMinutes(period.end) > asTimeMinutes(period.start) && asTimeMinutes(period.start) >= dayStart && asTimeMinutes(period.end) <= dayEnd);
  }
  const start = asTimeMinutes(day.start);
  const end = asTimeMinutes(day.end);
  const breaks = config.breaks.map((item) => ({ start: asTimeMinutes(item.start), end: asTimeMinutes(item.end), name: item.name })).sort((a, b) => a.start - b.start);
  const periods: PeriodConfig[] = [];
  let cursor = start;
  let period = 1;
  while (cursor + config.periodMinutes <= end && period <= config.periodsPerDay) {
    const next = cursor + config.periodMinutes;
    const crossing = breaks.find((item) => overlaps({ start: cursor, end: next }, item));
    if (crossing) {
      cursor = Math.max(cursor, crossing.end);
      continue;
    }
    periods.push({ period, start: fmt(cursor), end: fmt(next) });
    cursor = next;
    period += 1;
  }
  return periods;
}
export function getDayPeriods(day: DayConfig, config: TimetableConfig) {
  return buildPeriods(day, config);
}
function parse<T>(value: unknown, fallback: T): T {
  return value == null ? fallback : value as T;
}

export async function getAcademicEngineConfig(tx: TenantDb, schoolIdInput?: string) {
  const schoolId = schoolIdInput ?? currentSchoolId();
  const row = schoolId ? await tx.schoolSettings.findUnique({
    where: { schoolId },
    select: { timetableConfig: true, assessmentConfig: true, reportCardConfig: true, gradeCaWeight: true, gradeExamWeight: true },
  }) : null;
  const storedAssessment = parse(row?.assessmentConfig, DEFAULT_ASSESSMENT);
  const assessment: AssessmentConfig = row ? {
    ...storedAssessment,
    caWeight: Number(row.gradeCaWeight),
    examWeight: Number(row.gradeExamWeight),
  } : storedAssessment;
  return {
    timetable: normalizeTimetable(row?.timetableConfig as unknown),
    assessment,
    reportCard: parse(row?.reportCardConfig, DEFAULT_REPORT),
  };
}

export async function saveAcademicEngineConfig(tx: TenantDb, input: { schoolId: string; actorId: string; timetable?: TimetableConfig; assessment?: AssessmentConfig; reportCard?: ReportCardConfig }) {
  await requirePermission(tx, input.actorId, "settings:manage_school");
  const current = await getAcademicEngineConfig(tx, input.schoolId);
  // CA/Exam weights belong to the reporting policy columns and must not be
  // overwritten by the legacy Academic Setup category editor.
  const incomingAssessment = input.assessment ? { ...input.assessment, caWeight: current.assessment.caWeight, examWeight: current.assessment.examWeight } : current.assessment;
  const next = { timetable: input.timetable ?? current.timetable, assessment: incomingAssessment, reportCard: input.reportCard ?? current.reportCard };
  validateAssessmentRules(next.assessment as AssessmentConfig);
  const timetable = normalizeTimetable(next.timetable);
  const roomIds = new Set((timetable.rooms ?? []).map((room) => room.id));
  if (roomIds.size !== (timetable.rooms ?? []).length) throw new AppError("Room ids must be unique.", 400, "DUPLICATE_ROOM");
  for (const [teacherId, slots] of Object.entries(timetable.teacherUnavailability ?? {})) {
    if (!teacherId) throw new AppError("Teacher availability entries need a teacher.", 400, "INVALID_UNAVAILABILITY");
    for (const slot of slots) if (!/^[1-6]:([1-9]|1[0-6])$/.test(slot)) throw new AppError(`Invalid unavailable slot "${slot}". Use day:period, e.g. 2:4.`, 400, "INVALID_UNAVAILABILITY");
  }
  for (const requirement of Object.values(timetable.roomRequirements ?? {})) {
    if (requirement.room && !roomIds.has(requirement.room)) throw new AppError(`Room rule names unknown room "${requirement.room}".`, 400, "ROOM_NOT_FOUND");
  }
  for (const day of timetable.days) {
    const periods = getDayPeriods(day, timetable);
    if (periods.length === 0 && day.enabled) throw new AppError(`${day.name} has no valid lesson time blocks.`, 400, "NO_TIMETABLE_PERIODS");
    for (const period of periods) if (asTimeMinutes(period.end) <= asTimeMinutes(period.start)) throw new AppError(`Period ${period.period} has an invalid time range.`, 400, "INVALID_PERIOD_TIME");
    for (let index = 1; index < periods.length; index += 1) if (asTimeMinutes(periods[index].start) < asTimeMinutes(periods[index - 1].end)) throw new AppError(`${day.name} lesson time blocks overlap.`, 400, "OVERLAPPING_PERIODS");
  }
  // Persist only the JSON assessment fields. Top-level CA/Exam weights stay in
  // gradeCaWeight/gradeExamWeight and are changed from Report Card Setup.
  const { caWeight: _caWeight, examWeight: _examWeight, ...assessmentJson } = next.assessment;
  await tx.schoolSettings.upsert({
    where: { schoolId: input.schoolId },
    update: {
      timetableConfig: timetable as unknown as Prisma.InputJsonValue,
      assessmentConfig: assessmentJson as unknown as Prisma.InputJsonValue,
      reportCardConfig: next.reportCard as unknown as Prisma.InputJsonValue,
    },
    create: {
      schoolId: input.schoolId,
      timetableConfig: timetable as unknown as Prisma.InputJsonValue,
      assessmentConfig: assessmentJson as unknown as Prisma.InputJsonValue,
      reportCardConfig: next.reportCard as unknown as Prisma.InputJsonValue,
    },
  });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic.configuration_updated", entityType: "SchoolSettings", entityId: input.schoolId, after: { ...next, timetable } });
  return { ...next, timetable };
}

export async function getGradebookConfiguration(tx: TenantDb) {
  const config = await getAcademicEngineConfig(tx);
  const assignments = await tx.classSubjectTeacher.findMany({
    include: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } }, teacher: { select: { id: true, name: true } } },
    orderBy: { classId: "asc" },
  });
  const terms = await tx.term.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true } });
  return { assessment: config.assessment, reportCard: config.reportCard, assignments, terms };
}

export async function getClassSubjectPerformance(tx: TenantDb, classId: string, subjectId: string, termId: string) {
  const [students, assessments] = await Promise.all([
    tx.student.findMany({ where: { classId, status: "active" }, select: { id: true, name: true, admissionNo: true }, orderBy: { name: "asc" } }),
    tx.assessment.findMany({
      where: { classId, subjectId, termId },
      select: { id: true, name: true, type: true, maxScore: true, weight: true, scores: { select: { id: true, studentId: true, value: true, status: true, enteredAt: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const config = (await getAcademicEngineConfig(tx)).assessment as AssessmentConfig;
  const rows = students.map((student) => {
    const studentAssessments = assessments.map((assessment) => {
      const hit = assessment.scores.find((score) => score.studentId === student.id);
      return { id: assessment.id, name: assessment.name, type: assessment.type, maxScore: assessment.maxScore, weight: assessment.weight, score: hit?.value ?? null, status: hit?.status ?? null };
    });
    const result = calculateSubjectResult(studentAssessments, config);
    return {
      student,
      total: result.total,
      scores: result.details.map((detail) => {
        const score = assessments.find((assessment) => assessment.id === detail.assessmentId)?.scores.find((item) => item.studentId === student.id);
        return { ...detail, expected: score ? { id: score.id, value: Number(score.value), status: score.status, enteredAt: score.enteredAt.toISOString() } : null };
      }),
    };
  });
  return {
    rows,
    assessments: assessments.map((assessment) => ({ id: assessment.id, name: assessment.name, type: assessment.type, maxScore: Number(assessment.maxScore), weight: Number(assessment.weight) })),
    config,
  };
}
