import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { addApprovedPickup, attemptPickup, reviewPickupRequest } from "@/lib/pickup-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approveGuardian"), studentId: z.string(), guardianId: z.string() }),
  z.object({ action: z.literal("attempt"), studentId: z.string(), guardianId: z.string() }),
  z.object({
    action: z.literal("review"),
    requestId: z.string(),
    decision: z.enum(["approved", "rejected"])
  })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "attendance:record");
      const [approved, pending, events] = await Promise.all([
        tx.approvedPickup.findMany({
          include: { student: { select: { name: true } }, guardian: { select: { name: true, phone: true } } },
          orderBy: { createdAt: "desc" }
        }),
        tx.pickupApprovalRequest.findMany({
          where: { status: "pending" },
          include: {
            student: { select: { name: true } },
            collectingGuardian: { select: { name: true, phone: true } },
            requester: { select: { name: true } }
          },
          orderBy: { createdAt: "asc" }
        }),
        tx.pickupEvent.findMany({
          include: {
            student: { select: { name: true } },
            collectingGuardian: { select: { name: true } }
          },
          orderBy: { timestamp: "desc" },
          take: 100
        })
      ]);
      return { approved, pending, events };
    });
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      if (input.action === "approveGuardian") return addApprovedPickup(tx, { ...common, ...input });
      if (input.action === "attempt") return attemptPickup(tx, { ...common, ...input });
      return reviewPickupRequest(tx, { ...common, ...input });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
