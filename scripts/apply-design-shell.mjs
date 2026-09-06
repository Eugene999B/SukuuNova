#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "src");
const appShell = path.join(src, "components", "AppShell.tsx");
const globals = path.join(src, "app", "globals.css");
const header = path.join(src, "components", "PageHeader.tsx");
const headerCss = path.join(src, "components", "page-header.css");

if (!fs.existsSync(header)) {
  fs.writeFileSync(header, `import type { ReactNode } from "react";\nimport "./page-header.css";\n\nexport function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {\n  return <header className="sn-page-header"><div className="sn-page-header-copy"><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="sn-page-header-actions">{actions}</div> : null}</header>;\n}\n`);
}
if (!fs.existsSync(headerCss)) {
  fs.writeFileSync(headerCss, `.sn-page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:0 0 18px;padding:2px 0 6px}.sn-page-header-copy{min-width:0}.sn-page-header h1{margin:0;color:var(--sn-ink);font-size:var(--sn-font-2xl);line-height:1.15;letter-spacing:-.02em;font-weight:800}.sn-page-header p{margin:5px 0 0;color:var(--sn-muted);font-size:var(--sn-font-sm);line-height:1.45}.sn-page-header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}@media(max-width:720px){.sn-page-header{align-items:flex-start;flex-direction:column}.sn-page-header-actions{width:100%;justify-content:flex-start}}\n`);
}

let shell = fs.readFileSync(appShell, "utf8");
if (!shell.includes('from "./PageHeader"')) shell = shell.replace('import "./app-shell.css";', 'import { PageHeader } from "./PageHeader";\nimport "./app-shell.css";');
shell = shell.replace(/role\?: string;\n  children: ReactNode;/, 'role?: string;\n  headerActions?: ReactNode;\n  children: ReactNode;');
shell = shell.replace(/role = universe === "platform" \? "Super Admin" : universe === "guardian" \? "Guardian" : universe === "teacher" \? "Teacher" : "Administrator", children }: Props\)/, 'role = universe === "platform" ? "Super Admin" : universe === "guardian" ? "Guardian" : universe === "teacher" ? "Teacher" : "Administrator", headerActions, children }: Props)');
shell = shell.replace('<div className="app-content">\n          {children}\n        </div>', '<div className="app-content">\n          <PageHeader title={title} description={subtitle} actions={headerActions} />\n          <div className="sn-page-body">{children}</div>\n        </div>');
fs.writeFileSync(appShell, shell);

if (fs.existsSync(globals)) {
  let css = fs.readFileSync(globals, "utf8");
  if (!css.includes("/* system-wide operational form controls */")) {
    css += `\n\n/* system-wide operational form controls */\nselect{min-width:11rem;max-width:100%}\ninput::placeholder,textarea::placeholder{color:var(--color-text-subtle);opacity:1}\n`;
    fs.writeFileSync(globals, css);
  }
}

console.log("Applied compact PageHeader shell and global operational control sizing.");
