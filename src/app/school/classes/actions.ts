"use server";

import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "@/lib/db";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };
const teacherRoleKeys = ["teacher", "class-teacher", "subject-teacher", "assistant-teacher", "teaching-assistant"];
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
  const session = await requireSchoolSession(); const name = input.name.trim(); const code = input.code.trim().toUpperCase(); const color = input.color || HOUSE_COLORS[0]; const description = input.description?.trim() || null;
  if (!name || !code) return { ok: false, message: "Enter a house name and code." };
  return withTenant(session.schoolId, async (tx) => {
    try { await requirePermission(tx, session.userId, "classes:manage");
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "House" WHERE "schoolId"=${session.schoolId} AND (LOWER("name")=LOWER(${name}) OR UPPER("code")=UPPER(${code})) LIMIT 1`;
      if (duplicate.length) return { ok: false, message: "A house with that name or code already exists." };
      const id = createId();
      await tx.$executeRaw`INSERT INTO "House" ("id","schoolId","name","code","color","description","isActive") VALUES (${id},${session.schoolId},${name},${code},${color},${description},true)`;
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "house.created", entityType: "House", entityId: id, after: { name, code, color, description } });
      return { ok: true, message: `${name} was added to the house system.` };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "We could not create the house." }; }
  });
}

export async function assignHouse(input: { studentId: string; houseId: string }): Promise<ActionResult> {
  const session = await requireSchoolSession();
  return withTenant(session.schoolId, async (tx) => {
    try { await requirePermission(tx, session.userId, "students:write");
      const [house, student] = await Promise.all([tx.$queryRaw<Array<{ id: string; name: string }>>`SELECT "id","name" FROM "House" WHERE "id"=${input.houseId} AND "schoolId"=${session.schoolId} AND "isActive"=true LIMIT 1`, tx.student.findFirst({ where: { id: input.studentId }, select: { id: true, name: true } })]);
      if (!house[0] || !student) return { ok: false, message: "Student or house could not be found." };
      const previous = await tx.$queryRaw<Array<{ houseId: string | null }>>`SELECT "houseId" FROM "Student" WHERE "id"=${input.studentId} AND "schoolId"=${session.schoolId} LIMIT 1`;
      await tx.$executeRaw`UPDATE "Student" SET "houseId"=${input.houseId} WHERE "id"=${input.studentId} AND "schoolId"=${session.schoolId}`;
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "student.house_assigned", entityType: "Student", entityId: student.id, before: { houseId: previous[0]?.houseId ?? null }, after: { houseId: input.houseId, houseName: house[0].name } });
      return { ok: true, message: `${student.name} is now in ${house[0].name}.` };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "We could not assign the house." }; }
  });
}

export async function autoBalanceHouses(): Promise<ActionResult> {
  const session = await requireSchoolSession();
  return withTenant(session.schoolId, async (tx) => {
    try { await requirePermission(tx, session.userId, "students:write");
      const houses = await tx.$queryRaw<Array<{id:string;name:string;studentCount:number}>>`SELECT h."id",h."name",COUNT(s."id")::int AS "studentCount" FROM "House" h LEFT JOIN "Student" s ON s."houseId"=h."id" AND s."schoolId"=h."schoolId" AND s."status"='active' WHERE h."schoolId"=${session.schoolId} AND h."isActive"=true GROUP BY h."id",h."name" ORDER BY COUNT(s."id") ASC,h."name" ASC`;
      if (!houses.length) return { ok: false, message: "Create at least one active house first." };
      const students = await tx.$queryRaw<Array<{id:string}>>`SELECT "id" FROM "Student" WHERE "schoolId"=${session.schoolId} AND "status"='active' AND "houseId" IS NULL ORDER BY "name" ASC`;
      const counts = new Map(houses.map((h) => [h.id, h.studentCount])); let changed = 0;
      for (const student of students) { const target = [...houses].sort((a,b)=>(counts.get(a.id)!-counts.get(b.id)!) || a.name.localeCompare(b.name))[0]; await tx.$executeRaw`UPDATE "Student" SET "houseId"=${target.id} WHERE "id"=${student.id} AND "schoolId"=${session.schoolId}`; counts.set(target.id, counts.get(target.id)! + 1); changed++; }
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "houses.auto_assigned", entityType: "House", entityId: houses[0].id, after: { houseCount: houses.length, studentCount: students.length, changed } });
      return { ok: true, message: changed ? `${changed} unassigned learners were distributed across the active houses.` : "All active learners are already assigned to a house." };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "We could not assign the houses." }; }
  });
}
