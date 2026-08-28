import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { signInVisitor, signOutVisitor } from "@/lib/visitor-service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("signIn"),
    name: z.string().min(2).max(100),
    phone: z.string().max(30).optional(),
    purpose: z.string().min(2).max(240),
    hostStaffId: z.string().optional()
  }),
  z.object({ action: z.literal("signOut"), visitorId: z.string() })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const rows = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "visitors:log");
      return tx.visitorLog.findMany({
        include: { hostStaff: { select: { name: true } } },
        orderBy: { timeIn: "desc" },
        take: 200
      });
    });
    return NextResponse.json({ visitors: rows });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      return input.action === "signIn"
        ? signInVisitor(tx, { ...common, ...input })
        : signOutVisitor(tx, { ...common, visitorId: input.visitorId });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
