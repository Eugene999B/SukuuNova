import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getVisibleReportPdf } from "@/lib/report-card-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSchoolSession();
    const { id } = await context.params;
    const report = await withTenant(session.schoolId, (tx) =>
      getVisibleReportPdf(tx, { actorId: session.userId, reportCardId: id })
    );
    const bytes = Uint8Array.from(report.pdfData);
    return new Response(bytes.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="sukuunova-report-card.pdf"',
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) { return routeError(error); }
}
