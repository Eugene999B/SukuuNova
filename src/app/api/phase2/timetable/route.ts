import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import {
  confirmSubstitute,
  createTimetableSlot,
  deleteTimetableSlot,
  suggestSubstitutes
} from "@/lib/timetable-service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveSlot"),
    classId: z.string(), subjectId: z.string(), teacherId: z.string(),
    dayOfWeek: z.number().int().min(0).max(6), period: z.number().int().positive()
  }),
  z.object({ action: z.literal("deleteSlot"), slotId: z.string() }),
  z.object({
    action: z.literal("suggest"),
    absentTeacherId: z.string(), day: z.coerce.date(),
    period: z.number().int().positive(), asOf: z.coerce.date().optional()
  }),
  z.object({
    action: z.literal("confirm"),
    timetableSlotId: z.string(), substituteTeacherId: z.string(),
    assignmentDate: z.coerce.date()
  })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "classes:manage");
      const [slots, assignments] = await Promise.all([
        tx.timetableSlot.findMany({
          include: {
            class: { select: { name: true } },
            subject: { select: { name: true } },
            teacher: { select: { name: true } }
          },
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }]
        }),
        tx.substituteAssignment.findMany({
          include: {
            timetableSlot: { include: { class: true, subject: true } },
            substituteTeacher: { select: { name: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      ]);
      return { slots, assignments };
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
        case "deleteSlot": return deleteTimetableSlot(tx, { actorId: session.userId, slotId: input.slotId });
        case "suggest": return suggestSubstitutes(tx, { actorId: session.userId, ...input });
        case "confirm": return confirmSubstitute(tx, { ...common, ...input });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
