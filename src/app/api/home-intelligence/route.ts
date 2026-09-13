import { NextResponse } from "next/server";
import { getSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import {
  attendanceWindowRate,
  buildLearnerRisk,
  classAverage,
  collectionForecast,
  confidenceFromSample,
  percent,
  percentChange,
  pointDelta,
  scoreLabel,
  sortSignals,
  weightedScore,
  type DecisionIntelligence,
  type IntelligenceRecommendation,
  type IntelligenceSignal,
} from "@/lib/home-intelligence-engine";

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

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function daysBefore(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

function actionFromSignal(signal: IntelligenceSignal): IntelligenceRecommendation | null {
  if (!signal.href || signal.severity === "positive" || signal.severity === "info") return null;
  return {
    id: `action-${signal.id}`,
    title: signal.actionLabel || signal.title,
    detail: signal.detail,
    priority: signal.severity === "critical" ? "now" : "soon",
    href: signal.href,
    actionLabel: signal.actionLabel || "Open workspace",
  };
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
    const sevenDaysAgo = daysBefore(today, 6);
    const fourteenDaysAgo = daysBefore(today, 13);
    const current30Start = daysBefore(today, 29);
    const previous30Start = daysBefore(today, 59);

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

      const [assessments, scores] = await Promise.all([
        tx.assessment.findMany({
          where: assessmentWhere,
          select: {
            id: true,
            name: true,
            type: true,
            maxScore: true,
            class: { select: { id: true, name: true, _count: { select: { students: true } } } },
            _count: { select: { scores: true } },
          },
        }),
        tx.score.findMany({
          where: { assessment: assessmentWhere },
          select: {
            value: true,
            status: true,
            enteredAt: true,
            student: { select: { id: true, name: true, class: { select: { name: true } } } },
            assessment: { select: { maxScore: true, class: { select: { id: true, name: true } } } },
          },
        }),
      ]);

      const scopedClasses = new Map<string, { name: string; students: number }>();
      for (const item of ledClasses) scopedClasses.set(item.id, { name: item.name, students: item._count.students });
      for (const item of assignments) scopedClasses.set(item.class.id, { name: item.class.name, students: item.class._count.students });
      const uniqueSubjects = new Set(assignments.map((item) => item.subjectId));
      const totalStudents = [...scopedClasses.values()].reduce((sum, item) => sum + item.students, 0);
      const pendingMarking = assessments.filter((item) => item._count.scores < item.class._count.students).length;
      const expectedMarks = assessments.reduce((sum, item) => sum + item.class._count.students, 0);
      const enteredMarks = assessments.reduce((sum, item) => sum + Math.min(item._count.scores, item.class._count.students), 0);
      const markingCompletion = percent(enteredMarks, expectedMarks);

      const assessmentTypes = new Map<string, number>();
      for (const item of assessments) {
        const raw = item.type.trim().toLowerCase();
        const key = raw.includes("home") ? "Homework" : raw.includes("quiz") ? "Quizzes" : raw.includes("exercise") || raw.includes("classwork") ? "Exercises" : titleCase(raw || "Assessment");
        assessmentTypes.set(key, (assessmentTypes.get(key) || 0) + 1);
      }

      const classScores = new Map<string, { name: string; earned: number; possible: number }>();
      for (const score of scores) {
        if (score.status === "excused" || score.value == null) continue;
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
      const averagePerformance = classPerformance.length ? Math.round(classPerformance.reduce((sum, item) => sum + item.value, 0) / classPerformance.length) : null;
      const lowestClass = classPerformance.length ? [...classPerformance].sort((a, b) => a.value - b.value)[0] : null;

      const riskStudents = buildLearnerRisk(scores.map((score) => ({
        studentId: score.student.id,
        studentName: score.student.name,
        className: score.student.class?.name || score.assessment.class.name,
        value: score.value == null ? null : decimal(score.value),
        status: score.status,
        maxScore: decimal(score.assessment.maxScore),
      })), 8);
      const highRiskStudents = riskStudents.filter((item) => item.severity === "high").length;
      const recentMarkEntries = scores.filter((score) => score.enteredAt >= sevenDaysAgo).length;
      const previousMarkEntries = scores.filter((score) => score.enteredAt >= fourteenDaysAgo && score.enteredAt < sevenDaysAgo).length;
      const markingMomentum = percentChange(recentMarkEntries, previousMarkEntries);

      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(new Date());
      const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const todayIndex = dayNames.indexOf(weekday) + 1;
      const todayLessons = todayIndex > 0 ? timetable.filter((slot) => slot.dayOfWeek === todayIndex).length : 0;
      const lessonsByDay = dayNames.slice(0, 6).map((label, index) => ({ label: label.slice(0, 3), value: timetable.filter((slot) => slot.dayOfWeek === index + 1).length }));
      const workloadPressure = Math.min(100, pendingMarking * 12 + todayLessons * 7 + Math.max(0, timetable.length - 20));

      const components = [
        { label: "Marking completion", score: expectedMarks ? markingCompletion : null, weight: 40, detail: expectedMarks ? `${enteredMarks} of ${expectedMarks} expected marks entered.` : "No expected marking volume yet." },
        { label: "Class performance", score: averagePerformance, weight: 35, detail: averagePerformance == null ? "No recorded marks yet." : `Average recorded class performance is ${averagePerformance}%.` },
        { label: "Workload capacity", score: 100 - workloadPressure, weight: 25, detail: `${pendingMarking} assessments still need marking; ${todayLessons} lessons are scheduled today.` },
      ];
      const intelligenceScore = weightedScore(components);
      const signals: IntelligenceSignal[] = [];
      if (highRiskStudents > 0) signals.push({ id: "teacher-high-risk", title: `${highRiskStudents} learner${highRiskStudents === 1 ? "" : "s"} need urgent academic attention`, detail: "Recorded scores and missed assessments indicate high academic risk in your teaching scope.", severity: "critical", confidence: "high", metric: `${highRiskStudents} high risk`, href: "/teacher/gradebook", actionLabel: "Review learners" });
      if (lowestClass && lowestClass.value < 60) signals.push({ id: "teacher-low-class", title: `${lowestClass.label} is the weakest-performing class`, detail: `Its recorded average is ${lowestClass.value}%. Compare assessment results and reteach the weakest areas.`, severity: lowestClass.value < 50 ? "critical" : "warning", confidence: confidenceFromSample(scores.length), metric: `${lowestClass.value}%`, href: "/teacher/gradebook", actionLabel: "Inspect marks" });
      if (markingCompletion < 75 && expectedMarks > 0) signals.push({ id: "teacher-marking", title: "Marking backlog is building", detail: `${markingCompletion}% of expected marks are entered. Completing the backlog will improve learner feedback and leadership visibility.`, severity: markingCompletion < 50 ? "critical" : "warning", confidence: "high", metric: `${markingCompletion}% complete`, href: "/teacher/gradebook", actionLabel: "Continue marking" });
      if (markingMomentum > 20) signals.push({ id: "teacher-momentum", title: "Marking velocity is improving", detail: `You entered ${recentMarkEntries} marks in the latest 7-day window, ${markingMomentum}% more than the previous window.`, severity: "positive", confidence: confidenceFromSample(recentMarkEntries), metric: `+${markingMomentum}%` });
      if (!signals.length) signals.push({ id: "teacher-clear", title: "Teaching workload is currently controlled", detail: "No major exception is visible from your recorded classes, marking completion and learner performance.", severity: "positive", confidence: scores.length ? "medium" : "low" });
      const recommendations = sortSignals(signals).map(actionFromSignal).filter((item): item is IntelligenceRecommendation => Boolean(item)).slice(0, 4);
      const intelligence: DecisionIntelligence = {
        headline: highRiskStudents ? "Intervene before the next assessment cycle" : pendingMarking ? "Close the feedback loop" : "Teaching scope is under control",
        summary: `SukuuNova combined marking completion, class performance, learner risk and timetable pressure to prioritise what deserves your attention next.`,
        score: intelligenceScore,
        label: scoreLabel(intelligenceScore),
        components,
        signals: sortSignals(signals).slice(0, 6),
        recommendations,
        forecasts: [],
      };

      return {
        mode: "teacher" as const,
        school,
        summary: { classes: scopedClasses.size, subjects: uniqueSubjects.size, students: totalStudents, assessments: assessments.length, pendingMarking, todayLessons, messages },
        assessmentTypes: [...assessmentTypes.entries()].map(([label, value]) => ({ label, value })),
        classPerformance,
        lessonsByDay,
        riskStudents,
        intelligence,
      };
    }

    const [students, classes, staff, teachers, attendanceRows, attendance60, invoices, paymentTotal, paymentsToday, paymentsWeek, paymentsCurrent30, paymentsPrevious30, unpaidStudents, staffRoles, assessments, currentTerm] = await Promise.all([
      tx.student.count({ where: { status: "active" } }),
      tx.class.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.user.count({ where: { status: "active", userRoles: { some: { role: { key: { notIn: ["guardian", "parent", "student"] } } } } } }),
      tx.user.count({ where: { status: "active", userRoles: { some: { role: { key: "teacher" } } } } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: today, type: "in", studentId: { not: null } }, select: { studentId: true } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: { gte: previous30Start, lte: today }, type: "in", studentId: { not: null } }, select: { attendanceDate: true, studentId: true } }),
      tx.invoice.aggregate({ _sum: { totalAmount: true }, _count: { _all: true } }),
      tx.payment.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
      tx.payment.aggregate({ where: { createdAt: { gte: today } }, _sum: { amount: true }, _count: { _all: true } }),
      tx.payment.aggregate({ where: { createdAt: { gte: sevenDaysAgo } }, _sum: { amount: true }, _count: { _all: true } }),
      tx.payment.aggregate({ where: { createdAt: { gte: current30Start } }, _sum: { amount: true }, _count: { _all: true } }),
      tx.payment.aggregate({ where: { createdAt: { gte: previous30Start, lt: current30Start } }, _sum: { amount: true }, _count: { _all: true } }),
      tx.invoice.findMany({ where: { status: { not: "paid" } }, distinct: ["studentId"], select: { studentId: true } }),
      tx.userRole.findMany({ where: { user: { status: "active" }, role: { key: { notIn: ["guardian", "parent", "student"] } } }, select: { role: { select: { name: true, key: true } } } }),
      tx.assessment.count(),
      tx.term.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    ]);

    const todayPresent = new Set(attendanceRows.map((row) => row.studentId).filter(Boolean)).size;
    const attendanceByDate = new Map<string, Set<string>>();
    for (const row of attendance60.filter((row) => row.attendanceDate >= sevenDaysAgo)) {
      const key = dateKey(row.attendanceDate);
      if (!attendanceByDate.has(key)) attendanceByDate.set(key, new Set());
      if (row.studentId) attendanceByDate.get(key)?.add(row.studentId);
    }
    const attendanceTrend = Array.from({ length: 7 }, (_, index) => {
      const value = new Date(sevenDaysAgo);
      value.setUTCDate(value.getUTCDate() + index);
      const key = dateKey(value);
      return { label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(value), value: attendanceByDate.get(key)?.size ?? 0 };
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
    const current30Collections = decimal(paymentsCurrent30._sum.amount);
    const previous30Collections = decimal(paymentsPrevious30._sum.amount);
    const collectionMomentum = percentChange(current30Collections, previous30Collections);
    const classPopulation = classes.map((item) => ({ label: item.name, value: item._count.students })).sort((a, b) => b.value - a.value).slice(0, 10);
    const staffRoleDistribution = [...roleCounts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    const currentAttendance = attendanceWindowRate(attendance60.filter((row) => row.attendanceDate >= current30Start), students);
    const previousAttendance = attendanceWindowRate(attendance60.filter((row) => row.attendanceDate >= previous30Start && row.attendanceDate < current30Start), students);
    const attendanceDelta = pointDelta(currentAttendance.rate, previousAttendance.rate);

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
        ageBuckets.find((item) => age >= item.min && age <= item.max)?.students.add(invoice.studentId);
      }
      const arrears = ageBuckets.map((item) => ({ label: item.label, value: item.students.size }));
      const oldestBucket = [...arrears].reverse().find((item) => item.value > 0) || null;
      const debtorRate = percent(unpaidStudents.length, students);
      const financeComponents = [
        { label: "Collection rate", score: expected ? collectionRate : null, weight: 50, detail: expected ? `${collectionRate}% of billed fees have been collected.` : "No billed fees yet." },
        { label: "Debtor exposure", score: students ? Math.max(0, 100 - debtorRate) : null, weight: 30, detail: `${unpaidStudents.length} of ${students} active learners have unpaid invoices.` },
        { label: "Collection momentum", score: Math.max(0, Math.min(100, 50 + collectionMomentum)), weight: 20, detail: `Latest 30-day collections are ${collectionMomentum >= 0 ? "+" : ""}${collectionMomentum}% versus the previous 30 days.` },
      ];
      const financeScore = weightedScore(financeComponents);
      const financeSignals: IntelligenceSignal[] = [];
      if (collectionRate < 50 && expected > 0) financeSignals.push({ id: "finance-rate", title: "Collection rate is below half of billed fees", detail: `${collectionRate}% has been collected, leaving ${Math.round(outstanding)} outstanding. Prioritise the highest-value and oldest unpaid invoices.`, severity: "critical", confidence: "high", metric: `${collectionRate}% collected`, href: "/school/fees/invoices", actionLabel: "Work debtors" });
      else if (collectionRate < 75 && expected > 0) financeSignals.push({ id: "finance-rate", title: "Collections need acceleration", detail: `${collectionRate}% of billed fees are collected. A focused debtor follow-up can reduce exposure before balances age further.`, severity: "warning", confidence: "high", metric: `${collectionRate}% collected`, href: "/school/fees/invoices", actionLabel: "Review debtors" });
      if (collectionMomentum < -15) financeSignals.push({ id: "finance-momentum", title: "Collection momentum is falling", detail: `The latest 30-day collection total is ${Math.abs(collectionMomentum)}% below the previous 30-day window.`, severity: collectionMomentum < -35 ? "critical" : "warning", confidence: confidenceFromSample(paymentsCurrent30._count._all), metric: `${collectionMomentum}%`, href: "/school/fees/reports", actionLabel: "Inspect trend" });
      else if (collectionMomentum > 15) financeSignals.push({ id: "finance-momentum-up", title: "Collection momentum is improving", detail: `The latest 30-day collection total is ${collectionMomentum}% above the previous window.`, severity: "positive", confidence: confidenceFromSample(paymentsCurrent30._count._all), metric: `+${collectionMomentum}%` });
      if (oldestBucket?.label === "90+ days" && oldestBucket.value > 0) financeSignals.push({ id: "finance-aged", title: `${oldestBucket.value} debtor${oldestBucket.value === 1 ? "" : "s"} have balances older than 90 days`, detail: "Long-aged debt is the highest recovery risk. Separate these accounts from routine collections and escalate follow-up.", severity: oldestBucket.value >= 5 ? "critical" : "warning", confidence: "high", metric: `${oldestBucket.value} aged debtors`, href: "/school/fees/invoices", actionLabel: "Open aged debt" });
      if (!financeSignals.length) financeSignals.push({ id: "finance-clear", title: "Collections are currently within a controlled range", detail: "No severe collection-rate, momentum or arrears-ageing exception is visible in the recorded ledger.", severity: "positive", confidence: paymentTotal._count._all ? "high" : "low" });
      const financeRecommendations = sortSignals(financeSignals).map(actionFromSignal).filter((item): item is IntelligenceRecommendation => Boolean(item)).slice(0, 4);
      const intelligence: DecisionIntelligence = {
        headline: collectionRate < 75 ? "Protect cash flow before balances age" : collectionMomentum < 0 ? "Hold the collection rate while momentum softens" : "Collections are moving in the right direction",
        summary: "SukuuNova combined collection rate, debtor exposure, arrears age and recent payment velocity into one finance decision brief.",
        score: financeScore,
        label: scoreLabel(financeScore),
        components: financeComponents,
        signals: sortSignals(financeSignals).slice(0, 6),
        recommendations: financeRecommendations,
        forecasts: [collectionForecast(decimal(paymentsWeek._sum.amount), paymentsWeek._count._all)],
      };
      return {
        mode: "finance" as const,
        school,
        summary: { expected, collected, outstanding, collectionRate, studentsOwing: unpaidStudents.length, paymentsToday: decimal(paymentsToday._sum.amount), paymentsWeek: decimal(paymentsWeek._sum.amount), invoiceCount: invoices._count._all, paymentCount: paymentTotal._count._all },
        paymentMethods: paymentMethods.map((item) => ({ label: titleCase(item.method || "Other"), value: decimal(item._sum.amount) })),
        arrears,
        collectionTrend: { current30: current30Collections, previous30: previous30Collections, changePercent: collectionMomentum },
        intelligence,
      };
    }

    if (!isLeadership) {
      const canSeeLearners = canStudents || canAnalytics;
      const canSeePeople = canUsers || canAnalytics;
      const canSeeAttendance = canAttendance || canAnalytics;
      const staffSignals: IntelligenceSignal[] = [];
      if (canSeeAttendance && currentAttendance.recordedDays > 0 && currentAttendance.rate < 75) staffSignals.push({ id: "staff-attendance", title: "Attendance needs attention", detail: `Average recorded attendance over the latest window is ${currentAttendance.rate}%.`, severity: currentAttendance.rate < 60 ? "critical" : "warning", confidence: confidenceFromSample(currentAttendance.recordedDays), metric: `${currentAttendance.rate}%`, href: "/school/attendance", actionLabel: "Review attendance" });
      if (canSeeLearners && students > 0 && classes.length === 0) staffSignals.push({ id: "staff-classes", title: "Learners are not organised into classes", detail: `${students} active learners exist but no class records are available.`, severity: "warning", confidence: "high", href: "/school/classes", actionLabel: "Set up classes" });
      if (!staffSignals.length) staffSignals.push({ id: "staff-clear", title: "No urgent exception is visible in your permitted scope", detail: "SukuuNova only analysed the operational areas your assigned permissions allow you to see.", severity: "positive", confidence: "medium" });
      const visibleComponents = [
        canSeeAttendance ? { label: "Attendance", score: currentAttendance.recordedDays ? currentAttendance.rate : null, weight: 50, detail: `${currentAttendance.recordedDays} recorded attendance days in the latest 30-day window.` } : null,
        canSeeLearners ? { label: "Learner organisation", score: students ? Math.min(100, Math.round((classPopulation.reduce((sum, item) => sum + item.value, 0) / students) * 100)) : null, weight: 30, detail: "Share of active learners represented in populated classes." } : null,
        canSeePeople ? { label: "People structure", score: staff ? 100 : null, weight: 20, detail: `${staff} active staff accounts are available in your permitted view.` } : null,
      ].filter((item): item is { label: string; score: number | null; weight: number; detail: string } => Boolean(item));
      const staffScore = weightedScore(visibleComponents);
      const intelligence: DecisionIntelligence = {
        headline: staffSignals.some((item) => item.severity === "critical" || item.severity === "warning") ? "Focus on the exception in your operational scope" : "Your permitted operational scope is stable",
        summary: "This brief is permission-aware: it never uses restricted finance or people data to generate recommendations for roles that cannot access those areas.",
        score: staffScore,
        label: scoreLabel(staffScore),
        components: visibleComponents,
        signals: sortSignals(staffSignals),
        recommendations: staffSignals.map(actionFromSignal).filter((item): item is IntelligenceRecommendation => Boolean(item)),
        forecasts: [],
      };
      return {
        mode: "staff" as const,
        school,
        visibility: { learners: canSeeLearners, people: canSeePeople, attendance: canSeeAttendance, academics: canAnalytics },
        summary: { students: canSeeLearners ? students : null, staff: canSeePeople ? staff : null, teachers: canSeePeople ? teachers : null, classes: canSeeLearners ? classes.length : null, assessments: canAnalytics ? assessments : null, attendanceToday: canSeeAttendance ? todayPresent : null, attendanceRate: canSeeAttendance ? percent(todayPresent, students) : null },
        classPopulation: canSeeLearners ? classPopulation : [],
        attendanceTrend: canSeeAttendance ? attendanceTrend : [],
        staffRoles: canSeePeople ? staffRoleDistribution : [],
        intelligence,
      };
    }

    const [termAssessments, termScores] = currentTerm ? await Promise.all([
      tx.assessment.findMany({ where: { termId: currentTerm.id }, select: { id: true, class: { select: { _count: { select: { students: true } } } }, _count: { select: { scores: true } } } }),
      tx.score.findMany({ where: { assessment: { termId: currentTerm.id } }, select: { value: true, status: true, student: { select: { id: true, name: true, class: { select: { name: true } } } }, assessment: { select: { maxScore: true, class: { select: { name: true } } } } } }),
    ]) : [[], []];
    const academicAverage = classAverage(termScores.map((score) => ({ value: score.value == null ? null : decimal(score.value), status: score.status, maxScore: decimal(score.assessment.maxScore) })));
    const academicRisk = buildLearnerRisk(termScores.map((score) => ({ studentId: score.student.id, studentName: score.student.name, className: score.student.class?.name || score.assessment.class.name, value: score.value == null ? null : decimal(score.value), status: score.status, maxScore: decimal(score.assessment.maxScore) })), 10);
    const highAcademicRisk = academicRisk.filter((item) => item.severity === "high").length;
    const termExpectedMarks = termAssessments.reduce((sum, item) => sum + item.class._count.students, 0);
    const termEnteredMarks = termAssessments.reduce((sum, item) => sum + Math.min(item._count.scores, item.class._count.students), 0);
    const markingCompletion = percent(termEnteredMarks, termExpectedMarks);
    const leadershipComponents = [
      { label: "Attendance health", score: currentAttendance.recordedDays ? currentAttendance.rate : null, weight: 30, detail: currentAttendance.recordedDays ? `${currentAttendance.rate}% average presence across ${currentAttendance.recordedDays} recorded days.` : "No recent attendance days recorded." },
      { label: "Fee health", score: expected ? collectionRate : null, weight: 30, detail: expected ? `${collectionRate}% of billed fees are collected.` : "No billed fees yet." },
      { label: "Academic performance", score: academicAverage, weight: 25, detail: academicAverage == null ? "No scored assessments in the current term." : `Current-term recorded score average is ${academicAverage}%.` },
      { label: "Assessment completion", score: termExpectedMarks ? markingCompletion : null, weight: 15, detail: termExpectedMarks ? `${markingCompletion}% of expected current-term marks are entered.` : "No current-term marking expectation yet." },
    ];
    const leadershipScore = weightedScore(leadershipComponents);
    const leadershipSignals: IntelligenceSignal[] = [];
    if (currentAttendance.recordedDays >= 3 && attendanceDelta <= -5) leadershipSignals.push({ id: "lead-attendance-drop", title: "Attendance trend is deteriorating", detail: `Latest 30-day recorded attendance is ${currentAttendance.rate}%, ${Math.abs(attendanceDelta)} points below the previous recorded window.`, severity: attendanceDelta <= -10 ? "critical" : "warning", confidence: confidenceFromSample(currentAttendance.recordedDays), metric: `${attendanceDelta} pts`, href: "/school/attendance", actionLabel: "Investigate attendance" });
    else if (currentAttendance.recordedDays >= 3 && attendanceDelta >= 5) leadershipSignals.push({ id: "lead-attendance-up", title: "Attendance is improving", detail: `Latest recorded attendance is ${currentAttendance.rate}%, up ${attendanceDelta} points versus the previous 30-day window.`, severity: "positive", confidence: confidenceFromSample(currentAttendance.recordedDays), metric: `+${attendanceDelta} pts` });
    if (collectionRate < 60 && expected > 0) leadershipSignals.push({ id: "lead-finance", title: "Fee exposure is a leadership risk", detail: `${Math.round(outstanding)} remains outstanding and ${unpaidStudents.length} learners have unpaid invoices.`, severity: collectionRate < 40 ? "critical" : "warning", confidence: "high", metric: `${collectionRate}% collected`, href: "/school/fees/reports", actionLabel: "Review fee health" });
    if (collectionMomentum < -20) leadershipSignals.push({ id: "lead-cash-momentum", title: "Collections are slowing", detail: `Latest 30-day collections are ${Math.abs(collectionMomentum)}% below the preceding 30-day window.`, severity: "warning", confidence: confidenceFromSample(paymentsCurrent30._count._all), metric: `${collectionMomentum}%`, href: "/school/fees/reports", actionLabel: "Inspect collections" });
    if (highAcademicRisk > 0) leadershipSignals.push({ id: "lead-academic-risk", title: `${highAcademicRisk} learner${highAcademicRisk === 1 ? "" : "s"} show high academic risk`, detail: "Current-term scores and missed assessments indicate learners who should be discussed with teachers before the next assessment cycle.", severity: "critical", confidence: "high", metric: `${highAcademicRisk} high risk`, href: "/school/gradebook", actionLabel: "Review academic risk" });
    if (termExpectedMarks > 0 && markingCompletion < 70) leadershipSignals.push({ id: "lead-marking", title: "Assessment visibility is incomplete", detail: `Only ${markingCompletion}% of expected current-term marks are entered. Leadership decisions may be distorted until teachers close the marking gap.`, severity: markingCompletion < 45 ? "critical" : "warning", confidence: "high", metric: `${markingCompletion}% complete`, href: "/school/gradebook", actionLabel: "Review gradebook" });
    if (!leadershipSignals.length) leadershipSignals.push({ id: "lead-clear", title: "No major school-wide exception is visible", detail: "Attendance, finance and academic records do not currently produce a high-priority leadership warning.", severity: "positive", confidence: "medium" });
    const leadershipRecommendations = sortSignals(leadershipSignals).map(actionFromSignal).filter((item): item is IntelligenceRecommendation => Boolean(item)).slice(0, 5);
    const leadershipIntelligence: DecisionIntelligence = {
      headline: highAcademicRisk ? "Protect learners at risk first" : collectionRate < 60 ? "Strengthen cash collection without losing academic focus" : attendanceDelta < -5 ? "Reverse the attendance slide" : "School health is broadly controlled",
      summary: `SukuuNova combined attendance movement, fee health, academic performance and assessment completeness${currentTerm ? ` for ${currentTerm.name}` : ""} into one explainable school-health view.`,
      score: leadershipScore,
      label: scoreLabel(leadershipScore),
      components: leadershipComponents,
      signals: sortSignals(leadershipSignals).slice(0, 7),
      recommendations: leadershipRecommendations,
      forecasts: canFinance ? [collectionForecast(decimal(paymentsWeek._sum.amount), paymentsWeek._count._all)] : [],
    };

    return {
      mode: "leadership" as const,
      school,
      summary: { students, staff, teachers, classes: classes.length, assessments, studentsOwing: unpaidStudents.length, expected, collected, outstanding, collectionRate, attendanceToday: todayPresent, attendanceRate: percent(todayPresent, students) },
      classPopulation,
      attendanceTrend,
      staffRoles: staffRoleDistribution,
      gender: { available: false, male: null, female: null, notRecorded: students },
      academicRisk,
      trendComparisons: { attendance: { current: currentAttendance.rate, previous: previousAttendance.rate, deltaPoints: attendanceDelta, recordedDays: currentAttendance.recordedDays }, collections: { current30: current30Collections, previous30: previous30Collections, changePercent: collectionMomentum }, academics: { currentTerm: currentTerm?.name || null, average: academicAverage, markingCompletion } },
      intelligence: leadershipIntelligence,
    };
  });

  return NextResponse.json(payload);
}
