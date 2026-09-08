/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";

type Dataset = { key: string; title: string; detail: string; scope: string };
type TermOption = { id: string; name: string };
type ClassOption = { id: string; name: string; level: string | null };

type Props = {
  schoolName: string;
  logoUrl?: string | null;
  schoolCode: string;
  terms?: TermOption[];
  classes?: ClassOption[];
};

const datasets: Dataset[] = [
  { key: "students", title: "Student Directory", detail: "Learners, admission numbers, classes and status.", scope: "People" },
  { key: "gradebook", title: "Academic Results", detail: "Assessment scores and academic result data.", scope: "Academics" },
  { key: "attendance", title: "Attendance Register", detail: "Attendance, dates, methods and lateness records.", scope: "Attendance" },
  { key: "fees", title: "Fee Balances", detail: "Invoices, payments, outstanding balances and status.", scope: "Finance" },
  { key: "staff", title: "Staff Directory", detail: "Active workforce, contact details and roles.", scope: "People" },
];

const outputOptions = [
  { key: "csv", label: "CSV / Excel", detail: "Spreadsheet-ready CSV" },
  { key: "json", label: "JSON", detail: "Structured system data" },
  { key: "print", label: "Print / Save PDF", detail: "Official printable document" },
] as const;
type OutputKey = typeof outputOptions[number]["key"];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell.length || row.length) { row.push(cell); if (row.some((value) => value.length)) rows.push(row); }
  return rows;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function htmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function filenamePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "school";
}

