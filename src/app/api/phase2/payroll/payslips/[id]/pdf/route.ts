import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getVisiblePayslipPdf } from "@/lib/payroll-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSchoolSession();
    const { id } = await context.params;
    const payslip = await withTenant(session.schoolId, (tx) =>
      getVisiblePayslipPdf(tx, { schoolId: session.schoolId, actorId: session.userId, payslipId: id })
    );
    return new NextResponse(payslip.pdfData, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'inline; filename="sukuunova-payslip.pdf"',
        "cache-control": "private, no-store"
      }
    });
  } catch (error) { return routeError(error); }
}
