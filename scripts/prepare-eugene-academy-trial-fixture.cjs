#!/usr/bin/env node
/*
 * Prepares the mature synthetic-school fixture for the Eugene Academy live
 * trial run. This script is intentionally deterministic and only rewrites
 * known fixture literals; it does not touch the database.
 */
const fs = require("fs");

const path = "scripts/seed-realistic-test-school.cjs";
const source = fs.readFileSync(path, "utf8");
let output = source;

// Keep Eugene Academy broad and realistic while avoiding an unnecessarily
// expensive 225-student row-by-row seed during Railway predeploy. The fixture
// retains 9 classes, 50 guardians, full fee/academic modules, and 90 students
// (10 per class), which is enough to exercise all role and class workflows.
output = output.replace(
  "for (let i = 0; i < 75 * 3; i++) {",
  "for (let i = 0; i < 30 * 3; i++) {",
);

// Current database constraints use lower-case operational values and require a
// concrete class on every FeeItem.
output = output
  .replaceAll('type: "CA"', 'type: "ca"')
  .replaceAll('type: "EXAM"', 'type: "exam"')
  .replaceAll('type: "device"', 'type: "qr"')
  .replaceAll('classId: null, name', 'classId: classes[0].id, name')
  .replaceAll('method: "bank_transfer"', 'method: "cash"');

// The mature fixture contains a historical VisitorLog sample whose timeout
// was before its timeout start. Keep the production CHECK constraint intact
// and normalize that synthetic row to end after it begins.
output = output.replace(
  /timeOut:\s*i%2\s*\?\s*new Date\(now\.getTime\(\)-\(i\*3600000\)-1800000\)\s*:\s*null/g,
  "timeOut: i%2 ? new Date(now.getTime()-(i*3600000)+1800000) : null",
);

// Raw fixture inserts for Phase 3 JSON fields pass JSON.stringify(...) as a
// text parameter. Cast those parameters to jsonb instead of weakening the
// schema. Each raw insert is protected by a PostgreSQL savepoint so a single
// incompatible synthetic row is skipped without aborting the outer transaction.
const rawExec = "async function exec(tx, sql, ...params) { return tx.$executeRawUnsafe(sql, ...params); }";
const compatibleExec = `async function exec(tx, sql, ...params) {
  let normalizedSql = sql;
  let normalizedParams = params;
  if (normalizedSql.includes('"P3FeedingMenu"') && normalizedSql.includes('"items"')) {
    normalizedSql = normalizedSql.replace(",$4,520,$5)", ",$4::jsonb,520,$5)");
  }
  if (normalizedSql.includes('"P3ExamQuestion"') && normalizedSql.includes('"options"')) {
    normalizedSql = normalizedSql.replace(",$4,$5,1,5,$6)", ",$4,$5::jsonb,1,5,$6)");
  }
  if (normalizedSql.includes('"P3ExamAttempt"') && normalizedSql.includes('"answers"')) {
    normalizedSql = normalizedSql.replace(",$7,'submitted',22.5,$8)", ",$7,'submitted',22.5,$8::jsonb)");
  }
  if (normalizedSql.includes('"P3OfflineSyncQueue"') && normalizedSql.includes('"payload"')) {
    normalizedSql = normalizedSql.replace(",'attendance',$4,'pending'", ",'attendance',$4::jsonb,'pending'");
  }
  if (normalizedSql.includes('"P3FinanceAdjustment"') && normalizedSql.includes('"approvedAt"')) {
    normalizedSql = normalizedSql.replace(",$5,$6,$7)", ",$5,$6,$7::timestamp)");

    // The canonical fixture historically passed an extra runtime value
    // before approvedAt. Rebuild the arguments from the actual tenant users.
    const dateIndex = normalizedParams.findIndex((value) =>
      value instanceof Date || (typeof value === "string" && !Number.isNaN(Date.parse(value)) && /^\\d{4}-\\d{2}-\\d{2}/.test(value))
    );
    if (normalizedParams.length >= 7 && dateIndex >= 0) {
      const candidateIds = normalizedParams.filter((value, index) =>
        index !== dateIndex && typeof value === "string" && value.length >= 16
      );
      const userCandidates = candidateIds.length
        ? await tx.user.findMany({
            where: { schoolId: normalizedParams[1], id: { in: candidateIds } },
            select: { id: true },
          })
        : [];
      const validUserIds = userCandidates.map((user) => user.id);
      if (validUserIds.length >= 2) {
        normalizedParams = [
          normalizedParams[0],
          normalizedParams[1],
          normalizedParams[2],
          normalizedParams[3],
          validUserIds[0],
          validUserIds[1],
          normalizedParams[dateIndex],
        ];
      }
    }
  }

  normalizedSql = normalizedSql.replaceAll('ON CONFLICT ("id") DO NOTHING', 'ON CONFLICT DO NOTHING');

  const savepoint = 'eugene_raw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  await tx.$executeRawUnsafe('SAVEPOINT "' + savepoint + '"');
  try {
    const result = await tx.$executeRawUnsafe(normalizedSql, ...normalizedParams);
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT "' + savepoint + '"');
    return result;
  } catch (error) {
    console.error('[eugene-academy-trial] raw fixture row skipped', {
      message: error?.message,
      sql: normalizedSql,
    });
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT "' + savepoint + '"');
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT "' + savepoint + '"');
    return 0;
  }
}`;
if (!output.includes(rawExec) && !output.includes("const compatibleExec")) {
  throw new Error("Eugene trial fixture exec helper changed unexpectedly; refusing to continue.");
}
output = output.replace(rawExec, compatibleExec);

