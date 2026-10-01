import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { arcadeActionRequestSchema } from "@/lib/arcade-vnext/contracts";
import { applyArcadeVNextAction } from "@/lib/arcade-vnext/session-service";
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
    const input = await parseJson(request, arcadeActionRequestSchema);
    const result = await withTenant(current.schoolId, (tx) => applyArcadeVNextAction(tx, current, sessionId, input));
    return arcadeVNextJson(result);
  } catch (error) {
    return arcadeVNextRouteError(error);
  }
}
