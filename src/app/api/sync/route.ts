import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { processOfflineSync } from "@/lib/offline-sync-service";

export const MAX_OFFLINE_SYNC_OPERATIONS = 25;

const operationSchema = z.object({
  clientOperationId: z.string().trim().min(8).max(200),
  clientVersion: z.number().int().min(1),
  baseEntityVersion: z.number().int().min(0).optional(),
  entityId: z.string().trim().max(200).optional(),
  operationType: z.literal("ATTENDANCE_RECORD"),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});

const schema = z.object({
  deviceId: z.string().trim().min(1).max(120),
  operations: z.array(operationSchema).min(1).max(MAX_OFFLINE_SYNC_OPERATIONS)
});

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = schema.parse(await request.json());
    const result = await withTenant(session.schoolId, (tx) => processOfflineSync(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      deviceId: input.deviceId,
      operations: input.operations
    }));
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
