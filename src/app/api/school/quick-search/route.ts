import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { routeError } from "@/lib/errors";

const querySchema = z.object({
  q: z.string().trim().min(2).max(80)
});

type QuickResult = {
  id: string;
  kind: "student" | "invoice";
  title: string;
  subtitle: string;
  href: string;
};

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const parsed = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const q = parsed.q;

    const results = await withTenant(session.schoolId, async (tx) => {
      const [canReadStudents, canReadFees] = await Promise.all([
        hasPermission(tx, session.userId, "students:read"),
        hasPermission(tx, session.userId, "fees:read")
      ]);

      const [students, invoices] = await Promise.all([
        canReadStudents
          ? tx.student.findMany({
              where: {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { admissionNo: { contains: q, mode: "insensitive" } }
                ]
              },
              select: { id: true, name: true, admissionNo: true, class: { select: { name: true } } },
              orderBy: { name: "asc" },
              take: 6
            })
          : Promise.resolve([]),
        canReadFees
          ? tx.invoice.findMany({
              where: { id: { contains: q, mode: "insensitive" } },
              select: { id: true, status: true, totalAmount: true, student: { select: { name: true, admissionNo: true } } },
              orderBy: { createdAt: "desc" },
              take: 6
            })
          : Promise.resolve([])
      ]);

      const studentResults: QuickResult[] = students.map((student) => ({
        id: student.id,
        kind: "student",
        title: student.name,
        subtitle: `${student.admissionNo}${student.class?.name ? ` · ${student.class.name}` : ""}`,
        href: `/school/students/${student.id}`
      }));

      const invoiceResults: QuickResult[] = invoices.map((invoice) => ({
        id: invoice.id,
        kind: "invoice",
        title: `Invoice ${invoice.id.slice(-8).toUpperCase()}`,
        subtitle: `${invoice.student.name} · ${invoice.status} · ${invoice.totalAmount.toString()}`,
        href: `/school/fees/invoices/${invoice.id}`
      }));

      return [...studentResults, ...invoiceResults].slice(0, 10);
    });

    return NextResponse.json({ results });
  } catch (error) {
    return routeError(error);
  }
}
