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
  z.object({ action: z.literal("generate"), studentId: z.string().min(1).max(100), termId: z.string().min(1).max(100), remarks: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("submit"), reportCardId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("approve"), reportCardId: z.string().min(1).max(100), headRemark: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("send"), reportCardId: z.string().min(1).max(100) })
]);

function appOrigin(): string {
  // Never trust Origin/Host headers for links sent to guardians: an authenticated
  // caller could poison them and redirect families to a phishing domain.
  const raw = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
    return url.origin;
  } catch {
    return "http://localhost:3000";
  }
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
        case "approve": return await approveAndQueuePublicReportCard(tx, { ...common, ...input, origin: appOrigin() });
        case "send": return await sendApprovedReportCardPublic(tx, { ...common, ...input, origin: appOrigin() });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
