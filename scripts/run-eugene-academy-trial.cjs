#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();
const password = String(process.env.EUGENE_ACADEMY_TEST_PASSWORD || "");
if (allow !== "YES") throw new Error("Refusing Eugene Academy trial fixture: set ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES.");
if (!testUrl) throw new Error("TEST_DATABASE_URL is required.");
if (productionUrl && productionUrl === testUrl) throw new Error("Refusing Eugene Academy trial fixture: TEST_DATABASE_URL must be different from DATABASE_URL.");
if (password.length < 12) throw new Error("EUGENE_ACADEMY_TEST_PASSWORD must be at least 12 characters.");

const studentCount = Number(process.env.TEST_STUDENT_COUNT || 225);
if (!Number.isInteger(studentCount) || studentCount < 225 || studentCount > 500) {
  throw new Error("TEST_STUDENT_COUNT must be an integer between 225 and 500 for the Eugene Academy full-system trial.");
}

const env = { ...process.env, TEST_STUDENT_COUNT: String(studentCount) };
const baseFixturePath = path.join(__dirname, "seed-realistic-test-school.cjs");
const coreFixturePath = path.join(__dirname, "seed-eugene-academy-trial.cjs");
const operationsFixturePath = path.join(__dirname, "seed-eugene-academy-operations.cjs");
const verifierFixturePath = path.join(__dirname, "verify-eugene-academy-trial.cjs");
const originals = new Map([
  [baseFixturePath, fs.readFileSync(baseFixturePath, "utf8")],
  [coreFixturePath, fs.readFileSync(coreFixturePath, "utf8")],
  [operationsFixturePath, fs.readFileSync(operationsFixturePath, "utf8")],
  [verifierFixturePath, fs.readFileSync(verifierFixturePath, "utf8")],
]);
const patchedPaths = new Set();

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Fixture compatibility guard failed: ${label} changed.`);
  return source.replace(needle, replacement);
}

function replaceAllRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Fixture compatibility guard failed: ${label} changed.`);
  return source.replaceAll(needle, replacement);
}

