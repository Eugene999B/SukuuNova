import type { TenantDb } from "@/lib/db";
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
  return {
    ...preview,
    shadow: {
      current: currentQuality,
      candidate: candidateQuality,
      comparison: compareTimetableQuality(currentQuality, candidateQuality),
    },
  };
}
