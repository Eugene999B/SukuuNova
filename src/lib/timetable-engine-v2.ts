import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { getAcademicEngineConfig, type TimetableRoom } from "./academic-engine";

type PeriodConfig = { period: number; start: string; end: string };
type DayConfig = { dayOfWeek: number; name: string; enabled: boolean; start: string; end: string; periods?: PeriodConfig[] };
type BreakConfig = { name: string; start: string; end: string };
type TimetableConfig = {
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
type LessonPeriod = { period: number; start: number; end: number };

export type TimetableGenerationMode = "fill_gaps" | "rebuild" | "rebuild_preserving_locked";
export type TimetableGenerationInput = {
  schoolId: string;
  actorId: string;
  mode?: TimetableGenerationMode;
  dryRun?: boolean;
  lockedSlotIds?: string[];
  classIds?: string[];
  /** Backwards-compatible bridge for callers that have not moved to mode yet. */
  replaceExisting?: boolean;
};

function minutes(value: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new AppError(`Invalid time: ${value}`, 400, "INVALID_TIME");
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new AppError(`Invalid time: ${value}`, 400, "INVALID_TIME");
  return h * 60 + min;
}
function clock(value: number) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) { return a.start < b.end && a.end > b.start; }

export function dayBlocks(day: DayConfig, config: TimetableConfig) {
  const start = minutes(day.start);
  const end = minutes(day.end);
  const breaks = config.breaks.map((b) => ({ name: b.name.trim(), start: minutes(b.start), end: minutes(b.end) })).filter((b) => b.end > b.start).sort((a, b) => a.start - b.start);
  for (let i = 1; i < breaks.length; i += 1) if (overlaps(breaks[i - 1], breaks[i])) throw new AppError(`Breaks overlap on ${day.name}.`, 400, "OVERLAPPING_BREAKS");
  for (const b of breaks) if (b.start < start || b.end > end) throw new AppError(`${b.name} falls outside ${day.name}'s school hours.`, 400, "BREAK_OUTSIDE_DAY");
  const explicit = Array.isArray(day.periods) && day.periods.length ? day.periods : config.periods;
  const periods: LessonPeriod[] = [];
  if (Array.isArray(explicit) && explicit.length) {
    for (const p of explicit.slice(0, Math.max(1, Math.min(16, config.periodsPerDay)))) {
      const ps = minutes(p.start);
      const pe = minutes(p.end);
      if (ps < start || pe > end || pe <= ps) continue;
      if (breaks.some((b) => overlaps({ start: ps, end: pe }, b))) throw new AppError(`${day.name} period ${p.period} overlaps a break or lunch.`, 400, "PERIOD_OVERLAPS_BREAK");
      periods.push({ period: Number(p.period), start: ps, end: pe });
    }
  } else {
    let cursor = start;
    let period = 1;
    while (period <= config.periodsPerDay) {
      const next = cursor + config.periodMinutes;
      const crossing = breaks.find((b) => overlaps({ start: cursor, end: next }, b));
      if (crossing) { cursor = crossing.end; continue; }
      if (next > end) break;
      periods.push({ period, start: cursor, end: next });
      cursor = next;
      period += 1;
    }
  }
  periods.sort((a, b) => a.start - b.start || a.period - b.period);
  for (let i = 1; i < periods.length; i += 1) if (overlaps(periods[i - 1], periods[i])) throw new AppError(`${day.name} lesson time blocks overlap.`, 400, "OVERLAPPING_PERIODS");
  const blocks: Array<{ kind: "lesson" | "break"; period?: number; name: string; start: string; end: string }> = [];
  const events = [
    ...breaks.map((b) => ({ kind: "break" as const, start: b.start, end: b.end, name: b.name })),
    ...periods.map((p) => ({ kind: "lesson" as const, start: p.start, end: p.end, name: `Period ${p.period}`, period: p.period })),
  ].sort((a, b) => a.start - b.start || (a.kind === "break" ? 1 : -1));
  for (const event of events) blocks.push({ kind: event.kind, period: "period" in event ? event.period : undefined, name: event.name, start: clock(event.start), end: clock(event.end) });
  return { periods, breaks, blocks };
}
function mapNumber(value: Prisma.JsonValue | undefined) { return typeof value === "number" ? value : undefined; }

