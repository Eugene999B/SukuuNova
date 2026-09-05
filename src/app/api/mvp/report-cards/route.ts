import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { hasPermission } from "@/lib/rbac";
import { generateReportCard, submitReportCard } from "@/lib/report-card-service";
import { approveAndQueuePublicReportCard, sendApprovedReportCardPublic } from "@/lib/report-card-release-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), studentId: z.string(), termId: z.string(), remarks: z.string().optional() }),
  z.object({ action: z.literal("submit"), reportCardId: z.string() }),
  z.object({ action: z.literal("approve"), reportCardId: z.string(), headRemark: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("send"), reportCardId: z.string() })
]);

function requestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const host = request.headers.get("host");
  if (host) return `${request.headers.get("x-forwarded-proto") || "https"}://${host}`;
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const reports = await withTenant(session.schoolId, async (tx) => {
      const canView = await hasPermission(tx, session.userId, "report_cards:view");
      if (!canView) throw new ForbiddenError("Report-card access is not permitted.");
      const parent = await hasPermission(tx, session.userId, "parents:read_linked");
      return tx.reportCard.findMany({
        where: parent ? { status: "sent", student: { guardians: { some: { guardian: { userId: session.userId } } } } } : {},
        include: { student: true, term: true },
        orderBy: { createdAt: "desc" }
      });
    });
    return NextResponse.json({ reports });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, async (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      switch (input.action) {
        case "generate": return await generateReportCard(tx, { ...common, ...input });
        case "submit": return await submitReportCard(tx, { ...common, ...input });
        case "approve": return await approveAndQueuePublicReportCard(tx, { ...common, ...input, origin: requestOrigin(request) });
        case "send": return await sendApprovedReportCardPublic(tx, { ...common, ...input, origin: requestOrigin(request) });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
