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

// Current database constraints use lower-case operational values and require a
// concrete class on every FeeItem.
output = output
  .replaceAll('type: "CA"', 'type: "ca"')
  .replaceAll('type: "EXAM"', 'type: "exam"')
  .replaceAll('type: "device"', 'type: "qr"')
  .replaceAll('classId: null, name', 'classId: classes[0].id, name')
  .replaceAll('method: "bank_transfer"', 'method: "cash"');

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
