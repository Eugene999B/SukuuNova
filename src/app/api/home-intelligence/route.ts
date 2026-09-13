import { NextResponse } from "next/server";
import { getSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";

const FINANCE_ROLES = new Set(["accountant", "bursar", "finance_officer", "cashier", "finance_clerk"]);

function localDateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function decimal(value: unknown) {
  if (value == null) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function GET() {
  const session = await getSchoolSession();
  if (!session) return NextResponse.json({ error: "School session required." }, { status: 401 });

  const payload = await withTenant(session.schoolId, async (tx) => {
    const [access, settings, school] = await Promise.all([
      getSchoolAuthorization(tx, session.userId),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
    ]);

    const timezone = settings?.timezone || "Africa/Accra";
    const todayKey = localDateInTimeZone(new Date(), timezone);
    const today = new Date(`${todayKey}T00:00:00.000Z`);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
    const weekStart = new Date(today);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);

    const roleKeys = access.roleKeys;
    const isTeacher = access.workspace === "teacher";
    const [canFinance, canStudents, canUsers, canAttendance, canAnalytics] = await Promise.all([
      access.can("finance:read"),
      access.can("students:read"),
      access.can("users:read"),
      access.can("attendance:review"),
      access.can("analytics:view"),
    ]);
    const isFinance = roleKeys.some((role) => FINANCE_ROLES.has(role)) && canFinance;
    const isLeadership = access.isElevated && canFinance;

    if (isTeacher) {
      const [ledClasses, assignments, timetable, messages] = await Promise.all([
        tx.class.findMany({
          where: { classTeacherId: session.userId },
          select: { id: true, name: true, _count: { select: { students: true } } },
          orderBy: { name: "asc" },
        }),
        tx.classSubjectTeacher.findMany({
          where: { teacherId: session.userId },
          select: {
            classId: true,
            subjectId: true,
            class: { select: { id: true, name: true, _count: { select: { students: true } } } },
            subject: { select: { id: true, name: true } },
          },
        }),
        tx.timetableSlot.findMany({
          where: { teacherId: session.userId },
          select: { dayOfWeek: true, period: true, class: { select: { name: true } }, subject: { select: { name: true } } },
        }),
        tx.message.count({ where: { recipientType: "user", recipientId: session.userId, channel: "in_app" } }),
      ]);

      const pairFilters = assignments.map((item) => ({ classId: item.classId, subjectId: item.subjectId }));
      const ledFilters = ledClasses.map((item) => ({ classId: item.id }));
      const assessmentWhere = pairFilters.length || ledFilters.length ? { OR: [...pairFilters, ...ledFilters] } : { id: "__none__" };

      const assessments = await tx.assessment.findMany({
        where: assessmentWhere,
        select: {
          id: true,
          name: true,
          type: true,
          maxScore: true,
          class: { select: { id: true, name: true, _count: { select: { students: true } } } },
          _count: { select: { scores: true } },
        },
      });
      const scores = await tx.score.findMany({
        where: { assessment: assessmentWhere },
        select: {
          value: true,
          status: true,
          assessment: { select: { maxScore: true, class: { select: { id: true, name: true } } } },
        },
      });

      const scopedClasses = new Map<string, { name: string; students: number }>();
      for (const item of ledClasses) scopedClasses.set(item.id, { name: item.name, students: item._count.students });
      for (const item of assignments) scopedClasses.set(item.class.id, { name: item.class.name, students: item.class._count.students });
      const uniqueSubjects = new Set(assignments.map((item) => item.subjectId));
      const totalStudents = [...scopedClasses.values()].reduce((sum, item) => sum + item.students, 0);
      const pendingMarking = assessments.filter((item) => item._count.scores < item.class._count.students).length;

      const assessmentTypes = new Map<string, number>();
      for (const item of assessments) {
        const raw = item.type.trim().toLowerCase();
        const key = raw.includes("home") ? "Homework" : raw.includes("quiz") ? "Quizzes" : raw.includes("exercise") || raw.includes("classwork") ? "Exercises" : titleCase(raw || "Assessment");
        assessmentTypes.set(key, (assessmentTypes.get(key) || 0) + 1);
      }

      const classScores = new Map<string, { name: string; earned: number; possible: number }>();
      for (const score of scores) {
        if (score.status === "excused") continue;
        const classId = score.assessment.class.id;
        const current = classScores.get(classId) || { name: score.assessment.class.name, earned: 0, possible: 0 };
        current.earned += decimal(score.value);
        current.possible += decimal(score.assessment.maxScore);
        classScores.set(classId, current);
      }
      const classPerformance = [...classScores.values()]
        .map((item) => ({ label: item.name, value: percent(item.earned, item.possible) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(new Date());
      const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const todayIndex = dayNames.indexOf(weekday) + 1;
      const todayLessons = todayIndex > 0 ? timetable.filter((slot) => slot.dayOfWeek === todayIndex).length : 0;
      const lessonsByDay = dayNames.slice(0, 6).map((label, index) => ({ label: label.slice(0, 3), value: timetable.filter((slot) => slot.dayOfWeek === index + 1).length }));

      return {
        mode: "teacher" as const,
        school,
        summary: {
          classes: scopedClasses.size,
          subjects: uniqueSubjects.size,
          students: totalStudents,
          assessments: assessments.length,
          pendingMarking,
          todayLessons,
          messages,
        },
        assessmentTypes: [...assessmentTypes.entries()].map(([label, value]) => ({ label, value })),
        classPerformance,
        lessonsByDay,
      };
    }

    const [students, classes, staff, teachers, attendanceRows, attendanceWeek, invoices, paymentTotal, paymentsToday, paymentsWeek, unpaidStudents, staffRoles, assessments] = await Promise.all([
      tx.student.count({ where: { status: "active" } }),
      tx.class.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, level: true, _count: { select: { students: true } } },
      }),
      tx.user.count({ where: { status: "active", userRoles: { some: { role: { key: { notIn: ["guardian", "parent", "student"] } } } } } }),
      tx.user.count({ where: { status: "active", userRoles: { some: { role: { key: "teacher" } } } } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: today, type: "in", studentId: { not: null } }, select: { studentId: true } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: { gte: sevenDaysAgo, lte: today }, type: "in", studentId: { not: null } }, select: { attendanceDate: true, studentId: true } }),
      tx.invoice.aggregate({ _sum: { totalAmount: true }, _count: { _all: true } }),
      tx.payment.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
      tx.payment.aggregate({ where: { createdAt: { gte: today } }, _sum: { amount: true }, _count: { _all: true } }),
      tx.payment.aggregate({ where: { createdAt: { gte: weekStart } }, _sum: { amount: true }, _count: { _all: true } }),
      tx.invoice.findMany({ where: { status: { not: "paid" } }, distinct: ["studentId"], select: { studentId: true } }),
      tx.userRole.findMany({
        where: { user: { status: "active" }, role: { key: { notIn: ["guardian", "parent", "student"] } } },
        select: { role: { select: { name: true, key: true } } },
      }),
      tx.assessment.count(),
    ]);

    const todayPresent = new Set(attendanceRows.map((row) => row.studentId).filter(Boolean)).size;
    const attendanceByDate = new Map<string, Set<string>>();
    for (const row of attendanceWeek) {
      const key = dateKey(row.attendanceDate);
      if (!attendanceByDate.has(key)) attendanceByDate.set(key, new Set());
      if (row.studentId) attendanceByDate.get(key)?.add(row.studentId);
    }
    const attendanceTrend = Array.from({ length: 7 }, (_, index) => {
      const value = new Date(sevenDaysAgo);
      value.setUTCDate(value.getUTCDate() + index);
      const key = dateKey(value);
      return {
        label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(value),
        value: attendanceByDate.get(key)?.size ?? 0,
      };
    });

    const roleCounts = new Map<string, number>();
    for (const item of staffRoles) {
      const label = item.role.name || titleCase(item.role.key || "Staff");
      roleCounts.set(label, (roleCounts.get(label) || 0) + 1);
    }

    const expected = decimal(invoices._sum.totalAmount);
    const collected = decimal(paymentTotal._sum.amount);
    const outstanding = Math.max(0, expected - collected);
    const collectionRate = percent(collected, expected);
    const classPopulation = classes
      .map((item) => ({ label: item.name, value: item._count.students }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const staffRoleDistribution = [...roleCounts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    if (isFinance) {
      const [paymentMethods, unpaidInvoices] = await Promise.all([
        tx.payment.groupBy({ by: ["method"], _sum: { amount: true }, _count: { _all: true } }),
        tx.invoice.findMany({ where: { status: { not: "paid" } }, select: { studentId: true, createdAt: true, totalAmount: true } }),
      ]);
      const ageBuckets = [
        { label: "0–30 days", min: 0, max: 30, students: new Set<string>() },
        { label: "31–60 days", min: 31, max: 60, students: new Set<string>() },
        { label: "61–90 days", min: 61, max: 90, students: new Set<string>() },
        { label: "90+ days", min: 91, max: Number.POSITIVE_INFINITY, students: new Set<string>() },
      ];
      const nowMs = today.getTime();
      for (const invoice of unpaidInvoices) {
        const age = Math.max(0, Math.floor((nowMs - invoice.createdAt.getTime()) / 86400000));
        const bucket = ageBuckets.find((item) => age >= item.min && age <= item.max);
        bucket?.students.add(invoice.studentId);
      }
      return {
        mode: "finance" as const,
        school,
        summary: {
          expected,
          collected,
          outstanding,
          collectionRate,
          studentsOwing: unpaidStudents.length,
          paymentsToday: decimal(paymentsToday._sum.amount),
          paymentsWeek: decimal(paymentsWeek._sum.amount),
          invoiceCount: invoices._count._all,
          paymentCount: paymentTotal._count._all,
        },
        paymentMethods: paymentMethods.map((item) => ({ label: titleCase(item.method || "Other"), value: decimal(item._sum.amount) })),
        arrears: ageBuckets.map((item) => ({ label: item.label, value: item.students.size })),
      };
    }

    if (!isLeadership) {
      const canSeeLearners = canStudents || canAnalytics;
      const canSeePeople = canUsers || canAnalytics;
      const canSeeAttendance = canAttendance || canAnalytics;
      return {
        mode: "staff" as const,
        school,
        visibility: {
          learners: canSeeLearners,
          people: canSeePeople,
          attendance: canSeeAttendance,
          academics: canAnalytics,
        },
        summary: {
          students: canSeeLearners ? students : null,
          staff: canSeePeople ? staff : null,
          teachers: canSeePeople ? teachers : null,
          classes: canSeeLearners ? classes.length : null,
          assessments: canAnalytics ? assessments : null,
          attendanceToday: canSeeAttendance ? todayPresent : null,
          attendanceRate: canSeeAttendance ? percent(todayPresent, students) : null,
        },
        classPopulation: canSeeLearners ? classPopulation : [],
        attendanceTrend: canSeeAttendance ? attendanceTrend : [],
        staffRoles: canSeePeople ? staffRoleDistribution : [],
      };
    }

    return {
      mode: "leadership" as const,
      school,
      summary: {
        students,
        staff,
        teachers,
        classes: classes.length,
        assessments,
        studentsOwing: unpaidStudents.length,
        expected,
        collected,
        outstanding,
        collectionRate,
        attendanceToday: todayPresent,
        attendanceRate: percent(todayPresent, students),
      },
      classPopulation,
      attendanceTrend,
      staffRoles: staffRoleDistribution,
      gender: { available: false, male: null, female: null, notRecorded: students },
    };
  });

  return NextResponse.json(payload);
}
