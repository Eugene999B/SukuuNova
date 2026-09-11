import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { AppError, routeError } from "@/lib/errors";

const EXPORT_PERMISSIONS: Record<string, string> = {
  students: "exports:students",
  staff: "exports:staff",
  attendance: "exports:attendance",
  fees: "exports:finance",
  payments: "exports:finance",
  arrears: "exports:finance",
  gradebook: "exports:gradebook",
};

const MAX_EXPORT_ROWS = 5000;
const MAX_GRADEBOOK_EXPORT_ROWS = 50000;
const ZERO = new Prisma.Decimal(0);

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  // Prevent spreadsheet applications from evaluating exported user content as formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `\'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
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

function netPaid(
  payments: Array<{ amount: Prisma.Decimal; reversals: Array<{ amount: Prisma.Decimal }> }>,
) {
  const paid = payments.reduce((sum, payment) => {
    const reversed = payment.reversals.reduce(
      (reversalSum, reversal) => reversalSum.plus(new Prisma.Decimal(String(reversal.amount))),
      ZERO,
    );
    return sum.plus(new Prisma.Decimal(String(payment.amount))).minus(reversed);
  }, ZERO);
  return paid.lt(0) ? ZERO : paid;
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
            rows.map((row) => [row.admissionNo, row.name, row.class?.name ?? "", row.status]),
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
          (row) =>
            !row.userRoles.some((assignment) =>
              ["parent", "guardian", "student"].includes(
                assignment.role.key?.trim() ||
                  assignment.role.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
              ),
            ),
        );
        assertWithinExportLimit(staff.length);
        return {
          filename: `${school.uniqueCode}-staff.csv`,
          body: csv(
            ["Name", "Email", "Phone", "Roles", "Status"],
            staff.map((row) => [
              row.name,
              row.email ?? "",
              row.phone ?? "",
              row.userRoles.map((assignment) => assignment.role.name).join("; "),
              row.status,
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
            rows.map((row) => [
              row.attendanceDate.toISOString().slice(0, 10),
              row.student?.admissionNo ?? "",
              row.student?.name ?? "",
              row.student?.class?.name ?? "",
              row.type,
              row.method,
              row.isLate ? "Yes" : "No",
            ]),
          ),
        };
      }

      // Keep the established fee-balances export contract unchanged for existing consumers.
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
            payments: { select: { amount: true, reversals: { select: { amount: true } } } },
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
            rows.map((row) => {
              const paid = row.payments.reduce(
                (sum, payment) =>
                  sum
                    .plus(new Prisma.Decimal(String(payment.amount)))
                    .minus(
                      payment.reversals.reduce(
                        (reversed, reversal) => reversed.plus(new Prisma.Decimal(String(reversal.amount))),
                        new Prisma.Decimal(0),
                      ),
                    ),
                new Prisma.Decimal(0),
              );
              const total = new Prisma.Decimal(String(row.totalAmount));
              const balance = total.minus(paid);
              return [
                row.createdAt.toISOString().slice(0, 10),
                row.student.admissionNo,
                row.student.name,
                row.student.class?.name ?? "",
                total.toFixed(2),
                paid.toFixed(2),
                balance.toFixed(2),
                row.status,
              ];
            }),
          ),
        };
      }

      if (dataset === "arrears") {
        const rows = await tx.invoice.findMany({
          orderBy: { createdAt: "desc" },
          take: MAX_EXPORT_ROWS + 1,
          select: {
            id: true,
            totalAmount: true,
            status: true,
            createdAt: true,
            term: { select: { name: true } },
            student: {
              select: {
                admissionNo: true,
                name: true,
                class: { select: { name: true } },
              },
            },
            payments: { select: { amount: true, reversals: { select: { amount: true } } } },
          },
        });
        assertWithinExportLimit(rows.length);
        const arrears = rows
          .map((row) => {
            const total = new Prisma.Decimal(String(row.totalAmount));
            const paid = netPaid(row.payments);
            const rawBalance = total.minus(paid);
            const balance = rawBalance.lt(0) ? ZERO : rawBalance;
            return { row, total, paid, balance };
          })
          .filter(({ balance }) => balance.gt(0))
          .sort((a, b) => b.balance.comparedTo(a.balance));

        return {
          filename: `${school.uniqueCode}-arrears.csv`,
          body: csv(
            [
              "Invoice ID",
              "Created",
              "Admission No",
              "Student",
              "Class",
              "Term",
              "Invoice Total",
              "Net Paid",
              "Balance",
              "Status",
            ],
            arrears.map(({ row, total, paid, balance }) => [
              row.id,
              row.createdAt.toISOString().slice(0, 10),
              row.student.admissionNo,
              row.student.name,
              row.student.class?.name ?? "",
              row.term.name,
              total.toFixed(2),
              paid.toFixed(2),
              balance.toFixed(2),
              paid.gt(0) ? "partial" : row.status,
            ]),
          ),
        };
      }

      if (dataset === "payments") {
        const rows = await tx.payment.findMany({
          orderBy: { createdAt: "desc" },
          take: MAX_EXPORT_ROWS + 1,
          select: {
            id: true,
            invoiceId: true,
            amount: true,
            method: true,
            reference: true,
            createdAt: true,
            reversals: { select: { amount: true } },
            invoice: {
              select: {
                term: { select: { name: true } },
                student: {
                  select: {
                    admissionNo: true,
                    name: true,
                    class: { select: { name: true } },
                  },
                },
              },
            },
          },
        });
        assertWithinExportLimit(rows.length);
        return {
          filename: `${school.uniqueCode}-payments.csv`,
          body: csv(
            [
              "Payment ID",
              "Invoice ID",
              "Created",
              "Admission No",
              "Student",
              "Class",
              "Term",
              "Method",
              "Reference",
              "Gross Amount",
              "Reversed",
              "Net Amount",
            ],
            rows.map((row) => {
              const gross = new Prisma.Decimal(String(row.amount));
              const reversed = row.reversals.reduce(
                (sum, reversal) => sum.plus(new Prisma.Decimal(String(reversal.amount))),
                ZERO,
              );
              const rawNet = gross.minus(reversed);
              const net = rawNet.lt(0) ? ZERO : rawNet;
              return [
                row.id,
                row.invoiceId,
                row.createdAt.toISOString(),
                row.invoice.student.admissionNo,
                row.invoice.student.name,
                row.invoice.student.class?.name ?? "",
                row.invoice.term.name,
                row.method,
                row.reference ?? "",
                gross.toFixed(2),
                reversed.toFixed(2),
                net.toFixed(2),
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