type Constraints = {
  weekly: Record<string, number>;
  unavailable: Set<string>;
  roomReq: Record<string, { roomType?: string; room?: string }>;
  doubles: Record<string, number>;
  rooms: TimetableRoom[];
  roomsById: Map<string, TimetableRoom>;
  roomsByType: Map<string, TimetableRoom[]>;
};

function readConstraints(timetable: TimetableConfig): Constraints {
  const weekly: Record<string, number> = {};
  if (timetable.weeklyPeriods && typeof timetable.weeklyPeriods === "object") {
    for (const [key, value] of Object.entries(timetable.weeklyPeriods)) {
      const number = mapNumber(value as Prisma.JsonValue);
      if (number !== undefined) weekly[key] = Math.max(1, Math.min(10, Math.round(number)));
    }
  }
  const unavailable = new Set<string>();
  if (timetable.teacherUnavailability && typeof timetable.teacherUnavailability === "object") {
    for (const [teacherId, slots] of Object.entries(timetable.teacherUnavailability)) {
      if (!Array.isArray(slots)) continue;
      for (const slot of slots) {
        if (typeof slot !== "string") continue;
        const match = /^([1-6]):([1-9]|1[0-6])$/.exec(slot.trim());
        if (match) unavailable.add(`${teacherId}:${Number(match[1])}:${Number(match[2])}`);
      }
    }
  }
  const roomReq: Constraints["roomReq"] = {};
  if (timetable.roomRequirements && typeof timetable.roomRequirements === "object") {
    for (const [key, value] of Object.entries(timetable.roomRequirements)) {
      if (!value || typeof value !== "object") continue;
      const entry: { roomType?: string; room?: string } = {};
      if (typeof value.roomType === "string" && value.roomType.trim()) entry.roomType = value.roomType.trim();
      if (typeof value.room === "string" && value.room.trim()) entry.room = value.room.trim();
      if (entry.roomType || entry.room) roomReq[key] = entry;
    }
  }
  const doubles: Record<string, number> = {};
  if (timetable.doublePeriodSubjects && typeof timetable.doublePeriodSubjects === "object") {
    for (const [key, value] of Object.entries(timetable.doublePeriodSubjects)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) doubles[key] = Math.min(5, Math.floor(value));
    }
  }
  const rooms = Array.isArray(timetable.rooms) ? timetable.rooms.filter((room) => room && typeof room.id === "string" && room.id && typeof room.name === "string" && room.name) : [];
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const roomsByType = new Map<string, TimetableRoom[]>();
  for (const room of rooms) {
    const type = (room.type ?? "").trim() || "general";
    const list = roomsByType.get(type) ?? [];
    list.push(room);
    roomsByType.set(type, list);
  }
  return { weekly, unavailable, roomReq, doubles, rooms, roomsById, roomsByType };
}

type Assignment = { classId: string; subjectId: string; teacherId: string; className: string; subjectName: string; teacherName: string };
type Placed = { schoolId: string; classId: string; subjectId: string; teacherId: string; dayOfWeek: number; period: number; venue: string | null };
type ExistingSlot = Placed & { id: string; class: { name: string }; teacher: { name: string } };

const MAX_ATTEMPTS = 6;
const assignmentKey = (value: Pick<Assignment, "classId" | "subjectId" | "teacherId">) => `${value.classId}:${value.subjectId}:${value.teacherId}`;

function generationMode(input: TimetableGenerationInput): TimetableGenerationMode {
  if (input.mode) return input.mode;
  return input.replaceExisting ? "rebuild" : "fill_gaps";
}