export default function DownloadsExportCentre({ schoolName, logoUrl, schoolCode, terms = [], classes = [] }: Props) {
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<Array<{ id: string; title: string; format: string; at: string }>>([]);
  const [query, setQuery] = useState("");
  const [termId, setTermId] = useState(terms[0]?.id ?? "");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const filtered = useMemo(() => datasets.filter((item) => `${item.title} ${item.detail} ${item.scope}`.toLowerCase().includes(query.toLowerCase())), [query]);

  async function exportDataset(dataset: Dataset, format: OutputKey) {
    const id = `${dataset.key}:${format}`;
    setBusy(id);
    setNotice("");
    try {
      const response = await fetch(`/api/school/exports/${dataset.key}`, { cache: "no-store", credentials: "same-origin" });
      const source = await response.text();
      if (!response.ok) {
        let message = "This export is not available for your current school permissions.";
        try {
          const parsed = JSON.parse(source) as { message?: string; error?: string };
          message = parsed.message ?? parsed.error ?? message;
        } catch { /* response is not JSON */ }
        throw new Error(message);
      }
      const rows = parseCsv(source);
      const stamp = new Date().toISOString().slice(0, 10);
      const safeCode = filenamePart(schoolCode || schoolName);
      if (format === "csv") {
        downloadBlob(new Blob(["\ufeff", source], { type: "text/csv;charset=utf-8" }), `${safeCode}-${dataset.key}-${stamp}.csv`);
      } else if (format === "json") {
        const headers = rows[0] ?? [];
        const records = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
        downloadBlob(new Blob([JSON.stringify({ school: schoolName, schoolCode, generatedAt: new Date().toISOString(), dataset: dataset.key, records }, null, 2)], { type: "application/json;charset=utf-8" }), `${safeCode}-${dataset.key}-${stamp}.json`);
      } else {
        const headers = rows[0] ?? [];
        const body = rows.slice(1).map((row) => `<tr>${headers.map((_, index) => `<td>${htmlEscape(String(row[index] ?? ""))}</td>`).join("")}</tr>`).join("");
        const head = headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("");
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(dataset.title)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;background:#fff;margin:0}header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #111827;padding-bottom:12px}header img{max-height:58px;max-width:90px;object-fit:contain}h1{font-size:20px;margin:0 0 4px}p{font-size:10px;margin:2px 0}.meta{display:flex;gap:18px;flex-wrap:wrap;margin:12px 0;font-size:10px}table{width:100%;border-collapse:collapse;font-size:8px}th{background:#f1f5f9;text-align:left;padding:7px;border:1px solid #cbd5e1}td{border:1px solid #e2e8f0;padding:6px;vertical-align:top}footer{margin-top:14px;border-top:1px solid #cbd5e1;padding-top:8px;font-size:8px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><header>${logoUrl ? `<img src="${htmlEscape(logoUrl)}" alt="School logo">` : ""}<div><h1>${htmlEscape(schoolName)}</h1><p>${htmlEscape(dataset.title)}</p></div></header><div class="meta"><span><strong>School code:</strong> ${htmlEscape(schoolCode || "—")}</span><span><strong>Generated:</strong> ${htmlEscape(new Date().toLocaleString("en-GH"))}</span><span><strong>Records:</strong> ${String(Math.max(0, rows.length - 1))}</span></div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><footer>Generated by SukuuNova · ${htmlEscape(schoolName)} · Official school export.</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180))<\/script></body></html>`;
        const printWindow = window.open("", "_blank");
        if (!printWindow) throw new Error("Your browser blocked the print window. Allow pop-ups for SukuuNova and try again.");
        try { printWindow.opener = null; } catch { /* browser may prevent assignment */ }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      }
      setHistory((current) => [{ id, title: dataset.title, format: format === "print" ? "Print / PDF" : format.toUpperCase(), at: new Date().toLocaleString("en-GH") }, ...current].slice(0, 12));
      setNotice(`${dataset.title} prepared successfully.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy("");
    }
  }

  const selectedClass = classes.find((item) => item.id === classId);
  const selectedTerm = terms.find((item) => item.id === termId);
  const reportPackHref = termId && classId ? `/school/report-cards/class-print?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}` : "";
  const reportWorkspaceHref = termId && classId ? `/school/report-cards?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}` : "/school/report-cards";
  const timetableHref = classId ? `/school/timetable/print?view=class&classId=${encodeURIComponent(classId)}` : "/school/timetable";

  return <div className="space-y-5">
    <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-4">{logoUrl ? <img src={logoUrl} alt="School logo" className="h-16 w-16 rounded-2xl bg-white object-contain p-2" /> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-xl font-black">S</div>}<div><span className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300">Official downloads & exports</span><h2 className="mt-1 text-2xl font-black">One place for files that actually download or print.</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">Generate data exports, class report packs and official printable documents from the same tenant-scoped source.</p></div></div><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right"><div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">School</div><div className="mt-1 text-sm font-extrabold">{schoolName}</div><div className="text-[10px] text-slate-400">{schoolCode || "School account"}</div></div></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><span className="text-[9px] font-black uppercase tracking-[.13em] text-slate-500">Official document packs</span><h2 className="mt-1 text-base font-black text-slate-900">Choose the class once, then print the document.</h2><p className="mt-1 text-xs text-slate-500">Report cards use the school's selected report theme, logo, learner photographs and frozen signatures.</p></div><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-[10px] font-black text-slate-700">Term<select value={termId} onChange={(event) => setTermId(event.target.value)} className="min-h-11 border border-slate-300 bg-white px-3 text-xs font-semibold"><option value="">Choose term</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label><label className="grid gap-1 text-[10px] font-black text-slate-700">Class<select value={classId} onChange={(event) => setClassId(event.target.value)} className="min-h-11 border border-slate-300 bg-white px-3 text-xs font-semibold"><option value="">Choose class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label></div><div className="mt-4 grid gap-3 md:grid-cols-3"><a href={reportPackHref || reportWorkspaceHref} className={`rounded-2xl border p-4 no-underline ${reportPackHref ? "border-slate-900 bg-slate-900 text-white" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`}><strong className="block text-sm font-black">Print class report cards</strong><span className="mt-1 block text-[10px] leading-4 opacity-80">{selectedClass && selectedTerm ? `${selectedClass.name} · ${selectedTerm.name}` : "Choose a term and class"}</span></a><a href={reportWorkspaceHref} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 no-underline text-slate-900"><strong className="block text-sm font-black">Report-card workspace</strong><span className="mt-1 block text-[10px] leading-4 text-slate-500">Generate missing reports, remarks, promotion, approval and individual downloads.</span></a><a href={timetableHref} className={`rounded-2xl border p-4 no-underline ${classId ? "border-slate-200 bg-slate-50 text-slate-900" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`}><strong className="block text-sm font-black">Print class timetable</strong><span className="mt-1 block text-[10px] leading-4 opacity-70">Uses the selected class and current timetable configuration.</span></a></div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-base font-black text-slate-900">Data export library</h2><p className="mt-1 text-xs text-slate-500">Choose a dataset and output format.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 md:max-w-xs" placeholder="Search exports…" /></div><div className="mt-5 space-y-3">{filtered.map((dataset) => <article key={dataset.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><span className="rounded-full bg-white px-2.5 py-1 text-[8px] font-black uppercase tracking-[.1em] text-slate-500">{dataset.scope}</span><h3 className="mt-2 text-sm font-black text-slate-900">{dataset.title}</h3><p className="mt-1 text-[11px] text-slate-500">{dataset.detail}</p></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{outputOptions.map((option) => { const id = `${dataset.key}:${option.key}`; return <button key={option.key} type="button" disabled={busy === id} onClick={() => void exportDataset(dataset, option.key)} className="min-w-[128px] rounded-xl border border-slate-300 bg-white px-3 py-3 text-left disabled:cursor-wait disabled:opacity-60"><strong className="block text-[11px] font-black text-slate-900">{busy === id ? "Preparing…" : option.label}</strong><span className="mt-1 block text-[9px] leading-4 text-slate-500">{option.detail}</span></button>; })}</div></div></article>)}</div></section>

    {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] font-semibold text-emerald-900" role="status" aria-live="polite">{notice}</div> : null}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-slate-900">This session's export history</h2><p className="mt-1 text-[11px] text-slate-500">Files prepared from this browser session.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600">{history.length}</span></div>{history.length ? <div className="mt-4 divide-y divide-slate-200">{history.map((item) => <div key={`${item.id}-${item.at}`} className="flex items-center justify-between gap-4 py-3"><div><strong className="block text-[10px] font-black text-slate-900">{item.title}</strong><span className="text-[9px] text-slate-500">{item.format} · {item.at}</span></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase text-emerald-700">Prepared</span></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 py-8 text-center text-[10px] text-slate-400">No exports prepared in this session.</div>}</section>
  </div>;
}