function patchFixtures() {
  let base = originals.get(baseFixturePath);
  base = replaceRequired(base, "'in','device'", "'in','fingerprint'", "legacy attendance method");

  const baseFeeNeedle = `        items.push(await tx.feeItem.upsert({
          where: { schoolId_termId_classId_name: { schoolId, termId: term.id, classId: null, name } },
          update: { amount: new Prisma.Decimal(amount) },
          create: { schoolId, name, amount: new Prisma.Decimal(amount), termId: term.id, classId: null }
        }));`;
  const baseFeeReplacement = `        const existingFeeItem = await tx.feeItem.findFirst({ where: { schoolId, termId: term.id, classId: null, name } });
        const feeItem = existingFeeItem
          ? await tx.feeItem.update({ where: { id: existingFeeItem.id }, data: { amount: new Prisma.Decimal(amount) } })
          : await tx.feeItem.create({ data: { schoolId, name, amount: new Prisma.Decimal(amount), termId: term.id, classId: null } });
        items.push(feeItem);`;
  base = replaceRequired(base, baseFeeNeedle, baseFeeReplacement, "base nullable fee-item write");
  base = replaceAllRequired(base, '"mobile_money"', '"momo"', "base payment method");
  base = replaceAllRequired(base, '"part_paid"', '"partial"', "base invoice status");
  fs.writeFileSync(baseFixturePath, base, "utf8");
  patchedPaths.add(baseFixturePath);

  let core = originals.get(coreFixturePath);
  const coreFeeNeedle = `      for (const [name,amount] of feeDefs) feeItems.push(await tx.feeItem.upsert({
        where:{schoolId_termId_classId_name:{schoolId,termId:currentTerm.id,classId:null,name}},
        update:{amount:new Prisma.Decimal(amount)},
        create:{schoolId,termId:currentTerm.id,classId:null,name,amount:new Prisma.Decimal(amount)},
      }));`;
  const coreFeeReplacement = `      for (const [name,amount] of feeDefs) {
        const existingFeeItem=await tx.feeItem.findFirst({where:{schoolId,termId:currentTerm.id,classId:null,name}});
        const feeItem=existingFeeItem
          ? await tx.feeItem.update({where:{id:existingFeeItem.id},data:{amount:new Prisma.Decimal(amount)}})
          : await tx.feeItem.create({data:{schoolId,termId:currentTerm.id,classId:null,name,amount:new Prisma.Decimal(amount)}});
        feeItems.push(feeItem);
      }`;
  core = replaceRequired(core, coreFeeNeedle, coreFeeReplacement, "current-term nullable fee-item write");
  core = replaceAllRequired(core, '"mobile_money"', '"momo"', "current-term mobile payment method");
  core = replaceAllRequired(core, '"bank_transfer"', '"card"', "current-term alternate payment method");
  core = replaceAllRequired(core, '"part_paid"', '"partial"', "current-term invoice status");

  core = replaceRequired(core, '["New Family Orientation","orientation"', '["New Family Orientation","parent"', "orientation calendar category");
  core = replaceRequired(core, '["Founders Day Celebration","event"', '["Founders Day Celebration","other"', "Founders Day calendar category");
  core = replaceRequired(core, '["First Continuous Assessment","exam"', '["First Continuous Assessment","exam_week"', "continuous-assessment calendar category");
  core = replaceRequired(core, '["Mid-term Break","break"', '["Mid-term Break","vacation"', "mid-term calendar category");
  core = replaceRequired(core, '["PTA Open Day","pta"', '["PTA Open Day","parent"', "PTA calendar category");
  core = replaceRequired(core, '["Mock Examination Week","exam"', '["Mock Examination Week","exam_week"', "mock-exam calendar category");
  core = replaceRequired(core, '["Christmas Vacation","break"', '["Christmas Vacation","vacation"', "Christmas calendar category");

  // The showcase must model a schedulable school. Provision enough subject teachers so one
  // teacher never has to occupy two classes in the same day/period, then use a Latin-square
  // subject rotation that preserves each class-subject assignment without collisions.
  core = replaceRequired(
    core,
    '      for (let i=1;i<subjects.length;i++) subjectTeacherUsers.push(await ensureRoleUser(`subject.teacher.${i+1}`, staffNames[(i+8) % staffNames.length], "Subject Teacher", 20+i));',
    '      const requiredSubjectTeachers = Math.max(subjects.length, classes.length);\n      for (let i=1;i<requiredSubjectTeachers;i++) subjectTeacherUsers.push(await ensureRoleUser(`subject.teacher.${i+1}`, staffNames[(i+8) % staffNames.length], "Subject Teacher", 20+i));',
    "collision-free subject teacher pool",
  );
  core = replaceRequired(
    core,
    '            const subject = subjects[(ci + dayOfWeek + period - 2) % subjects.length];\n            const teacherId = assignmentMap.get(`${classes[ci].id}:${subject.id}`) || subjectTeacherUsers[0].id;\n            await tx.timetableSlot.upsert({\n              where: { schoolId_classId_dayOfWeek_period: { schoolId, classId: classes[ci].id, dayOfWeek, period } },\n              update: { subjectId: subject.id, teacherId, venue: period === 4 && subject.name.toLowerCase().includes("comput") ? "ICT Lab 1" : `Room ${ci+1}` },\n              create: { schoolId, classId: classes[ci].id, subjectId: subject.id, teacherId, dayOfWeek, period, venue: period === 4 && subject.name.toLowerCase().includes("comput") ? "ICT Lab 1" : `Room ${ci+1}` },\n            });',
    '            const subject = subjects[(dayOfWeek + period - 2) % subjects.length];\n            const teacherId = assignmentMap.get(`${classes[ci].id}:${subject.id}`) || subjectTeacherUsers[ci % subjectTeacherUsers.length].id;\n            const venue = `Room ${ci+1}`;\n            await tx.timetableSlot.upsert({\n              where: { schoolId_classId_dayOfWeek_period: { schoolId, classId: classes[ci].id, dayOfWeek, period } },\n              update: { subjectId: subject.id, teacherId, venue },\n              create: { schoolId, classId: classes[ci].id, subjectId: subject.id, teacherId, dayOfWeek, period, venue },\n            });',
    "collision-free showcase timetable",
  );

  const arcadeQuestionNeedle = 'questions:[{q:"Synthetic practice item",options:["A","B","C","D"],correct:1}],answers:[1],status:"completed",correct:1';
  const arcadeQuestionReplacement = 'questions:[{q:"Synthetic practice 1",options:["A","B","C","D"],correct:1},{q:"Synthetic practice 2",options:["A","B","C","D"],correct:1},{q:"Synthetic practice 3",options:["A","B","C","D"],correct:1},{q:"Synthetic practice 4",options:["A","B","C","D"],correct:1},{q:"Synthetic practice 5",options:["A","B","C","D"],correct:1}],answers:[1,1,1,1,1],status:"completed",correct:4';
  core = replaceAllRequired(core, arcadeQuestionNeedle, arcadeQuestionReplacement, "arcade round question length");

  const schoolLookupNeedle = `async function main() {
  patchAndRunBaseFixture();

  process.env.DATABASE_URL = testUrl;
  const prisma = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 300000 } });
  try {
    const school = await prisma.school.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
    if (!school) throw new Error("Eugene Academy was not created by the base fixture.");
    const schoolId = school.id;
    const passwordHash = await hash(password, 12);`;
  const schoolLookupReplacement = `async function main() {
  patchAndRunBaseFixture();

  // School rows are tenant-RLS protected. Read the ID emitted by the base fixture,
  // then enter the tenant context before any school-scoped Prisma read/write.
  const baseReportPath = path.join(__dirname, ".realistic-test-school-output.json");
  const baseReport = JSON.parse(fs.readFileSync(baseReportPath, "utf8"));
  const schoolId = String(baseReport?.school?.id || "");
  if (!schoolId || baseReport?.school?.code !== SCHOOL_CODE) throw new Error("Eugene Academy base fixture report is missing or mismatched.");

  process.env.DATABASE_URL = testUrl;
  const prisma = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 300000 } });
  try {
    const passwordHash = await hash(password, 12);`;
  core = replaceRequired(core, schoolLookupNeedle, schoolLookupReplacement, "tenant-RLS school bootstrap");

  const messageNeedle = `      // In-app communications must target User.id to appear in teacher/guardian inboxes.
      const guardianUsers=await tx.guardian.findMany`;
  const messageReplacement = `      // Synthetic staging credits let SMS lifecycle records exercise the real prepaid meter without any provider calls.
      await tx.$executeRawUnsafe(
        \`INSERT INTO "PlatformMessagingWallet" ("schoolId","smsBalance","whatsappBalance","smsSellRate","whatsappSellRate","smsCostRate","whatsappCostRate","lowBalanceThreshold","status","updatedAt")
         VALUES ($1,250,50,0.08,0.12,0.04,0.06,25,'active',NOW())
         ON CONFLICT ("schoolId") DO UPDATE SET "smsBalance"=GREATEST("PlatformMessagingWallet"."smsBalance",250),"whatsappBalance"=GREATEST("PlatformMessagingWallet"."whatsappBalance",50),"status"='active',"updatedAt"=NOW()\`,
        schoolId,
      );

      // In-app communications must target User.id to appear in teacher/guardian inboxes.
      const guardianUsers=await tx.guardian.findMany`;
  core = replaceRequired(core, messageNeedle, messageReplacement, "synthetic messaging wallet insertion point");

  fs.writeFileSync(coreFixturePath, core, "utf8");
  patchedPaths.add(coreFixturePath);

  let operations = originals.get(operationsFixturePath);
  operations = replaceRequired(
    operations,
    'const { PrismaClient } = require("@prisma/client");',
    'const fs = require("fs");\nconst path = require("path");\nconst { PrismaClient } = require("@prisma/client");',
    "operations fixture imports",
  );
  const operationsSchoolNeedle = `async function main() {
  const school = await prisma.school.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
  if (!school) throw new Error("Eugene Academy must be seeded before operational depth is added.");
  const schoolId = school.id;

  const summary = await prisma.$transaction(async (tx) => {`;
  const operationsSchoolReplacement = `async function main() {
  const baseReport = JSON.parse(fs.readFileSync(path.join(__dirname, ".realistic-test-school-output.json"), "utf8"));
  const schoolId = String(baseReport?.school?.id || "");
  if (!schoolId || baseReport?.school?.code !== SCHOOL_CODE) throw new Error("Eugene Academy base fixture report is missing or mismatched before operations seeding.");

  const summary = await prisma.$transaction(async (tx) => {`;
  operations = replaceRequired(operations, operationsSchoolNeedle, operationsSchoolReplacement, "operations tenant-RLS school bootstrap");

  operations = replaceAllRequired(
    operations,
    'approvedByUserId: index < 8 ? frontDeskUser.id : null',
    'approvedByUserId: index < 8 ? owner.id : null',
    "pickup four-eyes approval",
  );

  fs.writeFileSync(operationsFixturePath, operations, "utf8");
  patchedPaths.add(operationsFixturePath);

  let verifier = originals.get(verifierFixturePath);
  const verifierSchoolNeedle = `async function main() {
  const school = await prisma.school.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
  expected(school, "Eugene Academy school code eug123 was not created.");
  expected(school.name === "Eugene Academy", \`Expected school name Eugene Academy, received \${school.name}.\`);
  const schoolId = school.id;

  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);`;
  const verifierSchoolReplacement = `async function main() {
  const baseReport = JSON.parse(fs.readFileSync(path.join(__dirname, ".realistic-test-school-output.json"), "utf8"));
  const schoolId = String(baseReport?.school?.id || "");
  const school = { id: schoolId, name: String(baseReport?.school?.name || "Eugene Academy"), uniqueCode: SCHOOL_CODE };
  expected(schoolId && baseReport?.school?.code === SCHOOL_CODE, "Eugene Academy school code eug123 was not created.");

  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
    const visibleSchool = await tx.school.findUnique({ where: { id: schoolId } });
    expected(visibleSchool, "Eugene Academy is not visible inside its tenant context.");
    expected(visibleSchool.name === "Eugene Academy", \`Expected school name Eugene Academy, received \${visibleSchool.name}.\`);`;
  verifier = replaceRequired(verifier, verifierSchoolNeedle, verifierSchoolReplacement, "verification tenant-RLS school bootstrap");
  const timetableVerifierNeedle = `    const timetableSlots = await tx.timetableSlot.count({ where: { schoolId } });
    expected(classTeacherCoverage === classes, \`Every class needs a class teacher (\${classTeacherCoverage}/\${classes}).\`);
    expected(teachingAssignments >= classes * subjects, \`Expected full class-subject teaching assignment coverage, found \${teachingAssignments}.\`);
    expected(timetableSlots >= classes * 5 * 8, \`Expected a five-day, eight-period timetable, found \${timetableSlots} slots.\`);`;
  const timetableVerifierReplacement = `    const timetableSlots = await tx.timetableSlot.count({ where: { schoolId } });
    const teacherCollisions = Number((await tx.$queryRawUnsafe(\`SELECT COUNT(*)::int AS "count" FROM (SELECT "teacherId","dayOfWeek","period" FROM "TimetableSlot" WHERE "schoolId"=$1 GROUP BY "teacherId","dayOfWeek","period" HAVING COUNT(*)>1) conflicts\`, schoolId))[0].count);
    const venueCollisions = Number((await tx.$queryRawUnsafe(\`SELECT COUNT(*)::int AS "count" FROM (SELECT LOWER(BTRIM("venue")) AS venue,"dayOfWeek","period" FROM "TimetableSlot" WHERE "schoolId"=$1 AND "venue" IS NOT NULL AND BTRIM("venue")<>'' GROUP BY LOWER(BTRIM("venue")),"dayOfWeek","period" HAVING COUNT(*)>1) conflicts\`, schoolId))[0].count);
    expected(classTeacherCoverage === classes, \`Every class needs a class teacher (\${classTeacherCoverage}/\${classes}).\`);
    expected(teachingAssignments >= classes * subjects, \`Expected full class-subject teaching assignment coverage, found \${teachingAssignments}.\`);
    expected(timetableSlots >= classes * 5 * 8, \`Expected a five-day, eight-period timetable, found \${timetableSlots} slots.\`);
    expected(teacherCollisions === 0, \`Eugene Academy timetable has \${teacherCollisions} teacher collision group(s).\`);
    expected(venueCollisions === 0, \`Eugene Academy timetable has \${venueCollisions} venue collision group(s).\`);`;
  verifier = replaceRequired(verifier, timetableVerifierNeedle, timetableVerifierReplacement, "timetable collision verification");
  verifier = replaceRequired(
    verifier,
    'console.error("[verify-eugene-academy] failed:", error instanceof Error ? error.message : String(error));',
    'console.error("[verify-eugene-academy] failed:", error instanceof Error ? (error.stack || error.message) : String(error));',
    "verification stack diagnostics",
  );
  fs.writeFileSync(verifierFixturePath, verifier, "utf8");
  patchedPaths.add(verifierFixturePath);

  console.log("[eugene-academy] applied guarded compatibility normalization for current schema.");
}

