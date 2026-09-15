#!/usr/bin/env node
/*
 * Align the permanent/staging Eugene Academy showcase with the current SukuuNova
 * runtime contracts after the base full-system fixture has been created.
 *
 * This script is intentionally demo-tenant specific. It never calls external
 * providers and it refuses to target any tenant other than Eugene Academy (eug123).
 */
const { PrismaClient } = require("@prisma/client");

const TARGET = String(process.env.EUGENE_ACADEMY_SYSTEM_TARGET || "trial").trim().toLowerCase();
const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const PRODUCTION_ACK = "EUGENE_ACADEMY_ONLY";

if (!new Set(["trial", "production"]).has(TARGET)) {
  throw new Error("EUGENE_ACADEMY_SYSTEM_TARGET must be 'trial' or 'production'.");
}

const trialUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();
const databaseUrl = TARGET === "production" ? productionUrl : trialUrl;
if (!databaseUrl) throw new Error(`${TARGET === "production" ? "DATABASE_URL" : "TEST_DATABASE_URL"} is required.`);

if (TARGET === "trial") {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim() !== "YES") {
    throw new Error("Refusing Eugene Academy current-system refresh: trial acknowledgement is missing.");
  }
  if (productionUrl && productionUrl === trialUrl) {
    throw new Error("Refusing Eugene Academy current-system refresh: TEST_DATABASE_URL must differ from DATABASE_URL.");
  }
} else {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED || "").trim() !== PRODUCTION_ACK) {
    throw new Error(`Refusing Eugene Academy production refresh: set ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED=${PRODUCTION_ACK}.`);
  }
  const railwayEnvironment = String(process.env.RAILWAY_ENVIRONMENT_NAME || "").trim().toLowerCase();
  if (railwayEnvironment && railwayEnvironment !== "production") {
    throw new Error(`Refusing Eugene Academy production refresh in Railway environment '${railwayEnvironment}'. Expected 'production'.`);
  }
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
  transactionOptions: { maxWait: 15000, timeout: 300000 },
});

const ROLE_KEYS = {
  "Academic Coordinator": "academic_coordinator",
  "Department Head": "department_head",
  Accountant: "accountant",
  "HR Officer": "hr_officer",
  "Admissions Officer": "admissions_officer",
  "Class Teacher": "class_teacher",
  "Subject Teacher": "subject_teacher",
  "Front Desk/Gate Security": "front_desk_security",
  "Transport Officer": "transport_officer",
  Parent: "parent",
  Student: "student",
};

const SUPPORT = ["support:create", "support:view_own"];
const ROLE_BASELINES = {
  "Academic Coordinator": ["students:read","users:read","reports:generate","calendar:manage","classes:manage","attendance:record","attendance:record_all","attendance:view_own","attendance:display","attendance:review","attendance:staff_scan","scores:write:all","report_cards:submit","report_cards:approve","report_cards:view","identity_cards:manage","exams:manage","analytics:view","risk_flags:view","lesson_plans:review","homework:review","academic_readiness:view","guardian_alerts:view","guardian_alerts:manage",...SUPPORT],
  "Department Head": ["students:read","reports:generate","attendance:record","attendance:record_all","attendance:view_own","attendance:review","attendance:staff_scan","scores:write:all","report_cards:submit","report_cards:view","identity_cards:manage","exams:manage","analytics:view","risk_flags:view","lesson_plans:review","homework:review","academic_readiness:view","guardian_alerts:view",...SUPPORT],
  Accountant: ["students:read","finance:read","finance:write","finance:approve","finance:fee_structures_manage","finance:scholarships_manage","finance:expenses_write","finance:export","invoices:create","payments:record","payments:reverse","reports:generate","payroll:view_own","payroll:view_all","payroll:run","payroll:mark_paid","feeding:manage","fees:adjust","fees:approve","analytics:view","exports:students","exports:finance","store:view","store:sell","store:discount","store:export",...SUPPORT],
  "HR Officer": ["students:read","attendance:record","attendance:record_staff","attendance:view_own","attendance:staff_scan","payroll:view_own","payroll:manage","payroll:view_all","payroll:salary_manage","payroll:run","users:read","users:write","reports:generate","recruitment:manage","analytics:view","exports:staff","exports:attendance","identity_cards:manage",...SUPPORT],
  "Admissions Officer": ["students:read","students:write","reports:generate","payroll:view_own","identity_cards:manage",...SUPPORT],
  "Class Teacher": ["students:read","attendance:record","attendance:record_assigned","attendance:view_own","attendance:staff_scan","lesson_plans:manage","homework:manage_assigned","scores:write:assigned","report_cards:view","exams:manage","exams:take","offline:sync","ai_drafts:accept","report_cards:submit","payroll:view_own","risk_flags:view",...SUPPORT],
  "Subject Teacher": ["students:read","lesson_plans:manage","homework:manage_assigned","scores:write:assigned","attendance:view_own","attendance:staff_scan","report_cards:view","exams:manage","exams:take","offline:sync","ai_drafts:accept","payroll:view_own",...SUPPORT],
  "Front Desk/Gate Security": ["students:read","attendance:record","attendance:record_all","attendance:view_own","attendance:display","attendance:staff_scan","attendance:pickup_approve","visitors:log","payroll:view_own","identity_cards:manage",...SUPPORT],
  "Transport Officer": ["students:read","payroll:view_own","transport:manage","transport:view","offline:sync",...SUPPORT],
  Parent: ["parents:read_linked","report_cards:view","transport:view","exams:take","library:borrow"],
  Student: [],
};

