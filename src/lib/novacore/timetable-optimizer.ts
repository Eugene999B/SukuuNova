export const TIMETABLE_OPTIMIZER_VERSION = "timetable-csp-v1.1.0";

export type OptimizerSlot = { dayOfWeek: number; period: number };
export type OptimizerRoom = { id: string; type?: string | null };

export type TimetableDemand = {
  id: string;
  groupId?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  occurrences: number;
  blockSize?: 1 | 2;
  allowedRoomIds?: string[];
  requiredRoomType?: string | null;
  preferredDays?: number[];
  avoidPeriods?: number[];
  maxPerDay?: number;
};

export type FixedPlacement = {
  classId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  roomId?: string | null;
  groupId?: string;
};

export type LockedPlacement = {
  demandId: string;
  occurrenceIndex: number;
  dayOfWeek: number;
  period: number;
  roomId?: string | null;
};

export type OptimizedPlacement = {
  demandId: string;
  occurrenceIndex: number;
  classId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  blockSize: 1 | 2;
  roomId: string | null;
  locked: boolean;
};

export type TimetableOptimizerInput = {
  slots: OptimizerSlot[];
  rooms?: OptimizerRoom[];
  demands: TimetableDemand[];
  fixedPlacements?: FixedPlacement[];
  lockedPlacements?: LockedPlacement[];
  teacherUnavailable?: string[];
  classUnavailable?: string[];
  roomUnavailable?: string[];
  teacherDailySoftLimit?: number;
  maxSearchNodes?: number;
};

export type TimetableOptimizerResult = {
  status: "optimal" | "feasible" | "infeasible";
  placements: OptimizedPlacement[];
  score: number | null;
  nodesVisited: number;
  searchLimitReached: boolean;
  diagnostics: { reasons: Record<string, number>; deadEndDemandIds: string[] };
  algorithmVersion: string;
};

type Task = { demand: TimetableDemand; occurrenceIndex: number };
type Candidate = { dayOfWeek: number; period: number; roomId: string | null; penalty: number };
type CountMap = Map<string, Map<number, number>>;
type Occupancy = { class: Set<string>; teacher: Set<string>; room: Set<string>; groupDays: CountMap; teacherDays: CountMap };
type SearchState = { placements: OptimizedPlacement[]; occupancy: Occupancy; penalty: number };
type CandidateEvaluation = { candidates: Candidate[]; reasons: Record<string, number> };
type BestResult = { placements: OptimizedPlacement[]; score: number };

function clampInt(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Math.floor(value))); }
function slotKey(id: string, day: number, period: number) { return `${id}:${day}:${period}`; }
function roomKey(id: string, day: number, period: number) { return `${id}:${day}:${period}`; }
function groupKey(demand: TimetableDemand) { return demand.groupId?.trim() || demand.id; }
function taskKey(task: Task) { return `${task.demand.id}:${task.occurrenceIndex}`; }
function periodsFor(start: number, blockSize: 1 | 2) { return blockSize === 2 ? [start, start + 1] : [start]; }
function bump(record: Record<string, number>, key: string, amount = 1) { record[key] = (record[key] ?? 0) + amount; }

function nestedCount(map: CountMap, id: string, day: number) { return map.get(id)?.get(day) ?? 0; }
function incrementNested(map: CountMap, id: string, day: number, amount: number) {
  const days = map.get(id) ?? new Map<number, number>();
  days.set(day, (days.get(day) ?? 0) + amount);
  map.set(id, days);
}
function cloneCounts(source: CountMap): CountMap { return new Map([...source].map(([id, days]) => [id, new Map(days)])); }
function cloneOccupancy(source: Occupancy): Occupancy {
  return { class: new Set(source.class), teacher: new Set(source.teacher), room: new Set(source.room), groupDays: cloneCounts(source.groupDays), teacherDays: cloneCounts(source.teacherDays) };
}

function normalizeSlots(raw: OptimizerSlot[]) {
  const unique = new Map<string, OptimizerSlot>();
  for (const slot of raw) {
    if (!Number.isInteger(slot.dayOfWeek) || !Number.isInteger(slot.period)) continue;
    if (slot.dayOfWeek < 1 || slot.dayOfWeek > 7 || slot.period < 1 || slot.period > 32) continue;
    unique.set(`${slot.dayOfWeek}:${slot.period}`, { dayOfWeek: slot.dayOfWeek, period: slot.period });
  }
  return [...unique.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period);
}

