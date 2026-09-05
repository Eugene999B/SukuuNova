/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";

type Dataset = { key: string; title: string; detail: string; scope: string };

const datasets: Dataset[] = [
  { key: "students", title: "Student Directory", detail: "Learners, admission numbers, classes and status.", scope: "People" },
  { key: "gradebook", title: "Academic Results", detail: "Assessment scores and academic result data.", scope: "Academics" },
  { key: "attendance", title: "Attendance Register", detail: "Attendance, dates, methods and lateness records.", scope: "Attendance" },
  { key: "fees", title: "Fee Balances", detail: "Invoices, payments, outstanding balances and status.", scope: "Finance" },
  { key: "staff", title: "Staff Directory", detail: "Active workforce, contact details and roles.", scope: "People" },
];

const outputOptions = [
  { key: "csv", label: "CSV", detail: "Universal spreadsheet data" },
  { key: "excel", label: "Excel", detail: "Excel-compatible workbook data" },
  { key: "json", label: "JSON", detail: "Structured system data" },
  { key: "print", label: "PDF / Print", detail: "Branded school document" },
] as const;

type OutputKey = typeof outputOptions[number]["key"];

function parseCsv(text: string): string[][] {
  const lines = text.trimEnd().split(/\r?\n/);
  return lines.map((line) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === "," && !quoted) { cells.push(cell); cell = ""; continue; }
      cell += char;
    }
    cells.push(cell);
    return cells;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DownloadsExportCentre({ schoolName, logoUrl, schoolCode }: { schoolName: string; logoUrl?: string | null; schoolCode: string }) {
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<Array<{ id: string; title: string; format: string; at: string }>>([]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => datasets.filter((item) => `${item.title} ${item.detail} ${item.scope}`.toLowerCase().includes(query.toLowerCase())), [query]);

  async function exportDataset(dataset: Dataset, format: OutputKey) {
    const id = `${dataset.key}:${format}`;
    setBusy(id); setNotice("");
    try {
      const response = await fetch(`/api/school/exports/${dataset.key}`, { cache: "no-store" });
      const source = await response.text();
      if (!response.ok) throw new Error("This export is not available for your current school permissions.");
      const rows = parseCsv(source);
      const stamp = new Date().toISOString().slice(0, 10);
      const safeCode = schoolCode || "school";
      if (format === "csv") {
        downloadBlob(new Blob([source], { type: "text/csv;charset=utf-8" }), `${safeCode}-${dataset.key}-${stamp}.csv`);
      } else if (format === "excel") {
        const tsv = rows.map((row) => row.map((value) => value.replace(/\t/g, " ")).join("\t")).join("\n");
        downloadBlob(new Blob([tsv], { type: "application/vnd.ms-excel;charset=utf-8" }), `${safeCode}-${dataset.key}-${stamp}.xls`);
      } else if (format === "json") {
        const headers = rows[0] ?? [];
        const records = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
        downloadBlob(new Blob([JSON.stringify({ school: schoolName, generatedAt: new Date().toISOString(), dataset: dataset.key, records }, null, 2)], { type: "application/json;charset=utf-8" }), `${safeCode}-${dataset.key}-${stamp}.json`);
      } else {
        const headers = rows[0] ?? [];
        const body = rows.slice(1).map((row) => `<tr>${headers.map((_, index) => `<td>${String(row[index] ?? "").replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;"}[c] ?? c))}</td>`).join("")}</tr>`).join("");
        const head = headers.map((header) => `<th>${header}</th>`).join("");
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${dataset.title}</title><style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;color:#0f172a;margin:0}header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0f172a;padding-bottom:14px}header img{max-height:58px;max-width:90px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 10px}p{font-size:10px;color:#64748b;margin:2px 0}.meta{display:flex;gap:18px;margin:12px 0;font-size:10px}.meta span{font-weight:700}table{width:100%;border-collapse:collapse;font-size:8px}th{background:#0f172a;color:#fff;text-align:left;padding:7px}td{border-bottom:1px solid #e2e8f0;padding:6px}tr:nth-child(even){background:#f8fafc}footer{margin-top:18px;border-top:1px solid #cbd5e1;padding-top:8px;font-size:8px;color:#64748b}@media print{.no-print{display:none}}</style></head><body><header>${logoUrl ? `<img src="${logoUrl}" alt="School logo">` : ""}<div><h1>${schoolName}</h1><p>${dataset.title}</p></div></header><div class="meta"><span>School code: ${safeCode}</span><span>Generated: ${new Date().toLocaleString("en-GH")}</span><span>Records: ${rows.length - 1}</span></div><h2>Official school export</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><footer>Generated by SukuuNova · ${schoolName} · Keep this document with the school's official records.</footer><script>window.onload=()=>window.print()</script></body></html>`;
        const printWindow = window.open("", "_blank", "noopener,noreferrer");
        if (!printWindow) throw new Error("Your browser blocked the print window. Allow pop-ups for SukuuNova and try again.");
        printWindow.document.write(html); printWindow.document.close();
      }
      setHistory((current) => [{ id, title: dataset.title, format: format.toUpperCase(), at: new Date().toLocaleString("en-GH") }, ...current].slice(0, 12));
      setNotice(`${dataset.title} · ${format === "print" ? "print/PDF" : format.toUpperCase()} prepared successfully.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy("");
    }
  }

  return <div className="space-y-5">
    <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,.18)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">{logoUrl ? <img src={logoUrl} alt="School logo" className="h-16 w-16 rounded-2xl bg-white object-contain p-2" /> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-xl font-black">S</div>}<div><span className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300">Official school export centre</span><h2 className="mt-1 text-2xl font-black">Take your school's data with you.</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">Every output keeps the school identity, dataset name, generation date and filter context visible where the format supports it.</p></div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right"><div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">School</div><div className="mt-1 text-sm font-extrabold">{schoolName}</div><div className="text-[10px] text-slate-400">{schoolCode || "School account"}</div></div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.05)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-base font-black text-slate-900">Export library</h2><p className="mt-1 text-xs text-slate-500">Choose a dataset, then choose exactly how you want to take it out.</p></div><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 md:max-w-xs" placeholder="Search exports…" /></div>
      <div className="mt-5 space-y-4">{filtered.map((dataset) => <article key={dataset.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0"><span className="rounded-full bg-white px-2.5 py-1 text-[8px] font-black uppercase tracking-[.1em] text-slate-500">{dataset.scope}</span><h3 className="mt-2 text-sm font-black text-slate-900">{dataset.title}</h3><p className="mt-1 text-[11px] text-slate-500">{dataset.detail}</p></div><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{outputOptions.map((option) => { const id = `${dataset.key}:${option.key}`; return <button key={option.key} type="button" disabled={busy === id} onClick={() => void exportDataset(dataset, option.key)} className="min-w-[118px] rounded-xl border border-slate-300 bg-white px-3 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"><strong className="block text-[11px] font-black text-slate-900">{busy === id ? "Preparing…" : option.label}</strong><span className="mt-1 block text-[9px] leading-4 text-slate-500">{option.detail}</span></button>; })}</div></div></article>)}</div>
    </section>

    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] font-semibold text-emerald-900">{notice}</div>}

    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.05)]"><h2 className="text-sm font-black text-slate-900">Bulk document packs</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">The next layer is scheduled report packs, class registers, fee statements, payroll packs and archive bundles generated together and stored in the school's secure history.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><strong className="text-[11px] font-black text-slate-900">Class report pack</strong><p className="mt-1 text-[9px] text-slate-500">Generate all learner reports for a class.</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><strong className="text-[11px] font-black text-slate-900">Fee statement pack</strong><p className="mt-1 text-[9px] text-slate-500">Produce statements for selected families.</p></div></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.05)]"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-slate-900">This session's export history</h2><p className="mt-1 text-[11px] text-slate-500">Recent files prepared from this browser session.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600">{history.length}</span></div>{history.length ? <div className="mt-4 divide-y divide-slate-200">{history.map((item) => <div key={`${item.id}-${item.at}`} className="flex items-center justify-between gap-4 py-3"><div><strong className="block text-[10px] font-black text-slate-900">{item.title}</strong><span className="text-[9px] text-slate-500">{item.format} · {item.at}</span></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase text-emerald-700">Prepared</span></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 py-8 text-center text-[10px] text-slate-400">No exports prepared in this session.</div>}</section>
    </div>
  </div>;
}
