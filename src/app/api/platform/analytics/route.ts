import { NextResponse } from "next/server";
import { requirePlatformSession } from "@/lib/auth";
import { getPlatformSchoolScope, requirePlatformPermission } from "@/lib/platform-permissions";
import { routeError } from "@/lib/errors";
import { getPlatformAnalytics } from "@/lib/platform-analytics-service";

function scopedNetwork(schools: Awaited<ReturnType<typeof getPlatformAnalytics>>["schools"]) {
  const students = schools.reduce((sum, school) => sum + school.students, 0);
  const risks = schools.map((school) => school.riskScore).sort((a, b) => a - b);
  const middle = Math.floor(risks.length / 2);
  const medianRisk = risks.length
    ? risks.length % 2 ? risks[middle] : (risks[middle - 1] + risks[middle]) / 2
    : 0;
  return {
    schools: schools.length,
    students,
    users: schools.reduce((sum, school) => sum + school.users, 0),
    classes: schools.reduce((sum, school) => sum + school.classes, 0),
    attendanceCoverage: students
      ? Math.round(schools.reduce((sum, school) => sum + school.attendanceCoverage * school.students, 0) / students)
      : 0,
    collectionRate: schools.length
      ? Math.round(schools.reduce((sum, school) => sum + school.collectionRate, 0) / schools.length)
      : 0,
    outstanding: schools.reduce((sum, school) => sum + school.outstanding, 0),
    medianRisk: Math.round(medianRisk),
    critical: schools.filter((school) => school.riskLevel === "critical").length,
    watch: schools.filter((school) => school.riskLevel === "watch").length,
  };
}

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "analytics.view");
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 28);
    const [analytics, schoolScope] = await Promise.all([
      getPlatformAnalytics(session.role, Number.isFinite(days) ? days : 28),
      getPlatformSchoolScope(session),
    ]);
    if (schoolScope === null) return NextResponse.json(analytics);
    const schools = analytics.schools.filter((school) => schoolScope.includes(school.id));
    return NextResponse.json({ ...analytics, network: scopedNetwork(schools), schools });
  } catch (error) {
    return routeError(error);
  }
}
