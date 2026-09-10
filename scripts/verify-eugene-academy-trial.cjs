#!/usr/bin/env node
/* Verify that the Eugene Academy staging fixture is deep enough for end-to-end trial journeys. */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();
const secret = String(process.env.EUGENE_ACADEMY_TEST_PASSWORD || "");
if (allow !== "YES") throw new Error("Refusing verification: set ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES.");
if (!testUrl) throw new Error("TEST_DATABASE_URL is required.");
if (productionUrl && productionUrl === testUrl) throw new Error("Refusing verification: TEST_DATABASE_URL must be different from DATABASE_URL.");
process.env.DATABASE_URL = testUrl;

const prisma = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 180000 } });
const SCHOOL_CODE = "eug123";
const OWNER_EMAIL = "eugeneacademy@gmail.com";
const expected = (condition, message) => { if (!condition) throw new Error(message); };

async function main() {
  const school = await prisma.school.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
  expected(school, "Eugene Academy school code eug123 was not created.");
  expected(school.name === "Eugene Academy", `Expected school name Eugene Academy, received ${school.name}.`);
  const schoolId = school.id;

  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
    const scalar = async (table, extra = "") => Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "${table}" WHERE "schoolId"=$1 ${extra}`, schoolId))[0].count);
    const owner = await tx.user.findUnique({ where: { schoolId_email: { schoolId, email: OWNER_EMAIL } }, include: { userRoles: { include: { role: true } } } });
    expected(owner, "Requested Eugene Academy owner account is missing.");
    expected(owner.status === "active", "Eugene Academy owner account must be active.");
    expected(owner.userRoles.some((row) => row.role.name === "Owner"), "Eugene Academy owner account does not have the Owner role.");

    const students = await tx.student.count({ where: { schoolId, status: "active" } });
    const guardians = await tx.guardian.count({ where: { schoolId } });
    const classes = await tx.class.count({ where: { schoolId } });
    const subjects = await tx.subject.count({ where: { schoolId } });
    const staff = Number((await tx.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT u."id")::int AS "count" FROM "User" u
       JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId"
       JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=u."schoolId"
       WHERE u."schoolId"=$1 AND r."name" NOT IN ('Parent','Student')`, schoolId,
    ))[0].count);
    expected(students >= 225, `Expected at least 225 active learners, found ${students}.`);
    expected(guardians >= 90, `Expected at least 90 guardians, found ${guardians}.`);
    expected(classes >= 9, `Expected at least 9 classes, found ${classes}.`);
    expected(subjects >= 8, `Expected at least 8 subjects, found ${subjects}.`);
    expected(staff >= 20, `Expected a multi-role staff roster, found ${staff} staff accounts.`);

    const learnersWithoutGuardian = Number((await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "count" FROM "Student" s WHERE s."schoolId"=$1 AND s."status"='active'
       AND NOT EXISTS (SELECT 1 FROM "StudentGuardian" sg WHERE sg."schoolId"=s."schoolId" AND sg."studentId"=s."id")`, schoolId,
    ))[0].count);
    expected(learnersWithoutGuardian === 0, `${learnersWithoutGuardian} active learners have no guardian link.`);

    const currentYear = await tx.academicYear.findUnique({ where: { schoolId_name: { schoolId, name: "2026/2027" } } });
    expected(currentYear, "Current academic year 2026/2027 is missing.");
    const currentTerms = await tx.term.count({ where: { schoolId, academicYearId: currentYear.id } });
    expected(currentTerms === 3, `Expected 3 terms for 2026/2027, found ${currentTerms}.`);
    const historicalYear = await tx.academicYear.findUnique({ where: { schoolId_name: { schoolId, name: "2025/2026" } } });
    expected(historicalYear, "Historical academic year 2025/2026 is missing.");
    expected(await tx.term.count({ where: { schoolId, academicYearId: historicalYear.id } }) === 3, "Historical year must contain all three terms.");

    const currentTerm = await tx.term.findUnique({ where: { schoolId_academicYearId_name: { schoolId, academicYearId: currentYear.id, name: "Term 1" } } });
    expected(currentTerm, "2026/2027 Term 1 is missing.");
    const enrolments = await scalar("Enrollment", `AND "academicYearId"='${currentYear.id.replaceAll("'", "''")}' AND "termId"='${currentTerm.id.replaceAll("'", "''")}'`);
    expected(enrolments >= 225, `Expected at least 225 current enrolment records, found ${enrolments}.`);
    const enrollmentStates = await tx.$queryRawUnsafe(
      `SELECT "status",COUNT(*)::int AS "count" FROM "Enrollment" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "termId"=$3 GROUP BY "status"`,
      schoolId, currentYear.id, currentTerm.id,
    );
    const stateMap = Object.fromEntries(enrollmentStates.map((row) => [row.status, Number(row.count)]));
    expected((stateMap.confirmed || 0) >= 200, "Current enrolments should include at least 200 confirmed learners.");
    expected((stateMap.ready || 0) >= 10, "Current enrolments should include readiness-stage learners.");
    expected((stateMap.draft || 0) >= 5, "Current enrolments should include draft learners for workflow testing.");

    const classTeacherCoverage = await tx.class.count({ where: { schoolId, classTeacherId: { not: null } } });
    const teachingAssignments = await tx.classSubjectTeacher.count({ where: { schoolId } });
    const timetableSlots = await tx.timetableSlot.count({ where: { schoolId } });
    expected(classTeacherCoverage === classes, `Every class needs a class teacher (${classTeacherCoverage}/${classes}).`);
    expected(teachingAssignments >= classes * subjects, `Expected full class-subject teaching assignment coverage, found ${teachingAssignments}.`);
    expected(timetableSlots >= classes * 5 * 8, `Expected a five-day, eight-period timetable, found ${timetableSlots} slots.`);

    const lessonPlans = await scalar("LessonPlan");
    const lessonReviews = await scalar("LessonPlanReview");
    const academicNotes = await scalar("TeacherAcademicNote");
    const homework = await scalar("Homework");
    const academicWorks = await scalar("TeacherAcademicWork");
    const submissions = await scalar("TeacherAcademicSubmission");
    expected(lessonPlans >= 12, `Expected at least 12 lesson plans, found ${lessonPlans}.`);
    expected(lessonReviews >= 6, `Expected reviewed lesson plans, found ${lessonReviews} review records.`);
    expected(academicNotes >= 16, `Expected at least 16 teacher notes, found ${academicNotes}.`);
    expected(homework >= 12, `Expected at least 12 homework records, found ${homework}.`);
    expected(academicWorks >= 12, `Expected canonical learner activities linked to homework, found ${academicWorks}.`);
    expected(submissions >= 50, `Expected a mix of learner submissions, found ${submissions}.`);

    const assessments = await tx.assessment.count({ where: { schoolId } });
    const scores = await tx.score.count({ where: { schoolId } });
    expected(assessments >= 400, `Assessment history is too sparse (${assessments}).`);
    expected(scores >= 10000, `Score history is too sparse (${scores}).`);

    const admissions = await scalar("AdmissionEnquiry");
    const brokenConversions = Number((await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "count" FROM "AdmissionEnquiry" WHERE "schoolId"=$1 AND (("stage"='converted') <> ("convertedStudentId" IS NOT NULL))`, schoolId,
    ))[0].count);
    expected(admissions >= 18, `Expected an admissions pipeline of at least 18 records, found ${admissions}.`);
    expected(brokenConversions === 0, "Admissions conversion invariant is broken.");

    const invoices = await tx.invoice.count({ where: { schoolId } });
    const payments = await tx.payment.count({ where: { schoolId } });
    const adjustments = await scalar("P3FinanceAdjustment");
    expected(invoices >= 850, `Expected historical plus current invoices, found ${invoices}.`);
    expected(payments >= 60, `Expected current payment history, found ${payments}.`);
    expected(adjustments >= 4, `Expected finance adjustment workflow examples, found ${adjustments}.`);

    const messages = await tx.message.count({ where: { schoolId, channel: "in_app" } });
    const smsRows = await tx.message.count({ where: { schoolId, channel: "sms" } });
    expected(messages >= 25, `Expected in-app communication history, found ${messages}.`);
    expected(smsRows >= 8, `Expected synthetic guardian alert records, found ${smsRows}.`);

    const libraryTitles = await scalar("P3LibraryBook");
    const digitalTitles = Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "fileUrl" LIKE '/library-files/demo/%' AND "readerEnabled"=true`, schoolId))[0].count);
    const libraryCopies = await scalar("P3LibraryCopy");
    const libraryLoans = await scalar("P3LibraryLoan");
    const libraryReservations = await scalar("P3LibraryReservation");
    const readingProgress = await scalar("P3LibraryReadingProgress");
    expected(libraryTitles >= 4 && digitalTitles >= 4, `Expected four protected PDF resources, found ${libraryTitles} titles / ${digitalTitles} digital.`);
    expected(libraryCopies >= 12, `Expected physical accession records, found ${libraryCopies}.`);
    expected(libraryLoans >= 4, `Expected active library loans, found ${libraryLoans}.`);
    expected(libraryReservations >= 4, `Expected library reservations, found ${libraryReservations}.`);
    expected(readingProgress >= 12, `Expected digital reading progress, found ${readingProgress}.`);

    const vehicles = await scalar("P3Vehicle");
    const routes = await scalar("P3BusRoute");
    const stops = await scalar("P3BusStop");
    const routeStops = await scalar("P3RouteStop");
    const vehicleLocations = await scalar("P3VehicleLocation");
    const boardingEvents = await scalar("P3BoardingEvent");
    const compliance = await scalar("P3VehicleComplianceReminder");
    expected(vehicles >= 4, `Expected four vehicles, found ${vehicles}.`);
    expected(routes >= 3 && stops >= 9 && routeStops >= 12, "Transport route/stop coverage is incomplete.");
    expected(vehicleLocations >= 4, "Current vehicle-location fixtures are missing.");
    expected(boardingEvents >= 100, `Expected transport boarding history, found ${boardingEvents}.`);
    expected(compliance >= 4, "Vehicle compliance workflow is empty.");

    const feedingBudgets = await scalar("P3FeedingBudget");
    const feedingMenus = await scalar("P3FeedingMenu");
    const feedingLogs = await scalar("P3FeedingLog");
    expected(feedingBudgets >= 1, "Feeding budget is missing.");
    expected(feedingMenus >= 15 && feedingLogs >= 15, `Expected one week of three-meal feeding records, found ${feedingMenus} menus / ${feedingLogs} logs.`);

    const visitors = await tx.visitorLog.count({ where: { schoolId } });
    const activeVisitors = await tx.visitorLog.count({ where: { schoolId, timeOut: null } });
    expected(visitors >= 6 && activeVisitors >= 1, `Visitor desk coverage is incomplete (${visitors} total / ${activeVisitors} active).`);

    const approvedPickups = await tx.approvedPickup.count({ where: { schoolId } });
    const pickupRequests = await tx.pickupApprovalRequest.count({ where: { schoolId } });
    const pickupEvents = await tx.pickupEvent.count({ where: { schoolId } });
    expected(approvedPickups >= 10 && pickupRequests >= 10 && pickupEvents >= 6, "Pickup authorization workflow is incomplete.");

    const exams = await scalar("P3Exam");
    const examQuestions = await scalar("P3ExamQuestion");
    const examAttempts = await scalar("P3ExamAttempt");
    expected(exams >= 2 && examQuestions >= 6 && examAttempts >= 20, `CBT coverage is incomplete (${exams} exams / ${examQuestions} questions / ${examAttempts} attempts).`);

    const assets = await scalar("P3Asset");
    const recruitment = await scalar("P3RecruitmentPosting");
    const applicants = await scalar("P3Applicant");
    expected(assets >= 6, `Expected at least six assets, found ${assets}.`);
    expected(recruitment >= 2 && applicants >= 6, `Recruitment coverage is incomplete (${recruitment} postings / ${applicants} applicants).`);

    const devices = await tx.device.count({ where: { schoolId } });
    const deviceIdentities = await tx.deviceIdentity.count({ where: { schoolId } });
    const identityCards = await tx.identityCard.count({ where: { schoolId } });
    expected(devices >= 1 && deviceIdentities >= 20, `Device identity fixture is incomplete (${devices} devices / ${deviceIdentities} mappings).`);
    expected(identityCards >= 40, `Expected representative student/staff identity cards, found ${identityCards}.`);

    const payslips = await tx.payslip.count({ where: { schoolId } });
    const payslipsWithPdf = await tx.payslip.count({ where: { schoolId, pdfData: { not: null } } });
    const reportCards = await tx.reportCard.count({ where: { schoolId } });
    const reportPdfs = await tx.reportCard.count({ where: { schoolId, pdfData: { not: null } } });
    expected(payslips >= staff && payslipsWithPdf >= staff, `Every operational staff member should have a PDF payslip (${payslipsWithPdf}/${staff}).`);
    expected(reportCards >= 12 && reportPdfs >= 12, `Expected at least 12 downloadable report-card PDFs, found ${reportPdfs}.`);

    const riskFlags = await scalar("StudentRiskFlag");
    const arcadeRounds = await tx.arcadeRound.count({ where: { schoolId } });
    const staffAttendance = await tx.attendanceEvent.count({ where: { schoolId, staffId: { not: null } } });
    expected(riskFlags >= 10, `Expected leadership risk cases, found ${riskFlags}.`);
    expected(arcadeRounds >= 20, `Expected learner arcade history, found ${arcadeRounds}.`);
    expected(staffAttendance >= staff, `Expected today's staff attendance, found ${staffAttendance} events for ${staff} staff.`);

    const studentRoleAccounts = Number((await tx.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT u."id")::int AS "count" FROM "User" u
       JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId"
       JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=u."schoolId"
       WHERE u."schoolId"=$1 AND r."name"='Student'`, schoolId,
    ))[0].count);
    expected(studentRoleAccounts >= 24, `Expected student-role access accounts, found ${studentRoleAccounts}.`);

    return {
      people: { students, guardians, staff, classes, subjects, learnersWithoutGuardian },
      academics: { currentTerms, enrolments, enrollmentStates: stateMap, teachingAssignments, timetableSlots, assessments, scores, lessonPlans, lessonReviews, academicNotes, homework, academicWorks, submissions },
      admissions: { enquiries: admissions, brokenConversions },
      finance: { invoices, payments, adjustments, payslips, payslipsWithPdf, reportCards, reportPdfs },
      communication: { inAppMessages: messages, smsWorkflowRows: smsRows },
      library: { libraryTitles, digitalTitles, libraryCopies, libraryLoans, libraryReservations, readingProgress },
      transport: { vehicles, routes, stops, routeStops, vehicleLocations, boardingEvents, compliance },
      operations: { feedingBudgets, feedingMenus, feedingLogs, visitors, activeVisitors, approvedPickups, pickupRequests, pickupEvents, exams, examQuestions, examAttempts, assets, recruitment, applicants, devices, deviceIdentities, identityCards, riskFlags, arcadeRounds, staffAttendance },
      access: { ownerEmail: OWNER_EMAIL, studentRoleAccounts, dedicatedStudentPortal: false },
    };
  });

  const artifacts = [
    path.resolve("test-artifacts/eugene-academy-account-matrix.json"),
    path.resolve("test-artifacts/eugene-academy-coverage.json"),
    path.resolve("scripts/.realistic-test-school-output.json"),
  ];
  if (secret) {
    for (const file of artifacts) {
      if (fs.existsSync(file)) expected(!fs.readFileSync(file, "utf8").includes(secret), `A generated fixture artifact contains EUGENE_ACADEMY_TEST_PASSWORD: ${path.basename(file)}`);
    }
  }

  fs.mkdirSync(path.resolve("test-artifacts"), { recursive: true });
  fs.writeFileSync(path.resolve("test-artifacts/eugene-academy-verification.json"), JSON.stringify({
    verifiedAt: new Date().toISOString(),
    school: { name: school.name, code: school.uniqueCode },
    synthetic: true,
    passed: true,
    report,
    knownProductGap: "Student-role accounts exist for access-control testing, but SukuuNova does not yet expose a dedicated /student application universe.",
  }, null, 2));

  console.log(JSON.stringify({ ok: true, school: SCHOOL_CODE, verified: true, report }, null, 2));
}

main().catch((error) => {
  console.error("[verify-eugene-academy] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
