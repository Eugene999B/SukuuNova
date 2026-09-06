#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const allowed = path.resolve(srcRoot, "app", "design-tokens.css");
const extensions = new Set([".ts", ".tsx", ".css"]);
const hexRe = /#[0-9a-f]{3,8}\b/gi;
const rgbRe = /\brgba?\s*\(/gi;

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (extensions.has(path.extname(entry.name)) && path.resolve(full) !== allowed) files.push(full);
  }
  return files;
}

let failures = 0;
for (const file of walk(srcRoot)) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const matches = [...line.matchAll(hexRe), ...line.matchAll(rgbRe)];
    for (const match of matches) {
      failures += 1;
      console.error(`${path.relative(root, file)}:${i + 1}: hardcoded color literal ${match[0]}`);
    }
  });
}
if (failures) {
  console.error(`\nFound ${failures} hardcoded color literal(s). Use a token from src/app/design-tokens.css instead.`);
  process.exit(1);
}
console.log("Design-token lint passed: no hex/rgb/rgba literals outside design-tokens.css.");
