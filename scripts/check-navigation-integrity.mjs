#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "src", "components", "AppShell.tsx");
const source = fs.readFileSync(shellPath, "utf8");
const hrefs = [...source.matchAll(/href:\s*["']([^"']+)["']/g)].map((m) => m[1]);
const failures = [];
const approvedLegacyAliases = new Set([
  "/school/admissions/applications",
  "/school/admissions/enrolment",
  "/school/attendance/exceptions",
  "/school/fees/invoices",
  "/school/fees/payments",
  "/school/fees/arrears",
  "/school/communications/broadcasts",
  "/school/reports",
  "/school/settings/roles",
]);
const approvedCatchAllPrefixes = new Set(["/guardian"]);

function exists(file) { return fs.existsSync(path.join(root, file)); }
function routeCandidates(href) {
  const clean = href.split("?")[0].replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  const segments = clean.split("/").filter(Boolean);
  const candidates = [`src/app${clean}/page.tsx`];
  for (let i = 0; i < segments.length; i += 1) {
    const copy = [...segments];
    copy[i] = `[id]`;
    candidates.push(`src/app/${copy.join("/")}/page.tsx`);
    copy[i] = `[slug]`;
    candidates.push(`src/app/${copy.join("/")}/page.tsx`);
  }
  return [...new Set(candidates)];
}

function hasApprovedCatchAll(href) {
  const clean = href.split("?")[0].replace(/\/$/, "") || "/";
  return [...approvedCatchAllPrefixes].some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`)) && exists(`src/app${clean.split("/")[0]}/[...module]/page.tsx`);
}

const unique = [...new Set(hrefs)];
for (const href of unique) {
  if (/^(https?:|mailto:|tel:)/.test(href)) continue;
  const clean = href.split("?")[0];
  if (approvedLegacyAliases.has(clean) || hasApprovedCatchAll(href)) continue;
  if (!routeCandidates(href).some(exists)) failures.push(`AppShell target has no concrete Next page: ${href}`);
}

if (failures.length) {
  console.error("Navigation-integrity guard failed:");
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`Navigation-integrity guard passed: ${unique.length} AppShell destinations resolve to concrete routes, approved workspaces, or approved legacy aliases.`);
