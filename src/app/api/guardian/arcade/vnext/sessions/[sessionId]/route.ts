import { withTenant } from "@/lib/db";
import { readArcadeVNextSession } from "@/lib/arcade-vnext/session-service";
import {
  arcadeVNextJson,
  arcadeVNextRouteError,
  requireArcadeVNextGuardian,
} from "@/lib/arcade-vnext/guardian-route";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const current = await requireArcadeVNextGuardian();
    const { sessionId } = await context.params;
    const session = await withTenant(current.schoolId, (tx) => readArcadeVNextSession(tx, current, sessionId));
    return arcadeVNextJson(session);
  } catch (error) {
    return arcadeVNextRouteError(error);
  }
}
