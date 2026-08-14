import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { attendanceSummary, finalizeStudentAttendance, recordAttendance } from "@/lib/attendance-service";
import { createAttendanceQr, verifyAttendanceQr } from "@/lib/qr-attendance";
import { requirePermission } from "@/lib/rbac";

const target = z.union([
  z.object({ studentId: z.string(), staffId: z.never().optional() }),
  z.object({ staffId: z.string(), studentId: z.never().optional() })
]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record"), target, type: z.enum(["in", "out"]), timestamp: z.coerce.date().optional() }),
  z.object({ action: z.literal("finalize"), day: z.coerce.date(), classId: z.string().optional() }),
  z.object({ action: z.literal("qrToken"), kind: z.enum(["student", "staff"]), id: z.string() }),
  z.object({ action: z.literal("qrScan"), token: z.string(), type: z.enum(["in", "out"]), timestamp: z.coerce.date().optional() })
]);

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const day = new Date(url.searchParams.get("day") ?? new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    const result = await withTenant(session.schoolId, (tx) =>
      attendanceSummary(tx, { actorId: session.userId, day, classId: url.searchParams.get("classId") ?? undefined })
    );
    return NextResponse.json(result);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, async (tx) => {
      if (input.action === "record") {
        return recordAttendance(tx, { schoolId: session.schoolId, actorId: session.userId, target: input.target, type: input.type, method: "manual", timestamp: input.timestamp });
      }
      if (input.action === "finalize") {
        return finalizeStudentAttendance(tx, { schoolId: session.schoolId, actorId: session.userId, day: input.day, classId: input.classId });
      }
      if (input.action === "qrToken") {
        await requirePermission(tx, session.userId, "attendance:record");
        return { token: await createAttendanceQr(session.schoolId, { kind: input.kind, id: input.id }) };
      }
      const verified = await verifyAttendanceQr(input.token, session.schoolId);
      return recordAttendance(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        target: verified.kind === "student" ? { studentId: verified.id } : { staffId: verified.id },
        type: input.type,
        method: "qr",
        timestamp: input.timestamp
      });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
