"use server";

import { withTenant } from "@/lib/db";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };
const teacherRoleKeys = ["teacher", "class_teacher", "subject_teacher", "assistant_teacher", "teaching_assistant"];
const HOUSE_COLORS = ["#d36b4b", "#267a66", "#c18a2c", "#6f5ab8", "#2d7d8a", "#b84f74"];

export async function createClass(input: { level: string; name: string; classTeacherId?: string }): Promise<ActionResult> {
  const session = await requireSchoolSession();
  const level = input.level.trim(); const name = input.name.trim(); const teacherId = input.classTeacherId?.trim() || null;
  if (!level || !name) return { ok: false, message: "Enter both the grade level and class name." };
  return withTenant(session.schoolId, async (tx) => {
    try {
      await requirePermission(tx, session.userId, "classes:manage");
      const duplicate = await tx.class.findFirst({ where: { name }, select: { id: true, name: true, level: true } });
      if (duplicate) return { ok: false, message: `Class “${duplicate.name}” already exists in this school.` };
      if (teacherId) {
        const teacher = await tx.user.findFirst({ where: { id: teacherId, status: "active", userRoles: { some: { role: { key: { in: teacherRoleKeys } } } } }, select: { id: true, name: true } });
        if (!teacher) return { ok: false, message: "Choose an active teaching staff member. The selected account is not eligible to be a class teacher." };
        const assigned = await tx.class.findFirst({ where: { classTeacherId: teacherId }, select: { id: true, name: true } });
        if (assigned) return { ok: false, message: `${teacher.name} is already the class teacher for ${assigned.name}.` };
      }
      const schoolClass = await tx.class.create({ data: { schoolId: session.schoolId, level, name, classTeacherId: teacherId } });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "class.created", entityType: "Class", entityId: schoolClass.id, after: { level, name, classTeacherId: teacherId } });
      return { ok: true, message: `${name} was created successfully.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not create the class.";
      return { ok: false, message: /Unique constraint/i.test(message) ? "A class with that name already exists." : message };
    }
  });
}

export async function createHouse(input: { name: string; code: string; color?: string; description?: string }): Promise<ActionResult> {
  const session = await requireSchoolSession();
  const name = input.name.trim(); const code = input.code.trim().toUpperCase(); const color = input.color || HOUSE_COLORS[0]; const description = input.description?.trim() || null;
  if (!name || !code) return { ok: false, message: "Enter a house name and code." };
  return withTenant(session.schoolId, async (tx) => {
    try {
      await requirePermission(tx, session.userId, "classes:manage");
      const duplicate = await tx.house.findFirst({ where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { code: { equals: code, mode: "insensitive" } }] }, select: { id: true } });
      if (duplicate) return { ok: false, message: "A house with that name or code already exists." };
      const house = await tx.house.create({ data: { schoolId: session.schoolId, name, code, color, description, isActive: true }, select: { id: true, name: true, code: true, color: true, description: true } });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "house.created", entityType: "House", entityId: house.id, after: house });
      return { ok: true, message: `${name} was added to the house system.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "We could not create the house." };
    }
  });
}

export async function assignHouse(input: { studentId: string; houseId: string }): Promise<ActionResult> {
  const session = await requireSchoolSession();
  return withTenant(session.schoolId, async (tx) => {
    try {
      await requirePermission(tx, session.userId, "students:write");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`house-assignment:${session.schoolId}:${input.studentId}`}))`;
      const [house, student] = await Promise.all([
        tx.house.findFirst({ where: { id: input.houseId, isActive: true }, select: { id: true, name: true } }),
        tx.student.findFirst({ where: { id: input.studentId }, select: { id: true, name: true, houseId: true } })
      ]);
      if (!house || !student) return { ok: false, message: "Student or house could not be found." };
      await tx.student.update({ where: { id: student.id }, data: { houseId: house.id } });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "student.house_assigned", entityType: "Student", entityId: student.id, before: { houseId: student.houseId }, after: { houseId: house.id, houseName: house.name } });
      return { ok: true, message: `${student.name} is now in ${house.name}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "We could not assign the house." };
    }
  });
}

export async function autoBalanceHouses(): Promise<ActionResult> {
  const session = await requireSchoolSession();
  return withTenant(session.schoolId, async (tx) => {
    try {
      await requirePermission(tx, session.userId, "students:write");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`houses-auto-balance:${session.schoolId}`}))`;
      const houses = await tx.house.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
      if (!houses.length) return { ok: false, message: "Create at least one active house first." };
      const grouped = await tx.student.groupBy({ by: ["houseId"], where: { status: "active", houseId: { not: null } }, _count: { _all: true } });
      const counts = new Map(houses.map((house) => [house.id, grouped.find((row) => row.houseId === house.id)?._count._all ?? 0]));
      const students = await tx.student.findMany({ where: { status: "active", houseId: null }, select: { id: true, name: true, admissionNo: true }, orderBy: [{ admissionNo: "asc" }, { id: "asc" }] });
      let changed = 0;
      for (const student of students) {
        const target = [...houses].sort((a, b) => (counts.get(a.id)! - counts.get(b.id)!) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0];
        await tx.student.update({ where: { id: student.id }, data: { houseId: target.id } });
        counts.set(target.id, counts.get(target.id)! + 1);
        changed += 1;
      }
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "houses.auto_assigned", entityType: "House", entityId: houses[0].id, after: { houseCount: houses.length, studentCount: students.length, changed } });
      return { ok: true, message: changed ? `${changed} unassigned learners were distributed across the active houses.` : "All active learners are already assigned to a house." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "We could not assign the houses." };
    }
  });
}
