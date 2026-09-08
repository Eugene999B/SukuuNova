import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { isTeachingRoleKey, roleKeyForName } from "@/lib/authorization";
import { dayBlocks } from "@/lib/timetable-engine-v2";
import { confirmSubstitute, createTimetableSlot, deleteTimetableSlot, getTeacherWeeklyGrid, moveTimetableSlot, suggestSubstitutes, swapTimetableSlots, updateTimetableSlot } from "@/lib/timetable-service";

const slotFields = {
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(6),
  period: z.number().int().min(1).max(16),
  venue: z.string().max(60).optional(),
};
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveSlot"), ...slotFields }),
  z.object({ action: z.literal("updateSlot"), slotId: z.string().min(1), ...slotFields }),
  z.object({ action: z.literal("deleteSlot"), slotId: z.string().min(1) }),
  z.object({ action: z.literal("swapSlots"), slotIdA: z.string().min(1), slotIdB: z.string().min(1) }),
  z.object({ action: z.literal("moveSlot"), slotId: z.string().min(1), dayOfWeek: z.number().int().min(1).max(6), period: z.number().int().min(1).max(16) }),
  z.object({ action: z.literal("suggest"), absentTeacherId: z.string(), day: z.coerce.date(), period: z.number().int().positive(), asOf: z.coerce.date().optional() }),
  z.object({ action: z.literal("confirm"), timetableSlotId: z.string(), substituteTeacherId: z.string(), assignmentDate: z.coerce.date() }),
]);

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    const teacherId = url.searchParams.get("teacherId") ?? "";
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "calendar:manage");
      const [school, classes, subjects, activeUsers, slots, assignments, teachingAssignments, academic] = await Promise.all([
        tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
        tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
        tx.subject.findMany({ where: { schoolId: session.schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, userRoles: { select: { role: { select: { key: true, name: true } } } } } }),
        tx.timetableSlot.findMany({ where: { schoolId: session.schoolId }, include: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } }, teacher: { select: { id: true, name: true } } }, orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }] }),
        tx.substituteAssignment.findMany({ where: { schoolId: session.schoolId }, include: { timetableSlot: { include: { class: true, subject: true } }, substituteTeacher: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
        tx.classSubjectTeacher.findMany({ where: { schoolId: session.schoolId }, select: { classId: true, subjectId: true, teacherId: true } }),
        getAcademicEngineConfig(tx),
      ]);
      const teachers = activeUsers
        .filter((user) => user.userRoles.some(({ role }) => isTeachingRoleKey(roleKeyForName(role.key?.trim() || role.name))))
        .map(({ id, name }) => ({ id, name }));
      const eligibleTeacherIds = new Set(teachers.map((teacher) => teacher.id));
      const validTeachingAssignments = teachingAssignments.filter((assignment) => eligibleTeacherIds.has(assignment.teacherId));
      return { school, classes, subjects, teachers, slots, assignments, teachingAssignments: validTeachingAssignments, timetableConfig: academic.timetable, teacherGrid: view === "teacher" && teacherId ? await getTeacherWeeklyGrid(tx, { schoolId: session.schoolId, teacherId }) : undefined };
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, async (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      if (input.action === "saveSlot" || input.action === "updateSlot" || input.action === "deleteSlot" || input.action === "swapSlots" || input.action === "moveSlot") {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable-generation:${session.schoolId}`}))`;
      }

      if (input.action === "saveSlot" || input.action === "updateSlot" || input.action === "moveSlot" || input.action === "swapSlots") {
        const academic = await getAcademicEngineConfig(tx);
        const assertConfiguredPeriod = (dayOfWeek: number, period: number) => {
          const day = academic.timetable.days.find((candidate) => candidate.dayOfWeek === dayOfWeek && candidate.enabled);
          if (!day) throw new AppError("This day is not enabled in the timetable setup.", 409, "TIMETABLE_DAY_NOT_CONFIGURED");
          const valid = dayBlocks(day, academic.timetable).periods.some((candidate) => candidate.period === period);
          if (!valid) throw new AppError("This teaching period is not configured for the selected day.", 409, "TIMETABLE_PERIOD_NOT_CONFIGURED");
        };

        if (input.action === "saveSlot" || input.action === "updateSlot" || input.action === "moveSlot") {
          assertConfiguredPeriod(input.dayOfWeek, input.period);
        } else {
          const [slotA, slotB] = await Promise.all([
            tx.timetableSlot.findFirst({ where: { id: input.slotIdA, schoolId: session.schoolId }, select: { dayOfWeek: true, period: true } }),
            tx.timetableSlot.findFirst({ where: { id: input.slotIdB, schoolId: session.schoolId }, select: { dayOfWeek: true, period: true } }),
          ]);
          if (slotA && slotB) {
            assertConfiguredPeriod(slotB.dayOfWeek, slotB.period);
            assertConfiguredPeriod(slotA.dayOfWeek, slotA.period);
          }
        }
      }

      switch (input.action) {
        case "saveSlot": return createTimetableSlot(tx, { ...common, ...input });
        case "updateSlot": return updateTimetableSlot(tx, { ...common, ...input });
        case "deleteSlot": return deleteTimetableSlot(tx, { ...common, slotId: input.slotId });
        case "swapSlots": return swapTimetableSlots(tx, { ...common, slotIdA: input.slotIdA, slotIdB: input.slotIdB });
        case "moveSlot": return moveTimetableSlot(tx, { ...common, slotId: input.slotId, dayOfWeek: input.dayOfWeek, period: input.period });
        case "suggest": return suggestSubstitutes(tx, { ...common, ...input });
        case "confirm": return confirmSubstitute(tx, { ...common, ...input });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}