function roomsForDemand(demand: TimetableDemand, rooms: OptimizerRoom[], forcedRoomId?: string | null) {
  if (forcedRoomId !== undefined) {
    if (forcedRoomId === null) return demand.allowedRoomIds || demand.requiredRoomType ? [] : [null];
    const room = rooms.find((item) => item.id === forcedRoomId);
    if (!room) return [];
    if (demand.allowedRoomIds && !demand.allowedRoomIds.includes(room.id)) return [];
    if (demand.requiredRoomType && room.type !== demand.requiredRoomType) return [];
    return [room.id];
  }
  if (demand.allowedRoomIds) {
    const allowed = new Set(demand.allowedRoomIds);
    return rooms.filter((room) => allowed.has(room.id) && (!demand.requiredRoomType || room.type === demand.requiredRoomType)).map((room) => room.id).sort();
  }
  if (demand.requiredRoomType) return rooms.filter((room) => room.type === demand.requiredRoomType).map((room) => room.id).sort();
  return [null];
}

function evaluateCandidates(
  task: Task,
  slots: OptimizerSlot[],
  slotSet: Set<string>,
  rooms: OptimizerRoom[],
  occupancy: Occupancy,
  unavailable: { teacher: Set<string>; class: Set<string>; room: Set<string> },
  teacherDailySoftLimit: number,
  forcedRoomId?: string | null,
): CandidateEvaluation {
  const reasons: Record<string, number> = {};
  const candidates: Candidate[] = [];
  const demand = task.demand;
  const blockSize = demand.blockSize ?? 1;
  const roomChoices = roomsForDemand(demand, rooms, forcedRoomId);
  if (!roomChoices.length) { bump(reasons, "no_eligible_room"); return { candidates, reasons }; }

  for (const slot of slots) {
    const periods = periodsFor(slot.period, blockSize);
    if (periods.some((period) => !slotSet.has(`${slot.dayOfWeek}:${period}`))) { bump(reasons, "non_contiguous_block"); continue; }
    const dayPeriods = nestedCount(occupancy.groupDays, groupKey(demand), slot.dayOfWeek);
    const maximum = demand.maxPerDay == null ? null : clampInt(demand.maxPerDay, 1, 32);
    if (maximum != null && dayPeriods + blockSize > maximum) { bump(reasons, "daily_limit"); continue; }

    for (const roomId of roomChoices) {
      let blocked: string | null = null;
      for (const period of periods) {
        if (unavailable.teacher.has(slotKey(demand.teacherId, slot.dayOfWeek, period))) { blocked = "teacher_unavailable"; break; }
        if (unavailable.class.has(slotKey(demand.classId, slot.dayOfWeek, period))) { blocked = "class_unavailable"; break; }
        if (occupancy.teacher.has(slotKey(demand.teacherId, slot.dayOfWeek, period))) { blocked = "teacher_conflict"; break; }
        if (occupancy.class.has(slotKey(demand.classId, slot.dayOfWeek, period))) { blocked = "class_conflict"; break; }
        if (roomId && unavailable.room.has(roomKey(roomId, slot.dayOfWeek, period))) { blocked = "room_unavailable"; break; }
        if (roomId && occupancy.room.has(roomKey(roomId, slot.dayOfWeek, period))) { blocked = "room_conflict"; break; }
      }
      if (blocked) { bump(reasons, blocked); continue; }

      let penalty = dayPeriods * 12;
      if (demand.preferredDays?.length && !demand.preferredDays.includes(slot.dayOfWeek)) penalty += 4;
      if (demand.avoidPeriods?.some((period) => periods.includes(period))) penalty += 6;
      const teacherPeriods = nestedCount(occupancy.teacherDays, demand.teacherId, slot.dayOfWeek);
      if (teacherPeriods + blockSize > teacherDailySoftLimit) penalty += (teacherPeriods + blockSize - teacherDailySoftLimit) * 3;
      candidates.push({ dayOfWeek: slot.dayOfWeek, period: slot.period, roomId, penalty });
    }
  }
  candidates.sort((a, b) => a.penalty - b.penalty || a.dayOfWeek - b.dayOfWeek || a.period - b.period || (a.roomId ?? "").localeCompare(b.roomId ?? ""));
  return { candidates, reasons };
}

