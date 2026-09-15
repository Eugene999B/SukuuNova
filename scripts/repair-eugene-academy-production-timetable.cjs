#!/usr/bin/env node
/*
 * Repair only the permanent Eugene Academy production demo timetable.
 *
 * The original fixture could contain nine classes but only eight subject-teacher
 * accounts, which made a fully occupied eight-period timetable impossible without
 * teacher clashes. This repair reuses the existing active teaching staff (subject
 * teachers plus class teachers), normalizes the class-subject assignments, and
 * rebuilds the synthetic timetable without weakening database collision guards.
 */
const { PrismaClient } = require("@prisma/client");

const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const PRODUCTION_ACK = "EUGENE_ACADEMY_ONLY";
const TEACHING_ROLE_KEYS = new Set(["teacher", "class_teacher", "subject_teacher", "academic_coordinator", "department_head"]);

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const allow = String(process.env.ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED || "").trim();
const railwayEnvironment = String(process.env.RAILWAY_ENVIRONMENT_NAME || "").trim().toLowerCase();

if (!databaseUrl) throw new Error("DATABASE_URL is required for the Eugene Academy timetable repair.");
if (allow !== PRODUCTION_ACK) {
  throw new Error(`Refusing Eugene Academy timetable repair: set ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED=${PRODUCTION_ACK}.`);
}
if (railwayEnvironment && railwayEnvironment !== "production") {
  throw new Error(`Refusing Eugene Academy timetable repair in Railway environment '${railwayEnvironment}'. Expected 'production'.`);
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
  transactionOptions: { maxWait: 15000, timeout: 300000 },
});

