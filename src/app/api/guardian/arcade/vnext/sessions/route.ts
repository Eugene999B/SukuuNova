import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { arcadeSessionStartSchema } from "@/lib/arcade-vnext/contracts";
import { startArcadeVNextSession } from "@/lib/arcade-vnext/session-service";
import {
  arcadeVNextJson,
  arcadeVNextRouteError,
  requireArcadeVNextGuardian,
} from "@/lib/arcade-vnext/guardian-route";

export async function POST(request: Request) {
  try {
    const current = await requireArcadeVNextGuardian();
    const input = await parseJson(request, arcadeSessionStartSchema);
    const session = await withTenant(current.schoolId, (tx) => startArcadeVNextSession(tx, current, input));
    return arcadeVNextJson(session, { status: 201 });
  } catch (error) {
    return arcadeVNextRouteError(error);
  }
}