function place(state: SearchState, task: Task, candidate: Candidate, locked: boolean): SearchState {
  const occupancy = cloneOccupancy(state.occupancy);
  const blockSize = task.demand.blockSize ?? 1;
  for (const period of periodsFor(candidate.period, blockSize)) {
    occupancy.class.add(slotKey(task.demand.classId, candidate.dayOfWeek, period));
    occupancy.teacher.add(slotKey(task.demand.teacherId, candidate.dayOfWeek, period));
    if (candidate.roomId) occupancy.room.add(roomKey(candidate.roomId, candidate.dayOfWeek, period));
  }
  incrementNested(occupancy.groupDays, groupKey(task.demand), candidate.dayOfWeek, blockSize);
  incrementNested(occupancy.teacherDays, task.demand.teacherId, candidate.dayOfWeek, blockSize);
  return {
    placements: [...state.placements, {
      demandId: task.demand.id,
      occurrenceIndex: task.occurrenceIndex,
      classId: task.demand.classId,
      subjectId: task.demand.subjectId,
      teacherId: task.demand.teacherId,
      dayOfWeek: candidate.dayOfWeek,
      period: candidate.period,
      blockSize,
      roomId: candidate.roomId,
      locked,
    }],
    occupancy,
    penalty: state.penalty + candidate.penalty,
  };
}

function generatedGapPenalty(placements: OptimizedPlacement[]) {
  const teacherDays = new Map<string, number[]>();
  for (const placement of placements) {
    const key = `${placement.teacherId}:${placement.dayOfWeek}`;
    const periods = teacherDays.get(key) ?? [];
    periods.push(...periodsFor(placement.period, placement.blockSize));
    teacherDays.set(key, periods);
  }
  let penalty = 0;
  for (const periods of teacherDays.values()) {
    const unique = [...new Set(periods)].sort((a, b) => a - b);
    if (unique.length < 2) continue;
    const occupied = new Set(unique);
    for (let period = unique[0]; period <= unique[unique.length - 1]; period += 1) if (!occupied.has(period)) penalty += 1;
  }
  return penalty;
}

