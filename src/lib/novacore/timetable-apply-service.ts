import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { readTimetableExtensions } from "@/lib/timetable-generation-policy";
import { previewNovaCoreTimetable, type NovaCoreTimetablePreviewInput } from "./timetable-preview-service";

type ApplyInput = NovaCoreTimetablePreviewInput & {
  dryRun?: boolean;
  replaceExisting?: boolean;
};

type CollisionRow = {
  id?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  venue: string | null;
};

function normalizedVenue(value: string | null | undefined) {
  const venue = value?.trim();
  if (!venue) return null;
  if (venue.startsWith("room:")) return `room:${venue.slice(5).trim().toLowerCase()}`;
  if (venue.startsWith("type:")) return `type:${venue.slice(5).trim().toLowerCase()}`;
  return `venue:${venue.toLowerCase()}`;
}

function assertCollisionFree(rows: CollisionRow[]) {
  const classSlots = new Map<string, CollisionRow>();
  const teacherSlots = new Map<string, CollisionRow>();
  const roomSlots = new Map<string, CollisionRow>();

  for (const row of rows) {
    const classKey = `${row.classId}:${row.dayOfWeek}:${row.period}`;
    const existingClass = classSlots.get(classKey);
    if (existingClass) {
      throw new AppError("The generated timetable would place two lessons in the same class period. No changes were published.", 409, "TIMETABLE_CLASS_COLLISION");
    }
    classSlots.set(classKey, row);

    const teacherKey = `${row.teacherId}:${row.dayOfWeek}:${row.period}`;
    const existingTeacher = teacherSlots.get(teacherKey);
    if (existingTeacher) {
      throw new AppError("The generated timetable would double-book a teacher across classes. No changes were published.", 409, "TIMETABLE_TEACHER_COLLISION");
    }
    teacherSlots.set(teacherKey, row);

    const venue = normalizedVenue(row.venue);
    if (venue) {
      const roomKey = `${venue}:${row.dayOfWeek}:${row.period}`;
      const existingRoom = roomSlots.get(roomKey);
      if (existingRoom) {
        throw new AppError("The generated timetable would double-book a room. No changes were published.", 409, "TIMETABLE_ROOM_COLLISION");
      }
      roomSlots.set(roomKey, row);
    }
  }
}

function diagnosticMessage(preview: Awaited<ReturnType<typeof previewNovaCoreTimetable>>) {
  const reasons = Object.entries(preview.diagnostics.reasons ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4)
    .map(([reason, count]) => `${reason.replaceAll("_", " ")} (${count})`)
    .join(", ");
  const deadEnds = preview.diagnostics.deadEndDemandIds?.length
    ? ` Tight assignments: ${preview.diagnostics.deadEndDemandIds.slice(0, 3).join(", ")}.`
    : "";
  return `SukuuNova could not produce a clash-free timetable from the current weekly lesson targets and availability${reasons ? `: ${reasons}` : "."}${deadEnds} Adjust the timetable setup and try again.`;
}

export async function applyNovaCoreTimetable(tx: TenantDb, input: ApplyInput) {
  await requirePermission(tx, input.actorId, "calendar:manage");
  const mode = input.mode ?? (input.replaceExisting ? "rebuild" : "fill_gaps");

  if (!input.dryRun) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable-generation:${input.schoolId}`}))`;
  }

  const preview = await previewNovaCoreTimetable(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    mode,
    lockedSlotIds: input.lockedSlotIds,
    classIds: input.classIds,
    maxSearchNodes: input.maxSearchNodes ?? 500_000,
  });

  if (preview.status === "infeasible" || preview.status === "policy_violation") {
    throw new AppError(diagnosticMessage(preview), 409, "TIMETABLE_UNSATISFIABLE");
  }
  if (preview.coverage.satisfiedPeriods < preview.coverage.requestedPeriods) {
    throw new AppError(
      `The optimizer covered ${preview.coverage.satisfiedPeriods} of ${preview.coverage.requestedPeriods} required lesson periods. Nothing was published.`,
      409,
      "TIMETABLE_INCOMPLETE",
    );
  }

  const existing = await tx.timetableSlot.findMany({
    where: { schoolId: input.schoolId },
    select: { id: true, classId: true, subjectId: true, teacherId: true, dayOfWeek: true, period: true, venue: true },
  });
  const removeIds = new Set(preview.removeSlotIds);
  const finalPlan: CollisionRow[] = [
    ...existing.filter((slot) => !removeIds.has(slot.id)),
    ...preview.additions.map((slot) => ({
      classId: slot.classId,
      subjectId: slot.subjectId,
      teacherId: slot.teacherId,
      dayOfWeek: slot.dayOfWeek,
      period: slot.period,
      venue: slot.venue,
    })),
  ];
  assertCollisionFree(finalPlan);

  if (input.dryRun) {
    return { ...preview, previewOnly: true, dryRun: true, published: false };
  }

  if (preview.removeSlotIds.length) {
    await tx.timetableSlot.deleteMany({ where: { schoolId: input.schoolId, id: { in: preview.removeSlotIds } } });
  }
  for (const slot of preview.additions) {
    await tx.timetableSlot.create({
      data: {
        schoolId: input.schoolId,
        classId: slot.classId,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        venue: slot.venue,
      },
    });
  }

  const persistedRows = await tx.timetableSlot.findMany({
    where: { schoolId: input.schoolId },
    select: { id: true, classId: true, subjectId: true, teacherId: true, dayOfWeek: true, period: true, venue: true },
  });
  assertCollisionFree(persistedRows);

  const [academic, rawSettings] = await Promise.all([
    getAcademicEngineConfig(tx, input.schoolId),
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { timetableConfig: true } }),
  ]);
  const extensions = readTimetableExtensions(rawSettings?.timetableConfig);
  const timetableConfig = {
    ...academic.timetable,
    ...extensions,
    published: true,
  };
  await tx.schoolSettings.update({
    where: { schoolId: input.schoolId },
    data: { timetableConfig: timetableConfig as unknown as Prisma.InputJsonValue },
  });

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "timetable.novacore_generation_applied",
    entityType: "Timetable",
    entityId: `novacore-${Date.now()}`,
    after: {
      mode,
      algorithmVersion: preview.algorithmVersion,
      score: preview.score,
      nodesVisited: preview.nodesVisited,
      generatedPeriods: preview.additions.length,
      removedPeriods: preview.removeSlotIds.length,
      requestedPeriods: preview.coverage.requestedPeriods,
      searchLimitReached: preview.searchLimitReached,
    },
  });

  return {
    ...preview,
    previewOnly: false,
    dryRun: false,
    published: true,
    scheduled: preview.additions.length,
    removed: preview.removeSlotIds.length,
  };
}
