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
// schema. This mirrors the compatibility treatment already proven by the
// older realistic live-seed runner.
const rawExec = "async function exec(tx, sql, ...params) { return tx.$executeRawUnsafe(sql, ...params); }";
const compatibleExec = `async function exec(tx, sql, ...params) {
  let normalizedSql = sql;
  let normalizedParams = params;
  if (normalizedSql.includes('"P3FeedingMenu"') && normalizedSql.includes('"items"')) {
    normalizedSql = normalizedSql.replace(",\$4,520,\$5)", ",\$4::jsonb,520,\$5)");
  }
  if (normalizedSql.includes('"P3ExamQuestion"') && normalizedSql.includes('"options"')) {
    normalizedSql = normalizedSql.replace(",\$4,\$5,1,5,\$6)", ",\$4,\$5::jsonb,1,5,\$6)");
  }
  if (normalizedSql.includes('"P3ExamAttempt"') && normalizedSql.includes('"answers"')) {
    normalizedSql = normalizedSql.replace(",\$7,'submitted',22.5,\$8)", ",\$7,'submitted',22.5,\$8::jsonb)");
  }
  if (normalizedSql.includes('"P3OfflineSyncQueue"') && normalizedSql.includes('"payload"')) {
    normalizedSql = normalizedSql.replace(",'attendance',\$4,'pending'", ",'attendance',\$4::jsonb,'pending'");
  }
  if (normalizedSql.includes('"P3FinanceAdjustment"') && normalizedSql.includes('"approvedAt"')) {
    normalizedSql = normalizedSql.replace(",\$5,\$6,\$7)", ",\$5,\$6,\$7::timestamp)");

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

  // The mature fixture uses many raw inserts whose SQL only guards the
  // generated id. Live trial reruns can legitimately hit composite unique
  // keys (notably AttendanceEvent's school/student/date/period/type key).
  // Ignore any existing unique row instead of failing the entire seed.
  normalizedSql = normalizedSql.replaceAll("ON CONFLICT (\"id\") DO NOTHING", "ON CONFLICT DO NOTHING");

  return tx.$executeRawUnsafe(normalizedSql, ...normalizedParams);
}`;
if (!output.includes(rawExec)) {
  throw new Error("Eugene trial fixture exec helper changed unexpectedly; refusing to continue.");
}
output = output.replace(rawExec, compatibleExec);

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
