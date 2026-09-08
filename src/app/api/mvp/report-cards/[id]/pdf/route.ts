import { requireSchoolSession } from "@/lib/auth";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getVisibleReportPdf } from "@/lib/report-card-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    let actor: { userId: string; schoolId: string };
    try {
      const session = await requireSchoolSession();
      actor = { userId: session.userId, schoolId: session.schoolId };
    } catch {
      const session = await requireGuardianSession();
      actor = { userId: session.userId, schoolId: session.schoolId };
    }

    const { id } = await context.params;
    const report = await withTenant(actor.schoolId, (tx) =>
      getVisibleReportPdf(tx, { actorId: actor.userId, reportCardId: id })
    );
    const bytes = Uint8Array.from(report.pdfData);
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true";
    const filename = `sukuunova-report-card-${id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48)}.pdf`;
    return new Response(bytes.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) { return routeError(error); }
}