export function optimizeTimetable(input: TimetableOptimizerInput): TimetableOptimizerResult {
  const slots = normalizeSlots(input.slots);
  const slotSet = new Set(slots.map((slot) => `${slot.dayOfWeek}:${slot.period}`));
  const rooms = [...(input.rooms ?? [])].filter((room) => room.id).sort((a, b) => a.id.localeCompare(b.id));
  const maxSearchNodes = clampInt(input.maxSearchNodes ?? 200_000, 100, 2_000_000);
  const teacherDailySoftLimit = clampInt(input.teacherDailySoftLimit ?? 5, 1, 32);
  const reasons: Record<string, number> = {};
  const deadEndDemandIds = new Set<string>();
  if (!slots.length) return { status: "infeasible", placements: [], score: null, nodesVisited: 0, searchLimitReached: false, diagnostics: { reasons: { no_slots: 1 }, deadEndDemandIds: [] }, algorithmVersion: TIMETABLE_OPTIMIZER_VERSION };

  const demands: TimetableDemand[] = [...input.demands]
    .filter((demand) => demand.id && demand.classId && demand.subjectId && demand.teacherId && Number.isFinite(demand.occurrences) && demand.occurrences > 0)
    .map((demand): TimetableDemand => ({ ...demand, occurrences: clampInt(demand.occurrences, 1, 40), blockSize: demand.blockSize === 2 ? 2 : 1 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const tasks: Task[] = demands.flatMap((demand) => Array.from({ length: demand.occurrences }, (_, occurrenceIndex) => ({ demand, occurrenceIndex })));
  const taskByKey = new Map(tasks.map((task) => [taskKey(task), task]));

  const occupancy: Occupancy = { class: new Set(), teacher: new Set(), room: new Set(), groupDays: new Map(), teacherDays: new Map() };
  for (const fixed of input.fixedPlacements ?? []) {
    occupancy.class.add(slotKey(fixed.classId, fixed.dayOfWeek, fixed.period));
    occupancy.teacher.add(slotKey(fixed.teacherId, fixed.dayOfWeek, fixed.period));
    if (fixed.roomId) occupancy.room.add(roomKey(fixed.roomId, fixed.dayOfWeek, fixed.period));
    if (fixed.groupId) incrementNested(occupancy.groupDays, fixed.groupId, fixed.dayOfWeek, 1);
    incrementNested(occupancy.teacherDays, fixed.teacherId, fixed.dayOfWeek, 1);
  }
  const unavailable = { teacher: new Set(input.teacherUnavailable ?? []), class: new Set(input.classUnavailable ?? []), room: new Set(input.roomUnavailable ?? []) };
  let initial: SearchState = { placements: [], occupancy, penalty: 0 };
  const lockedTaskKeys = new Set<string>();

  for (const locked of [...(input.lockedPlacements ?? [])].sort((a, b) => a.demandId.localeCompare(b.demandId) || a.occurrenceIndex - b.occurrenceIndex)) {
    const task = taskByKey.get(`${locked.demandId}:${locked.occurrenceIndex}`);
    if (!task) { bump(reasons, "locked_demand_missing"); continue; }
    const evaluation = evaluateCandidates(task, [{ dayOfWeek: locked.dayOfWeek, period: locked.period }], slotSet, rooms, initial.occupancy, unavailable, teacherDailySoftLimit, locked.roomId ?? null);
    const candidate = evaluation.candidates[0];
    if (!candidate) {
      bump(reasons, "invalid_locked_placement");
      for (const [key, count] of Object.entries(evaluation.reasons)) bump(reasons, key, count);
      return { status: "infeasible", placements: initial.placements, score: null, nodesVisited: 0, searchLimitReached: false, diagnostics: { reasons, deadEndDemandIds: [locked.demandId] }, algorithmVersion: TIMETABLE_OPTIMIZER_VERSION };
    }
    initial = place(initial, task, candidate, true);
    lockedTaskKeys.add(taskKey(task));
  }

  const remaining = tasks.filter((task) => !lockedTaskKeys.has(taskKey(task)));
  let nodesVisited = 0;
  let searchLimitReached = false;
  const bestRef: { value: BestResult | null } = { value: null };

  const search = (state: SearchState, unplaced: Task[]) => {
    if (nodesVisited >= maxSearchNodes) { searchLimitReached = true; return; }
    nodesVisited += 1;
    if (!unplaced.length) {
      const score = state.penalty + generatedGapPenalty(state.placements);
      if (!bestRef.value || score < bestRef.value.score) bestRef.value = { placements: state.placements, score };
      return;
    }
    if (bestRef.value && state.penalty >= bestRef.value.score) return;

    let selectedIndex = -1;
    let selected: CandidateEvaluation | null = null;
    for (let index = 0; index < unplaced.length; index += 1) {
      const evaluation = evaluateCandidates(unplaced[index], slots, slotSet, rooms, state.occupancy, unavailable, teacherDailySoftLimit);
      if (!evaluation.candidates.length) {
        deadEndDemandIds.add(unplaced[index].demand.id);
        for (const [key, count] of Object.entries(evaluation.reasons)) bump(reasons, key, count);
        return;
      }
      if (!selected || evaluation.candidates.length < selected.candidates.length || (evaluation.candidates.length === selected.candidates.length && taskKey(unplaced[index]).localeCompare(taskKey(unplaced[selectedIndex])) < 0)) {
        selectedIndex = index;
        selected = evaluation;
      }
    }
    if (selectedIndex < 0 || !selected) return;
    const task = unplaced[selectedIndex];
    const nextTasks = unplaced.filter((_, index) => index !== selectedIndex);
    for (const candidate of selected.candidates) {
      if (nodesVisited >= maxSearchNodes) { searchLimitReached = true; break; }
      search(place(state, task, candidate, false), nextTasks);
    }
  };

  search(initial, remaining);
  const best = bestRef.value;
  if (!best) return { status: "infeasible", placements: initial.placements, score: null, nodesVisited, searchLimitReached, diagnostics: { reasons, deadEndDemandIds: [...deadEndDemandIds].sort() }, algorithmVersion: TIMETABLE_OPTIMIZER_VERSION };
  const placements = [...best.placements].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period || a.classId.localeCompare(b.classId) || a.demandId.localeCompare(b.demandId) || a.occurrenceIndex - b.occurrenceIndex);
  return {
    status: searchLimitReached ? "feasible" : "optimal",
    placements,
    score: best.score,
    nodesVisited,
    searchLimitReached,
    diagnostics: { reasons, deadEndDemandIds: [...deadEndDemandIds].sort() },
    algorithmVersion: TIMETABLE_OPTIMIZER_VERSION,
  };
}
