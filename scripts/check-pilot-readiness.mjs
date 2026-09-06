#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = [path.join(root, "src", "app"), path.join(root, "src", "components")];
const extensions = new Set([".ts", ".tsx", ".css"]);
const failures = [];

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (extensions.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

const forbiddenUiPhrases = [
  "Prototype / placeholder",
  "Workflow not connected yet",
  "Read-only preview.",
  "Search index not connected yet.",
];

for (const dir of scanRoots) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file);
    for (const phrase of forbiddenUiPhrases) {
      if (text.includes(phrase)) failures.push(`${relative}: pilot-blocking placeholder text: ${phrase}`);
    }
    if (/setForm\([^;\n]*\)\s*;[^\n]*setTimeout\([^\n]*(?:save|submit)\(/.test(text)) {
      failures.push(`${relative}: potential stale React state submission pattern; pass the next payload directly to the action.`);
    }
  }
}

if (failures.length) {
  console.error("Pilot-readiness guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Pilot-readiness guard passed: no known placeholder UI or stale form-submission pattern detected.");
