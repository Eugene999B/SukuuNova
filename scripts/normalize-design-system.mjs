#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const tokenFile = path.join(srcRoot, "app", "design-tokens.css");
const extensions = new Set([".ts", ".tsx", ".css"]);
const skipFiles = new Set([tokenFile]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (extensions.has(path.extname(entry.name)) && !skipFiles.has(full)) out.push(full);
  }
  return out;
}

function rgb(hex) {
  const h = hex.replace(/^#/, "");
  if (![3, 6, 8].includes(h.length)) return null;
  const s = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

const palette = [
  ["#0f766e", "--color-brand"], ["#0d9488", "--color-brand-hover"], ["#042f2e", "--color-brand-deep"],
  ["#f8fafc", "--color-bg"], ["#f1f5f9", "--color-bg-subtle"], ["#ffffff", "--color-surface"], ["#e2e8f0", "--color-border"], ["#cbd5e1", "--color-border-strong"],
  ["#0f172a", "--color-text-primary"], ["#334155", "--color-text-secondary"], ["#64748b", "--color-text-muted"], ["#94a3b8", "--color-text-subtle"], ["#cbd5e1", "--color-text-disabled"],
  ["#15803d", "--color-success"], ["#166534", "--color-success-hover"], ["#f0fdf4", "--color-success-soft"], ["#bbf7d0", "--color-success-border"],
  ["#b45309", "--color-warning"], ["#92400e", "--color-warning-hover"], ["#fffbeb", "--color-warning-soft"], ["#fde68a", "--color-warning-border"],
  ["#b91c1c", "--color-danger"], ["#991b1b", "--color-danger-hover"], ["#fef2f2", "--color-danger-soft"], ["#fecaca", "--color-danger-border"],
  ["#1d4ed8", "--color-info"], ["#1e40af", "--color-info-hover"], ["#eff6ff", "--color-info-soft"], ["#bfdbfe", "--color-info-border"],
  ["#4338ca", "--color-accent-indigo"], ["#eef2ff", "--color-accent-indigo-soft"],
  ["#14b8a6", "--color-brand"], ["#2dd4bf", "--color-brand-hover"], ["#162032", "--color-surface-soft"], ["#1e293b", "--color-surface-raised"],
  ["#090e17", "--color-bg"], ["#0f172a", "--color-surface"], ["#f8fafc", "--color-text-primary"], ["#cbd5e1", "--color-text-secondary"],
  ["#4ade80", "--color-success"], ["#fbbf24", "--color-warning"], ["#f87171", "--color-danger"], ["#60a5fa", "--color-info"],
];

function nearestToken(value) {
  const c = rgb(value);
  if (!c) return "--sn-ink";
  let best = null;
  let bestDist = Infinity;
  for (const [hex, token] of palette) {
    const p = rgb(hex);
    const d = Math.sqrt((c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2);
    if (d < bestDist) { bestDist = d; best = token; }
  }
  return best || "--sn-ink";
}

function inferToken(source, index, raw) {
  const before = source.slice(Math.max(0, index - 240), index);
  const prop = [...before.matchAll(/([A-Za-z-]+)\s*[:=]\s*[^;{}\n]*$/g)].at(-1)?.[1]?.toLowerCase() || "";
  if (prop.includes("boxshadow") || prop.includes("shadow")) return "--sn-shadow-sm";
  if (prop.includes("border") || prop === "outline" || prop === "outlinecolor" || prop === "dividercolor") return "--sn-line";
  if (prop === "color" || prop === "fill" || prop === "stroke" || prop.includes("textcolor")) {
    const t = nearestToken(raw);
    return ["--color-success", "--color-warning", "--color-danger", "--color-info"].includes(t) ? t : "--sn-ink";
  }
  if (prop.includes("background") || prop === "background") {
    const t = nearestToken(raw);
    if (t.includes("success") || t.includes("warning") || t.includes("danger") || t.includes("info")) return t;
    return "--sn-surface";
  }
  return nearestToken(raw);
}

function replaceColors(content) {
  const literal = /#[0-9a-f]{3,8}\b/gi;
  let out = content.replace(literal, (m, offset) => `var(${inferToken(content, offset, m)})`);
  out = out.replace(/\brgba?\(\s*[^)]*\)/gi, (m, offset) => `var(${inferToken(out, offset, "#000000")})`);
  out = out.replace(/([:\s,(])(?:white|black)(?=[;,\s)])/gi, (m, prefix, offset) => {
    const token = inferToken(out, Math.max(0, offset), prefix.toLowerCase() === "black" ? "#000000" : "#ffffff");
    return `${prefix}var(${token})`;
  });
  return out;
}

function rewriteFiles() {
  const changed = [];
  for (const file of walk(srcRoot)) {
    const before = fs.readFileSync(file, "utf8");
    const after = replaceColors(before);
    if (after !== before) { fs.writeFileSync(file, after); changed.push(path.relative(root, file)); }
  }
  return changed;
}

function ensurePageHeader() {
  const component = path.join(srcRoot, "components", "PageHeader.tsx");
  const css = path.join(srcRoot, "components", "page-header.css");
  fs.writeFileSync(component, `import type { ReactNode } from "react";\nimport "./page-header.css";\n\nexport function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {\n  return <header className=\"sn-page-header\"><div className=\"sn-page-header-copy\"><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className=\"sn-page-header-actions\">{actions}</div> : null}</header>;\n}\n`);
  fs.writeFileSync(css, `.sn-page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:0 0 18px;padding:2px 0 6px}.sn-page-header-copy{min-width:0}.sn-page-header h1{margin:0;color:var(--sn-ink);font-size:var(--sn-font-2xl);line-height:1.15;letter-spacing:-.02em;font-weight:800}.sn-page-header p{margin:5px 0 0;color:var(--sn-muted);font-size:var(--sn-font-sm);line-height:1.45}.sn-page-header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}@media(max-width:720px){.sn-page-header{align-items:flex-start;flex-direction:column}.sn-page-header-actions{width:100%;justify-content:flex-start}}\n`);
}

function patchAppShell() {
  const file = path.join(srcRoot, "components", "AppShell.tsx");
  let text = fs.readFileSync(file, "utf8");
  if (!text.includes('from "./PageHeader"')) text = text.replace('import "./app-shell.css";', 'import { PageHeader } from "./PageHeader";\nimport "./app-shell.css";');
  const old = '<div className="app-content">\n          {children}\n        </div>';
  const next = '<div className="app-content">\n          <PageHeader title={title} description={subtitle} />\n          <div className="sn-page-body">{children}</div>\n        </div>';
  if (text.includes(old)) text = text.replace(old, next);
  fs.writeFileSync(file, text);
}

function patchGlobalLayout() {
  const file = path.join(srcRoot, "app", "app-shell.css");
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  const marker = "/* system-wide compact operational page treatment */";
  if (!text.includes(marker)) {
    text += `\n\n${marker}\n.app-content{min-width:0}.sn-page-body{min-width:0}.app-content>h1,.app-content>section>h1,.app-content>main>h1{font-size:var(--sn-font-2xl)!important;line-height:1.15!important}.app-content [class*="hero"] h1,.app-content [class*="Hero"] h1{font-size:var(--sn-font-2xl);line-height:1.15}.app-content [class*="hero"],[class*="Hero"].app-card{margin-bottom:18px}\n`;
    fs.writeFileSync(file, text);
  }
  const globals = path.join(srcRoot, "app", "globals.css");
  if (fs.existsSync(globals)) {
    let g = fs.readFileSync(globals, "utf8");
    if (!g.includes("/* system-wide select sizing */")) {
      g += `\n\n/* system-wide select sizing */\nselect{min-width:10.5rem;max-width:100%;}\n`;
      fs.writeFileSync(globals, g);
    }
  }
}

const changed = rewriteFiles();
ensurePageHeader();
patchAppShell();
patchGlobalLayout();
console.log(`Design-system normalization changed ${changed.length} source files.`);
for (const file of changed) console.log(file);
