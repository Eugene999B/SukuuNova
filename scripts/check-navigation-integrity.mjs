#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "src", "app");
const shellPath = path.join(root, "src", "components", "AppShell.tsx");
const source = fs.readFileSync(shellPath, "utf8");
const hrefs = [...source.matchAll(/href:\s*["']([^"']+)["']/g)].map((m) => m[1]);
const failures = [];

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
  candidates.push(`src/app/${segments[0] ?? ""}/[...module]/page.tsx`);
  return [...new Set(candidates)];
}

const unique = [...new Set(hrefs)];
for (const href of unique) {
  if (/^(https?:|mailto:|tel:)/.test(href)) continue;
  if (!routeCandidates(href).some(exists)) failures.push(`AppShell target has no concrete Next page: ${href}`);
}

if (failures.length) {
  console.error("Navigation-integrity guard failed:");
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`Navigation-integrity guard passed: ${unique.length} AppShell destinations resolve to a concrete route.`);
