import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getVisiblePayslipPdf } from "@/lib/payroll-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSchoolSession();
    const { id } = await context.params;
    const payslip = await withTenant(session.schoolId, (tx) =>
      getVisiblePayslipPdf(tx, { schoolId: session.schoolId, actorId: session.userId, payslipId: id })
    );
    const bytes = Uint8Array.from(payslip.pdfData);
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true";
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    return new NextResponse(bytes, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="sukuunova-payslip-${safeId}.pdf"`,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) { return routeError(error); }
}