export async function generateBalancedTimetable(tx: TenantDb, input: TimetableGenerationInput) {
  await requirePermission(tx, input.actorId, "calendar:manage");
  const mode = generationMode(input);
  const dryRun = input.dryRun === true;
  if (!dryRun) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable-generation:${input.schoolId}`}))`;

  const config = await getAcademicEngineConfig(tx, input.schoolId);
  const timetable = config.timetable as TimetableConfig;
  const days = timetable.days.filter((day) => day.enabled);
  if (!days.length) throw new AppError("Enable at least one school day before generating the timetable.", 400, "NO_SCHOOL_DAYS");
  const periodsByDay = new Map<number, ReturnType<typeof dayBlocks>>();
  for (const day of days) {
    const built = dayBlocks(day, timetable);
    if (!built.periods.length) throw new AppError(`${day.name} has no usable teaching periods after breaks.`, 400, "NO_USABLE_PERIODS");
    periodsByDay.set(day.dayOfWeek, built);
  }

  const classes = await tx.class.findMany({ where: input.classIds?.length ? { id: { in: input.classIds } } : {}, select: { id: true, name: true, level: true } });
  if (!classes.length) throw new AppError("Create at least one class before generating the timetable.", 409, "NO_CLASSES");
  const classIds = classes.map((row) => row.id);
  const classIdSet = new Set(classIds);
  const classById = new Map(classes.map((row) => [row.id, row]));
  const rawAssignments = await tx.classSubjectTeacher.findMany({ where: { classId: { in: classIds } }, include: { class: true, subject: true, teacher: true } });
  if (!rawAssignments.length) throw new AppError("Assign subjects to classes and teachers before generating the timetable.", 409, "NO_ASSIGNMENTS");

  const constraints = readConstraints(timetable);
  for (const [, requirement] of Object.entries(constraints.roomReq)) {
    if (requirement.room && !constraints.roomsById.has(requirement.room)) throw new AppError(`A timetable rule names room "${requirement.room}", which is not in the school's room list. Add the room or fix the rule first.`, 400, "ROOM_NOT_FOUND");
  }
  const assignments: Assignment[] = rawAssignments.map((row) => ({ classId: row.classId, subjectId: row.subjectId, teacherId: row.teacherId, className: row.class.name, subjectName: row.subject.name, teacherName: row.teacher.name }));
  const fullTargetFor = (assignment: Assignment) => constraints.weekly[assignmentKey(assignment)] ?? 2;

  const allExisting = await tx.timetableSlot.findMany({
    where: { schoolId: input.schoolId },
    select: { id: true, classId: true, subjectId: true, teacherId: true, dayOfWeek: true, period: true, venue: true, class: { select: { name: true } }, teacher: { select: { name: true } } },
  }) as ExistingSlot[];
  const inScope = allExisting.filter((slot) => classIdSet.has(slot.classId));
  const outsideScope = allExisting.filter((slot) => !classIdSet.has(slot.classId));
  const requestedLocked = new Set(input.lockedSlotIds ?? []);
  const keptInScope = mode === "fill_gaps"
    ? inScope
    : mode === "rebuild_preserving_locked"
      ? inScope.filter((slot) => requestedLocked.has(slot.id))
      : [];
  const keptIdSet = new Set(keptInScope.map((slot) => slot.id));
  const removeSlotIds = mode === "fill_gaps" ? [] : inScope.filter((slot) => !keptIdSet.has(slot.id)).map((slot) => slot.id);
  const seeded = [...outsideScope, ...keptInScope];

  const existingByAssignment = new Map<string, number>();
  for (const slot of keptInScope) existingByAssignment.set(assignmentKey(slot), (existingByAssignment.get(assignmentKey(slot)) ?? 0) + 1);
  const remainingFor = (assignment: Assignment) => Math.max(0, fullTargetFor(assignment) - (existingByAssignment.get(assignmentKey(assignment)) ?? 0));

  const warnings: string[] = [];
  if (mode === "rebuild_preserving_locked" && requestedLocked.size > keptInScope.length) warnings.push(`${requestedLocked.size - keptInScope.length} selected locked lesson(s) were outside this generation scope or no longer exist.`);
  for (const assignment of assignments) {
    const current = existingByAssignment.get(assignmentKey(assignment)) ?? 0;
    const target = fullTargetFor(assignment);
    if (current > target) warnings.push(`${assignment.className} · ${assignment.subjectName} already has ${current} preserved lessons against a target of ${target}; generation will not add more.`);
  }

  const holderNames = new Map<string, string>();
  const baseClass = new Set<string>();
  const baseTeacher = new Set<string>();
  const baseRoom = new Set<string>();
  for (const slot of seeded) {
    baseClass.add(`${slot.classId}:${slot.dayOfWeek}:${slot.period}`);
    baseTeacher.add(`${slot.teacherId}:${slot.dayOfWeek}:${slot.period}`);
    if (slot.venue) baseRoom.add(`${slot.venue}:${slot.dayOfWeek}:${slot.period}`);
    holderNames.set(`t:${slot.teacherId}:${slot.dayOfWeek}:${slot.period}`, slot.class.name);
    holderNames.set(`c:${slot.classId}:${slot.dayOfWeek}:${slot.period}`, slot.class.name);
  }
  const dayName = (day: number) => days.find((item) => item.dayOfWeek === day)?.name ?? `Day ${day}`;

  const resolveVenue = (assignment: Assignment, day: number, period: number, occupied: Set<string>): { venue: string | null; blocked?: string } => {
    const requirement = constraints.roomReq[`${assignment.classId}:${assignment.subjectId}`] ?? constraints.roomReq[assignment.subjectId];
    if (!requirement || (!requirement.room && !requirement.roomType)) return { venue: null };
    if (requirement.room) {
      const key = `room:${requirement.room}:${day}:${period}`;
      if (occupied.has(key)) return { venue: null, blocked: requirement.room };
      return { venue: `room:${requirement.room}` };
    }
    const type = (requirement.roomType ?? "").trim() || "general";
    const pool = constraints.roomsByType.get(type) ?? [];
    if (!pool.length) return { venue: `type:${type}` };
    for (const room of pool) {
      const key = `room:${room.id}:${day}:${period}`;
      if (!occupied.has(key)) return { venue: `room:${room.id}` };
    }
    return { venue: null, blocked: pool.map((room) => room.name).join(", ") };
  };

  const totalNeeded = assignments.reduce((sum, assignment) => sum + remainingFor(assignment), 0);
  let best: { placed: Placed[]; count: number; pairs: number } | null = totalNeeded === 0 ? { placed: [], count: 0, pairs: 0 } : null;
  let lastFailure: { assignment: Assignment; target: number; fullTarget: number; placed: number; teacherBlocks: Map<string, string[]>; classBlocks: number; roomBlocks: number; unavailBlocks: number; roomLabel: string | null } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && totalNeeded > 0; attempt += 1) {
    const placedClass = new Set(baseClass);
    const placedTeacher = new Set(baseTeacher);
    const placedRoom = new Set(baseRoom);
    const dayLoad = new Map<string, number>();
    const teacherLoad = new Map<string, number>();
    const subjectDay = new Map<string, number>();
    for (const slot of seeded) {
      dayLoad.set(`${slot.classId}:${slot.dayOfWeek}`, (dayLoad.get(`${slot.classId}:${slot.dayOfWeek}`) ?? 0) + 1);
      teacherLoad.set(`${slot.teacherId}:${slot.dayOfWeek}`, (teacherLoad.get(`${slot.teacherId}:${slot.dayOfWeek}`) ?? 0) + 1);
      subjectDay.set(`${slot.classId}:${slot.subjectId}:${slot.dayOfWeek}`, (subjectDay.get(`${slot.classId}:${slot.subjectId}:${slot.dayOfWeek}`) ?? 0) + 1);
    }
    const chosen: Placed[] = [];
    const ordered = [...assignments].filter((assignment) => remainingFor(assignment) > 0).sort((a, b) => {
      const targetDifference = remainingFor(b) - remainingFor(a);
      if (targetDifference !== 0) return targetDifference;
      const classDifference = a.classId.localeCompare(b.classId);
      return classDifference !== 0 ? classDifference : a.subjectName.localeCompare(b.subjectName);
    });
    const rotated = ordered.length ? [...ordered.slice(attempt % ordered.length), ...ordered.slice(0, attempt % ordered.length)] : ordered;
    const dayOrder = days.length ? [...days.slice(attempt % days.length), ...days.slice(0, attempt % days.length)] : days;
    let failed: { assignment: Assignment; target: number; placed: number } | null = null;

    const trySingle = (assignment: Assignment): boolean => {
      let bestSlot: { score: number; day: number; period: number; venue: string | null } | null = null;
      for (const day of dayOrder) {
        const built = periodsByDay.get(day.dayOfWeek);
        if (!built) continue;
        for (const period of built.periods) {
          const classKey = `${assignment.classId}:${day.dayOfWeek}:${period.period}`;
          const teacherKey = `${assignment.teacherId}:${day.dayOfWeek}:${period.period}`;
          if (placedClass.has(classKey) || placedTeacher.has(teacherKey)) continue;
          if (constraints.unavailable.has(`${assignment.teacherId}:${day.dayOfWeek}:${period.period}`)) continue;
          const venue = resolveVenue(assignment, day.dayOfWeek, period.period, placedRoom);
          if (venue.blocked !== undefined && venue.venue === null) continue;
          const score = (dayLoad.get(`${assignment.classId}:${day.dayOfWeek}`) ?? 0) * 4
            + (teacherLoad.get(`${assignment.teacherId}:${day.dayOfWeek}`) ?? 0) * 5
            + (subjectDay.get(`${assignment.classId}:${assignment.subjectId}:${day.dayOfWeek}`) ?? 0) * 6
            + period.period * 0.1;
          if (!bestSlot || score < bestSlot.score) bestSlot = { score, day: day.dayOfWeek, period: period.period, venue: venue.venue };
        }
      }
      if (!bestSlot) return false;
      chosen.push({ schoolId: input.schoolId, classId: assignment.classId, subjectId: assignment.subjectId, teacherId: assignment.teacherId, dayOfWeek: bestSlot.day, period: bestSlot.period, venue: bestSlot.venue });
      placedClass.add(`${assignment.classId}:${bestSlot.day}:${bestSlot.period}`);
      placedTeacher.add(`${assignment.teacherId}:${bestSlot.day}:${bestSlot.period}`);
      if (bestSlot.venue) placedRoom.add(`${bestSlot.venue}:${bestSlot.day}:${bestSlot.period}`);
      dayLoad.set(`${assignment.classId}:${bestSlot.day}`, (dayLoad.get(`${assignment.classId}:${bestSlot.day}`) ?? 0) + 1);
      teacherLoad.set(`${assignment.teacherId}:${bestSlot.day}`, (teacherLoad.get(`${assignment.teacherId}:${bestSlot.day}`) ?? 0) + 1);
      subjectDay.set(`${assignment.classId}:${assignment.subjectId}:${bestSlot.day}`, (subjectDay.get(`${assignment.classId}:${assignment.subjectId}:${bestSlot.day}`) ?? 0) + 1);
      return true;
    };

    const tryDouble = (assignment: Assignment): boolean => {
      let bestPair: { score: number; day: number; first: number; second: number; venue: string | null } | null = null;
      for (const day of dayOrder) {
        const built = periodsByDay.get(day.dayOfWeek);
        if (!built) continue;
        const list = built.periods;
        for (let i = 0; i < list.length - 1; i += 1) {
          const first = list[i];
          const second = list[i + 1];
          const classKeyOne = `${assignment.classId}:${day.dayOfWeek}:${first.period}`;
          const classKeyTwo = `${assignment.classId}:${day.dayOfWeek}:${second.period}`;
          const teacherKeyOne = `${assignment.teacherId}:${day.dayOfWeek}:${first.period}`;
          const teacherKeyTwo = `${assignment.teacherId}:${day.dayOfWeek}:${second.period}`;
          if (placedClass.has(classKeyOne) || placedClass.has(classKeyTwo) || placedTeacher.has(teacherKeyOne) || placedTeacher.has(teacherKeyTwo)) continue;
          if (constraints.unavailable.has(`${assignment.teacherId}:${day.dayOfWeek}:${first.period}`) || constraints.unavailable.has(`${assignment.teacherId}:${day.dayOfWeek}:${second.period}`)) continue;
          const venueOne = resolveVenue(assignment, day.dayOfWeek, first.period, placedRoom);
          if (venueOne.venue === null && venueOne.blocked !== undefined) continue;
          const occupiedPlus = new Set(placedRoom);
          if (venueOne.venue) occupiedPlus.add(`${venueOne.venue}:${day.dayOfWeek}:${first.period}`);
          const venueTwo = resolveVenue(assignment, day.dayOfWeek, second.period, occupiedPlus);
          if (venueTwo.venue === null && venueTwo.blocked !== undefined) continue;
          if (venueOne.venue && venueTwo.venue && venueOne.venue !== venueTwo.venue) continue;
          const score = (dayLoad.get(`${assignment.classId}:${day.dayOfWeek}`) ?? 0) * 4
            + (teacherLoad.get(`${assignment.teacherId}:${day.dayOfWeek}`) ?? 0) * 5
            + (subjectDay.get(`${assignment.classId}:${assignment.subjectId}:${day.dayOfWeek}`) ?? 0) * 6
            + first.period * 0.1;
          if (!bestPair || score < bestPair.score) bestPair = { score, day: day.dayOfWeek, first: first.period, second: second.period, venue: venueOne.venue };
        }
      }
      if (!bestPair) return false;
      for (const period of [bestPair.first, bestPair.second]) {
        chosen.push({ schoolId: input.schoolId, classId: assignment.classId, subjectId: assignment.subjectId, teacherId: assignment.teacherId, dayOfWeek: bestPair.day, period, venue: bestPair.venue });
        placedClass.add(`${assignment.classId}:${bestPair.day}:${period}`);
        placedTeacher.add(`${assignment.teacherId}:${bestPair.day}:${period}`);
        if (bestPair.venue) placedRoom.add(`${bestPair.venue}:${bestPair.day}:${period}`);
      }
      dayLoad.set(`${assignment.classId}:${bestPair.day}`, (dayLoad.get(`${assignment.classId}:${bestPair.day}`) ?? 0) + 2);
      teacherLoad.set(`${assignment.teacherId}:${bestPair.day}`, (teacherLoad.get(`${assignment.teacherId}:${bestPair.day}`) ?? 0) + 2);
      subjectDay.set(`${assignment.classId}:${assignment.subjectId}:${bestPair.day}`, (subjectDay.get(`${assignment.classId}:${assignment.subjectId}:${bestPair.day}`) ?? 0) + 2);
      return true;
    };

    let attemptOk = true;
    let pairsPlaced = 0;
    for (const assignment of rotated) {
      const target = remainingFor(assignment);
      const doubles = Math.min(constraints.doubles[assignment.subjectId] ?? 0, Math.floor(target / 2));
      let placed = 0;
      for (let index = 0; index < doubles; index += 1) {
        if (tryDouble(assignment)) { placed += 2; pairsPlaced += 1; } else break;
      }
      while (placed < target) {
        if (trySingle(assignment)) placed += 1;
        else break;
      }
      if (placed < target) { failed = { assignment, target, placed }; attemptOk = false; break; }
    }
    if (!best || chosen.length > best.count) best = { placed: chosen, count: chosen.length, pairs: pairsPlaced };
    if (attemptOk) break;
    if (failed && attempt === MAX_ATTEMPTS - 1) {
      const assignment = failed.assignment;
      const teacherBlocks = new Map<string, string[]>();
      let classBlocks = 0;
      let roomBlocks = 0;
      let unavailBlocks = 0;
      let roomLabel: string | null = null;
      const requirement = constraints.roomReq[`${assignment.classId}:${assignment.subjectId}`] ?? constraints.roomReq[assignment.subjectId];
      if (requirement) roomLabel = requirement.room ?? requirement.roomType ?? null;
      for (const day of days) {
        const built = periodsByDay.get(day.dayOfWeek);
        if (!built) continue;
        for (const period of built.periods) {
          const classKey = `${assignment.classId}:${day.dayOfWeek}:${period.period}`;
          const teacherKey = `${assignment.teacherId}:${day.dayOfWeek}:${period.period}`;
          if (baseClass.has(classKey)) { classBlocks += 1; continue; }
          if (baseTeacher.has(teacherKey)) {
            const holder = holderNames.get(`t:${assignment.teacherId}:${day.dayOfWeek}:${period.period}`) ?? classById.get(assignment.classId)?.name ?? "another class";
            const list = teacherBlocks.get(holder) ?? [];
            list.push(`${dayName(day.dayOfWeek)} period ${period.period}`);
            teacherBlocks.set(holder, list);
            continue;
          }
          if (constraints.unavailable.has(`${assignment.teacherId}:${day.dayOfWeek}:${period.period}`)) { unavailBlocks += 1; continue; }
          const venue = resolveVenue(assignment, day.dayOfWeek, period.period, baseRoom);
          if (venue.venue === null && venue.blocked !== undefined) roomBlocks += 1;
        }
      }
      lastFailure = { assignment, target: failed.target, fullTarget: fullTargetFor(assignment), placed: failed.placed, teacherBlocks, classBlocks, roomBlocks, unavailBlocks, roomLabel };
    }
  }

  if (!best || best.count < totalNeeded) {
    if (lastFailure) {
      const failure = lastFailure;
      const lines: string[] = [`I could not fit the ${failure.target} additional ${failure.assignment.subjectName} lesson(s) needed for ${failure.assignment.className} to reach its weekly target of ${failure.fullTarget} (placed ${failure.placed}).`];
      const teacherEntries = [...failure.teacherBlocks.entries()].sort((a, b) => b[1].length - a[1].length);
      if (teacherEntries.length) {
        const [holder, slots] = teacherEntries[0];
        const shown = slots.slice(0, 3).join(", ");
        lines.push(`The tightest squeeze: ${failure.assignment.teacherName} is already committed in ${slots.length} of the remaining free slots${holder !== failure.assignment.className ? ` (e.g. ${holder}: ${shown})` : ` (${shown})`}. Options: reduce the weekly target, free ${failure.assignment.teacherName} in one of those slots, or assign another eligible teacher.`);
      }
      if (failure.roomBlocks > 0) lines.push(`Room pressure: ${failure.roomBlocks} otherwise-free slot(s) need ${failure.roomLabel ? `"${failure.roomLabel}"` : "a special room"} that is already booked then. Add another room of that type or loosen the room rule.`);
      if (failure.unavailBlocks > 0) lines.push(`Availability: ${failure.assignment.teacherName} is marked unavailable in ${failure.unavailBlocks} slot(s). Adjust their availability if those hours are actually free.`);
      if (failure.classBlocks > 0 && !teacherEntries.length) lines.push(`${failure.assignment.className} is already occupied in ${failure.classBlocks} candidate slot(s). Reduce that class's weekly load or open more teaching periods.`);
      throw new AppError(lines.join(" "), 409, "TIMETABLE_UNSATISFIABLE");
    }
    throw new AppError(`I could not fit the requested remaining weekly load (${best?.count ?? 0}/${totalNeeded} lessons placed) without double-booking a class, teacher or room.`, 409, "TIMETABLE_UNSATISFIABLE");
  }

  const chosen = best.placed;
  const targetLessons = assignments.reduce((sum, assignment) => sum + fullTargetFor(assignment), 0);
  const preservedTargetCoverage = assignments.reduce((sum, assignment) => sum + Math.min(fullTargetFor(assignment), existingByAssignment.get(assignmentKey(assignment)) ?? 0), 0);
  const coverageAfter = targetLessons ? Math.min(100, Math.round((preservedTargetCoverage + chosen.length) / targetLessons * 1000) / 10) : 100;
  const additions = chosen.map((slot) => {
    const assignment = assignments.find((item) => item.classId === slot.classId && item.subjectId === slot.subjectId && item.teacherId === slot.teacherId);
    return { ...slot, className: assignment?.className ?? "Class", subjectName: assignment?.subjectName ?? "Subject", teacherName: assignment?.teacherName ?? "Teacher" };
  });
  const result = {
    mode,
    dryRun,
    scheduled: chosen.length,
    classes: classes.length,
    teachers: new Set(chosen.map((slot) => slot.teacherId)).size,
    days: days.length,
    periodsPerDay: Math.max(...days.map((day) => periodsByDay.get(day.dayOfWeek)?.periods.length ?? 0)),
    published: false,
    breaks: timetable.breaks,
    attempts: totalNeeded ? MAX_ATTEMPTS : 0,
    roomsUsed: new Set(chosen.map((slot) => slot.venue).filter((venue): venue is string => Boolean(venue))).size,
    pairedBlocks: best.pairs,
    warnings,
    metrics: {
      targetLessons,
      existingInScope: inScope.length,
      preservedLessons: keptInScope.length,
      generatedLessons: chosen.length,
      removedLessons: removeSlotIds.length,
      remainingBeforeGeneration: totalNeeded,
      coverageAfter,
    },
    changes: {
      keepSlotIds: keptInScope.map((slot) => slot.id),
      removeSlotIds,
      additions,
    },
  };

  if (!dryRun) {
    if (removeSlotIds.length) await tx.timetableSlot.deleteMany({ where: { schoolId: input.schoolId, id: { in: removeSlotIds } } });
    for (const slot of chosen) await tx.timetableSlot.create({ data: slot });
    await appendSchoolAudit(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "timetable.intelligent_generation_applied",
      entityType: "Timetable",
      entityId: `generation-${Date.now()}`,
      after: { ...result, changes: { keepCount: keptInScope.length, removeCount: removeSlotIds.length, additionCount: additions.length } },
    });
  }
  return result;
}
