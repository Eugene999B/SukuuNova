import { requireSchoolSession } from "@/lib/auth";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getVisibleReportPdf } from "@/lib/report-card-service";

export async function GET(
  _request: Request,
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
    return new Response(bytes.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="sukuunova-report-card.pdf"',
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) { return routeError(error); }
}
