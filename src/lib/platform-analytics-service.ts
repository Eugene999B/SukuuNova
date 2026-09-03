import { withTenant, db } from "./db";
import { ForbiddenError } from "./errors";

type Role = string;

export type PlatformAnalyticsSchool = {
  id: string;
  name: string;
  uniqueCode: string;
  status: string;
  students: number;
  users: number;
  classes: number;
  attendanceCoverage: number;
  attendanceToday: number;
  lateRate: number;
  collections: number;
  invoices: number;
  outstanding: number;
  collectionRate: number;
  activityRate: number;
  attendanceTrend: number;
  activityTrend: number;
  riskScore: number;
  riskLevel: "critical" | "watch" | "stable";
  riskReasons: string[];
  series: Array<{ day: string; attendance: number; activeStudents: number; activeUsers: number }>;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function trendSlope(values: number[]) {
  if (values.length < 2) return 0;
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = index - meanX;
    numerator += dx * (values[index] - meanY);
    denominator += dx * dx;
  }
  return denominator ? numerator / denominator : 0;
}

function ewma(values: number[], alpha = 0.25) {
  if (!values.length) return 0;
  let estimate = values[0];
  for (let index = 1; index < values.length; index += 1) estimate = alpha * values[index] + (1 - alpha) * estimate;
  return estimate;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export async function getPlatformAnalytics(role: Role, days = 28): Promise<{ generatedAt: string; windowDays: number; network: Record<string, number>; schools: PlatformAnalyticsSchool[] }> {
  if (!["super_admin", "platform_admin", "analytics_admin"].includes(role)) throw new ForbiddenError("Network analytics permission required.");
  const windowDays = Math.min(Math.max(Math.floor(days), 7), 90);
  const directories = await db.schoolLoginDirectory.findMany({ where: { status: "active" }, select: { schoolId: true }, orderBy: { createdAt: "desc" } });
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - windowDays + 1);
  start.setHours(0, 0, 0, 0);

  const schools = (await Promise.all(directories.map(({ schoolId }) => withTenant(schoolId, async (tx) => {
    const [school, aggregate, daily] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true } }),
      tx.$queryRawUnsafe<Array<{ students: string; users: string; classes: string; attendance: string; attendedStudents: string; late: string; invoices: string; outstanding: string; collections: string }>>(`
        SELECT
          (SELECT COUNT(*)::text FROM "Student" WHERE "schoolId"=$1 AND "status"='active') AS students,
          (SELECT COUNT(*)::text FROM "User" WHERE "schoolId"=$1 AND "status"='active') AS users,
          (SELECT COUNT(*)::text FROM "Class" WHERE "schoolId"=$1) AS classes,
          (SELECT COUNT(*)::text FROM "AttendanceEvent" WHERE "schoolId"=$1 AND "attendanceDate" BETWEEN $2 AND $3 AND "type"='in') AS attendance,
          (SELECT COUNT(DISTINCT "studentId")::text FROM "AttendanceEvent" WHERE "schoolId"=$1 AND "attendanceDate" BETWEEN $2 AND $3 AND "type"='in' AND "studentId" IS NOT NULL) AS "attendedStudents",
          (SELECT COUNT(*)::text FROM "AttendanceEvent" WHERE "schoolId"=$1 AND "attendanceDate" BETWEEN $2 AND $3 AND "type"='in' AND COALESCE("isLate",false)=true) AS late,
          (SELECT COUNT(*)::text FROM "PlatformInvoice" WHERE "schoolId"=$1) AS invoices,
          (SELECT COALESCE(SUM(GREATEST("amount" - COALESCE((SELECT SUM(p."amount") FROM "PlatformPayment" p WHERE p."platformInvoiceId"=i."id"),0),0)),0)::text FROM "PlatformInvoice" i WHERE i."schoolId"=$1) AS outstanding,
          (SELECT COALESCE(SUM("amount"),0)::text FROM "PlatformPayment" WHERE "schoolId"=$1) AS collections
      `, schoolId, start, end),
      tx.$queryRawUnsafe<Array<{ day: string; attendance: string; activeStudents: string; activeUsers: string }>>(`
        WITH days AS (
          SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
        ), attendance AS (
          SELECT "attendanceDate"::date AS day,
                 COUNT(*) FILTER (WHERE "type"='in')::text AS attendance,
                 COUNT(DISTINCT "studentId") FILTER (WHERE "type"='in' AND "studentId" IS NOT NULL)::text AS "activeStudents"
          FROM "AttendanceEvent"
          WHERE "schoolId"=$1 AND "attendanceDate" BETWEEN $2 AND $3
          GROUP BY "attendanceDate"::date
        )
        SELECT
          to_char(days.day,'YYYY-MM-DD') AS day,
          COALESCE(attendance.attendance,'0') AS attendance,
          COALESCE(attendance."activeStudents",'0') AS "activeStudents",
          (SELECT COUNT(*)::text FROM "User" WHERE "schoolId"=$1 AND "status"='active' AND "createdAt" < days.day + interval '1 day') AS "activeUsers"
        FROM days
        LEFT JOIN attendance ON attendance.day=days.day
        ORDER BY days.day ASC
      `, schoolId, start, end),
    ]);
    if (!school) return null;
    const a = aggregate[0] ?? { students: "0", users: "0", classes: "0", attendance: "0", attendedStudents: "0", late: "0", invoices: "0", outstanding: "0", collections: "0" };
    const students = Number(a.students);
    const users = Number(a.users);
    const attendance = Number(a.attendance);
    const attendedStudents = Number(a.attendedStudents);
    const late = Number(a.late);
    const invoices = Number(a.invoices);
    const outstanding = Number(a.outstanding);
    const collections = Number(a.collections);
    const invoiced = collections + outstanding;
    const today = daily[daily.length - 1];
    const series = daily.map((row) => ({ day: row.day, attendance: Number(row.attendance), activeStudents: Number(row.activeStudents), activeUsers: Number(row.activeUsers) }));
    const coverage = students ? clamp((attendedStudents / students) * 100) : 0;
    const activityRate = users ? clamp((series.reduce((sum, row) => sum + Math.min(row.activeUsers, users), 0) / Math.max(series.length, 1) / users) * 100) : 0;
    const attendanceRatios = series.map((row) => students ? (row.activeStudents / students) * 100 : 0);
    const activityRatios = series.map((row) => users ? (Math.min(row.activeUsers, users) / users) * 100 : 0);
    const recentAttendance = ewma(attendanceRatios.slice(-7));
    const priorAttendance = ewma(attendanceRatios.slice(-14, -7));
    const attendanceTrend = recentAttendance - priorAttendance;
    const activityTrend = trendSlope(activityRatios.slice(-14));
    const collectionRate = invoiced ? clamp((collections / invoiced) * 100) : 100;
    const lateRate = attendance ? clamp((late / attendance) * 100) : 0;
    const reasons: string[] = [];
    let risk = 0;
    if (school.status !== "active") { risk += 55; reasons.push("School account is not active"); }
    if (students > 0 && coverage < 35) { risk += 25; reasons.push("Attendance coverage is low"); }
    else if (students > 0 && coverage < 65) { risk += 12; reasons.push("Attendance coverage needs review"); }
    if (users > 0 && activityRate < 25) { risk += 18; reasons.push("Low operator activity"); }
    if (attendanceTrend < -10) { risk += 18; reasons.push("Attendance trend is declining"); }
    else if (attendanceTrend < -4) { risk += 9; reasons.push("Attendance trend softened"); }
    if (collectionRate < 50) { risk += 18; reasons.push("Collection rate is below 50%"); }
    else if (collectionRate < 80) { risk += 8; reasons.push("Collection rate below target"); }
    if (lateRate > 25) { risk += 8; reasons.push("Late attendance is elevated"); }
    risk = clamp(risk);
    const riskLevel = risk >= 60 ? "critical" : risk >= 25 ? "watch" : "stable";
    return {
      id: school.id, name: school.name, uniqueCode: school.uniqueCode, status: school.status,
      students, users, classes: Number(a.classes), attendanceCoverage: Math.round(coverage), attendanceToday: Number(today?.activeStudents ?? 0),
      lateRate: Math.round(lateRate), collections, invoices, outstanding, collectionRate: Math.round(collectionRate), activityRate: Math.round(activityRate),
      attendanceTrend: Math.round(attendanceTrend * 10) / 10, activityTrend: Math.round(activityTrend * 10) / 10,
      riskScore: Math.round(risk), riskLevel, riskReasons: reasons.slice(0, 3), series,
    } satisfies PlatformAnalyticsSchool;
  }))).filter((school): school is PlatformAnalyticsSchool => Boolean(school));

  const riskValues = schools.map((school) => school.riskScore);
  const medianRisk = median(riskValues);
  const networkStudents = schools.reduce((sum, school) => sum + school.students, 0);
  const networkAttendance = schools.reduce((sum, school) => sum + school.attendanceCoverage * school.students, 0);
  const networkUsers = schools.reduce((sum, school) => sum + school.users, 0);
  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    network: {
      schools: schools.length,
      students: networkStudents,
      users: networkUsers,
      classes: schools.reduce((sum, school) => sum + school.classes, 0),
      attendanceCoverage: networkStudents ? Math.round(networkAttendance / networkStudents) : 0,
      collectionRate: schools.length ? Math.round(schools.reduce((sum, school) => sum + school.collectionRate, 0) / schools.length) : 0,
      outstanding: schools.reduce((sum, school) => sum + school.outstanding, 0),
      medianRisk: Math.round(medianRisk),
      critical: schools.filter((school) => school.riskLevel === "critical").length,
      watch: schools.filter((school) => school.riskLevel === "watch").length,
    },
    schools: schools.sort((a, b) => b.riskScore - a.riskScore),
  };
}
