#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = [path.join(root, "src", "app"), path.join(root, "src", "components")];
const extensions = new Set([".ts", ".tsx"]);
const failures = [];
const approvedLegacyAliases = new Set([
  "/school/admissions/applications", "/school/admissions/enrolment", "/school/attendance/exceptions", "/school/fees/invoices", "/school/fees/payments", "/school/fees/arrears", "/school/communications/broadcasts", "/school/reports", "/school/settings/roles",
]);
const approvedCatchAllPrefixes = new Set(["/guardian"]);

function walk(dir) { const files=[]; for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==="node_modules"||entry.name===".next"||entry.name.startsWith("."))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())files.push(...walk(full));else if(extensions.has(path.extname(entry.name)))files.push(full);}return files; }
function exists(file){return fs.existsSync(path.join(root,file));}
function routeCandidates(href){const clean=href.split(/[?#]/)[0].replace(/\/+/g,"/").replace(/\/$/,"")||"/";const segments=clean.split("/").filter(Boolean);const candidates=[`src/app${clean}/page.tsx`];for(let i=0;i<segments.length;i+=1){for(const token of ["[id]","[slug]"]){const copy=[...segments];copy[i]=token;candidates.push(`src/app/${copy.join("/")}/page.tsx`);}}return [...new Set(candidates)];}
function hasApprovedCatchAll(href){const clean=href.split("?")[0].replace(/\/$/,"")||"/";return [...approvedCatchAllPrefixes].some(prefix=>clean===prefix||clean.startsWith(`${prefix}/`))&&exists(`src/app${clean.split("/")[0]}/[...module]/page.tsx`);}

const links=[];
for(const rootDir of scanRoots){if(!fs.existsSync(rootDir))continue;for(const file of walk(rootDir)){const text=fs.readFileSync(file,"utf8");const relative=path.relative(root,file);for(const match of text.matchAll(/\bhref\s*=\s*["']([^"']+)["']/g))links.push({href:match[1],source:relative});for(const match of text.matchAll(/\bhref:\s*["']([^"']+)["']/g))links.push({href:match[1],source:relative});}}

const unique=[...new Map(links.map(item=>[`${item.source}:${item.href}`,item])).values()];
for(const{href,source}of unique){if(/^(https?:|mailto:|tel:|javascript:)/.test(href)||href.startsWith("/api/"))continue;if(href.includes("${")||href.includes("{"))continue;if(href.startsWith("#"))continue;const clean=href.split("?")[0].split("#")[0];if(approvedLegacyAliases.has(clean)||hasApprovedCatchAll(href))continue;if(!routeCandidates(href).some(exists))failures.push(`${source}: internal link has no concrete Next page: ${href}`);}
if(failures.length){console.error("Navigation-integrity guard failed:");failures.forEach(x=>console.error(`- ${x}`));process.exit(1);}
console.log(`Navigation-integrity guard passed: ${unique.length} internal literal links resolve to a concrete page, approved workspace, or approved legacy alias.`);
