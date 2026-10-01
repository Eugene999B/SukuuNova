import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { arcadeArtifactRequestSchema } from "@/lib/arcade-vnext/contracts";
import { submitArcadeVNextArtifact } from "@/lib/arcade-vnext/session-service";
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
    const input = await parseJson(request, arcadeArtifactRequestSchema);
    const result = await withTenant(current.schoolId, (tx) => submitArcadeVNextArtifact(tx, current, sessionId, input));
    return arcadeVNextJson(result);
  } catch (error) {
    return arcadeVNextRouteError(error);
  }
}
