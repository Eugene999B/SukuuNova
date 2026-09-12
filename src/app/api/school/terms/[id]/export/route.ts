import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { buildTermSummaryPdf } from "@/lib/term-export-pdf";

type ExportCategory = "academic" | "lesson_plans" | "attendance" | "finance";
type ExportFormat = "pdf" | "csv" | "doc";
type Row = { label: string; value: string };

const categories = new Set<ExportCategory>(["academic", "lesson_plans", "attendance", "finance"]);
const formats = new Set<ExportFormat>(["pdf", "csv", "doc"]);

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "term";
}
function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { id } = await context.params;
    const url = new URL(request.url);
    const category = (url.searchParams.get("category") || "academic") as ExportCategory;
    const format = (url.searchParams.get("format") || "pdf") as ExportFormat;
    if (!categories.has(category)) throw new AppError("Unknown term-report category.", 400, "INVALID_TERM_EXPORT_CATEGORY");
    if (!formats.has(format)) throw new AppError("Unknown term-report format.", 400, "INVALID_TERM_EXPORT_FORMAT");

    const report = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "reports:generate");
      const term = await tx.term.findFirst({ where: { id, schoolId: session.schoolId }, include: { academicYear: true } });
      if (!term) throw new AppError("Term not found.", 404, "TERM_NOT_FOUND");
      const rows: Row[] = [];

      if (category === "academic") {
        const [students, assessments, reports, scores] = await Promise.all([
          tx.student.count({ where: { schoolId: session.schoolId, status: "active" } }),
          tx.assessment.count({ where: { schoolId: session.schoolId, termId: id } }),
          tx.reportCard.groupBy({ by: ["status"], where: { schoolId: session.schoolId, termId: id }, _count: { _all: true } }),
          tx.$queryRawUnsafe<Array<{ count: string; average: string | null }>>(`SELECT COUNT(*)::text AS "count", AVG(s."value" / NULLIF(a."maxScore",0) * 100)::text AS "average" FROM "Score" s JOIN "Assessment" a ON a."id"=s."assessmentId" AND a."schoolId"=s."schoolId" WHERE s."schoolId"=$1 AND a."termId"=$2`, session.schoolId, id),
        ]);
        rows.push(
          { label: "Active students", value: String(students) },
          { label: "Assessments", value: String(assessments) },
          { label: "Recorded scores", value: String(Number(scores[0]?.count ?? 0)) },
          { label: "Average score", value: scores[0]?.average == null ? "Not available" : `${Number(scores[0].average).toFixed(1)}%` },
        );
        for (const report of reports) rows.push({ label: `Report cards - ${report.status}`, value: String(report._count._all) });
      }

      if (category === "lesson_plans") {
        const plans = await tx.$queryRawUnsafe<Array<{ className: string; subjectName: string; teacherName: string; weekNumber: number; status: string; fileName: string | null }>>(`
          SELECT c."name" AS "className",s."name" AS "subjectName",u."name" AS "teacherName",lp."weekNumber",lp."status",a."fileName"
          FROM "LessonPlan" lp
          JOIN "Class" c ON c."id"=lp."classId" AND c."schoolId"=lp."schoolId"
          JOIN "Subject" s ON s."id"=lp."subjectId" AND s."schoolId"=lp."schoolId"
          JOIN "User" u ON u."id"=lp."teacherId" AND u."schoolId"=lp."schoolId"
          LEFT JOIN "LessonPlanAttachment" a ON a."lessonPlanId"=lp."id" AND a."schoolId"=lp."schoolId"
          WHERE lp."schoolId"=$1 AND lp."termId"=$2
          ORDER BY c."name",s."name",lp."weekNumber",u."name" LIMIT 1000`, session.schoolId, id);
        if (!plans.length) rows.push({ label: "Lesson plans", value: "No lesson plans were recorded for this term." });
        for (const plan of plans) rows.push({ label: `${plan.className} / ${plan.subjectName} / Week ${plan.weekNumber}`, value: `${plan.teacherName} - ${plan.status.replaceAll("_", " ")}${plan.fileName ? ` - ${plan.fileName}` : ""}` });
      }

      if (category === "attendance") {
        const attendance = await tx.$queryRawUnsafe<Array<{ day: string; present: string; late: string; absent: string }>>(`
          SELECT "attendanceDate"::date::text AS "day",COUNT(*) FILTER (WHERE "type"='in')::text AS "present",COUNT(*) FILTER (WHERE "isLate" IS TRUE)::text AS "late",COUNT(*) FILTER (WHERE "type" IN ('absence','absent'))::text AS "absent"
          FROM "AttendanceEvent" WHERE "schoolId"=$1 AND "attendanceDate">=$2 AND "attendanceDate"<=$3 GROUP BY "attendanceDate"::date ORDER BY "attendanceDate"::date`, session.schoolId, term.startDate, term.endDate);
        if (!attendance.length) rows.push({ label: "Attendance", value: "No attendance records were recorded for this term." });
        for (const day of attendance) rows.push({ label: day.day, value: `Present ${day.present} | Late ${day.late} | Absent ${day.absent}` });
      }

      if (category === "finance") {
        const finance = await tx.$queryRawUnsafe<Array<{ invoices: string; invoiced: string; collected: string }>>(`SELECT COUNT(*)::text AS "invoices",COALESCE(SUM("totalAmount"),0)::text AS "invoiced",COALESCE((SELECT SUM(p."amount" - COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."paymentId"=p."id" AND r."schoolId"=p."schoolId"),0)) FROM "Payment" p JOIN "Invoice" pi ON pi."id"=p."invoiceId" AND pi."schoolId"=p."schoolId" WHERE p."schoolId"=$1 AND pi."termId"=$2),0)::text AS "collected" FROM "Invoice" WHERE "schoolId"=$1 AND "termId"=$2`, session.schoolId, id);
        const value = finance[0];
        const invoiced = Number(value?.invoiced ?? 0);
        const collected = Number(value?.collected ?? 0);
        rows.push(
          { label: "Invoices", value: String(Number(value?.invoices ?? 0)) },
          { label: "Amount invoiced", value: `GHS ${invoiced.toFixed(2)}` },
          { label: "Amount collected", value: `GHS ${collected.toFixed(2)}` },
          { label: "Outstanding", value: `GHS ${Math.max(0, invoiced - collected).toFixed(2)}` },
        );
      }

      return { term, rows };
    });

    const title = `${report.term.academicYear.name} - ${report.term.name}`;
    const subtitle = `${category.replaceAll("_", " ")} term report`;
    const baseName = `${safeName(report.term.academicYear.name)}-${safeName(report.term.name)}-${category}`;

    if (format === "pdf") {
      const bytes = await buildTermSummaryPdf(title, subtitle, report.rows);
      return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${baseName}.pdf"`, "Cache-Control": "private, no-store" } });
    }
    if (format === "doc") {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><h2>${escapeHtml(subtitle)}</h2><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Category</th><th>Detail</th></tr></thead><tbody>${report.rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody></table></body></html>`;
      return new Response(html, { headers: { "Content-Type": "application/msword; charset=utf-8", "Content-Disposition": `attachment; filename="${baseName}.doc"`, "Cache-Control": "private, no-store" } });
    }
    const csv = ["Category,Detail", ...report.rows.map((row) => `${csvCell(row.label)},${csvCell(row.value)}`)].join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${baseName}.csv"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
