import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { arcadeFinishRequestSchema } from "@/lib/arcade-vnext/contracts";
import { finishArcadeVNextSession } from "@/lib/arcade-vnext/session-service";
import {
  arcadeVNextJson,
  arcadeVNextRouteError,
  requireArcadeVNextGuardian,
} from "@/lib/arcade-vnext/guardian-route";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const current = await requireArcadeVNextGuardian();
    const { sessionId } = await context.params;
    const input = await parseJson(request, arcadeFinishRequestSchema);
    const result = await withTenant(current.schoolId, (tx) => finishArcadeVNextSession(tx, current, sessionId, input));
    return arcadeVNextJson(result);
  } catch (error) {
    return arcadeVNextRouteError(error);
  }
}
