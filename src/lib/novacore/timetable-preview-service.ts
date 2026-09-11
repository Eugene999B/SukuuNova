import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import type { TimetableGenerationMode } from "@/lib/timetable-engine-v2";
import { safeDayBlocks } from "@/lib/timetable-bell-schedule";
import { assignmentKey, readTimetableExtensions } from "@/lib/timetable-generation-policy";
import { optimizeTimetable, type FixedPlacement, type TimetableDemand } from "./timetable-optimizer";

export type NovaCoreTimetablePreviewInput = {
  schoolId: string;
  actorId: string;
  mode?: TimetableGenerationMode;
  lockedSlotIds?: string[];
  classIds?: string[];
  maxSearchNodes?: number;
};

type ExistingSlot = {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  venue: string | null;
};

type Addition = {
  classId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  venue: string | null;
  demandId: string;
  blockGroup: string | null;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberRecord(value: unknown) {
  const output: Record<string, number> = {};
  for (const [key, item] of Object.entries(object(value))) {
    if (typeof item === "number" && Number.isFinite(item)) output[key] = Math.max(0, Math.floor(item));
  }
  return output;
}

function assignmentKeyOf(value: { classId: string; subjectId: string; teacherId: string }) {
  return assignmentKey(value);
}

function roomRequirement(raw: unknown, classId: string, subjectId: string) {
  const requirements = object(raw);
  const candidate = object(requirements[`${classId}:${subjectId}`] ?? requirements[subjectId]);
  return {
    room: typeof candidate.room === "string" && candidate.room.trim() ? candidate.room.trim() : undefined,
    roomType: typeof candidate.roomType === "string" && candidate.roomType.trim() ? candidate.roomType.trim() : undefined,
  };
}

function configuredRoomId(value: string | null, knownRoomIds: Set<string>) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = trimmed.startsWith("room:") ? trimmed.slice(5) : trimmed;
  return knownRoomIds.has(candidate) ? candidate : null;
}

function assertPreservedPlacementsAreSafe(rows: ExistingSlot[], knownRoomIds: Set<string>) {
  const classes = new Set<string>();
  const teachers = new Set<string>();
  const rooms = new Set<string>();
  for (const row of rows) {
    const classKey = `${row.classId}:${row.dayOfWeek}:${row.period}`;
    if (classes.has(classKey)) throw new AppError("The current timetable already contains two lessons for one class in the same period. Fix that clash before generating.", 409, "EXISTING_CLASS_COLLISION");
    classes.add(classKey);

    const teacherKey = `${row.teacherId}:${row.dayOfWeek}:${row.period}`;
    if (teachers.has(teacherKey)) throw new AppError("The current timetable already double-books a teacher. Fix that clash before generating.", 409, "EXISTING_TEACHER_COLLISION");
    teachers.add(teacherKey);

    const roomId = configuredRoomId(row.venue, knownRoomIds);
    if (roomId) {
      const roomKey = `${roomId}:${row.dayOfWeek}:${row.period}`;
      if (rooms.has(roomKey)) throw new AppError("The current timetable already double-books a configured room. Fix that clash before generating.", 409, "EXISTING_ROOM_COLLISION");
      rooms.add(roomKey);
    }
  }
}

