import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const IGNORE = new Set([path.join("src", "app", "design-tokens.css")]);
const EXTENSIONS = new Set([".tsx", ".ts", ".css"]);
const COLOR_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^)]*\)|\b(?:white|black)\b/gi;
const DECLARATION_RE = /(?:background(?:-color)?|color|border(?:-color)?|box-shadow|text-shadow|outline|fill|stroke)\s*:\s*([^;{}\n]+)/gi;

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function lineCol(source, offset) {
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  const lastNl = before.lastIndexOf("\n");
  const column = offset - lastNl;
  return { line, column };
}

const findings = [];
for (const file of filesUnder(ROOT)) {
  const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
  if (IGNORE.has(rel)) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(DECLARATION_RE)) {
    const declaration = match[1];
    const valueOffset = match.index + match[0].indexOf(declaration);
    for (const color of declaration.matchAll(COLOR_RE)) {
      const { line, column } = lineCol(source, valueOffset + color.index);
      findings.push({ file: rel, line, column, value: color[0], declaration: declaration.trim() });
    }
  }
  if (/style\s*=\s*\{\{/.test(source)) {
    for (const match of source.matchAll(/style\s*=\s*\{\{([\s\S]*?)\}\}/g)) {
      for (const color of match[1].matchAll(COLOR_RE)) {
        const { line, column } = lineCol(source, match.index + color.index);
        findings.push({ file: rel, line, column, value: color[0], declaration: match[1].trim().replace(/\s+/g, " ") });
      }
    }
  }
}

const unique = new Map();
for (const item of findings) unique.set(`${item.file}:${item.line}:${item.column}:${item.value}`, item);
const sorted = [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);

console.log(`DESIGN TOKEN AUDIT: ${sorted.length} hardcoded color findings outside design-tokens.css`);
for (const item of sorted) console.log(`${item.file}:${item.line}:${item.column}  ${item.value}  :: ${item.declaration}`);

if (process.argv.includes("--fail") && sorted.length) process.exit(1);
