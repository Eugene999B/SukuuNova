import { withTenant, db } from "./db";
import type { PlatformSession } from "./auth";
import { getPlatformSchoolScope } from "./platform-permissions";
import { ForbiddenError } from "./errors";

type OverviewSchool = {
  id: string;
  name: string;
  uniqueCode: string;
  status: string;
  createdAt: Date;
  studentCount: number;
  userCount: number;
  classCount: number;
  attendanceToday: number;
  invoices: number;
  unpaidInvoices: number;
  collected: number;
  subscriptionPlan: { id: string; name: string; price: unknown } | null;
};

type Overview = {
  totals: {
    schools: number;
    activeSchools: number;
    suspendedSchools: number;
    students: number;
    users: number;
    classes: number;
    invoices: number;
    unpaidInvoices: number;
    collected: number;
  };
  schools: OverviewSchool[];
};

export async function getScopedPlatformOverview(session: PlatformSession): Promise<Overview> {
  const scope = await getPlatformSchoolScope(session);
  if (scope === null) {
    throw new ForbiddenError("Use the full platform overview service for Super Admin access.");
  }
  if (!scope.length) {
    return {
      totals: { schools: 0, activeSchools: 0, suspendedSchools: 0, students: 0, users: 0, classes: 0, invoices: 0, unpaidInvoices: 0, collected: 0 },
      schools: [],
    };
  }

  const directories = await db.schoolLoginDirectory.findMany({
    where: { schoolId: { in: scope } },
    select: { schoolId: true },
    orderBy: { createdAt: "desc" },
  });
  const today = new Date(new Date().toISOString().slice(0, 10));
  const schoolResults = await Promise.all(directories.map(({ schoolId }) =>
    withTenant(schoolId, async (tx) => {
      const [school, studentCount, userCount, classCount, attendanceToday, invoiceRows, paymentRows] = await Promise.all([
        tx.school.findUnique({
          where: { id: schoolId },
          select: { id: true, name: true, uniqueCode: true, status: true, createdAt: true, subscriptionPlan: { select: { id: true, name: true, price: true } } },
        }),
        tx.student.count({ where: { status: "active" } }),
        tx.user.count(),
        tx.class.count(),
        tx.attendanceEvent.count({ where: { attendanceDate: today, type: "in" } }),
        tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "PlatformInvoice" WHERE "schoolId"=$1`, schoolId),
        tx.$queryRawUnsafe<Array<{ amount: string }>>(`SELECT "amount"::text amount FROM "PlatformPayment" WHERE "schoolId"=$1`, schoolId),
      ]);
      if (!school) return null;
      return {
        ...school,
        studentCount,
        userCount,
        classCount,
        attendanceToday,
        invoices: invoiceRows.length,
        unpaidInvoices: invoiceRows.filter((invoice) => invoice.status !== "paid").length,
        collected: paymentRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        subscriptionPlan: school.subscriptionPlan,
      } satisfies OverviewSchool;
    }).catch(() => null),
  ));
  const schools = schoolResults.filter((school): school is OverviewSchool => Boolean(school));
  return {
    totals: {
      schools: schools.length,
      activeSchools: schools.filter((school) => school.status !== "suspended").length,
      suspendedSchools: schools.filter((school) => school.status === "suspended").length,
      students: schools.reduce((sum, school) => sum + school.studentCount, 0),
      users: schools.reduce((sum, school) => sum + school.userCount, 0),
      classes: schools.reduce((sum, school) => sum + school.classCount, 0),
      invoices: schools.reduce((sum, school) => sum + school.invoices, 0),
      unpaidInvoices: schools.reduce((sum, school) => sum + school.unpaidInvoices, 0),
      collected: schools.reduce((sum, school) => sum + school.collected, 0),
    },
    schools,
  };
}
