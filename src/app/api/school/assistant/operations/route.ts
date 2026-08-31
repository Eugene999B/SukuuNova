import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { runOperationsAssistant } from "@/lib/operations-assistant-service";

const schema = z.object({ message: z.string().min(1).max(500) });

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, (tx) => runOperationsAssistant(tx, {
      actorId: session.userId,
      message: input.message
    }));
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
