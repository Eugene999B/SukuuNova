import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { generateBalancedTimetable, type TimetableGenerationInput } from "./timetable-engine-v2";
import { getAcademicEngineConfig } from "./academic-engine";

type TimetableExtensions = {
  maxDailyPeriods: Record<string, number>;
  printTheme: "ghana_classic" | "modern_blue" | "heritage_green" | "minimal_mono";
};

type PlannedAddition = {
  classId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
};

type GenerationPlan = Awaited<ReturnType<typeof generateBalancedTimetable>> & {
  changes?: {
    keepSlotIds?: string[];
    additions?: PlannedAddition[];
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function assignmentKey(value: { classId: string; subjectId: string; teacherId: string }) {
  return `${value.classId}:${value.subjectId}:${value.teacherId}`;
}

export function readTimetableExtensions(value: unknown): TimetableExtensions {
  const raw = record(value);
  const dailyRaw = record(raw.maxDailyPeriods);
  const maxDailyPeriods: Record<string, number> = {};
  for (const [key, value] of Object.entries(dailyRaw)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    maxDailyPeriods[key] = Math.max(1, Math.min(6, Math.round(value)));
  }
  const theme = raw.printTheme;
  const printTheme: TimetableExtensions["printTheme"] =
    theme === "modern_blue" || theme === "heritage_green" || theme === "minimal_mono" || theme === "ghana_classic"
      ? theme
      : "ghana_classic";
  return { maxDailyPeriods, printTheme };
}

async function rawTimetableConfig(tx: TenantDb, schoolId: string) {
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId }, select: { timetableConfig: true } });
  return settings?.timetableConfig ?? null;
}

async function enforceDailyLimits(tx: TenantDb, input: TimetableGenerationInput, plan: GenerationPlan, extensions: TimetableExtensions) {
  const limits = extensions.maxDailyPeriods;
  if (!Object.keys(limits).length) return;

  const keepSlotIds = plan.changes?.keepSlotIds ?? [];
  const kept = keepSlotIds.length
    ? await tx.timetableSlot.findMany({
        where: { schoolId: input.schoolId, id: { in: keepSlotIds } },
        select: { classId: true, subjectId: true, teacherId: true, dayOfWeek: true },
      })
    : [];
  const rows = [...kept, ...(plan.changes?.additions ?? [])];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = assignmentKey(row);
    const dayKey = `${key}:${row.dayOfWeek}`;
    counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
  }

  for (const [assignment, maximum] of Object.entries(limits)) {
    for (let day = 1; day <= 7; day += 1) {
      const count = counts.get(`${assignment}:${day}`) ?? 0;
      if (count > maximum) {
        throw new AppError(
          `The generated timetable places ${count} lessons for one class/subject on the same day, but the school maximum is ${maximum}. Increase that daily maximum or adjust the weekly requirement and generate again.`,
          409,
          "TIMETABLE_DAILY_LIMIT_EXCEEDED",
        );
      }
    }
  }
}

export async function generateSchoolTimetable(tx: TenantDb, input: TimetableGenerationInput) {
  const raw = await rawTimetableConfig(tx, input.schoolId);
  const extensions = readTimetableExtensions(raw);

  if (input.dryRun) {
    const preview = await generateBalancedTimetable(tx, { ...input, dryRun: true }) as GenerationPlan;
    await enforceDailyLimits(tx, input, preview, extensions);
    return { ...preview, published: false };
  }

  // Hold the same school-level lock across preview validation and the actual write.
  // This makes the validated plan stable against concurrent manual timetable edits.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable-generation:${input.schoolId}`}))`;
  const preview = await generateBalancedTimetable(tx, { ...input, dryRun: true }) as GenerationPlan;
  await enforceDailyLimits(tx, input, preview, extensions);
  const result = await generateBalancedTimetable(tx, { ...input, dryRun: false }) as GenerationPlan;
  await enforceDailyLimits(tx, input, result, extensions);

  const academic = await getAcademicEngineConfig(tx, input.schoolId);
  const persisted = {
    ...academic.timetable,
    ...extensions,
    published: true,
  };
  await tx.schoolSettings.update({
    where: { schoolId: input.schoolId },
    data: { timetableConfig: persisted as unknown as Prisma.InputJsonValue },
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "timetable.published_after_generation",
    entityType: "SchoolSettings",
    entityId: input.schoolId,
    after: {
      mode: input.mode ?? (input.replaceExisting ? "rebuild" : "fill_gaps"),
      scheduled: result.scheduled,
      printTheme: extensions.printTheme,
    },
  });
  return { ...result, published: true };
}
