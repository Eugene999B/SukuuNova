"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type GradeBand = { grade?: string; min?: number; max?: number; remark?: string; label?: string };
type SubjectRow = {
  subject: string;
  ca: number | null;
  exam: number | null;
  total: number;
};
type Data = {
  school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown };
  student: { name: string; admissionNo: string; className: string; level: string | null; photoUrl: string | null };
  term: { name: string; startDate: string; endDate: string; nextTermStartDate: string | null };
  results: SubjectRow[];
  gradingScale: GradeBand[];
  attendance: { present: number; late: number; totalRecorded: number };
  position: number | null;
  classSize: number;
  remarks: string;
  classTeacherName: string;
};

type Style = "classic" | "modern" | "formal";

const styles: { id: Style; name: string; description: string }[] = [
  { id: "classic", name: "Ghana Classic", description: "Formal terminal-report layout with strong school identity." },
  { id: "modern", name: "Modern School", description: "Cleaner hierarchy with a contemporary, highly legible table." },
  { id: "formal", name: "Official Formal", description: "Traditional letterhead feel with restrained colour and rules." }
];

function color(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function asDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function gradeFor(total: number, scale: GradeBand[]) {
  const band = scale.find((item) => typeof item.min === "number" && typeof item.max === "number" && total >= item.min! && total <= item.max!);
  return { grade: band?.grade ?? "—", remark: band?.remark ?? band?.label ?? "" };
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report-card";
}

export default function ReportCardPrintStudio({ data }: { data: Data }) {
  const [style, setStyle] = useState<Style>("classic");
  const brand = data.school.brandColors && typeof data.school.brandColors === "object" && !Array.isArray(data.school.brandColors)
    ? data.school.brandColors as Record<string, unknown>
    : {};
  const primary = color(brand.primary, "#164e63");
  const accent = color(brand.accent, "#dcefeb");
  const total = useMemo(() => data.results.reduce((sum, row) => sum + row.total, 0), [data.results]);
  const average = data.results.length ? total / data.results.length : 0;
  const studentGrade = gradeFor(average, data.gradingScale);

  const print = () => window.print();
  const downloadHtml = () => {
    const root = document.querySelector(".ghana-report-paper");
    if (!root) return;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${data.school.name} - ${data.student.name} Report Card</title><style>${document.querySelector("style[data-report-card-print]")?.textContent ?? ""}</style></head><body><main class="report-export">${root.outerHTML}</main></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(data.student.name)}-${safeFileName(data.term.name)}-report-card.html`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className={`report-card-studio style-${style}`} style={{ ["--report-primary" as string]: primary, ["--report-accent" as string]: accent }}>
      <style data-report-card-print>{`
        :root{--report-primary:${primary};--report-accent:${accent};--report-ink:#1b2528;--report-muted:#667477;--report-border:#b9c4c5;--report-soft:#f4f6f4}
        .report-card-studio{min-height:100vh;background:#10191d;color:#eaf3f1;padding:28px}
        .studio-bar{max-width:1240px;margin:0 auto 18px;display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.studio-title small{font-size:9px;letter-spacing:.17em;font-weight:900;color:#82a19d}.studio-title h1{margin:5px 0 6px;font-size:27px;letter-spacing:-.035em}.studio-title p{margin:0;color:#829795;font-size:11px;line-height:1.6;max-width:760px}.studio-controls{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}.studio-controls button{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#aac0bd;border-radius:10px;padding:9px 11px;font-size:8px;font-weight:850}.studio-controls button.active,.studio-controls button.primary{background:var(--report-primary);border-color:var(--report-primary);color:#fff}.studio-controls button.primary{padding-inline:15px}.style-picker{max-width:1240px;margin:0 auto 18px;display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.style-card{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035);border-radius:13px;padding:12px;text-align:left;color:#9eb3b2}.style-card.active{border-color:var(--report-primary);box-shadow:0 0 0 1px var(--report-primary) inset}.style-card strong{display:block;color:#dce9e7;font-size:10px}.style-card span{display:block;margin-top:4px;font-size:8px;line-height:1.45;color:#6e8785}.paper-stage{max-width:1240px;margin:0 auto;padding:18px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.025);overflow:auto}.stage-label{font-size:8px;letter-spacing:.16em;font-weight:900;color:#70908b;margin:0 0 10px;text-transform:uppercase}.paper-frame{background:#dce1df;padding:24px;min-width:760px}.ghana-report-paper{width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:var(--report-ink);padding:14mm;box-shadow:0 12px 35px rgba(0,0,0,.2);font-family:Arial,Helvetica,sans-serif}.report-export .ghana-report-paper{box-shadow:none;margin:0 auto}.school-head{display:grid;grid-template-columns:78px 1fr 92px;gap:14px;align-items:center}.school-logo{width:76px;height:76px;border:1px solid var(--report-border);display:grid;place-items:center;overflow:hidden;background:#fff}.school-logo img{width:100%;height:100%;object-fit:contain}.school-logo.empty:after{content:"SCHOOL CREST";font-size:7px;color:#7d8b8c;text-align:center}.school-copy{text-align:center}.school-copy .kicker{font-size:8px;letter-spacing:.18em;font-weight:900;text-transform:uppercase;color:var(--report-primary)}.school-copy h2{font-family:Georgia,"Times New Roman",serif;margin:3px 0 2px;font-size:20px;line-height:1.05}.school-copy h3{margin:0;font-size:12px;letter-spacing:.09em;text-transform:uppercase}.school-copy .subline{margin-top:4px;font-size:8px;color:var(--report-muted)}.report-title{text-align:center;margin:12px 0 10px}.report-title span{display:inline-block;padding:5px 12px;border:1.5px solid var(--report-primary);font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.style-modern .school-copy h2{font-family:Arial,Helvetica,sans-serif}.style-modern .report-title span{border-radius:999px;background:var(--report-primary);color:white}.style-formal .ghana-report-paper{border:1px solid #777;padding:12mm}.style-formal .school-copy h2{font-family:Georgia,"Times New Roman",serif;font-size:19px}.style-formal .report-title span{border-width:2px}.student-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr 72px;gap:0;border:1px solid var(--report-border);margin-top:8px}.student-cell{padding:7px 8px;border-right:1px solid var(--report-border);border-bottom:1px solid var(--report-border);min-height:35px}.student-cell:nth-last-child(-n+4){border-bottom:0}.student-cell:last-child{border-right:0}.student-cell label{display:block;font-size:6.5px;text-transform:uppercase;letter-spacing:.11em;font-weight:900;color:#687678;margin-bottom:3px}.student-cell strong{font-size:9px}.photo-cell{grid-row:span 2;display:grid;place-items:center;padding:5px;border-right:0}.photo-cell img{width:60px;height:70px;object-fit:cover;border:1px solid var(--report-border)}.photo-cell span{font-size:6px;color:#7a8585;text-align:center}.section-head{margin-top:11px;background:var(--report-primary);color:#fff;padding:6px 8px;font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.style-modern .section-head{border-radius:6px}.style-formal .section-head{background:#fff;color:var(--report-primary);border-top:1.5px solid var(--report-primary);border-bottom:1.5px solid var(--report-primary)}table{width:100%;border-collapse:collapse}th,td{border:1px solid var(--report-border);padding:5px 6px;font-size:7.5px}th{background:var(--report-soft);font-size:6.5px;text-transform:uppercase;letter-spacing:.08em;text-align:center}.subject-col{text-align:left;width:31%}.num{text-align:center}.result-remark{text-align:left}.style-modern th{background:rgba(0,0,0,.035);border-bottom:2px solid var(--report-primary)}.style-formal th{background:#fff}.summary-row td{font-weight:900;background:#f7f8f7}.summary-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:7px}.summary-item{border:1px solid var(--report-border);padding:6px 7px}.summary-item label{display:block;font-size:6px;letter-spacing:.1em;text-transform:uppercase;color:#718082;font-weight:900}.summary-item strong{display:block;margin-top:2px;font-size:10px}.pastoral-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.box{border:1px solid var(--report-border);min-height:58px}.box h4{margin:0;padding:5px 7px;background:var(--report-soft);font-size:7px;letter-spacing:.08em;text-transform:uppercase}.box p{margin:7px;font-size:8px;line-height:1.5;min-height:28px}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px}.signature-box{padding-top:30px;border-bottom:1px solid #667477;font-size:7px}.signature-label{font-size:6.5px;color:#657274;margin-top:4px;text-transform:uppercase;letter-spacing:.1em}.footer-note{margin-top:10px;padding-top:7px;border-top:1px solid var(--report-border);display:flex;justify-content:space-between;gap:12px;font-size:6.5px;color:#6c7879}.watermark{margin-top:4px;text-align:center;font-size:6.5px;letter-spacing:.12em;color:var(--report-primary);opacity:.55}
        @page{size:A4;margin:0}.report-card-studio,.report-card-studio *{box-sizing:border-box}@media(max-width:900px){.report-card-studio{padding:14px}.studio-bar{flex-direction:column}.studio-controls{justify-content:flex-start}.style-picker{grid-template-columns:1fr}.paper-stage{padding:8px}.paper-frame{padding:10px}.ghana-report-paper{transform-origin:top left}}@media print{body{background:#fff!important}.report-card-studio{padding:0!important;background:#fff!important;min-height:0}.studio-bar,.style-picker,.stage-label,.paper-stage{display:block}.studio-bar,.style-picker,.stage-label{display:none!important}.paper-stage{border:0!important;padding:0!important;overflow:visible!important;background:#fff!important}.paper-frame{padding:0!important;min-width:0!important;background:#fff!important}.ghana-report-paper{box-shadow:none!important;margin:0!important;width:210mm!important;min-height:297mm!important;padding:14mm!important}.report-card-studio.style-formal .ghana-report-paper{padding:12mm!important}}
      `}</style>

      <section className="studio-bar">
        <div className="studio-title">
          <small>ACADEMICS / REPORT CARD PRINT STUDIO</small>
          <h1>Ghanaian terminal report, built for your school.</h1>
          <p>Preview the official A4 report before printing. The document uses the school identity, configured grading scale and verified academic results; presentation changes never change the marks.</p>
        </div>
        <div className="studio-controls">
          <button type="button" onClick={print} className="primary">Print / Save PDF</button>
          <button type="button" onClick={downloadHtml}>Export HTML</button>
          <Link href="/school/report-cards" style={{ display: "inline-flex", alignItems: "center", padding: "9px 11px", borderRadius: 10, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", textDecoration: "none", color: "#aac0bd", fontSize: 8, fontWeight: 850 }}>← Report cards</Link>
        </div>
      </section>

      <section className="style-picker" aria-label="Report card style">
        {styles.map((item) => (
          <button key={item.id} type="button" className={`style-card ${style === item.id ? "active" : ""}`} onClick={() => setStyle(item.id)}>
            <strong>{item.name}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </section>

      <section className="paper-stage">
        <p className="stage-label">Live A4 preview</p>
        <div className="paper-frame">
          <article className="ghana-report-paper">
            <header className="school-head">
              <div className={`school-logo ${data.school.logoUrl ? "" : "empty"}`}>
                {data.school.logoUrl ? <img src={data.school.logoUrl} alt={`${data.school.name} crest`} /> : null}
              </div>
              <div className="school-copy">
                <div className="kicker">Official terminal report</div>
                <h2>{data.school.name}</h2>
                <h3>Learner's Terminal Report</h3>
                <div className="subline">School Code: {data.school.uniqueCode} · Academic record generated by SukuuNova</div>
              </div>
              <div />
            </header>

            <div className="report-title"><span>{data.term.name} · {asDate(data.term.endDate)}</span></div>

            <section className="student-grid">
              <div className="student-cell"><label>Learner's Name</label><strong>{data.student.name}</strong></div>
              <div className="student-cell"><label>Class / Form</label><strong>{data.student.className}</strong></div>
              <div className="student-cell"><label>Level</label><strong>{data.student.level ?? "—"}</strong></div>
              <div className="student-cell photo-cell">
                {data.student.photoUrl ? <img src={data.student.photoUrl} alt="Learner" /> : <span>No photo</span>}
              </div>
              <div className="student-cell"><label>Admission No.</label><strong>{data.student.admissionNo}</strong></div>
              <div className="student-cell"><label>Term</label><strong>{data.term.name}</strong></div>
              <div className="student-cell"><label>Position in Class</label><strong>{data.position ? `${data.position} / ${data.classSize}` : "—"}</strong></div>
            </section>

            <div className="section-head">Academic Performance</div>
            <table>
              <thead>
                <tr>
                  <th className="subject-col">Subjects</th>
                  <th>SBA / CA<br />40%</th>
                  <th>Exam<br />60%</th>
                  <th>Total<br />100%</th>
                  <th>Grade</th>
                  <th className="result-remark">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((row) => {
                  const grade = gradeFor(row.total, data.gradingScale);
                  return <tr key={row.subject}>
                    <td className="subject-col">{row.subject}</td>
                    <td className="num">{row.ca === null ? "—" : row.ca.toFixed(1)}</td>
                    <td className="num">{row.exam === null ? "—" : row.exam.toFixed(1)}</td>
                    <td className="num"><strong>{row.total.toFixed(1)}</strong></td>
                    <td className="num"><strong>{grade.grade}</strong></td>
                    <td className="result-remark">{grade.remark || "—"}</td>
                  </tr>;
                })}
                <tr className="summary-row">
                  <td className="subject-col">Overall</td><td colSpan={2} className="num">Average</td><td className="num">{average.toFixed(1)}</td><td className="num">{studentGrade.grade}</td><td>{studentGrade.remark || "—"}</td>
                </tr>
              </tbody>
            </table>

            <div className="summary-strip">
              <div className="summary-item"><label>Attendance</label><strong>{data.attendance.present} / {data.attendance.totalRecorded || "—"}</strong></div>
              <div className="summary-item"><label>Late Days</label><strong>{data.attendance.late}</strong></div>
              <div className="summary-item"><label>Position</label><strong>{data.position ? `${data.position} / ${data.classSize}` : "—"}</strong></div>
              <div className="summary-item"><label>Next Term Begins</label><strong>{data.term.nextTermStartDate ? asDate(data.term.nextTermStartDate) : "To be announced"}</strong></div>
            </div>

            <div className="section-head">Learner Development</div>
            <section className="pastoral-grid">
              <div className="box"><h4>Conduct / Attitude</h4><p>Respectful, cooperative and ready to improve.</p></div>
              <div className="box"><h4>Talents & Interests</h4><p>................................................................................................</p></div>
              <div className="box"><h4>Class Teacher's Remarks</h4><p>{data.remarks || "................................................................................................"}</p></div>
              <div className="box"><h4>Promotion / Progress</h4><p>Progress recorded for the next academic period.</p></div>
            </section>

            <div className="signature-grid">
              <div><div className="signature-box"></div><div className="signature-label">Class Teacher: {data.classTeacherName}</div></div>
              <div><div className="signature-box"></div><div className="signature-label">Headteacher / Headmistress</div></div>
            </div>

            <footer className="footer-note">
              <span>Term: {data.term.name} · Closed: {asDate(data.term.endDate)}</span>
              <span>School Code: {data.school.uniqueCode}</span>
            </footer>
            <div className="watermark">{data.school.name} · {data.term.name} · Official learner report</div>
          </article>
        </div>
      </section>
    </main>
  );
}
