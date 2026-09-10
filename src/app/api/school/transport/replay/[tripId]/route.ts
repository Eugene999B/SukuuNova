import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { getTransportTripReplay } from "@/lib/novacore/transport-replay-service";

export async function GET(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { tripId } = await context.params;
    if (!tripId || tripId.length > 100) return NextResponse.json({ ok: false, message: "Transport trip was not found." }, { status: 404 });
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "transport:view");
      return NextResponse.json(
        await getTransportTripReplay(tx, { schoolId: session.schoolId, tripId }),
        { headers: { "Cache-Control": "private, no-store" } },
      );
    });
  } catch (error) { return routeError(error); }
}
