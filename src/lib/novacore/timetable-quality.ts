export type TimetableQualityPlacement = {
  classId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  roomId?: string | null;
};

export type TimetableQuality = {
  placements: number;
  classConflicts: number;
  teacherConflicts: number;
  roomConflicts: number;
  repeatedAssignmentDayPenalty: number;
  teacherIdleGaps: number;
  hardConflicts: number;
  score: number;
};

function countDuplicates(keys: string[]) {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  let duplicates = 0;
  for (const count of counts.values()) if (count > 1) duplicates += count - 1;
  return duplicates;
}

export function scoreTimetableQuality(placements: TimetableQualityPlacement[]): TimetableQuality {
  const valid = placements.filter((placement) =>
    placement.classId
    && placement.subjectId
    && placement.teacherId
    && Number.isInteger(placement.dayOfWeek)
    && Number.isInteger(placement.period),
  );
  const classConflicts = countDuplicates(valid.map((placement) => `${placement.classId}:${placement.dayOfWeek}:${placement.period}`));
  const teacherConflicts = countDuplicates(valid.map((placement) => `${placement.teacherId}:${placement.dayOfWeek}:${placement.period}`));
  const roomConflicts = countDuplicates(valid.flatMap((placement) => placement.roomId ? [`${placement.roomId}:${placement.dayOfWeek}:${placement.period}`] : []));

  const assignmentDays = new Map<string, number>();
  for (const placement of valid) {
    const key = `${placement.classId}:${placement.subjectId}:${placement.teacherId}:${placement.dayOfWeek}`;
    assignmentDays.set(key, (assignmentDays.get(key) ?? 0) + 1);
  }
  let repeatedAssignmentDayPenalty = 0;
  for (const count of assignmentDays.values()) if (count > 1) repeatedAssignmentDayPenalty += count - 1;

  const teacherDays = new Map<string, number[]>();
  for (const placement of valid) {
    const key = `${placement.teacherId}:${placement.dayOfWeek}`;
    const periods = teacherDays.get(key) ?? [];
    periods.push(placement.period);
    teacherDays.set(key, periods);
  }
  let teacherIdleGaps = 0;
  for (const periods of teacherDays.values()) {
    const unique = [...new Set(periods)].sort((a, b) => a - b);
    if (unique.length < 2) continue;
    const occupied = new Set(unique);
    for (let period = unique[0]; period <= unique[unique.length - 1]; period += 1) if (!occupied.has(period)) teacherIdleGaps += 1;
  }

  const hardConflicts = classConflicts + teacherConflicts + roomConflicts;
  const score = hardConflicts * 10_000 + repeatedAssignmentDayPenalty * 10 + teacherIdleGaps;
  return {
    placements: valid.length,
    classConflicts,
    teacherConflicts,
    roomConflicts,
    repeatedAssignmentDayPenalty,
    teacherIdleGaps,
    hardConflicts,
    score,
  };
}

export function compareTimetableQuality(current: TimetableQuality, candidate: TimetableQuality) {
  const improvement = current.score === 0
    ? candidate.score === 0 ? 0 : -100
    : (current.score - candidate.score) / current.score * 100;
  return {
    currentScore: current.score,
    candidateScore: candidate.score,
    scoreImprovementPercent: Math.round(improvement * 100) / 100,
    candidateWins: candidate.score < current.score,
    hardConflictDelta: candidate.hardConflicts - current.hardConflicts,
    teacherIdleGapDelta: candidate.teacherIdleGaps - current.teacherIdleGaps,
    repeatedAssignmentDayDelta: candidate.repeatedAssignmentDayPenalty - current.repeatedAssignmentDayPenalty,
  };
}
