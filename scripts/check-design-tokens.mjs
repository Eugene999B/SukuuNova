#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const root=process.cwd(), src=path.join(root,"src"), tokenFile=path.resolve(src,"app","design-tokens.css");
function walk(dir){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==='node_modules'||e.name==='.next'||e.name.startsWith('.'))continue;const f=path.join(dir,e.name);if(e.isDirectory())out.push(...walk(f));else if((f.endsWith('.css')||f.endsWith('.tsx')||f.endsWith('.ts'))&&path.resolve(f)!==tokenFile)out.push(f)}return out}
const literal=/#[0-9a-f]{3,8}\b|\brgba?\s*\(/gi;
const styleDecl=/(background(?:Color)?|color|fill|stroke|border(?:Color)?|outlineColor|boxShadow|textShadow|backgroundImage)\s*:\s*(["'])(#[0-9a-f]{3,8}|rgba?\([^)]*\)|white|black)\2/gi;
const jsxAttr=/\b(backgroundColor|color|fill|stroke|borderColor)=(['"])(#[0-9a-f]{3,8}|rgba?\([^)]*\)|white|black)\2/gi;
let failures=0;
function scanCss(file,text){for(const [i,line] of text.split(/\r?\n/).entries()){for(const m of line.matchAll(literal)){failures++;console.error(`${path.relative(root,file)}:${i+1}: hardcoded color ${m[0]}`)}}for(const m of text.matchAll(/\b(?:white|black)\b/gi)){const before=text.slice(Math.max(0,m.index-80),m.index);if(/[;:{]\s*$/.test(before)){failures++;const line=text.slice(0,m.index).split(/\r?\n/).length;console.error(`${path.relative(root,file)}:${line}: hardcoded color keyword ${m[0]}`)}}}
function scanCode(file,text){for(const block of text.matchAll(/style=\{\{([\s\S]*?)\}\}/g)){for(const m of block[1].matchAll(styleDecl)){failures++;console.error(`${path.relative(root,file)}: inline style contains ${m[3]}`)}}for(const m of text.matchAll(jsxAttr)){failures++;console.error(`${path.relative(root,file)}: JSX color attribute contains ${m[3]}`)}for(const block of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))scanCss(file,block[1])}
for(const file of walk(src))scanCss(file,fs.readFileSync(file,'utf8').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,''));
for(const file of walk(src).filter(f=>!f.endsWith('.css')))scanCode(file,fs.readFileSync(file,'utf8'));
if(failures){console.error(`\nDesign-token lint failed with ${failures} visual literal(s).`);process.exit(1)}
console.log('Design-token lint passed.');
