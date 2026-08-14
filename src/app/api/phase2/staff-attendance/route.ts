import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { staffAttendanceDashboard } from "@/lib/staff-attendance-service";

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const today = new Date().toISOString().slice(0, 10);
    const start = url.searchParams.get("start") ?? today;
    const end = url.searchParams.get("end") ?? today;
    const data = await withTenant(session.schoolId, (tx) =>
      staffAttendanceDashboard(tx, {
        actorId: session.userId,
        startDate: new Date(start + "T00:00:00.000Z"),
        endDate: new Date(end + "T00:00:00.000Z"),
        staffId: url.searchParams.get("staffId") ?? undefined
      })
    );
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}
