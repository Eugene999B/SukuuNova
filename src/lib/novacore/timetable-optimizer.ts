export const TIMETABLE_OPTIMIZER_VERSION = "timetable-csp-v1.0.0";

export type OptimizerSlot = { dayOfWeek: number; period: number };
export type OptimizerRoom = { id: string; type?: string | null };

export type TimetableDemand = {
  id: string;
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
  diagnostics: {
    reasons: Record<string, number>;
    deadEndDemandIds: string[];
  };
  algorithmVersion: string;
};

type Task = { demand: TimetableDemand; occurrenceIndex: number };
type Candidate = { dayOfWeek: number; period: number; roomId: string | null; penalty: number };
type Occupancy = {
  class: Set<string>;
  teacher: Set<string>;
  room: Set<string>;
  demandDays: Map<string, Map<number, number>>;
  teacherDays: Map<string, Map<number, number>>;
};

type SearchState = {
  placements: OptimizedPlacement[];
  occupancy: Occupancy;
  penalty: number;
};

type CandidateEvaluation = { candidates: Candidate[]; reasons: Record<string, number> };

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function slotKey(entityId: string, day: number, period: number) {
  return `${entityId}:${day}:${period}`;
}

function roomKey(roomId: string, day: number, period: number) {
  return `${roomId}:${day}:${period}`;
}

function bump(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

function cloneCountMap(source: Map<string, Map<number, number>>) {
  return new Map([...source].map(([id, counts]) => [id, new Map(counts)]));
}

function cloneOccupancy(source: Occupancy): Occupancy {
  return {
    class: new Set(source.class),
    teacher: new Set(source.teacher),
    room: new Set(source.room),
    demandDays: cloneCountMap(source.demandDays),
    teacherDays: cloneCountMap(source.teacherDays),
  };
}

function incrementNested(map: Map<string, Map<number, number>>, id: string, day: number, amount = 1) {
  const counts = map.get(id) ?? new Map<number, number>();
  counts.set(day, (counts.get(day) ?? 0) + amount);
  map.set(id, counts);
}

function normalizeSlots(slots: OptimizerSlot[]) {
  const unique = new Map<string, OptimizerSlot>();
  for (const slot of slots) {
    if (!Number.isInteger(slot.dayOfWeek) || !Number.isInteger(slot.period)) continue;
    if (slot.dayOfWeek < 1 || slot.dayOfWeek > 7 || slot.period < 1 || slot.period > 32) continue;
    unique.set(`${slot.dayOfWeek}:${slot.period}`, { dayOfWeek: slot.dayOfWeek, period: slot.period });
  }
  return [...unique.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period);
}

function taskKey(task: Task) {
  return `${task.demand.id}:${task.occurrenceIndex}`;
}

function placementPeriods(start: number, blockSize: 1 | 2) {
  return blockSize === 2 ? [start, start + 1] : [start];
}

function candidateRooms(demand: TimetableDemand, rooms: OptimizerRoom[]) {
  if (demand.allowedRoomIds) {
    const allowed = new Set(demand.allowedRoomIds);
    return rooms.filter((room) => allowed.has(room.id) && (!demand.requiredRoomType || room.type === demand.requiredRoomType));
  }
  if (demand.requiredRoomType) return rooms.filter((room) => room.type === demand.requiredRoomType);
  return [];
}

function evaluateCandidates(
  task: Task,
  slots: OptimizerSlot[],
  slotSet: Set<string>,
  rooms: OptimizerRoom[],
  occupancy: Occupancy,
  unavailable: { teacher: Set<string>; class: Set<string>; room: Set<string> },
  teacherDailySoftLimit: number,
): CandidateEvaluation {
  const reasons: Record<string, number> = {};
  const candidates: Candidate[] = [];
  const demand = task.demand;
  const blockSize = demand.blockSize ?? 1;
  const roomsForDemand = candidateRooms(demand, rooms);
  const roomRequired = Boolean(demand.allowedRoomIds || demand.requiredRoomType);
  if (roomRequired && !roomsForDemand.length) {
    bump(reasons, "no_eligible_room");
    return { candidates, reasons };
  }
  const roomChoices: Array<string | null> = roomRequired ? roomsForDemand.map((room) => room.id).sort() : [null];

  for (const slot of slots) {
    const periods = placementPeriods(slot.period, blockSize);
    if (periods.some((period) => !slotSet.has(`${slot.dayOfWeek}:${period}`))) {
      bump(reasons, "non_contiguous_block");
      continue;
    }
    const dayCount = occupancy.demandDays.get(demand.id)?.get(slot.dayOfWeek) ?? 0;
    if (demand.maxPerDay != null && dayCount >= clampInteger(demand.maxPerDay, 1, 32)) {
      bump(reasons, "daily_limit");
      continue;
    }

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
      if (blocked) {
        bump(reasons, blocked);
        continue;
      }

      let penalty = dayCount * 12;
      if (demand.preferredDays?.length && !demand.preferredDays.includes(slot.dayOfWeek)) penalty += 4;
      if (demand.avoidPeriods?.includes(slot.period)) penalty += 6;
      const teacherDayCount = occupancy.teacherDays.get(demand.teacherId)?.get(slot.dayOfWeek) ?? 0;
      const projectedTeacherPeriods = teacherDayCount + blockSize;
      if (projectedTeacherPeriods > teacherDailySoftLimit) penalty += (projectedTeacherPeriods - teacherDailySoftLimit) * 3;
      candidates.push({ dayOfWeek: slot.dayOfWeek, period: slot.period, roomId, penalty });
    }
  }
  candidates.sort((a, b) => a.penalty - b.penalty || a.dayOfWeek - b.dayOfWeek || a.period - b.period || (a.roomId ?? "").localeCompare(b.roomId ?? ""));
  return { candidates, reasons };
}