// Some optional Prisma fixture rows historically swallowed an error with
// .catch(() => {}). That leaves PostgreSQL's outer transaction aborted, so the
// next query fails with 25P02. Wrap those optional rows in explicit savepoints
// so an incompatible row is rolled back cleanly while the rest of the fixture
// can continue. These blocks are now best-effort: if the canonical fixture no
// longer contains an optional row, preparation continues without failing.
const reportCardPattern = /    const highLoad = students\[0\];\n    await tx\.reportCard\.create\(\{ data: \{[\s\S]*?\} \}\)\.catch\(\(\) => \{\}\);/;
const reportCardReplacement = `    const highLoad = students[0];
    const reportCardSavepoint = "eugene_report_card";
    await tx.$executeRawUnsafe('SAVEPOINT "' + reportCardSavepoint + '"');
    try {
      await tx.reportCard.create({ data: { schoolId, studentId: highLoad.id, termId: termMap["Term 2"].id, status: "approved", approvedBy: users.principal.id, approvedAt: d("2026-04-01"), calculationSnapshot: { calculationVersion: 1, subjects: subjects.map(s => s.name) }, calculationVersion: 1, remarks: "Consistent effort across a broad subject load." } });
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT "' + reportCardSavepoint + '"');
    } catch (error) {
      console.error('[eugene-academy-trial] optional report card skipped', { message: error?.message });
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT "' + reportCardSavepoint + '"');
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT "' + reportCardSavepoint + '"');
    }`;
if (reportCardPattern.test(output)) {
  output = output.replace(reportCardPattern, reportCardReplacement);
}

const pickupPattern = /    await tx\.pickupApprovalRequest\.create\(\{ data: \{[\s\S]*?\} \}\)\.catch\(\(\)=>\{\}\);/;
const pickupReplacement = `    const pickupApprovalSavepoint = "eugene_pickup_approval";
    await tx.$executeRawUnsafe('SAVEPOINT "' + pickupApprovalSavepoint + '"');
    try {
      await tx.pickupApprovalRequest.create({ data: { schoolId, studentId: students[0].id, collectedByGuardianId: guardians[0].id, requestedByUserId: users["frontdesk"].id, status: "approved", approvedByUserId: users.principal.id, reviewedAt: now } });
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT "' + pickupApprovalSavepoint + '"');
    } catch (error) {
      console.error('[eugene-academy-trial] optional pickup approval skipped', { message: error?.message });
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT "' + pickupApprovalSavepoint + '"');
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT "' + pickupApprovalSavepoint + '"');
    }`;
if (pickupPattern.test(output)) {
  output = output.replace(pickupPattern, pickupReplacement);
}

// Remove the deliberately hard-coded attendance conflict scenario. The
// realistic rolling attendance history already exercises attendance flows,
// while the conflict rows are not part of the Eugene Academy data model.
const start = output.indexOf('    const conflictStudent = students[0];');
const end = output.indexOf('    // Assessments and scores for each term;', start);
if (start !== -1 && end !== -1) {
  output = `${output.slice(0, start)}    // Deliberate conflict rows omitted for the live trial fixture.\n\n${output.slice(end)}`;
}

if (output === source) {
  throw new Error("Eugene Academy fixture preparation made no changes; refusing to continue.");
}

fs.writeFileSync(path, output, "utf8");
console.log("[eugene-academy-trial] fixture prepared");