const PERIODS = [
  { period: 1, start: "08:00", end: "08:45" },
  { period: 2, start: "08:45", end: "09:30" },
  { period: 3, start: "09:50", end: "10:35" },
  { period: 4, start: "10:35", end: "11:20" },
  { period: 5, start: "11:20", end: "12:05" },
  { period: 6, start: "12:45", end: "13:30" },
  { period: 7, start: "13:30", end: "14:15" },
  { period: 8, start: "14:15", end: "15:00" },
];
const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TEACHING_ROLE_KEYS = new Set(["teacher", "class_teacher", "subject_teacher", "academic_coordinator", "department_head"]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function assignmentKey(row) {
  return `${row.classId}:${row.subjectId}:${row.teacherId}`;
}

async function applyRoleBaselines(tx, schoolId) {
  const roles = await tx.role.findMany({ where: { schoolId } });
  const roleByName = new Map(roles.map((role) => [role.name, role]));
  for (const [roleName, permissionKeys] of Object.entries(ROLE_BASELINES)) {
    const role = roleByName.get(roleName);
    if (!role) throw new Error(`Eugene Academy is missing current system role '${roleName}'.`);
    const canonicalKey = ROLE_KEYS[roleName];
    if (role.key !== canonicalKey || !role.isSystem) {
      await tx.role.update({ where: { id: role.id }, data: { key: canonicalKey, isSystem: true } });
    }
    const permissionIds = [];
    for (const key of permissionKeys) {
      const permission = await tx.permission.upsert({ where: { key }, update: {}, create: { key, description: key } });
      permissionIds.push(permission.id);
    }
    if (permissionIds.length) {
      await tx.rolePermission.deleteMany({ where: { schoolId, roleId: role.id, permissionId: { notIn: permissionIds } } });
    } else {
      await tx.rolePermission.deleteMany({ where: { schoolId, roleId: role.id } });
    }
    for (const permissionId of permissionIds) {
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: { schoolId },
        create: { schoolId, roleId: role.id, permissionId },
      });
    }
  }
}

async function currentPermissionSet(tx, schoolId, roleName) {
  const rows = await tx.rolePermission.findMany({
    where: { schoolId, role: { name: roleName } },
    select: { permission: { select: { key: true } } },
  });
  return new Set(rows.map((row) => row.permission.key));
}