function place(state: SearchState, task: Task, candidate: Candidate, locked: boolean) {
  const occupancy = cloneOccupancy(state.occupancy);
  const blockSize = task.demand.blockSize ?? 1;
  const periods = placementPeriods(candidate.period, blockSize);
  for (const period of periods) {
    occupancy.class.add(slotKey(task.demand.classId, candidate.dayOfWeek, period));
    occupancy.teacher.add(slotKey(task.demand.teacherId, candidate.dayOfWeek, period));
    if (candidate.roomId) occupancy.room.add(roomKey(candidate.roomId, candidate.dayOfWeek, period));
  }
  incrementNested(occupancy.demandDays, task.demand.id, candidate.dayOfWeek);
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
  } satisfies SearchState;
}

function finalGapPenalty(placements: OptimizedPlacement[]) {
  const byTeacherDay = new Map<string, number[]>();
  for (const placement of placements) {
    const key = `${placement.teacherId}:${placement.dayOfWeek}`;
    const periods = byTeacherDay.get(key) ?? [];
    for (const period of placementPeriods(placement.period, placement.blockSize)) periods.push(period);
    byTeacherDay.set(key, periods);
  }
  let penalty = 0;
  for (const periods of byTeacherDay.values()) {
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
  const teacherDailySoftLimit = clampInteger(input.teacherDailySoftLimit ?? 5, 1, 32);
  const maxSearchNodes = clampInteger(input.maxSearchNodes ?? 200_000, 100, 2_000_000);
  const reasons: Record<string, number> = {};
  const deadEndDemandIds = new Set<string>();

  if (!slots.length) {
    return { status: "infeasible", placements: [], score: null, nodesVisited: 0, searchLimitReached: false, diagnostics: { reasons: { no_slots: 1 }, deadEndDemandIds: [] }, algorithmVersion: TIMETABLE_OPTIMIZER_VERSION };
  }

  const demands = [...input.demands]
    .filter((demand) => demand.id && demand.classId && demand.subjectId && demand.teacherId && Number.isFinite(demand.occurrences) && demand.occurrences > 0)
    .map((demand) => ({ ...demand, occurrences: clampInteger(demand.occurrences, 1, 40), blockSize: demand.blockSize ?? 1 as 1 | 2 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const demandById = new Map(demands.map((demand) => [demand.id, demand]));
  const tasks: Task[] = demands.flatMap((demand) => Array.from({ length: demand.occurrences }, (_, occurrenceIndex) => ({ demand, occurrenceIndex })));
  const taskByKey = new Map(tasks.map((task) => [taskKey(task), task]));

  const occupancy: Occupancy = { class: new Set(), teacher: new Set(), room: new Set(), demandDays: new Map(), teacherDays: new Map() };
  for (const fixed of input.fixedPlacements ?? []) {
    occupancy.class.add(slotKey(fixed.classId, fixed.dayOfWeek, fixed.period));
    occupancy.teacher.add(slotKey(fixed.teacherId, fixed.dayOfWeek, fixed.period));
    if (fixed.roomId) occupancy.room.add(roomKey(fixed.roomId, fixed.dayOfWeek, fixed.period));
    incrementNested(occupancy.teacherDays, fixed.teacherId, fixed.dayOfWeek);
  }
  const unavailable = {
    teacher: new Set(input.teacherUnavailable ?? []),
    class: new Set(input.classUnavailable ?? []),
    room: new Set(input.roomUnavailable ?? []),
  };

  let state: SearchState = { placements: [], occupancy, penalty: 0 };
  const lockedKeys = new Set<string>();
  for (const locked of [...(input.lockedPlacements ?? [])].sort((a, b) => a.demandId.localeCompare(b.demandId) || a.occurrenceIndex - b.occurrenceIndex)) {
    const task = taskByKey.get(`${locked.demandId}:${locked.occurrenceIndex}`);
    if (!task || !demandById.has(locked.demandId)) {
      bump(reasons, "locked_demand_missing");
      continue;
    }
    const evaluated = evaluateCandidates(task, [{ dayOfWeek: locked.dayOfWeek, period: locked.period }], slotSet, rooms, state.occupancy, unavailable, teacherDailySoftLimit);
    const candidate = evaluated.candidates.find((item) => (locked.roomId ?? null) === item.roomId);
    if (!candidate) {
      bump(reasons, "invalid_locked_placement");
      for (const [key, count] of Object.entries(evaluated.reasons)) reasons[key] = (reasons[key] ?? 0) + count;
      return { status: "infeasible", placements: state.placements, score: null, nodesVisited: 0, searchLimitReached: false, diagnostics: { reasons, deadEndDemandIds: [locked.demandId] }, algorithmVersion: TIMETABLE_OPTIMIZER_VERSION };
    }
    state = place(state, task, candidate, true);
    lockedKeys.add(taskKey(task));
  }

  const remaining = tasks.filter((task) => !lockedKeys.has(taskKey(task)));
  let nodesVisited = 0;
  let searchLimitReached = false;
  let best: { placements: OptimizedPlacement[]; score: number } | null = null;

  const search = (current: SearchState, unplaced: Task[]) => {
    if (nodesVisited >= maxSearchNodes) { searchLimitReached = true; return; }
    nodesVisited += 1;
    if (!unplaced.length) {
      const score = current.penalty + finalGapPenalty(current.placements);
      if (!best || score < best.score) best = { placements: current.placements, score };
      return;
    }
    if (best && current.penalty >= best.score) return;

    let selectedIndex = -1;
    let selectedEvaluation: CandidateEvaluation | null = null;
    for (let index = 0; index < unplaced.length; index += 1) {
      const evaluation = evaluateCandidates(unplaced[index], slots, slotSet, rooms, current.occupancy, unavailable, teacherDailySoftLimit);
      if (!evaluation.candidates.length) {
        deadEndDemandIds.add(unplaced[index].demand.id);
        for (const [key, count] of Object.entries(evaluation.reasons)) reasons[key] = (reasons[key] ?? 0) + count;
        return;
      }
      if (!selectedEvaluation || evaluation.candidates.length < selectedEvaluation.candidates.length || (evaluation.candidates.length === selectedEvaluation.candidates.length && taskKey(unplaced[index]).localeCompare(taskKey(unplaced[selectedIndex])) < 0)) {
        selectedIndex = index;
        selectedEvaluation = evaluation;
      }
    }
    if (selectedIndex < 0 || !selectedEvaluation) return;
    const task = unplaced[selectedIndex];
    const nextTasks = unplaced.filter((_, index) => index !== selectedIndex);
    for (const candidate of selectedEvaluation.candidates) {
      if (nodesVisited >= maxSearchNodes) { searchLimitReached = true; break; }
      search(place(current, task, candidate, false), nextTasks);
    }
  };

  search(state, remaining);
  if (!best) {
    return { status: "infeasible", placements: state.placements, score: null, nodesVisited, searchLimitReached, diagnostics: { reasons, deadEndDemandIds: [...deadEndDemandIds].sort() }, algorithmVersion: TIMETABLE_OPTIMIZER_VERSION };
  }
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
