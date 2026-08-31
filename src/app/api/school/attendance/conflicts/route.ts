import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { listPendingAttendanceRecords, resolveAttendanceRecord } from "@/lib/attendance-resolution-service";

const schema = z.object({
  recordId: z.string().min(1),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED", "LEFT_EARLY"]),
  reason: z.string().min(3).max(500)
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const records = await withTenant(session.schoolId, (tx) =>
      listPendingAttendanceRecords(tx, { actorId: session.userId })
    );
    return NextResponse.json({ records });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, (tx) =>
      resolveAttendanceRecord(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        recordId: input.recordId,
        status: input.status,
        reason: input.reason
      })
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
