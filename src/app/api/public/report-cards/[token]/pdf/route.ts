import { NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";
import { verifyPublicReportPdfToken } from "@/lib/report-card-release-service";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (typeof token !== "string" || token.length > 2000) {
    return NextResponse.json({ ok: false, message: "The report-card link is invalid or expired." }, { status: 404 });
  }
  try {
    await recordLoginAttempt("public-report-pdf", token.slice(0, 32), requestIp(request.headers));
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { ok: false, message: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }
    throw error;
  }
  const payload = verifyPublicReportPdfToken(token);
  if (!payload) return NextResponse.json({ ok: false, message: "The report-card link is invalid or expired." }, { status: 404 });

  try {
    const result = await rawDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", payload.schoolId);
      const report = await tx.reportCard.findFirst({ where: { id: payload.reportId, schoolId: payload.schoolId }, select: { id: true, status: true, pdfData: true } });
      if (!report || !report.pdfData || !["approved", "sent"].includes(report.status)) return null;
      return { id: report.id, pdfData: report.pdfData };
    });
    if (!result) return NextResponse.json({ ok: false, message: "The report-card is not available." }, { status: 404 });

    const bytes = Uint8Array.from(result.pdfData);
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true";
    const safeId = result.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    return new Response(bytes.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="sukuunova-report-card-${safeId}.pdf"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "Pragma": "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json({ ok: false, message: "The report-card could not be retrieved." }, { status: 500 });
  }
}
