"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Result = { subject: string; ca: number | null; exam: number | null; total: number; position: number | null };
type ReportSettings = { showOverallPosition: boolean; positionScope: "class" | "year_group"; remarkSource: "grade_band" | "position_band"; positionBandLabels: unknown; behaviorRatingFields: unknown; promotionRule: "manual" | "pass_mark" | "overall_position" };
type Data = {
  school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown };
  student: { name: string; admissionNo: string; className: string; level: string | null; photoUrl: string | null };
  term: { name: string; startDate: string; endDate: string; nextTermStartDate: string | null };
  results: Result[];
  gradingScale: Array<{ min?: number; max?: number; grade?: string; remark?: string; label?: string }>;
  attendance: { present: number; late: number; totalRecorded: number };
  position: number | null;
  classSize: number;
  remarks: string;
  classTeacherName: string;
  reportSettings: ReportSettings;
};

type Style = "classic" | "modern" | "formal";

function hex(value: unknown, fallback: string) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—"; }
function ordinal(value: number | null) { if (value == null) return "—"; const mod100 = value % 100; if (mod100 >= 11 && mod100 <= 13) return `${value}th`; const mod10 = value % 10; return `${value}${mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th"}`; }
function safe(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report-card"; }
function parseBehavior(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function parsePositionBands(value: unknown) { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }

export default function ReportCardPrintStudioV2({ data }: { data: Data }) {
  const [style, setStyle] = useState<Style>("classic");
  const primary = hex((data.school.brandColors as Record<string, unknown> | null)?.primary, "#164e63");
  const accent = hex((data.school.brandColors as Record<string, unknown> | null)?.accent, "#dcefeb");
  const total = useMemo(() => data.results.reduce((sum, row) => sum + row.total, 0), [data.results]);
  const average = data.results.length ? total / data.results.length : 0;
  const grade = data.gradingScale.find((band) => typeof band.min === "number" && typeof band.max === "number" && average >= band.min && average <= band.max);
  const behavior = parseBehavior(data.reportSettings.behaviorRatingFields);
  const positionBands = parsePositionBands(data.reportSettings.positionBandLabels);
  const filename = `${safe(data.school.uniqueCode)}-report-card-${safe(data.student.admissionNo)}-${safe(data.term.name)}-${new Date().toISOString().slice(0,10)}`;
  const downloadHtml = () => {
    const root = document.querySelector(".report-paper-v2");
    if (!root) return;
    const css = document.querySelector("style[data-report-card-v2]")?.textContent ?? "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${data.school.name} - ${data.student.name}</title><style>${css}</style></head><body><main class="export-v2">${root.outerHTML}</main></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${filename}.html`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <main className={`report-v2 style-${style}`} style={{ ["--primary" as string]: primary, ["--accent" as string]: accent }}>
    <style data-report-card-v2>{`
      :root{--primary:${primary};--accent:${accent};--ink:#172426;--muted:#67787b;--line:#b9c4c4;--soft:#f3f6f4}.report-v2{min-height:100vh;background:#0e171a;color:#e8f0ee;padding:26px;font-family:Arial,Helvetica,sans-serif}.v2-toolbar{max-width:1180px;margin:0 auto 16px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.v2-toolbar h1{margin:4px 0;font-size:26px;letter-spacing:-.035em}.v2-toolbar p{margin:0;color:#829593;font-size:10px;line-height:1.6}.v2-actions,.v2-styles{display:flex;flex-wrap:wrap;gap:7px}.v2-actions button,.v2-actions a,.v2-styles button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#abc0bc;border-radius:9px;padding:9px 11px;font-size:8px;font-weight:900;text-decoration:none}.v2-actions .primary,.v2-styles .active{background:var(--primary);color:#fff;border-color:var(--primary)}.v2-styles{max-width:1180px;margin:0 auto 15px}.paper-wrap-v2{max-width:1180px;margin:0 auto;padding:12px;background:#d9dfdd;border-radius:15px;overflow:auto}.report-paper-v2{width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:var(--ink);padding:13mm;box-shadow:0 14px 38px rgba(0,0,0,.2)}.school-header-v2{display:grid;grid-template-columns:72px 1fr 110px;gap:13px;align-items:center}.logo-v2{width:70px;height:70px;border:1px solid var(--line);display:grid;place-items:center;overflow:hidden}.logo-v2 img{width:100%;height:100%;object-fit:contain}.school-copy-v2{text-align:center}.school-copy-v2 .kicker{font-size:7px;letter-spacing:.18em;color:var(--primary);font-weight:900;text-transform:uppercase}.school-copy-v2 h2{margin:4px 0 2px;font:700 20px Georgia,"Times New Roman",serif}.school-copy-v2 h3{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase}.school-meta-v2{margin-top:4px;font-size:7px;color:var(--muted)}.title-v2{text-align:center;margin:12px 0}.title-v2 span{display:inline-block;border:1.5px solid var(--primary);padding:5px 12px;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.style-modern .school-copy-v2 h2{font-family:Arial,Helvetica,sans-serif}.style-modern .title-v2 span{border-radius:999px;background:var(--primary);color:#fff}.style-formal .report-paper-v2{border:1px solid #777}.info-grid-v2{display:grid;grid-template-columns:1.1fr 1fr 1fr 66px;border:1px solid var(--line)}.info-cell{padding:6px 7px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);min-height:30px}.info-cell:nth-child(3n){border-right:0}.info-cell label{display:block;font-size:6px;text-transform:uppercase;letter-spacing:.11em;color:var(--muted);font-weight:900}.info-cell strong{display:block;margin-top:2px;font-size:8px}.photo{grid-row:span 2;display:grid;place-items:center}.photo img{width:54px;height:64px;object-fit:cover}.section-v2{margin-top:10px;background:var(--primary);color:#fff;padding:6px 7px;font-size:7px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.style-formal .section-v2{background:#fff;color:var(--primary);border-top:1px solid var(--primary);border-bottom:1px solid var(--primary)}table{width:100%;border-collapse:collapse}.results-table th,.results-table td{border:1px solid var(--line);padding:5px;font-size:7px}.results-table th{background:var(--soft);font-size:6px;text-transform:uppercase;letter-spacing:.08em}.results-table .subject{text-align:left}.num{text-align:center}.summary-v2{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:7px}.summary-item-v2{border:1px solid var(--line);padding:6px}.summary-item-v2 label{display:block;font-size:6px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:900}.summary-item-v2 strong{display:block;margin-top:2px;font-size:10px}.boxes-v2{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.box-v2{border:1px solid var(--line);min-height:62px}.box-v2 h4{margin:0;padding:5px 6px;background:var(--soft);font-size:6px;text-transform:uppercase;letter-spacing:.1em}.box-v2 p{margin:6px;font-size:8px;line-height:1.45}.sign-v2{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:17px}.sign-v2 div{padding-top:28px;border-bottom:1px solid #6a7778;font-size:6px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}.footer-v2{margin-top:10px;border-top:1px solid var(--line);padding-top:6px;display:flex;justify-content:space-between;font-size:6px;color:var(--muted)}.watermark-v2{text-align:center;color:var(--primary);opacity:.5;font-size:6px;letter-spacing:.12em;margin-top:4px}.export-v2{background:#fff}.export-v2 .report-paper-v2{box-shadow:none;margin:0}@media print{body{background:#fff!important}.report-v2{padding:0;background:#fff;color:#111}.v2-toolbar,.v2-styles{display:none!important}.paper-wrap-v2{padding:0;background:#fff;overflow:visible}.report-paper-v2{box-shadow:none;margin:0;width:210mm;min-height:297mm;padding:13mm}}@media(max-width:900px){.report-v2{padding:12px}.v2-toolbar{flex-direction:column}.report-paper-v2{transform-origin:top left}.paper-wrap-v2{padding:6px}}
    `}</style>
    <section className="v2-toolbar"><div><small style={{letterSpacing:".15em",fontWeight:900,color:"#7f9994",fontSize:8}}>ACADEMICS / REPORT CARD PRINT STUDIO</small><h1>Official report card</h1><p>{data.school.name} · {data.student.name} · {data.term.name}</p></div><div className="v2-actions"><button className="primary" onClick={() => window.print()}>Print / Save PDF</button><button onClick={downloadHtml}>Export HTML</button><Link href="/school/report-cards">← Report cards</Link></div></section>
    <section className="v2-styles" aria-label="Report card style"><button className={style==="classic"?"active":""} onClick={() => setStyle("classic")}>Ghana Classic</button><button className={style==="modern"?"active":""} onClick={() => setStyle("modern")}>Modern School</button><button className={style==="formal"?"active":""} onClick={() => setStyle("formal")}>Official Formal</button></section>
    <section className="paper-wrap-v2"><article className="report-paper-v2">
      <header className="school-header-v2"><div className="logo-v2">{data.school.logoUrl ? <img src={data.school.logoUrl} alt={`${data.school.name} crest`} /> : <span style={{fontSize:7,color:"#788789"}}>SCHOOL CREST</span>}</div><div className="school-copy-v2"><div className="kicker">Official terminal report</div><h2>{data.school.name}</h2><h3>Learner's Terminal Report</h3><div className="school-meta-v2">School Code: {data.school.uniqueCode} · Issued by SukuuNova</div></div><div /></header>
      <div className="title-v2"><span>{data.term.name} · {dateLabel(data.term.endDate)}</span></div>
      <section className="info-grid-v2"><div className="info-cell"><label>Learner</label><strong>{data.student.name}</strong></div><div className="info-cell"><label>Class / Form</label><strong>{data.student.className}</strong></div><div className="info-cell"><label>Admission No.</label><strong>{data.student.admissionNo}</strong></div><div className="info-cell photo">{data.student.photoUrl ? <img src={data.student.photoUrl} alt="Learner" /> : null}</div><div className="info-cell"><label>Level</label><strong>{data.student.level ?? "—"}</strong></div><div className="info-cell"><label>Next Term</label><strong>{dateLabel(data.term.nextTermStartDate)}</strong></div></section>
      <div className="section-v2">Academic performance</div>
      <table className="results-table"><thead><tr><th className="subject">Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Position</th></tr></thead><tbody>{data.results.map((row) => <tr key={row.subject}><td className="subject">{row.subject}</td><td className="num">{row.ca == null ? "—" : row.ca.toFixed(1)}</td><td className="num">{row.exam == null ? "—" : row.exam.toFixed(1)}</td><td className="num"><strong>{row.total.toFixed(1)}</strong></td><td className="num">{ordinal(row.position)}</td></tr>)}</tbody></table>
      <div className="summary-v2"><div className="summary-item-v2"><label>Total</label><strong>{total.toFixed(1)}</strong></div><div className="summary-item-v2"><label>Average</label><strong>{average.toFixed(1)}%</strong></div><div className="summary-item-v2"><label>Grade</label><strong>{grade?.grade ?? "—"}</strong></div><div className="summary-item-v2"><label>{data.reportSettings.showOverallPosition ? `Overall position · ${data.reportSettings.positionScope === "year_group" ? "Year group" : "Class"}` : "Overall position"}</label><strong>{data.reportSettings.showOverallPosition ? `${ordinal(data.position)} / ${data.classSize}` : "Not shown"}</strong></div></div>
      <div className="section-v2">Attendance & progression</div>
      <div className="boxes-v2"><div className="box-v2"><h4>Attendance</h4><p>{data.attendance.present} day(s) present · {data.attendance.late} late · {data.attendance.totalRecorded} day(s) recorded.</p></div><div className="box-v2"><h4>Promotion</h4><p>{data.reportSettings.promotionRule === "manual" ? "Promotion decision: manual school decision." : data.reportSettings.promotionRule === "pass_mark" ? "Promotion decision follows the configured pass-mark rule." : "Promotion decision follows the configured overall-position rule."}</p></div></div>
      {behavior.length ? <><div className="section-v2">Behaviour / conduct</div><div className="boxes-v2">{behavior.map((field) => <div className="box-v2" key={field}><h4>{field}</h4><p>________________________________</p></div>)}</div></> : null}
      {data.reportSettings.remarkSource === "position_band" && positionBands.length ? <><div className="section-v2">Position-based remark guide</div><div className="boxes-v2">{positionBands.slice(0,4).map((band, index) => <div className="box-v2" key={index}><h4>{String(band.label ?? band.name ?? `Band ${index+1}`)}</h4><p>{String(band.remark ?? band.description ?? "")}</p></div>)}</div></> : null}
      <div className="section-v2">Teacher's remark</div><div className="box-v2" style={{minHeight:70}}><p>{data.remarks || (grade?.remark ?? grade?.label ?? "—")}</p></div>
      <div className="sign-v2"><div>{data.classTeacherName}<br/>Class Teacher</div><div>Head of Academics<br/>Signature / Date</div><div>Principal<br/>Signature / Date</div></div>
      <div className="watermark-v2">{data.school.name} · {data.school.uniqueCode}</div>
      <div className="footer-v2"><span>Next term begins: {dateLabel(data.term.nextTermStartDate)}</span><span>Official filename: {filename}.pdf</span></div>
    </article></section>
  </main>;
}
