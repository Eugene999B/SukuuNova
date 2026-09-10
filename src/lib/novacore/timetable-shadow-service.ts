import type { TenantDb } from "@/lib/db";
import { fingerprintNovaCoreInput, recordNovaCoreDecisionBestEffort } from "./decision-ledger";
import { compareTimetableQuality, scoreTimetableQuality, type TimetableQualityPlacement } from "./timetable-quality";
import { previewNovaCoreTimetable, type NovaCoreTimetablePreviewInput } from "./timetable-preview-service";

type CurrentSlot = {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  venue: string | null;
};

export async function previewNovaCoreTimetableWithShadow(tx: TenantDb, input: NovaCoreTimetablePreviewInput) {
  const startedAt = Date.now();
  const preview = await previewNovaCoreTimetable(tx, input);
  const classes = input.classIds?.length
    ? new Set(input.classIds)
    : null;
  const currentRows = await tx.timetableSlot.findMany({
    where: { schoolId: input.schoolId, ...(input.classIds?.length ? { classId: { in: input.classIds } } : {}) },
    select: { id: true, classId: true, subjectId: true, teacherId: true, dayOfWeek: true, period: true, venue: true },
  }) as CurrentSlot[];
  const current = classes ? currentRows.filter((row) => classes.has(row.classId)) : currentRows;
  const preservedIds = new Set(preview.preservedSlotIds);
  const candidateRows: TimetableQualityPlacement[] = [
    ...current.filter((row) => preservedIds.has(row.id)).map((row) => ({
      classId: row.classId,
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      dayOfWeek: row.dayOfWeek,
      period: row.period,
      roomId: row.venue,
    })),
    ...preview.additions.map((row) => ({
      classId: row.classId,
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      dayOfWeek: row.dayOfWeek,
      period: row.period,
      roomId: row.venue,
    })),
  ];
  const currentQuality = scoreTimetableQuality(current.map((row) => ({
    classId: row.classId,
    subjectId: row.subjectId,
    teacherId: row.teacherId,
    dayOfWeek: row.dayOfWeek,
    period: row.period,
    roomId: row.venue,
  })), preview.coverage.requestedPeriods);
  const candidateQuality = scoreTimetableQuality(candidateRows, preview.coverage.requestedPeriods);
  const comparison = compareTimetableQuality(currentQuality, candidateQuality);
  const response = {
    ...preview,
    shadow: {
      current: currentQuality,
      candidate: candidateQuality,
      comparison,
    },
  };

  const inputFingerprint = fingerprintNovaCoreInput({
    mode: preview.mode,
    requestedClassIds: [...(input.classIds ?? [])].sort(),
    lockedSlotIds: [...(input.lockedSlotIds ?? [])].sort(),
    maxSearchNodes: input.maxSearchNodes ?? null,
    currentSlots: current.map((row) => ({
      id: row.id,
      classId: row.classId,
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      dayOfWeek: row.dayOfWeek,
      period: row.period,
      venue: row.venue,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
  const diagnosticReasons = Object.entries(preview.diagnostics.reasons)
    .filter(([, count]) => count > 0)
    .map(([reason]) => reason);
  await recordNovaCoreDecisionBestEffort(tx, {
    schoolId: input.schoolId,
    algorithmKey: "timetable.constraint-solver",
    entityType: "TimetablePreview",
    entityId: input.schoolId,
    inputFingerprint,
    reasonCodes: [
      `status:${preview.status}`,
      comparison.candidateWins ? "candidate_wins" : "candidate_not_better",
      ...(preview.searchLimitReached ? ["search_limit_reached"] : []),
      ...(preview.diagnostics.dailyLimitViolations.length ? ["daily_limit_violation"] : []),
      ...diagnosticReasons,
    ],
    outputSummary: {
      status: preview.status,
      solverScore: preview.score,
      nodesVisited: preview.nodesVisited,
      searchLimitReached: preview.searchLimitReached,
      requestedPeriods: preview.coverage.requestedPeriods,
      satisfiedPeriods: preview.coverage.satisfiedPeriods,
      generatedPeriods: preview.coverage.generatedPeriods,
      currentQualityScore: currentQuality.score,
      candidateQualityScore: candidateQuality.score,
      candidateWins: comparison.candidateWins,
      scoreImprovementPercent: comparison.scoreImprovementPercent,
      hardConflictDelta: comparison.hardConflictDelta,
      teacherIdleGapDelta: comparison.teacherIdleGapDelta,
      repeatedAssignmentDayDelta: comparison.repeatedAssignmentDayDelta,
      warningCount: preview.warnings.length,
    },
    shadowGroupKey: `timetable:${inputFingerprint}`,
    latencyMs: Date.now() - startedAt,
  });

  return response;
}
