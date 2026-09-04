import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { AppError, routeError } from "@/lib/errors";

const EXPORT_PERMISSIONS: Record<string, string> = {
  students: "exports:students",
  staff: "exports:staff",
  attendance: "exports:attendance",
  fees: "exports:finance",
  gradebook: "exports:gradebook",
};

const MAX_EXPORT_ROWS = 5000;
const MAX_GRADEBOOK_EXPORT_ROWS = 50000;

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n") + "\n";
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(
    `${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`,
  );
  if (Number.isNaN(date.getTime())) {
    throw new AppError("Export date is invalid.", 400, "INVALID_EXPORT_DATE");
  }
  return date;
}

function assertWithinExportLimit(count: number, limit = MAX_EXPORT_ROWS) {
  if (count > limit) {
    throw new AppError(
      `Export is limited to ${limit.toLocaleString()} rows. Narrow the filters and try again.`,
      413,
      "EXPORT_TOO_LARGE",
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dataset: string }> },
) {
  try {
    const session = await requireSchoolSession();
    const { dataset } = await params;
    const requiredPermission = EXPORT_PERMISSIONS[dataset];
    if (!requiredPermission) {
      throw new AppError("That export is not available.", 404, "EXPORT_NOT_FOUND");
    }

    const url = new URL(request.url);
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, requiredPermission);

      const school = await tx.school.findUnique({
        where: { id: session.schoolId },
        select: { name: true, uniqueCode: true },
      });
      if (!school) {
        throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
      }

      if (dataset === "students") {
        const rows = await tx.student.findMany({
          orderBy: { name: "asc" },
          take: MAX_EXPORT_ROWS + 1,
          select: {
            admissionNo: true,
            name: true,
            status: true,
            class: { select: { name: true } },
          },
        });
        assertWithinExportLimit(rows.length);
        return {
          filename: `${school.uniqueCode}-students.csv`,
          body: csv(
            ["Admission No", "Student", "Class", "Status"],
            rows.map((r) => [r.admissionNo, r.name, r.class?.name ?? "", r.status]),
          ),
        };
      }

      if (dataset === "staff") {
        const rows = await tx.user.findMany({
          orderBy: { name: "asc" },
          take: MAX_EXPORT_ROWS + 1,
          select: {
            name: true,
            email: true,
            phone: true,
            status: true,
            userRoles: {
              select: { role: { select: { name: true, key: true } } },
            },
          },
        });
        const staff = rows.filter(
          (r) =>
            !r.userRoles.some((x) =>
              ["parent", "guardian", "student"].includes(
                x.role.key?.trim() ||
                  x.role.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
              ),
            ),
        );
        assertWithinExportLimit(staff.length);
        return {
          filename: `${school.uniqueCode}-staff.csv`,
          body: csv(
            ["Name", "Email", "Phone", "Roles", "Status"],
            staff.map((r) => [
              r.name,
              r.email ?? "",
              r.phone ?? "",
              r.userRoles.map((x) => x.role.name).join("; "),
              r.status,
            ]),
          ),
        };
      }

      if (dataset === "attendance") {
        const from = parseDate(url.searchParams.get("from"));
        const to = parseDate(url.searchParams.get("to"), true);
        if (from && to && from > to) {
          throw new AppError(
            "Export start date must not be after the end date.",
            400,
            "INVALID_EXPORT_RANGE",
          );
        }
        const rows = await tx.attendanceEvent.findMany({
          where: {
            attendanceDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          },
          orderBy: { attendanceDate: "desc" },
          take: MAX_EXPORT_ROWS + 1,
          select: {
            attendanceDate: true,
            type: true,
            method: true,
            isLate: true,
            student: {
              select: {
                admissionNo: true,
                name: true,
                class: { select: { name: true } },
              },
            },
          },
        });
        assertWithinExportLimit(rows.length);
        return {
          filename: `${school.uniqueCode}-attendance.csv`,
          body: csv(
            ["Date", "Admission No", "Student", "Class", "Type", "Method", "Late"],
            rows.map((r) => [
              r.attendanceDate.toISOString().slice(0, 10),
              r.student?.admissionNo ?? "",
              r.student?.name ?? "",
              r.student?.class?.name ?? "",
              r.type,
              r.method,
              r.isLate ? "Yes" : "No",
            ]),
          ),
        };
      }

      if (dataset === "fees") {
        const rows = await tx.invoice.findMany({
          orderBy: { createdAt: "desc" },
          take: MAX_EXPORT_ROWS + 1,
          select: {
            totalAmount: true,
            status: true,
            createdAt: true,
            student: {
              select: {
                admissionNo: true,
                name: true,
                class: { select: { name: true } },
              },
            },
            payments: { select: { amount: true } },
          },
        });
        assertWithinExportLimit(rows.length);
        return {
          filename: `${school.uniqueCode}-fee-balances.csv`,
          body: csv(
            [
              "Created",
              "Admission No",
              "Student",
              "Class",
              "Invoice Total",
              "Paid",
              "Balance",
              "Status",
            ],
            rows.map((r) => {
              const paid = r.payments.reduce((sum, p) => sum + Number(p.amount), 0);
              const total = Number(r.totalAmount);
              return [
                r.createdAt.toISOString().slice(0, 10),
                r.student.admissionNo,
                r.student.name,
                r.student.class?.name ?? "",
                total.toFixed(2),
                paid.toFixed(2),
                Math.max(0, total - paid).toFixed(2),
                r.status,
              ];
            }),
          ),
        };
      }

      if (dataset === "gradebook") {
        const assessments = await tx.assessment.findMany({
          orderBy: [
            { class: { name: "asc" } },
            { subject: { name: "asc" } },
            { name: "asc" },
          ],
          take: MAX_GRADEBOOK_EXPORT_ROWS + 1,
          select: {
            id: true,
            name: true,
            type: true,
            maxScore: true,
            scores: {
              take: MAX_GRADEBOOK_EXPORT_ROWS + 1,
              select: {
                studentId: true,
                value: true,
                student: { select: { admissionNo: true, name: true } },
              },
            },
            class: { select: { name: true } },
            subject: { select: { name: true } },
          },
        });
        let rowCount = 0;
        const rows: unknown[][] = [];
        for (const assessment of assessments) {
          for (const score of assessment.scores) {
            rowCount++;
            if (rowCount > MAX_GRADEBOOK_EXPORT_ROWS) break;
            rows.push([
              assessment.class.name,
              assessment.subject.name,
              assessment.name,
              assessment.type,
              Number(assessment.maxScore).toFixed(2),
              score.student?.admissionNo ?? "",
              score.student?.name ?? "",
              Number(score.value).toFixed(2),
            ]);
          }
          if (rowCount > MAX_GRADEBOOK_EXPORT_ROWS) break;
        }
        assertWithinExportLimit(rowCount, MAX_GRADEBOOK_EXPORT_ROWS);
        return {
          filename: `${school.uniqueCode}-gradebook.csv`,
          body: csv(
            [
              "Class",
              "Subject",
              "Assessment",
              "Category",
              "Max Score",
              "Admission No",
              "Student Name",
              "Score",
            ],
            rows,
          ),
        };
      }

      throw new AppError("That export is not available.", 404, "EXPORT_NOT_FOUND");
    });

    return new NextResponse(result.body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