export async function previewNovaCoreTimetable(tx: TenantDb, input: NovaCoreTimetablePreviewInput) {
  await requirePermission(tx, input.actorId, "calendar:manage");
  const mode = input.mode ?? "fill_gaps";
  const [academic, rawSettings, classes, rawAssignments, existing] = await Promise.all([
    getAcademicEngineConfig(tx, input.schoolId),
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { timetableConfig: true } }),
    tx.class.findMany({
      where: input.classIds?.length ? { id: { in: input.classIds } } : {},
      select: { id: true, name: true, level: true },
      orderBy: [{ level: "asc" }, { name: "asc" }],
    }),
    tx.classSubjectTeacher.findMany({
      where: input.classIds?.length ? { classId: { in: input.classIds } } : {},
      include: { class: true, subject: true, teacher: true },
    }),
    tx.timetableSlot.findMany({
      where: { schoolId: input.schoolId },
      select: { id: true, classId: true, subjectId: true, teacherId: true, dayOfWeek: true, period: true, venue: true },
    }) as Promise<ExistingSlot[]>,
  ]);
  if (!classes.length) throw new AppError("Create at least one class before previewing timetable optimization.", 409, "NO_CLASSES");

  const classIds = new Set(classes.map((item) => item.id));
  const assignments = rawAssignments.filter((item) => classIds.has(item.classId) && item.teacher.status === "active");
  if (!assignments.length) throw new AppError("Assign subjects to classes and active teachers before generating the timetable.", 409, "NO_ASSIGNMENTS");

  const timetable = academic.timetable;
  const enabledDays = timetable.days.filter((day) => day.enabled).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const slots = enabledDays.flatMap((day) => safeDayBlocks(day, timetable).periods.map((period) => ({ dayOfWeek: day.dayOfWeek, period: period.period })));
  if (!slots.length) throw new AppError("Timetable Setup has no usable teaching periods.", 409, "NO_USABLE_PERIODS");

  const inScope = existing.filter((slot) => classIds.has(slot.classId));
  const outsideScope = existing.filter((slot) => !classIds.has(slot.classId));
  const requestedLocks = new Set(input.lockedSlotIds ?? []);
  const preservedInScope = mode === "fill_gaps"
    ? inScope
    : mode === "rebuild_preserving_locked"
      ? inScope.filter((slot) => requestedLocks.has(slot.id))
      : [];
  const preserved = [...outsideScope, ...preservedInScope];
  const preservedIds = new Set(preservedInScope.map((slot) => slot.id));
  const removeSlotIds = mode === "fill_gaps" ? [] : inScope.filter((slot) => !preservedIds.has(slot.id)).map((slot) => slot.id);
  const warnings: string[] = [];
  if (mode === "rebuild_preserving_locked" && requestedLocks.size > preservedInScope.length) {
    warnings.push(`${requestedLocks.size - preservedInScope.length} requested lock(s) are outside this generation scope or no longer exist.`);
  }

  const config = object(timetable);
  const weekly = numberRecord(config.weeklyPeriods);
  const doubles = numberRecord(config.doublePeriodSubjects);
  const extensions = readTimetableExtensions(rawSettings?.timetableConfig);
  const preservedCounts = new Map<string, number>();
  for (const slot of preservedInScope) {
    const key = assignmentKeyOf(slot);
    preservedCounts.set(key, (preservedCounts.get(key) ?? 0) + 1);
  }

  const roomList = Array.isArray(config.rooms)
    ? config.rooms.flatMap((value) => {
        const row = object(value);
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!id) return [];
        return [{ id, type: typeof row.type === "string" ? row.type : null }];
      })
    : [];
  const knownRoomIds = new Set(roomList.map((room) => room.id));
  assertPreservedPlacementsAreSafe(preserved, knownRoomIds);

  const fixedPlacements: FixedPlacement[] = preserved.map((slot) => ({
    classId: slot.classId,
    teacherId: slot.teacherId,
    dayOfWeek: slot.dayOfWeek,
    period: slot.period,
    roomId: configuredRoomId(slot.venue, knownRoomIds),
    groupId: classIds.has(slot.classId) ? assignmentKeyOf(slot) : undefined,
  }));

  const demands: TimetableDemand[] = [];
  const assignmentByDemand = new Map<string, { classId: string; subjectId: string; teacherId: string }>();
  for (const row of assignments) {
    const baseKey = assignmentKeyOf(row);
    const target = Math.max(1, Math.min(10, weekly[baseKey] ?? 2));
    const already = preservedCounts.get(baseKey) ?? 0;
    const remainingPeriods = Math.max(0, target - already);
    if (already > target) warnings.push(`${row.class.name} · ${row.subject.name} has ${already} preserved periods against a target of ${target}.`);
    if (!remainingPeriods) continue;

    const requirement = roomRequirement(config.roomRequirements, row.classId, row.subjectId);
    if (requirement.room && !knownRoomIds.has(requirement.room)) {
      throw new AppError(`A timetable rule references room "${requirement.room}" but that room is not configured.`, 409, "ROOM_NOT_FOUND");
    }
    if (requirement.roomType && !roomList.some((room) => room.type === requirement.roomType)) {
      throw new AppError(`No configured room matches the required room type "${requirement.roomType}". Add a matching room or change the subject room rule.`, 409, "ROOM_TYPE_NOT_FOUND");
    }

    const doublePairs = Math.min(doubles[row.subjectId] ?? 0, Math.floor(remainingPeriods / 2));
    const singles = remainingPeriods - doublePairs * 2;
    const common = {
      groupId: baseKey,
      classId: row.classId,
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      allowedRoomIds: requirement.room ? [requirement.room] : undefined,
      requiredRoomType: requirement.roomType,
      maxPerDay: extensions.maxDailyPeriods[baseKey],
    };
    if (doublePairs) {
      const id = `${baseKey}:double`;
      demands.push({ id, ...common, occurrences: doublePairs, blockSize: 2 });
      assignmentByDemand.set(id, { classId: row.classId, subjectId: row.subjectId, teacherId: row.teacherId });
    }
    if (singles) {
      const id = `${baseKey}:single`;
      demands.push({ id, ...common, occurrences: singles, blockSize: 1 });
      assignmentByDemand.set(id, { classId: row.classId, subjectId: row.subjectId, teacherId: row.teacherId });
    }
  }

  const teacherUnavailable = Object.entries(object(config.teacherUnavailability)).flatMap(([teacherId, raw]) =>
    Array.isArray(raw)
      ? raw.flatMap((slot) => typeof slot === "string" && /^([1-7]):(\d+)$/.test(slot) ? [`${teacherId}:${slot}`] : [])
      : [],
  );

  const result = optimizeTimetable({
    slots,
    rooms: roomList,
    demands,
    fixedPlacements,
    teacherUnavailable,
    teacherDailySoftLimit: Math.max(1, Math.min(8, Math.ceil(slots.length / Math.max(enabledDays.length, 1)) - 1)),
    maxSearchNodes: input.maxSearchNodes,
  });

  const additions: Addition[] = [];
  for (const placement of result.placements.filter((item) => !item.locked)) {
    const assignment = assignmentByDemand.get(placement.demandId);
    if (!assignment) continue;
    const blockGroup = placement.blockSize === 2 ? `${placement.demandId}:${placement.occurrenceIndex}` : null;
    for (let offset = 0; offset < placement.blockSize; offset += 1) {
      additions.push({
        ...assignment,
        dayOfWeek: placement.dayOfWeek,
        period: placement.period + offset,
        venue: placement.roomId ? `room:${placement.roomId}` : null,
        demandId: placement.demandId,
        blockGroup,
      });
    }
  }
  additions.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period || a.classId.localeCompare(b.classId));

  const dailyCounts = new Map<string, number>();
  for (const slot of preservedInScope) {
    const key = `${assignmentKeyOf(slot)}:${slot.dayOfWeek}`;
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }
  for (const slot of additions) {
    const key = `${assignmentKeyOf(slot)}:${slot.dayOfWeek}`;
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }
  const dailyLimitViolations: Array<{ assignmentKey: string; dayOfWeek: number; count: number; maximum: number }> = [];
  for (const [key, maximum] of Object.entries(extensions.maxDailyPeriods)) {
    for (const day of enabledDays) {
      const count = dailyCounts.get(`${key}:${day.dayOfWeek}`) ?? 0;
      if (count > maximum) dailyLimitViolations.push({ assignmentKey: key, dayOfWeek: day.dayOfWeek, count, maximum });
    }
  }
  if (dailyLimitViolations.length) warnings.push(`${dailyLimitViolations.length} daily lesson-limit violation(s) remain in this candidate; it cannot be published until they are resolved.`);

  const requestedPeriods = assignments.reduce((sum, row) => sum + Math.max(1, Math.min(10, weekly[assignmentKeyOf(row)] ?? 2)), 0);
  return {
    engine: "novacore",
    previewOnly: true,
    mode,
    status: dailyLimitViolations.length && result.status !== "infeasible" ? "policy_violation" : result.status,
    score: result.score,
    algorithmVersion: result.algorithmVersion,
    nodesVisited: result.nodesVisited,
    searchLimitReached: result.searchLimitReached,
    preservedSlotIds: preservedInScope.map((slot) => slot.id),
    removeSlotIds,
    additions,
    coverage: {
      requestedPeriods,
      preservedPeriods: preservedInScope.length,
      generatedPeriods: additions.length,
      satisfiedPeriods: preservedInScope.length + additions.length,
    },
    diagnostics: { ...result.diagnostics, dailyLimitViolations },
    warnings,
  };
}
