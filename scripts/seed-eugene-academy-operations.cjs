#!/usr/bin/env node
/*
 * Eugene Academy operational depth fixture.
 *
 * Runs only against TEST_DATABASE_URL and never invokes external providers.
 * It extends the core Eugene Academy fixture with transport, visitors, pickup,
 * library circulation, CBT, feeding budget, assets, recruitment and finance
 * exception records so the corresponding SukuuNova workspaces are non-empty.
 */
const { PrismaClient } = require("@prisma/client");

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();
if (allow !== "YES") throw new Error("Refusing operations fixture: set ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES.");
if (!testUrl) throw new Error("TEST_DATABASE_URL is required.");
if (productionUrl && productionUrl === testUrl) throw new Error("Refusing operations fixture: TEST_DATABASE_URL must be different from DATABASE_URL.");
process.env.DATABASE_URL = testUrl;

const prisma = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 300000 } });
const SCHOOL_CODE = "eug123";
const OWNER_EMAIL = "eugeneacademy@gmail.com";
const dt = (value) => new Date(value.endsWith("Z") ? value : `${value}T00:00:00.000Z`);
const ident = (prefix, value) => `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`.slice(0, 95);

async function main() {
  const school = await prisma.school.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
  if (!school) throw new Error("Eugene Academy must be seeded before operational depth is added.");
  const schoolId = school.id;

  const summary = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
    const owner = await tx.user.findUnique({ where: { schoolId_email: { schoolId, email: OWNER_EMAIL } } });
    if (!owner) throw new Error("Eugene Academy owner account is missing.");
    const students = await tx.student.findMany({ where: { schoolId, status: "active" }, orderBy: { admissionNo: "asc" }, take: 300 });
    const guardians = await tx.guardian.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 150 });
    const staff = await tx.$queryRawUnsafe(
      `SELECT DISTINCT u."id",u."name",u."email" FROM "User" u
       JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId"
       JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=u."schoolId"
       WHERE u."schoolId"=$1 AND r."name" NOT IN ('Parent','Student') ORDER BY u."name"`,
      schoolId,
    );
    if (students.length < 20 || !guardians.length || !staff.length) throw new Error("Eugene Academy people fixture is incomplete.");

    const transportUser = await tx.user.findFirst({
      where: { schoolId, userRoles: { some: { role: { name: "Transport Officer" } } } },
      orderBy: { createdAt: "asc" },
    }) || owner;
    const frontDeskUser = await tx.user.findFirst({
      where: { schoolId, userRoles: { some: { role: { name: "Front Desk/Gate Security" } } } },
      orderBy: { createdAt: "asc" },
    }) || owner;
    const accountant = await tx.user.findFirst({
      where: { schoolId, userRoles: { some: { role: { name: "Accountant" } } } },
      orderBy: { createdAt: "asc" },
    }) || owner;
    const hrUser = await tx.user.findFirst({
      where: { schoolId, userRoles: { some: { role: { name: "HR Officer" } } } },
      orderBy: { createdAt: "asc" },
    }) || owner;
    const teacherUsers = await tx.user.findMany({
      where: { schoolId, userRoles: { some: { role: { name: { in: ["Class Teacher", "Subject Teacher"] } } } } },
      orderBy: { name: "asc" },
      take: 20,
    });

    // Transport network: vehicles, routes, stops, live locations and compliance.
    const vehicleDefs = [
      ["EUG-BUS-01", "Eugene Bus 1", 45, "Kwame Agyapong", "+233267100101"],
      ["EUG-BUS-02", "Eugene Bus 2", 45, "Daniel Ofori", "+233267100102"],
      ["EUG-BUS-03", "Eugene Mini Bus", 30, "Michael Asiedu", "+233267100103"],
      ["EUG-VAN-01", "Eugene School Van", 18, "Samuel Nyame", "+233267100104"],
    ];
    const vehicles = [];
    for (let index = 0; index < vehicleDefs.length; index += 1) {
      const [registrationNumber, name, capacity, driverName, driverPhone] = vehicleDefs[index];
      const vehicleId = ident("eug-vehicle", index + 1);
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3Vehicle" ("id","schoolId","registrationNumber","name","capacity","status","driverName","driverPhone","lastComplianceAt","createdAt")
         VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,NOW())
         ON CONFLICT ("schoolId","registrationNumber") DO UPDATE SET "name"=EXCLUDED."name","capacity"=EXCLUDED."capacity","status"='active',"driverName"=EXCLUDED."driverName","driverPhone"=EXCLUDED."driverPhone","lastComplianceAt"=EXCLUDED."lastComplianceAt"`,
        vehicleId, schoolId, registrationNumber, name, capacity, driverName, driverPhone, dt("2026-08-28"),
      );
      const row = await tx.$queryRawUnsafe(`SELECT "id" FROM "P3Vehicle" WHERE "schoolId"=$1 AND "registrationNumber"=$2 LIMIT 1`, schoolId, registrationNumber);
      vehicles.push({ id: row[0].id, registrationNumber });
    }

    const routeDefs = [
      ["EUG-NORTH", "North Corridor", "North Estate", "Eugene Academy"],
      ["EUG-CENTRAL", "Central Corridor", "Central Market", "Eugene Academy"],
      ["EUG-EAST", "East Corridor", "East Ridge", "Eugene Academy"],
    ];
    const routes = [];
    for (let index = 0; index < routeDefs.length; index += 1) {
      const [code, name, origin, destination] = routeDefs[index];
      const routeId = ident("eug-route", index + 1);
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3BusRoute" ("id","schoolId","name","code","origin","destination","status","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,'active',NOW())
         ON CONFLICT ("schoolId","code") DO UPDATE SET "name"=EXCLUDED."name","origin"=EXCLUDED."origin","destination"=EXCLUDED."destination","status"='active'`,
        routeId, schoolId, name, code, origin, destination,
      );
      const row = await tx.$queryRawUnsafe(`SELECT "id" FROM "P3BusRoute" WHERE "schoolId"=$1 AND "code"=$2 LIMIT 1`, schoolId, code);
      routes.push({ id: row[0].id, code });
    }

    const stopDefs = [
      ["North Estate Stop", 6.7162, -1.6241], ["Garden Junction", 6.7086, -1.6184], ["Community Clinic", 6.7013, -1.6127],
      ["Central Market Stop", 6.6977, -1.6249], ["Station Road", 6.6951, -1.6174], ["Civic Centre", 6.6928, -1.6108],
      ["East Ridge Stop", 6.7045, -1.5964], ["Library Junction", 6.6998, -1.6031], ["Eugene Academy Main Gate", 6.6942, -1.6072],
    ];
    const stops = [];
    for (let index = 0; index < stopDefs.length; index += 1) {
      const [name, latitude, longitude] = stopDefs[index];
      const stopId = ident("eug-stop", index + 1);
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3BusStop" ("id","schoolId","name","latitude","longitude","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name","latitude"=EXCLUDED."latitude","longitude"=EXCLUDED."longitude"`,
        stopId, schoolId, name, latitude, longitude,
      );
      stops.push({ id: stopId, name, latitude, longitude });
    }
    const routeStopGroups = [[0,1,2,8],[3,4,5,8],[6,7,5,8]];
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
      const indexes = routeStopGroups[routeIndex];
      for (let sequence = 0; sequence < indexes.length; sequence += 1) {
        const stop = stops[indexes[sequence]];
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3RouteStop" ("id","schoolId","routeId","stopId","sequence","etaMinutes") VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT ("id") DO UPDATE SET "routeId"=EXCLUDED."routeId","stopId"=EXCLUDED."stopId","sequence"=EXCLUDED."sequence","etaMinutes"=EXCLUDED."etaMinutes"`,
          ident("eug-route-stop", `${routeIndex + 1}-${sequence + 1}`), schoolId, routes[routeIndex].id, stop.id, sequence + 1, sequence * 12,
        );
      }
    }
    for (let index = 0; index < vehicles.length; index += 1) {
      const route = routes[index % routes.length];
      const stop = stops[(index * 2 + 1) % stops.length];
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3VehicleLocation" ("id","schoolId","vehicleId","routeId","latitude","longitude","speedKph","heading","reportedAt","source")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'gps')
         ON CONFLICT ("id") DO UPDATE SET "routeId"=EXCLUDED."routeId","latitude"=EXCLUDED."latitude","longitude"=EXCLUDED."longitude","speedKph"=EXCLUDED."speedKph","heading"=EXCLUDED."heading","reportedAt"=EXCLUDED."reportedAt"`,
        ident("eug-location", index + 1), schoolId, vehicles[index].id, route.id, stop.latitude, stop.longitude, 22 + index * 3, 115 + index * 10, dt("2026-09-10T07:42:00.000Z"),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3VehicleComplianceReminder" ("id","schoolId","vehicleId","kind","dueAt","status","notes","completedAt","createdBy","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT ("id") DO UPDATE SET "dueAt"=EXCLUDED."dueAt","status"=EXCLUDED."status","notes"=EXCLUDED."notes","completedAt"=EXCLUDED."completedAt"`,
        ident("eug-compliance", index + 1), schoolId, vehicles[index].id, index % 2 ? "insurance" : "roadworthiness", dt(index < 2 ? "2026-10-15" : "2026-11-01"), index === 0 ? "completed" : "pending", index === 0 ? "August inspection verified." : "Synthetic upcoming compliance check.", index === 0 ? dt("2026-09-05") : null, transportUser.id,
      );
    }
    for (let index = 0; index < Math.min(6, guardians.length); index += 1) {
      const stop = stops[index % (stops.length - 1)];
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3ParentLocation" ("id","schoolId","guardianId","routeId","latitude","longitude","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT ("schoolId","guardianId") DO UPDATE SET "routeId"=EXCLUDED."routeId","latitude"=EXCLUDED."latitude","longitude"=EXCLUDED."longitude","updatedAt"=EXCLUDED."updatedAt"`,
        ident("eug-parent-location", index + 1), schoolId, guardians[index].id, routes[index % routes.length].id, stop.latitude + 0.0008, stop.longitude - 0.0005, dt("2026-09-10T07:40:00.000Z"),
      );
    }
    for (let index = 0; index < Math.min(60, students.length); index += 1) {
      const vehicle = vehicles[index % vehicles.length];
      const route = routes[index % routes.length];
      const stop = stops[routeStopGroups[index % routes.length][index % 3]];
      for (const type of ["boarded", "alighted"]) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3BoardingEvent" ("id","schoolId","vehicleId","routeId","studentId","type","stopId","eventAt","alertQueued","createdBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
           ON CONFLICT ("id") DO UPDATE SET "vehicleId"=EXCLUDED."vehicleId","routeId"=EXCLUDED."routeId","stopId"=EXCLUDED."stopId","eventAt"=EXCLUDED."eventAt","alertQueued"=true`,
          ident("eug-boarding", `${index + 1}-${type}`), schoolId, vehicle.id, route.id, students[index].id, type, stop.id,
          dt(type === "boarded" ? "2026-09-10T06:55:00.000Z" : "2026-09-10T15:38:00.000Z"), transportUser.id,
        );
      }
    }

    // Feeding budget sits above the menus/logs already created by the primary fixture.
    await tx.$executeRawUnsafe(
      `INSERT INTO "P3FeedingBudget" ("id","schoolId","name","periodStart","periodEnd","plannedAmount","status","createdBy","createdAt")
       VALUES ($1,$2,'Term 1 Feeding Programme',$3,$4,42000,'active',$5,NOW())
       ON CONFLICT ("id") DO UPDATE SET "periodStart"=EXCLUDED."periodStart","periodEnd"=EXCLUDED."periodEnd","plannedAmount"=EXCLUDED."plannedAmount","status"='active'`,
      "eug-feeding-budget-term1", schoolId, dt("2026-09-07"), dt("2026-12-18"), accountant.id,
    );

    // Visitor desk: completed visits plus one person currently on site.
    const visitorDefs = [
      ["PTA Representative", "PTA planning meeting", "2026-09-10T08:10:00.000Z", "2026-09-10T09:05:00.000Z"],
      ["Book Supplier", "Library catalogue delivery", "2026-09-10T09:20:00.000Z", "2026-09-10T10:15:00.000Z"],
      ["Prospective Parent", "Admissions enquiry", "2026-09-10T10:05:00.000Z", "2026-09-10T10:42:00.000Z"],
      ["Maintenance Technician", "ICT laboratory maintenance", "2026-09-10T10:35:00.000Z", "2026-09-10T12:00:00.000Z"],
      ["Catering Supplier", "Feeding stock delivery", "2026-09-10T11:15:00.000Z", "2026-09-10T11:45:00.000Z"],
      ["Education Partner", "Leadership meeting", "2026-09-10T12:10:00.000Z", null],
    ];
    for (let index = 0; index < visitorDefs.length; index += 1) {
      const [name, purpose, timeIn, timeOut] = visitorDefs[index];
      await tx.visitorLog.upsert({
        where: { id: ident("eug-visitor", index + 1) },
        update: { schoolId, name, phone: `+23326720010${index}`, purpose, hostStaffId: staff[index % staff.length].id, timeIn: dt(timeIn), timeOut: timeOut ? dt(timeOut) : null },
        create: { id: ident("eug-visitor", index + 1), schoolId, name, phone: `+23326720010${index}`, purpose, hostStaffId: staff[index % staff.length].id, timeIn: dt(timeIn), timeOut: timeOut ? dt(timeOut) : null },
      });
    }

    // Pickup authorization, approval-request and completed pickup examples.
    const guardianLinks = await tx.studentGuardian.findMany({
      where: { schoolId, isPrimary: true },
      orderBy: { studentId: "asc" },
      take: 12,
      select: { studentId: true, guardianId: true },
    });
    for (let index = 0; index < guardianLinks.length; index += 1) {
      const link = guardianLinks[index];
      await tx.approvedPickup.upsert({
        where: { schoolId_studentId_guardianId: { schoolId, studentId: link.studentId, guardianId: link.guardianId } },
        update: {},
        create: { schoolId, studentId: link.studentId, guardianId: link.guardianId },
      });
      const requestId = ident("eug-pickup-request", index + 1);
      await tx.pickupApprovalRequest.upsert({
        where: { id: requestId },
        update: { status: index < 8 ? "approved" : "pending", approvedByUserId: index < 8 ? frontDeskUser.id : null, reviewedAt: index < 8 ? dt("2026-09-10T14:25:00.000Z") : null },
        create: { id: requestId, schoolId, studentId: link.studentId, collectedByGuardianId: link.guardianId, requestedByUserId: frontDeskUser.id, status: index < 8 ? "approved" : "pending", approvedByUserId: index < 8 ? frontDeskUser.id : null, reviewedAt: index < 8 ? dt("2026-09-10T14:25:00.000Z") : null },
      });
      if (index < 8) {
        const pickupEventId = ident("eug-pickup-event", index + 1);
        await tx.pickupEvent.upsert({
          where: { id: pickupEventId },
          update: { wasPreApproved: true, approvedByUserId: frontDeskUser.id, timestamp: dt("2026-09-10T15:10:00.000Z") },
          create: { id: pickupEventId, schoolId, studentId: link.studentId, collectedByGuardianId: link.guardianId, wasPreApproved: true, approvedByUserId: frontDeskUser.id, timestamp: dt("2026-09-10T15:10:00.000Z") },
        });
      }
    }

    // Substitute assignments exercise timetable exception handling.
    const timetableSlots = await tx.timetableSlot.findMany({ where: { schoolId }, orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }], take: 12 });
    if (teacherUsers.length > 1) {
      for (let index = 0; index < Math.min(4, timetableSlots.length); index += 1) {
        const slot = timetableSlots[index];
        const substitute = teacherUsers.find((teacher) => teacher.id !== slot.teacherId) || teacherUsers[0];
        await tx.substituteAssignment.upsert({
          where: { schoolId_timetableSlotId_assignmentDate: { schoolId, timetableSlotId: slot.id, assignmentDate: dt("2026-09-10") } },
          update: { substituteTeacherId: substitute.id, assignedBy: owner.id },
          create: { schoolId, timetableSlotId: slot.id, substituteTeacherId: substitute.id, assignedBy: owner.id, assignmentDate: dt("2026-09-10") },
        });
      }
    }

    // Physical library circulation and reservations complement digital reading progress.
    const libraryBooks = await tx.$queryRawUnsafe(
      `SELECT "id","title" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "isbn" LIKE 'EUG-PDF-%' ORDER BY "isbn" LIMIT 4`,
      schoolId,
    );
    for (let index = 0; index < libraryBooks.length; index += 1) {
      const book = libraryBooks[index];
      const copies = await tx.$queryRawUnsafe(
        `SELECT "id" FROM "P3LibraryCopy" WHERE "schoolId"=$1 AND "bookId"=$2 ORDER BY "accessionNo" LIMIT 3`, schoolId, book.id,
      );
      const copy = copies[0];
      if (copy) {
        const loanId = ident("eug-library-loan", index + 1);
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3LibraryLoan" ("id","schoolId","bookId","copyId","studentId","borrowedAt","dueAt","returnedAt","status","issuedBy","returnedBy","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,'borrowed',$8,NULL,NOW())
           ON CONFLICT ("id") DO UPDATE SET "copyId"=EXCLUDED."copyId","studentId"=EXCLUDED."studentId","dueAt"=EXCLUDED."dueAt","returnedAt"=NULL,"status"='borrowed'`,
          loanId, schoolId, book.id, copy.id, students[index].id, dt("2026-09-09"), dt("2026-09-23"), owner.id,
        );
        await tx.$executeRawUnsafe(`UPDATE "P3LibraryCopy" SET "status"='on_loan',"updatedAt"=NOW() WHERE "schoolId"=$1 AND "id"=$2`, schoolId, copy.id);
        await tx.$executeRawUnsafe(`UPDATE "P3LibraryBook" SET "availableCopies"=GREATEST(0,"copies"-1),"updatedAt"=NOW() WHERE "schoolId"=$1 AND "id"=$2`, schoolId, book.id);
      }
      const reservationStudent = students[index + 12];
      if (reservationStudent) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3LibraryReservation" ("id","schoolId","bookId","studentId","status","requestedAt","readyAt","expiresAt","fulfilledAt","cancelledAt","createdBy")
           VALUES ($1,$2,$3,$4,'waiting',$5,NULL,NULL,NULL,NULL,$6)
           ON CONFLICT ("id") DO UPDATE SET "status"='waiting',"cancelledAt"=NULL,"fulfilledAt"=NULL`,
          ident("eug-library-reservation", index + 1), schoolId, book.id, reservationStudent.id, dt("2026-09-10T11:00:00.000Z"), owner.id,
        );
      }
    }

    // CBT: published examinations, objective questions and completed attempts.
    const examDefs = [
      ["Eugene Mathematics Baseline CBT", "Early-term numeracy baseline", 1800],
      ["Eugene ICT Safety Check", "ICT laboratory safety and digital conduct", 1200],
    ];
    for (let examIndex = 0; examIndex < examDefs.length; examIndex += 1) {
      const [title, description, durationSeconds] = examDefs[examIndex];
      const examId = ident("eug-exam", examIndex + 1);
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3Exam" ("id","schoolId","title","description","durationSeconds","opensAt","closesAt","status","createdBy","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'published',$8,NOW())
         ON CONFLICT ("schoolId","title") DO UPDATE SET "description"=EXCLUDED."description","durationSeconds"=EXCLUDED."durationSeconds","opensAt"=EXCLUDED."opensAt","closesAt"=EXCLUDED."closesAt","status"='published'`,
        examId, schoolId, title, description, durationSeconds, dt("2026-09-09T08:00:00.000Z"), dt("2026-09-18T17:00:00.000Z"), owner.id,
      );
      const examRow = await tx.$queryRawUnsafe(`SELECT "id" FROM "P3Exam" WHERE "schoolId"=$1 AND "title"=$2 LIMIT 1`, schoolId, title);
      const actualExamId = examRow[0].id;
      const prompts = examIndex === 0
        ? [
            ["What is 15% of 200?", ["15", "30", "45", "60"], 1],
            ["Solve 3x = 18.", ["3", "6", "9", "12"], 1],
            ["A rectangle is 8 cm by 5 cm. What is its area?", ["13 cm²", "26 cm²", "40 cm²", "80 cm²"], 2],
          ]
        : [
            ["What should a learner do after noticing an exposed power cable?", ["Repair it", "Ignore it", "Tell the teacher and keep away", "Cover it with paper"], 2],
            ["Which password practice is safest?", ["Share with a friend", "Use your own private password", "Write it on the monitor", "Use the class name"], 1],
            ["Unknown USB storage should be used only when…", ["It looks new", "A teacher approves the process", "It has many files", "Nobody is watching"], 1],
          ];
      for (let questionIndex = 0; questionIndex < prompts.length; questionIndex += 1) {
        const [prompt, options, correctOptionIndex] = prompts[questionIndex];
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3ExamQuestion" ("id","schoolId","examId","prompt","options","correctOptionIndex","points","orderIndex")
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,1,$7)
           ON CONFLICT ("id") DO UPDATE SET "prompt"=EXCLUDED."prompt","options"=EXCLUDED."options","correctOptionIndex"=EXCLUDED."correctOptionIndex","orderIndex"=EXCLUDED."orderIndex"`,
          ident("eug-exam-question", `${examIndex + 1}-${questionIndex + 1}`), schoolId, actualExamId, prompt, JSON.stringify(options), correctOptionIndex, questionIndex + 1,
        );
      }
      for (let studentIndex = 0; studentIndex < Math.min(10, students.length); studentIndex += 1) {
        const status = studentIndex < 8 ? "submitted" : "in_progress";
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3ExamAttempt" ("id","schoolId","examId","studentId","startedAt","expiresAt","submittedAt","status","score","answers")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           ON CONFLICT ("schoolId","examId","studentId") DO UPDATE SET "startedAt"=EXCLUDED."startedAt","expiresAt"=EXCLUDED."expiresAt","submittedAt"=EXCLUDED."submittedAt","status"=EXCLUDED."status","score"=EXCLUDED."score","answers"=EXCLUDED."answers"`,
          ident("eug-exam-attempt", `${examIndex + 1}-${studentIndex + 1}`), schoolId, actualExamId, students[studentIndex].id,
          dt("2026-09-10T09:00:00.000Z"), dt("2026-09-10T09:35:00.000Z"), status === "submitted" ? dt("2026-09-10T09:18:00.000Z") : null,
          status, status === "submitted" ? 2 + (studentIndex % 2) : 0, JSON.stringify({ 1: 1, 2: 1, 3: studentIndex % 2 ? 1 : 2 }),
        );
      }
    }

    // Assets and recruitment make administration/HR operations realistic.
    const assetDefs = [
      ["EUG-ICT-001", "ICT Lab Desktop 01", "ICT", "ICT Lab 1", 6200],
      ["EUG-ICT-002", "ICT Lab Desktop 02", "ICT", "ICT Lab 1", 6200],
      ["EUG-PROJ-001", "Classroom Projector", "Teaching equipment", "JHS Block", 4800],
      ["EUG-PRN-001", "Administration Printer", "Office equipment", "Administration", 3200],
      ["EUG-GEN-001", "Standby Generator", "Infrastructure", "Utility Area", 28500],
      ["EUG-TAB-001", "Learning Tablet Set", "Digital learning", "Resource Room", 12000],
    ];
    for (let index = 0; index < assetDefs.length; index += 1) {
      const [assetTag, name, category, location, purchaseCost] = assetDefs[index];
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3Asset" ("id","schoolId","assetTag","name","category","serialNumber","location","condition","status","purchaseDate","purchaseCost","assignedToUserId","notes","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11,$12,NOW(),NOW())
         ON CONFLICT ("schoolId","assetTag") DO UPDATE SET "name"=EXCLUDED."name","category"=EXCLUDED."category","location"=EXCLUDED."location","condition"=EXCLUDED."condition","status"='active',"purchaseCost"=EXCLUDED."purchaseCost","assignedToUserId"=EXCLUDED."assignedToUserId","notes"=EXCLUDED."notes","updatedAt"=NOW()`,
        ident("eug-asset", index + 1), schoolId, assetTag, name, category, `EUG-SN-${String(index + 1).padStart(5, "0")}`, location,
        index === 4 ? "fair" : "good", dt("2026-08-15"), purchaseCost, index < 4 ? staff[index % staff.length].id : null, "Synthetic Eugene Academy asset record.",
      );
    }

    const postingDefs = [
      ["Assistant Mathematics Teacher", "Academics", "Full time", "Support JHS Mathematics teaching, marking and intervention groups."],
      ["School Nurse", "Student Wellbeing", "Full time", "Coordinate first aid, health records and family follow-up."],
    ];
    for (let postingIndex = 0; postingIndex < postingDefs.length; postingIndex += 1) {
      const [title, department, employmentType, description] = postingDefs[postingIndex];
      const postingId = ident("eug-posting", postingIndex + 1);
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3RecruitmentPosting" ("id","schoolId","title","department","employmentType","description","status","closingDate","createdBy","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,NOW())
         ON CONFLICT ("schoolId","title") DO UPDATE SET "department"=EXCLUDED."department","employmentType"=EXCLUDED."employmentType","description"=EXCLUDED."description","status"='open',"closingDate"=EXCLUDED."closingDate"`,
        postingId, schoolId, title, department, employmentType, description, dt("2026-10-02"), hrUser.id,
      );
      const postingRow = await tx.$queryRawUnsafe(`SELECT "id" FROM "P3RecruitmentPosting" WHERE "schoolId"=$1 AND "title"=$2 LIMIT 1`, schoolId, title);
      for (let applicantIndex = 0; applicantIndex < 3; applicantIndex += 1) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3Applicant" ("id","schoolId","postingId","name","email","phone","resumeUrl","status","notes","staffUserId","convertedAt","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,NULL,NULL,NOW())
           ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name","email"=EXCLUDED."email","phone"=EXCLUDED."phone","status"=EXCLUDED."status","notes"=EXCLUDED."notes"`,
          ident("eug-applicant", `${postingIndex + 1}-${applicantIndex + 1}`), schoolId, postingRow[0].id,
          `Synthetic Applicant ${postingIndex + 1}-${applicantIndex + 1}`, `applicant${postingIndex + 1}${applicantIndex + 1}@example.test`, `+233267300${postingIndex}${applicantIndex}0`,
          applicantIndex === 0 ? "shortlisted" : applicantIndex === 1 ? "interview" : "applied", "Synthetic recruitment case for workflow testing.",
        );
      }
    }

    // Finance exceptions/discount requests and feeding-linked optional items.
    const currentYear = await tx.academicYear.findUnique({ where: { schoolId_name: { schoolId, name: "2026/2027" } } });
    const currentTerm = currentYear ? await tx.term.findUnique({ where: { schoolId_academicYearId_name: { schoolId, academicYearId: currentYear.id, name: "Term 1" } } }) : null;
    if (currentTerm) {
      const invoices = await tx.invoice.findMany({ where: { schoolId, termId: currentTerm.id }, orderBy: { createdAt: "asc" }, take: 8 });
      for (let index = 0; index < Math.min(4, invoices.length); index += 1) {
        const invoice = invoices[index];
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3FinanceAdjustment" ("id","schoolId","studentId","invoiceId","kind","mode","value","siblingGroupKey","reason","status","requestedBy","approvedBy","approvedAt","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT ("id") DO UPDATE SET "kind"=EXCLUDED."kind","mode"=EXCLUDED."mode","value"=EXCLUDED."value","reason"=EXCLUDED."reason","status"=EXCLUDED."status","approvedBy"=EXCLUDED."approvedBy","approvedAt"=EXCLUDED."approvedAt"`,
          ident("eug-fin-adjust", index + 1), schoolId, invoice.studentId, invoice.id, index % 2 ? "scholarship" : "discount", index % 2 ? "fixed" : "percent", index % 2 ? 250 : 10,
          index === 2 ? "EUG-SIBLING-A" : null, index % 2 ? "Synthetic scholarship support case." : "Synthetic family discount request.", index < 2 ? "approved" : "pending",
          accountant.id, index < 2 ? owner.id : null, index < 2 ? dt("2026-09-10T12:30:00.000Z") : null,
        );
        if (index < 2) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "P3FeedingInvoiceItem" ("id","schoolId","invoiceId","description","amount","status","approvedBy","approvedAt","createdBy","createdAt")
             VALUES ($1,$2,$3,$4,$5,'approved',$6,$7,$8,NOW())
             ON CONFLICT ("id") DO UPDATE SET "description"=EXCLUDED."description","amount"=EXCLUDED."amount","status"='approved',"approvedBy"=EXCLUDED."approvedBy","approvedAt"=EXCLUDED."approvedAt"`,
            ident("eug-feeding-invoice", index + 1), schoolId, invoice.id, "Special feeding programme add-on", 75, owner.id, dt("2026-09-10T12:35:00.000Z"), accountant.id,
          );
        }
      }
    }

    // Offline queue includes completed and pending records without contacting a device.
    for (let index = 0; index < 4; index += 1) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3OfflineSyncQueue" ("id","schoolId","clientGeneratedId","entityType","payload","status","entityId","error","createdAt","processedAt")
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,NULL,NOW(),$8)
         ON CONFLICT ("schoolId","clientGeneratedId") DO UPDATE SET "payload"=EXCLUDED."payload","status"=EXCLUDED."status","entityId"=EXCLUDED."entityId","error"=NULL,"processedAt"=EXCLUDED."processedAt"`,
        ident("eug-offline", index + 1), schoolId, `EUG-OFFLINE-${index + 1}`, index % 2 ? "attendance" : "visitor",
        JSON.stringify({ fixture: true, source: "synthetic-offline-client", sequence: index + 1 }), index < 3 ? "processed" : "pending", index < 3 ? `synthetic-entity-${index + 1}` : null,
        index < 3 ? dt("2026-09-10T13:00:00.000Z") : null,
      );
    }

    await tx.auditLogSchool.create({
      data: {
        schoolId,
        actorId: owner.id,
        action: "eugene_academy.operations_fixture_completed",
        entityType: "School",
        entityId: schoolId,
        after: { synthetic: true, vehicles: vehicles.length, routes: routes.length, stops: stops.length, visitors: visitorDefs.length, assets: assetDefs.length, recruitmentPostings: postingDefs.length },
      },
    });

    const scalar = async (table) => Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "${table}" WHERE "schoolId"=$1`, schoolId))[0].count);
    return {
      vehicles: await scalar("P3Vehicle"),
      routes: await scalar("P3BusRoute"),
      stops: await scalar("P3BusStop"),
      boardingEvents: await scalar("P3BoardingEvent"),
      feedingBudgets: await scalar("P3FeedingBudget"),
      libraryLoans: await scalar("P3LibraryLoan"),
      libraryReservations: await scalar("P3LibraryReservation"),
      cbtExams: await scalar("P3Exam"),
      cbtAttempts: await scalar("P3ExamAttempt"),
      assets: await scalar("P3Asset"),
      recruitmentPostings: await scalar("P3RecruitmentPosting"),
      applicants: await scalar("P3Applicant"),
      financeAdjustments: await scalar("P3FinanceAdjustment"),
      offlineQueue: await scalar("P3OfflineSyncQueue"),
      visitors: await tx.visitorLog.count({ where: { schoolId } }),
      approvedPickups: await tx.approvedPickup.count({ where: { schoolId } }),
      pickupRequests: await tx.pickupApprovalRequest.count({ where: { schoolId } }),
      pickupEvents: await tx.pickupEvent.count({ where: { schoolId } }),
      substituteAssignments: await tx.substituteAssignment.count({ where: { schoolId } }),
    };
  }, { maxWait: 15000, timeout: 300000 });

  console.log(JSON.stringify({ ok: true, school: SCHOOL_CODE, operations: summary }, null, 2));
}

main().catch((error) => {
  console.error("[eugene-academy-operations] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
