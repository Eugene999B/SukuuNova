import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { confirmSubstitute, createTimetableSlot, deleteTimetableSlot, getTeacherWeeklyGrid, moveTimetableSlot, suggestSubstitutes, swapTimetableSlots } from "@/lib/timetable-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveSlot"), classId: z.string(), subjectId: z.string(), teacherId: z.string(), dayOfWeek: z.number().int().min(1).max(6), period: z.number().int().positive(), venue: z.string().max(60).optional() }),
  z.object({ action: z.literal("deleteSlot"), slotId: z.string() }),
  z.object({ action: z.literal("swapSlots"), slotIdA: z.string().min(1), slotIdB: z.string().min(1) }),
  z.object({ action: z.literal("moveSlot"), slotId: z.string().min(1), dayOfWeek: z.number().int().min(1).max(6), period: z.number().int().min(1).max(16) }),
  z.object({ action: z.literal("suggest"), absentTeacherId: z.string(), day: z.coerce.date(), period: z.number().int().positive(), asOf: z.coerce.date().optional() }),
  z.object({ action: z.literal("confirm"), timetableSlotId: z.string(), substituteTeacherId: z.string(), assignmentDate: z.coerce.date() })
]);

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    const teacherId = url.searchParams.get("teacherId") ?? "";
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "calendar:manage");
      const [school, classes, subjects, teachers, slots, assignments, academic] = await Promise.all([
        tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
        tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
        tx.subject.findMany({ where: { schoolId: session.schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        tx.timetableSlot.findMany({ where: { schoolId: session.schoolId }, include: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } }, teacher: { select: { id: true, name: true } } }, orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }] }),
        tx.substituteAssignment.findMany({ where: { schoolId: session.schoolId }, include: { timetableSlot: { include: { class: true, subject: true } }, substituteTeacher: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
        getAcademicEngineConfig(tx)
      ]);
      if (view === "teacher" && teacherId) {
        return { school, classes, subjects, teachers, slots, assignments, timetableConfig: academic.timetable, teacherGrid: await getTeacherWeeklyGrid(tx, { schoolId: session.schoolId, teacherId }) };
      }
      return { school, classes, subjects, teachers, slots, assignments, timetableConfig: academic.timetable };
    });
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      switch (input.action) {
        case "saveSlot": return createTimetableSlot(tx, { ...common, ...input });
        case "deleteSlot": return deleteTimetableSlot(tx, { ...common, slotId: input.slotId });
        case "swapSlots": return swapTimetableSlots(tx, { ...common, slotIdA: input.slotIdA, slotIdB: input.slotIdB });
        case "moveSlot": return moveTimetableSlot(tx, { ...common, slotId: input.slotId, dayOfWeek: input.dayOfWeek, period: input.period });
        case "suggest": return suggestSubstitutes(tx, { ...common, ...input });
        case "confirm": return confirmSubstitute(tx, { ...common, ...input });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
