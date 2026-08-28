import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      const keys = [
        "attendance:record", "attendance:pickup_approve", "classes:manage",
        "payroll:manage", "payroll:view_own", "templates:manage",
        "visitors:log", "settings:manage_school", "roles:create_custom"
      ] as const;
      const pairs = await Promise.all(keys.map(async (key) => [key, await hasPermission(tx, session.userId, key)] as const));
      const capabilities = Object.fromEntries(pairs);
      const canReadPeople = capabilities["attendance:record"] || capabilities["classes:manage"];
      const [students, guardians, staff, classes, subjects] = canReadPeople
        ? await Promise.all([
            tx.student.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
            tx.guardian.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
            tx.user.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
            tx.class.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
            tx.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
          ])
        : [[], [], [], [], []];
      return { user: { id: session.userId, name: session.name }, capabilities, students, guardians, staff, classes, subjects };
    });
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}