async function main() {
  const directory = await prisma.schoolLoginDirectory.findUnique({ where: { uniqueCode: SCHOOL_CODE }, select: { schoolId: true } });
  if (!directory) throw new Error("Eugene Academy directory eug123 does not exist.");
  const schoolId = directory.schoolId;

  const summary = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true } });
    if (!school || school.name !== SCHOOL_NAME || school.uniqueCode !== SCHOOL_CODE) {
      throw new Error(`Refusing current-system refresh: expected ${SCHOOL_NAME} (${SCHOOL_CODE}).`);
    }

    await applyRoleBaselines(tx, schoolId);

    const [classes, subjects, assignments, settings] = await Promise.all([
      tx.class.findMany({ where: { schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.classSubjectTeacher.findMany({
        where: { schoolId },
        include: { teacher: { select: { id: true, status: true, userRoles: { select: { role: { select: { key: true, name: true } } } } } } },
      }),
      tx.schoolSettings.findUnique({ where: { schoolId }, select: { reportCardConfig: true } }),
    ]);
    if (!classes.length || subjects.length !== 8) throw new Error(`Eugene Academy current timetable expects classes and exactly 8 subjects; found ${classes.length} classes / ${subjects.length} subjects.`);
    if (assignments.length < classes.length * subjects.length) throw new Error("Eugene Academy is missing class-subject teaching assignments.");

    for (const assignment of assignments) {
      const roleKeys = assignment.teacher.userRoles.map(({ role }) => String(role.key || role.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
      if (assignment.teacher.status !== "active" || !roleKeys.some((key) => TEACHING_ROLE_KEYS.has(key))) {
        throw new Error(`Teaching assignment ${assignment.classId}/${assignment.subjectId} points to an ineligible teacher.`);
      }
    }

    // Make all synthetic academic authorship obey the same exact class+subject
    // jurisdiction now enforced by the live lesson/homework services.
    const academicRepairs = {};
    for (const table of ["LessonPlan", "Homework", "TeacherAcademicWork", "TeacherAcademicNote"]) {
      academicRepairs[table] = await tx.$executeRawUnsafe(
        `UPDATE "${table}" row
         SET "teacherId"=cst."teacherId", "updatedAt"=NOW()
         FROM "ClassSubjectTeacher" cst
         WHERE row."schoolId"=$1
           AND cst."schoolId"=row."schoolId"
           AND cst."classId"=row."classId"
           AND cst."subjectId"=row."subjectId"
           AND row."teacherId" IS DISTINCT FROM cst."teacherId"`,
        schoolId,
      );
    }
    academicRepairs.Score = await tx.$executeRawUnsafe(
      `UPDATE "Score" score
       SET "enteredBy"=cst."teacherId"
       FROM "Assessment" assessment, "ClassSubjectTeacher" cst
       WHERE score."schoolId"=$1
         AND assessment."id"=score."assessmentId" AND assessment."schoolId"=score."schoolId"
         AND cst."schoolId"=score."schoolId" AND cst."classId"=assessment."classId" AND cst."subjectId"=score."subjectId"
         AND score."enteredBy" IS DISTINCT FROM cst."teacherId"`,
      schoolId,
    );
    academicRepairs.TimetableSlot = await tx.$executeRawUnsafe(
      `UPDATE "TimetableSlot" slot
       SET "teacherId"=cst."teacherId"
       FROM "ClassSubjectTeacher" cst
       WHERE slot."schoolId"=$1
         AND cst."schoolId"=slot."schoolId" AND cst."classId"=slot."classId" AND cst."subjectId"=slot."subjectId"
         AND slot."teacherId" IS DISTINCT FROM cst."teacherId"`,
      schoolId,
    );

    const rooms = classes.map((classroom, index) => ({ id: `class-room-${index + 1}`, name: `Room ${index + 1}`, type: "classroom" }));
    for (let index = 0; index < classes.length; index += 1) {
      await tx.timetableSlot.updateMany({
        where: { schoolId, classId: classes[index].id },
        data: { venue: `room:${rooms[index].id}` },
      });
    }

    const slots = await tx.timetableSlot.findMany({ where: { schoolId }, select: { classId: true, subjectId: true, teacherId: true, dayOfWeek: true, period: true } });
    const expectedSlots = classes.length * 5 * 8;
    if (slots.length !== expectedSlots) throw new Error(`Expected ${expectedSlots} current timetable slots, found ${slots.length}.`);
    const weeklyPeriods = {};
    const dailyCounts = new Map();
    for (const slot of slots) {
      const key = assignmentKey(slot);
      weeklyPeriods[key] = (weeklyPeriods[key] || 0) + 1;
      const dailyKey = `${key}:${slot.dayOfWeek}`;
      dailyCounts.set(dailyKey, (dailyCounts.get(dailyKey) || 0) + 1);
    }
    const maxDailyPeriods = {};
    for (const assignment of assignments) {
      const key = assignmentKey(assignment);
      let maximum = 1;
      for (let day = 1; day <= 5; day += 1) maximum = Math.max(maximum, dailyCounts.get(`${key}:${day}`) || 0);
      maxDailyPeriods[key] = maximum;
      if (!weeklyPeriods[key]) throw new Error(`Teaching assignment ${key} has no timetable lessons.`);
    }

    const timetableConfig = {
      days: [1,2,3,4,5].map((dayOfWeek) => ({ dayOfWeek, name: DAY_NAMES[dayOfWeek], enabled: true, start: "08:00", end: "15:00", periods: PERIODS })),
      periodMinutes: 45,
      breaks: [
        { name: "Morning Break", start: "09:30", end: "09:50" },
        { name: "Lunch", start: "12:05", end: "12:45" },
      ],
      periodsPerDay: 8,
      periods: PERIODS,
      published: true,
      weeklyPeriods,
      rooms,
      teacherUnavailability: {},
      roomRequirements: {},
      doublePeriodSubjects: {},
      maxDailyPeriods,
      printTheme: "ghana_classic",
    };
    const assessmentConfig = {
      categories: [
        { name: "Classwork", weight: 20 },
        { name: "Homework", weight: 10 },
        { name: "Exercises", weight: 10 },
        { name: "Quizzes", weight: 10 },
        { name: "Project", weight: 10 },
        { name: "Exam", weight: 40 },
      ],
      rounding: "nearest",
      missingScorePolicy: "blank",
      allowTeacherOverride: false,
    };
    const reportCardConfig = {
      ...record(settings?.reportCardConfig),
      includePosition: true,
      includeSubjectPosition: true,
      includeAttendance: true,
      includeTeacherRemark: true,
      includeHeadRemark: true,
      includeSignatures: true,
      includeSchoolContacts: true,
      rankMethod: "total_average",
      showGrades: true,
      showClassAverage: true,
      showOverallPosition: true,
      showSubjectPosition: true,
      showAttendance: true,
      showClassTeacherRemark: true,
      showHeadteacherRemark: true,
      showStudentPhoto: true,
      verifiedWorkflow: true,
    };
    await tx.schoolSettings.update({
      where: { schoolId },
      data: { timetableConfig, assessmentConfig, reportCardConfig },
    });

    const [teacherCollisions, venueCollisions, invalidLessonPlans, invalidHomework, invalidWorks, invalidNotes, invalidMessages] = await Promise.all([
      tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM (SELECT "teacherId","dayOfWeek","period" FROM "TimetableSlot" WHERE "schoolId"=$1 GROUP BY "teacherId","dayOfWeek","period" HAVING COUNT(*)>1) conflicts`, schoolId),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM (SELECT LOWER(BTRIM("venue")) AS venue,"dayOfWeek","period" FROM "TimetableSlot" WHERE "schoolId"=$1 AND "venue" IS NOT NULL AND BTRIM("venue")<>'' GROUP BY LOWER(BTRIM("venue")),"dayOfWeek","period" HAVING COUNT(*)>1) conflicts`, schoolId),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "LessonPlan" row WHERE row."schoolId"=$1 AND NOT EXISTS (SELECT 1 FROM "ClassSubjectTeacher" cst WHERE cst."schoolId"=row."schoolId" AND cst."classId"=row."classId" AND cst."subjectId"=row."subjectId" AND cst."teacherId"=row."teacherId")`, schoolId),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "Homework" row WHERE row."schoolId"=$1 AND NOT EXISTS (SELECT 1 FROM "ClassSubjectTeacher" cst WHERE cst."schoolId"=row."schoolId" AND cst."classId"=row."classId" AND cst."subjectId"=row."subjectId" AND cst."teacherId"=row."teacherId")`, schoolId),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "TeacherAcademicWork" row WHERE row."schoolId"=$1 AND NOT EXISTS (SELECT 1 FROM "ClassSubjectTeacher" cst WHERE cst."schoolId"=row."schoolId" AND cst."classId"=row."classId" AND cst."subjectId"=row."subjectId" AND cst."teacherId"=row."teacherId")`, schoolId),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "TeacherAcademicNote" row WHERE row."schoolId"=$1 AND NOT EXISTS (SELECT 1 FROM "ClassSubjectTeacher" cst WHERE cst."schoolId"=row."schoolId" AND cst."classId"=row."classId" AND cst."subjectId"=row."subjectId" AND cst."teacherId"=row."teacherId")`, schoolId),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "Message" m WHERE m."schoolId"=$1 AND m."channel"='in_app' AND (m."recipientType"<>'user' OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u."schoolId"=m."schoolId" AND u."id"=m."recipientId"))`, schoolId),
    ]);
    const counts = {
      teacherCollisions: Number(teacherCollisions[0].count),
      venueCollisions: Number(venueCollisions[0].count),
      invalidLessonPlans: Number(invalidLessonPlans[0].count),
      invalidHomework: Number(invalidHomework[0].count),
      invalidWorks: Number(invalidWorks[0].count),
      invalidNotes: Number(invalidNotes[0].count),
      invalidMessages: Number(invalidMessages[0].count),
    };
    if (Object.values(counts).some((value) => value !== 0)) throw new Error(`Current-system verification failed: ${JSON.stringify(counts)}`);

    const [academicCoordinator, classTeacher, subjectTeacher, departmentHead] = await Promise.all([
      currentPermissionSet(tx, schoolId, "Academic Coordinator"),
      currentPermissionSet(tx, schoolId, "Class Teacher"),
      currentPermissionSet(tx, schoolId, "Subject Teacher"),
      currentPermissionSet(tx, schoolId, "Department Head"),
    ]);
    if (!academicCoordinator.has("calendar:manage") || !academicCoordinator.has("classes:manage")) throw new Error("Academic Coordinator must manage the current timetable.");
    if (academicCoordinator.has("settings:manage_school")) throw new Error("Academic Coordinator must not need broad school-settings authority for timetable management.");
    if (classTeacher.has("calendar:manage") || subjectTeacher.has("calendar:manage") || departmentHead.has("calendar:manage")) throw new Error("Non-timetable roles must not inherit calendar:manage in Eugene Academy.");
    if (!classTeacher.has("lesson_plans:manage") || !subjectTeacher.has("homework:manage_assigned")) throw new Error("Teaching roles are missing the current academic authoring permissions.");

    const refreshedSettings = await tx.schoolSettings.findUnique({ where: { schoolId }, select: { timetableConfig: true, assessmentConfig: true, reportCardConfig: true } });
    const timetable = record(refreshedSettings?.timetableConfig);
    const assessment = record(refreshedSettings?.assessmentConfig);
    const report = record(refreshedSettings?.reportCardConfig);
    if (!Array.isArray(timetable.days) || timetable.days.length !== 5 || timetable.published !== true || timetable.periodsPerDay !== 8) throw new Error("Timetable configuration is not on the current schema.");
    if (!Array.isArray(assessment.categories) || assessment.categories.reduce((sum, item) => sum + Number(item.weight || 0), 0) !== 100) throw new Error("Assessment configuration is not on the current grading schema.");
    if (report.includePosition !== true || report.includeAttendance !== true || report.rankMethod !== "total_average") throw new Error("Report-card configuration is not on the current schema.");

    await tx.auditLogSchool.create({
      data: {
        schoolId,
        actorId: (await tx.user.findFirst({ where: { schoolId, userRoles: { some: { role: { name: "Owner" } } } }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id || assignments[0].teacherId,
        action: "eugene_academy.current_system_refreshed",
        entityType: "School",
        entityId: schoolId,
        after: { fixture: true, timetablePublished: true, assignmentCount: assignments.length, slotCount: slots.length, academicRepairs, verification: counts },
      },
    });

    return {
      school: `${school.name} (${school.uniqueCode})`,
      rolesRefreshed: Object.keys(ROLE_BASELINES).length,
      assignments: assignments.length,
      timetableSlots: slots.length,
      weeklyTargets: Object.keys(weeklyPeriods).length,
      academicRepairs,
      verification: counts,
      timetablePublished: true,
      assessmentWeight: assessmentConfig.categories.reduce((sum, item) => sum + item.weight, 0),
    };
  });

  console.log("[eugene-current-system] verified", JSON.stringify(summary));
}

main().catch((error) => {
  console.error("[eugene-current-system] failed:", error instanceof Error ? (error.stack || error.message) : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
