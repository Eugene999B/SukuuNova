import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { AppError } from "@/lib/errors";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function csv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { dataset } = await params;
    const url = new URL(request.url);
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "reports:view");
      const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
      if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
      if (dataset === "students") {
        const rows = await tx.student.findMany({ orderBy: { name: "asc" }, select: { admissionNo: true, name: true, status: true, class: { select: { name: true } } } });
        return { filename: `${school.uniqueCode}-students.csv`, body: csv(["Admission No","Student","Class","Status"], rows.map((r) => [r.admissionNo, r.name, r.class?.name ?? "", r.status])) };
      }
      if (dataset === "staff") {
        const rows = await tx.user.findMany({ orderBy: { name: "asc" }, select: { name: true, email: true, phone: true, status: true, userRoles: { select: { role: { select: { name: true } } } } } });
        return { filename: `${school.uniqueCode}-staff.csv`, body: csv(["Name","Email","Phone","Roles","Status"], rows.map((r) => [r.name, r.email ?? "", r.phone ?? "", r.userRoles.map((x) => x.role.name).join("; "), r.status])) };
      }
      if (dataset === "attendance") {
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const rows = await tx.attendanceEvent.findMany({ where: { attendanceDate: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}) } }, orderBy: { attendanceDate: "desc" }, take: 5000, select: { attendanceDate: true, type: true, method: true, isLate: true, student: { select: { admissionNo: true, name: true, class: { select: { name: true } } } } } });
        return { filename: `${school.uniqueCode}-attendance.csv`, body: csv(["Date","Admission No","Student","Class","Type","Method","Late"], rows.map((r) => [r.attendanceDate.toISOString().slice(0,10), r.student?.admissionNo ?? "", r.student?.name ?? "", r.student?.class?.name ?? "", r.type, r.method, r.isLate ? "Yes" : "No"])) };
      }
      if (dataset === "fees") {
        const rows = await tx.invoice.findMany({ orderBy: { createdAt: "desc" }, take: 5000, select: { totalAmount: true, status: true, createdAt: true, student: { select: { admissionNo: true, name: true, class: { select: { name: true } } } }, payments: { select: { amount: true } } } });
        return { filename: `${school.uniqueCode}-fee-balances.csv`, body: csv(["Created","Admission No","Student","Class","Invoice Total","Paid","Balance","Status"], rows.map((r) => { const paid = r.payments.reduce((sum, p) => sum + Number(p.amount), 0); const total = Number(r.totalAmount); return [r.createdAt.toISOString().slice(0,10), r.student.admissionNo, r.student.name, r.student.class?.name ?? "", total.toFixed(2), paid.toFixed(2), Math.max(0, total - paid).toFixed(2), r.status]; })) };
      }
      if (dataset === "gradebook") {
        const assessments = await tx.assessment.findMany({ orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, type: true, maxScore: true, scores: { select: { studentId: true, value: true } }, class: { select: { name: true } }, subject: { select: { name: true } } } });
        const rows: unknown[][] = [];
        for (const assessment of assessments) for (const score of assessment.scores) rows.push([assessment.class.name, assessment.subject.name, assessment.name, assessment.type, Number(assessment.maxScore).toFixed(2), score.studentId, Number(score.value).toFixed(2)]);
        return { filename: `${school.uniqueCode}-gradebook.csv`, body: csv(["Class","Subject","Assessment","Category","Max Score","Student ID","Score"], rows) };
      }
      throw new AppError("That export is not available.", 404, "EXPORT_NOT_FOUND");
    });
    return new NextResponse(result.body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${result.filename}"`, "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed." }, { status: 400 });
  }
}
