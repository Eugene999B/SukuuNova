import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { hasPermission } from "@/lib/rbac";
import { generateReportCard, submitReportCard, approveReportCard, sendReportCard } from "@/lib/report-card-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), studentId: z.string(), termId: z.string(), remarks: z.string().optional() }),
  z.object({ action: z.literal("submit"), reportCardId: z.string() }),
  z.object({ action: z.literal("approve"), reportCardId: z.string() }),
  z.object({ action: z.literal("send"), reportCardId: z.string() })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const reports = await withTenant(session.schoolId, async (tx) => {
      const canView = await hasPermission(tx, session.userId, "report_cards:view");
      if (!canView) {
        const { ForbiddenError } = await import("@/lib/errors");
        throw new ForbiddenError("Report-card access is not permitted.");
      }
      const parent = await hasPermission(tx, session.userId, "parents:read_linked");
      return tx.reportCard.findMany({
        where: parent ? {
          status: "sent",
          student: { guardians: { some: { guardian: { userId: session.userId } } } }
        } : {},
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
    const result = await withTenant(session.schoolId, (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      switch (input.action) {
        case "generate": return generateReportCard(tx, { ...common, ...input });
        case "submit": return submitReportCard(tx, { ...common, ...input });
        case "approve": return approveReportCard(tx, { ...common, ...input });
        case "send": return sendReportCard(tx, { ...common, ...input });
      }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
