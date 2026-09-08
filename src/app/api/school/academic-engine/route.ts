import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { generateBalancedTimetable } from "@/lib/timetable-engine-v2";
import { getAcademicEngineConfig, saveAcademicEngineConfig } from "@/lib/academic-engine";

const period = z.object({ period: z.number().int().min(1).max(16), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) });
const day = z.object({ dayOfWeek: z.number().int().min(1).max(7), name: z.string().min(2).max(20), enabled: z.boolean(), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), periods: z.array(period).max(16).optional() });
const room = z.object({ id: z.string().min(1).max(60), name: z.string().min(1).max(80), type: z.string().max(60).optional() });
const timetable = z.object({
  days: z.array(day).min(1).max(7),
  periodMinutes: z.number().int().min(20).max(480),
  breaks: z.array(z.object({ name: z.string().min(1).max(40), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).max(8),
  periodsPerDay: z.number().int().min(1).max(16),
  published: z.boolean(),
  weeklyPeriods: z.record(z.string(), z.number().int().min(1).max(10)).optional(),
  periods: z.array(period).max(16).optional(),
  rooms: z.array(room).max(100).optional(),
  teacherUnavailability: z.record(z.string(), z.array(z.string().regex(/^[1-6]:([1-9]|1[0-6])$/)).max(96)).optional(),
  roomRequirements: z.record(z.string(), z.object({ roomType: z.string().max(60).optional(), room: z.string().max(60).optional() })).optional(),
  doublePeriodSubjects: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
});
const assessment = z.object({ categories: z.array(z.object({ name: z.string().min(1).max(80), weight: z.number().min(0).max(100) })).min(1).max(16), rounding: z.enum(["nearest", "down", "up"]), missingScorePolicy: z.enum(["blank", "zero"]), allowTeacherOverride: z.boolean() });
const report = z.object({ includePosition: z.boolean(), includeSubjectPosition: z.boolean(), includeAttendance: z.boolean(), includeTeacherRemark: z.boolean(), includeHeadRemark: z.boolean(), includeSignatures: z.boolean(), includeSchoolContacts: z.boolean(), rankMethod: z.enum(["total_average", "weighted_total"]), showGrades: z.boolean(), showClassAverage: z.boolean() });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), timetable: timetable.optional(), assessment: assessment.optional(), reportCard: report.optional() }),
  z.object({ action: z.literal("generate"), replaceExisting: z.boolean().default(false), classIds: z.array(z.string()).max(100).optional() }),
]);

type LegacyReport = z.infer<typeof report>;
const LEGACY_DEFAULT: LegacyReport = { includePosition: true, includeSubjectPosition: true, includeAttendance: true, includeTeacherRemark: true, includeHeadRemark: true, includeSignatures: true, includeSchoolContacts: true, rankMethod: "total_average", showGrades: true, showClassAverage: true };
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function flag(raw: Record<string, unknown>, legacyKey: string, advancedKey: string, fallback: boolean) {
  if (typeof raw[legacyKey] === "boolean") return raw[legacyKey] as boolean;
  if (typeof raw[advancedKey] === "boolean") return raw[advancedKey] as boolean;
  return fallback;
}
function legacyReportView(value: unknown): LegacyReport {
  const raw = object(value);
  return {
    includePosition: flag(raw, "includePosition", "showOverallPosition", LEGACY_DEFAULT.includePosition),
    includeSubjectPosition: flag(raw, "includeSubjectPosition", "showSubjectPosition", LEGACY_DEFAULT.includeSubjectPosition),
    includeAttendance: flag(raw, "includeAttendance", "showAttendance", LEGACY_DEFAULT.includeAttendance),
    includeTeacherRemark: flag(raw, "includeTeacherRemark", "showClassTeacherRemark", LEGACY_DEFAULT.includeTeacherRemark),
    includeHeadRemark: flag(raw, "includeHeadRemark", "showHeadteacherRemark", LEGACY_DEFAULT.includeHeadRemark),
    includeSignatures: typeof raw.includeSignatures === "boolean" ? raw.includeSignatures : LEGACY_DEFAULT.includeSignatures,
    includeSchoolContacts: typeof raw.includeSchoolContacts === "boolean" ? raw.includeSchoolContacts : LEGACY_DEFAULT.includeSchoolContacts,
    rankMethod: raw.rankMethod === "weighted_total" ? "weighted_total" : "total_average",
    showGrades: typeof raw.showGrades === "boolean" ? raw.showGrades : LEGACY_DEFAULT.showGrades,
    showClassAverage: typeof raw.showClassAverage === "boolean" ? raw.showClassAverage : LEGACY_DEFAULT.showClassAverage,
  };
}
function mergeLegacyReport(existing: unknown, incoming: LegacyReport) {
  return {
    ...object(existing),
    ...incoming,
    showOverallPosition: incoming.includePosition,
    showSubjectPosition: incoming.includeSubjectPosition,
    showAttendance: incoming.includeAttendance,
    showClassTeacherRemark: incoming.includeTeacherRemark,
    showHeadteacherRemark: incoming.includeHeadRemark,
  };
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return NextResponse.json(await withTenant(session.schoolId, async (tx) => {
      const config = await getAcademicEngineConfig(tx);
      const classes = await tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } });
      return { ...config, reportCard: legacyReportView(config.reportCard), classes };
    }));
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = schema.parse(await request.json());
    return await withTenant(session.schoolId, async (tx) => {
      if (input.action === "save") {
        // Never hand the legacy report-card object to saveAcademicEngineConfig:
        // that function historically replaces the entire JSON document. Save
        // timetable/assessment first, then merge only the legacy presentation
        // keys into the richer reporting configuration.
        const result = await saveAcademicEngineConfig(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          timetable: input.timetable,
          assessment: input.assessment,
          reportCard: undefined,
        });
        let reportCard = legacyReportView(result.reportCard);
        if (input.reportCard) {
          const current = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardConfig: true } });
          const merged = mergeLegacyReport(current?.reportCardConfig, input.reportCard);
          await tx.schoolSettings.update({ where: { schoolId: session.schoolId }, data: { reportCardConfig: merged } });
          reportCard = legacyReportView(merged);
        }
        return NextResponse.json({ ...result, reportCard });
      }
      const result = await generateBalancedTimetable(tx, { schoolId: session.schoolId, actorId: session.userId, replaceExisting: input.replaceExisting, classIds: input.classIds });
      return NextResponse.json(result);
    });
  } catch (error) { return routeError(error); }
}