function roleKey(role) {
  return String(role?.key || role?.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function isEligibleTeacher(user) {
  return Boolean(
    user
      && user.status === "active"
      && Array.isArray(user.userRoles)
      && user.userRoles.some(({ role }) => TEACHING_ROLE_KEYS.has(roleKey(role))),
  );
}

function slotKey(classId, dayOfWeek, period) {
  return `${classId}:${dayOfWeek}:${period}`;
}

async function main() {
  const directory = await prisma.schoolLoginDirectory.findUnique({
    where: { uniqueCode: SCHOOL_CODE },
    select: { schoolId: true },
  });
  if (!directory) throw new Error("Eugene Academy directory eug123 does not exist.");
  const schoolId = directory.schoolId;

  const summary = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);

    const school = await tx.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, uniqueCode: true },
    });
    if (!school || school.name !== SCHOOL_NAME || school.uniqueCode !== SCHOOL_CODE) {
      throw new Error(`Refusing timetable repair: expected ${SCHOOL_NAME} (${SCHOOL_CODE}).`);
    }

    const [classes, subjects, currentAssignments, substituteRows] = await Promise.all([
      tx.class.findMany({
        where: { schoolId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          classTeacher: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              userRoles: { select: { role: { select: { key: true, name: true } } } },
            },
          },
        },
      }),
      tx.subject.findMany({
        where: { schoolId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      tx.classSubjectTeacher.findMany({
        where: { schoolId },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              userRoles: { select: { role: { select: { key: true, name: true } } } },
            },
          },
        },
      }),
      tx.substituteAssignment.findMany({
        where: { schoolId },
        select: {
          id: true,
          substituteTeacherId: true,
          assignedBy: true,
          assignmentDate: true,
          createdAt: true,
          timetableSlot: { select: { classId: true, dayOfWeek: true, period: true } },
        },
      }),
    ]);

    if (!classes.length || subjects.length !== 8) {
      throw new Error(`Eugene Academy repair expects classes and exactly 8 subjects; found ${classes.length} classes / ${subjects.length} subjects.`);
    }

    const candidateById = new Map();
    const addCandidate = (user) => {
      if (!isEligibleTeacher(user)) return;
      candidateById.set(user.id, user);
    };
    for (const assignment of currentAssignments) addCandidate(assignment.teacher);
    for (const classroom of classes) addCandidate(classroom.classTeacher);

    const teacherPool = [...candidateById.values()].sort((left, right) => {
      const a = String(left.email || left.name || left.id);
      const b = String(right.email || right.name || right.id);
      return a.localeCompare(b) || left.id.localeCompare(right.id);
    });
    if (teacherPool.length < classes.length) {
      throw new Error(`Cannot build a collision-free timetable: ${classes.length} classes require at least ${classes.length} active teaching staff, found ${teacherPool.length}.`);
    }

    const normalizedAssignments = [];
    const assignmentMap = new Map();
    for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
      for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex += 1) {
        const teacher = teacherPool[(classIndex + subjectIndex) % teacherPool.length];
        const row = {
          schoolId,
          classId: classes[classIndex].id,
          subjectId: subjects[subjectIndex].id,
          teacherId: teacher.id,
        };
        normalizedAssignments.push(row);
        assignmentMap.set(`${row.classId}:${row.subjectId}`, row.teacherId);
      }
    }

    // ClassSubjectTeacher has no child ownership relationship; canonical academic
    // author records are repaired by the next current-system refresh step.
    await tx.classSubjectTeacher.deleteMany({ where: { schoolId } });
    await tx.classSubjectTeacher.createMany({ data: normalizedAssignments });

    // TimetableSlot is referenced by substitute assignments with RESTRICT. Preserve
    // those synthetic records across the rebuild by snapshotting their coordinates,
    // deleting them first, then restoring them against the replacement slots.
    await tx.substituteAssignment.deleteMany({ where: { schoolId } });
    await tx.timetableSlot.deleteMany({ where: { schoolId } });

    const timetableRows = [];
    for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
      const classroom = classes[classIndex];
      const venue = `room:class-room-${classIndex + 1}`;
      for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek += 1) {
        for (let period = 1; period <= 8; period += 1) {
          // Every class studies the same subject index in a given period. Because
          // each class-subject pair was rotated across at least one teacher per
          // class, the teacher IDs are distinct across classes at that instant.
          const subject = subjects[(dayOfWeek + period - 2) % subjects.length];
          const teacherId = assignmentMap.get(`${classroom.id}:${subject.id}`);
          if (!teacherId) throw new Error(`Missing normalized teaching assignment for ${classroom.name}/${subject.name}.`);
          timetableRows.push({
            schoolId,
            classId: classroom.id,
            subjectId: subject.id,
            teacherId,
            dayOfWeek,
            period,
            venue,
          });
        }
      }
    }
    await tx.timetableSlot.createMany({ data: timetableRows });

    const rebuiltSlots = await tx.timetableSlot.findMany({
      where: { schoolId },
      select: { id: true, classId: true, dayOfWeek: true, period: true },
    });
    const rebuiltByCoordinate = new Map(
      rebuiltSlots.map((slot) => [slotKey(slot.classId, slot.dayOfWeek, slot.period), slot.id]),
    );

    let substitutesRestored = 0;
    for (const previous of substituteRows) {
      const replacementSlotId = rebuiltByCoordinate.get(
        slotKey(previous.timetableSlot.classId, previous.timetableSlot.dayOfWeek, previous.timetableSlot.period),
      );
      if (!replacementSlotId) {
        throw new Error(`Could not restore substitute assignment ${previous.id}: replacement timetable slot is missing.`);
      }
      await tx.substituteAssignment.create({
        data: {
          id: previous.id,
          schoolId,
          timetableSlotId: replacementSlotId,
          substituteTeacherId: previous.substituteTeacherId,
          assignedBy: previous.assignedBy,
          assignmentDate: previous.assignmentDate,
          createdAt: previous.createdAt,
        },
      });
      substitutesRestored += 1;
    }

    const [teacherCollisions, venueCollisions] = await Promise.all([
      tx.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS "count" FROM (
           SELECT "teacherId","dayOfWeek","period"
           FROM "TimetableSlot"
           WHERE "schoolId"=$1
           GROUP BY "teacherId","dayOfWeek","period"
           HAVING COUNT(*)>1
         ) conflicts`,
        schoolId,
      ),
      tx.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS "count" FROM (
           SELECT LOWER(BTRIM("venue")) AS venue,"dayOfWeek","period"
           FROM "TimetableSlot"
           WHERE "schoolId"=$1 AND "venue" IS NOT NULL AND BTRIM("venue")<>''
           GROUP BY LOWER(BTRIM("venue")),"dayOfWeek","period"
           HAVING COUNT(*)>1
         ) conflicts`,
        schoolId,
      ),
    ]);

    const teacherCollisionCount = Number(teacherCollisions[0].count);
    const venueCollisionCount = Number(venueCollisions[0].count);
    const expectedSlots = classes.length * 5 * 8;
    if (rebuiltSlots.length !== expectedSlots) {
      throw new Error(`Expected ${expectedSlots} rebuilt timetable slots, found ${rebuiltSlots.length}.`);
    }
    if (teacherCollisionCount !== 0 || venueCollisionCount !== 0) {
      throw new Error(`Timetable repair verification failed: ${JSON.stringify({ teacherCollisions: teacherCollisionCount, venueCollisions: venueCollisionCount })}`);
    }

    return {
      school: `${school.name} (${school.uniqueCode})`,
      classes: classes.length,
      subjects: subjects.length,
      teachingStaffPool: teacherPool.length,
      assignments: normalizedAssignments.length,
      timetableSlots: rebuiltSlots.length,
      substitutesRestored,
      teacherCollisions: teacherCollisionCount,
      venueCollisions: venueCollisionCount,
    };
  });

  console.log("[eugene-timetable-repair] verified", JSON.stringify(summary));
}

main().catch((error) => {
  console.error("[eugene-timetable-repair] failed:", error instanceof Error ? (error.stack || error.message) : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