function restoreFixtures() {
  for (const fixturePath of patchedPaths) {
    try { fs.writeFileSync(fixturePath, originals.get(fixturePath), "utf8"); } catch (error) {
      console.error("[eugene-academy] failed to restore fixture file:", error instanceof Error ? error.message : String(error));
    }
  }
  patchedPaths.clear();
}

process.on("exit", restoreFixtures);
process.on("SIGINT", () => { restoreFixtures(); process.exit(130); });
process.on("SIGTERM", () => { restoreFixtures(); process.exit(143); });

patchFixtures();

const steps = [
  ["core school fixture", "seed-eugene-academy-trial.cjs"],
  ["operational depth", "seed-eugene-academy-operations.cjs"],
  ["coverage verification", "verify-eugene-academy-trial.cjs"],
];

for (const [label, filename] of steps) {
  console.log(`[eugene-academy] starting ${label}…`);
  const child = spawnSync(process.execPath, [path.join(__dirname, filename)], { env, stdio: "inherit" });
  if (child.error) {
    restoreFixtures();
    throw child.error;
  }
  if (child.status !== 0) {
    console.error(`[eugene-academy] ${label} failed.`);
    restoreFixtures();
    process.exit(child.status || 1);
  }
  console.log(`[eugene-academy] ${label} complete.`);
}

restoreFixtures();
console.log("[eugene-academy] full synthetic staging fixture verified successfully.");
