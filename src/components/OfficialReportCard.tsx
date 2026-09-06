/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

type Result = {
  subjectId: string;
  subject: string;
  ca: number | null;
  exam: number | null;
  total: number | null;
  grade: string | null;
  position: number | null;
};

type Signature = {
  role: string;
  name: string;
  signatureDataUrl?: string;
};

type Data = {
  reportId: string;
  school: {
    name: string;
    uniqueCode: string;
    logoUrl: string | null;
    brandColors: unknown;
  };
  student: {
    name: string;
    admissionNo: string;
    photoUrl: string | null;
    className: string;
    level: string | null;
  };
  term: {
    name: string;
    academicYear: string;
    startDate: Date | string;
    endDate: Date | string;
  };
  gradingWeights: { ca: number; exam: number };
  results: Result[];
  summary: { total: number | null; average: number | null; grade: string | null };
  position: number | null;
  classSize: number;
  rankedCount: number;
  remarks: string;
  headRemark: string | null;
  attendance: { present: number; late: number; totalRecorded: number };
  promotionDecision: "promoted" | "not_promoted" | "decision_required";
  reportSettings: {
    showOverallPosition: boolean;
    showSubjectPosition: boolean;
    showAttendance: boolean;
    showPromotion: boolean;
    showStudentPhoto: boolean;
    showClassTeacherRemark: boolean;
    showHeadteacherRemark: boolean;
    behaviorRatingFields: unknown;
    promotionRule: string;
    positionPromotionCutoffPercent: number;
  };
  watermark: string;
  classTeacherName: string;
};

const ordinal = (value: number | null) => {
  if (value == null) return "—";
  const mod100 = value % 100;
  return `${value}${mod100 >= 11 && mod100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;
};

const formatNumber = (value: number | null) => (value == null ? "—" : value.toFixed(1));
const formatDate = (value: Date | string) => new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

function brandValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function OfficialReportCard({ data, signatures }: { data: Data; signatures: Signature[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const brand = data.school.brandColors && typeof data.school.brandColors === "object" && !Array.isArray(data.school.brandColors)
    ? data.school.brandColors as Record<string, unknown>
    : {};
  const primary = brandValue(brand.primary, "var(--color-brand)");
  const accent = brandValue(brand.accent, "var(--color-brand-soft)");
  const behavior = Array.isArray(data.reportSettings.behaviorRatingFields)
    ? data.reportSettings.behaviorRatingFields.filter((item): item is string => typeof item === "string")
    : [];
  const promotion = data.promotionDecision === "promoted"
    ? "Promoted to the next class / level."
    : data.promotionDecision === "not_promoted"
      ? "Not promoted under the configured rule."
      : data.summary.average == null
        ? "Decision required"
        : "School decision required";

  return (
    <main className="official-shell">
      <style>{styles}</style>
      <header className="official-toolbar">
        <div>
          <span>OFFICIAL REPORT CARD</span>
          <strong>{data.student.name} · {data.term.name}</strong>
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
          <button type="button" onClick={() => setMenuOpen((open) => !open)}>Options</button>
          {menuOpen ? (
            <div className="option-menu">
              <button type="button" onClick={() => window.print()}>Print current report</button>
            </div>
          ) : null}
        </div>
      </header>

      <article className="paper" style={{ ["--primary" as string]: primary, ["--accent" as string]: accent }}>
        {data.watermark ? <div className="watermark">{data.watermark}</div> : null}

        <header className="school-head">
          <div className="logo">
            {data.school.logoUrl ? <img src={data.school.logoUrl} alt={`${data.school.name} logo`} /> : <span>{data.school.name.slice(0, 1)}</span>}
          </div>
          <div className="school-title">
            <small>OFFICIAL TERMINAL REPORT</small>
            <h1>{data.school.name}</h1>
            <p>Learner&apos;s Academic Report · {data.school.uniqueCode}</p>
          </div>
          {data.reportSettings.showStudentPhoto ? (
            <div className="student-photo">
              {data.student.photoUrl ? <img src={data.student.photoUrl} alt="Student" /> : <span>PHOTO</span>}
            </div>
          ) : null}
        </header>

        <section className="meta">
          {[
            ["Student", data.student.name],
            ["Admission No.", data.student.admissionNo],
            ["Class", data.student.className],
            ["Level", data.student.level ?? "—"],
            ["Academic year", data.term.academicYear],
            ["Term", data.term.name],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
        </section>

        <div className="rule-line">
          <span>ACADEMIC PERFORMANCE</span>
          <b>CA {data.gradingWeights.ca} + EXAM {data.gradingWeights.exam} = 100</b>
        </div>

        <table className="marks">
          <thead>
            <tr>
              <th>Subject</th>
              <th>CA / {data.gradingWeights.ca}</th>
              <th>Exam / {data.gradingWeights.exam}</th>
              <th>Total / 100</th>
              <th>Grade</th>
              {data.reportSettings.showSubjectPosition ? <th>Position</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.results.map((result) => (
              <tr key={result.subjectId}>
                <td>{result.subject}</td>
                <td>{formatNumber(result.ca)}</td>
                <td>{formatNumber(result.exam)}</td>
                <td><strong>{formatNumber(result.total)}</strong></td>
                <td>{result.grade ?? "—"}</td>
                {data.reportSettings.showSubjectPosition ? <td>{ordinal(result.position)}{result.position != null && data.classSize ? ` / ${data.classSize}` : ""}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>

        <section className="totals">
          <div><small>Total marks</small><b>{formatNumber(data.summary.total)} / {data.results.length * 100}</b></div>
          <div><small>Overall average</small><b>{formatNumber(data.summary.average)}%</b></div>
          <div><small>Overall grade</small><b>{data.summary.grade ?? "—"}</b></div>
          {data.reportSettings.showOverallPosition ? <div><small>Class position</small><b>{ordinal(data.position)} / {data.classSize}</b></div> : null}
        </section>

        {data.reportSettings.showAttendance || data.reportSettings.showPromotion ? (
          <section className="info-grid">
            {data.reportSettings.showAttendance ? (
              <div><small>Attendance</small><b>{data.attendance.present} present · {data.attendance.late} late · {data.attendance.totalRecorded} recorded days.</b></div>
            ) : null}
            {data.reportSettings.showPromotion ? <div><small>Promotion</small><b>{promotion}</b></div> : null}
          </section>
        ) : null}

        {behavior.length ? (
          <section className="remarks">
            <div className="section-label">BEHAVIOUR / CONDUCT</div>
            <div className="behavior">
              {behavior.map((field) => <div key={field}><small>{field}</small><span>________________</span></div>)}
            </div>
          </section>
        ) : null}

        {data.reportSettings.showClassTeacherRemark ? (
          <section className="remarks">
            <div className="section-label">CLASS TEACHER&apos;S REMARK</div>
            <p>{data.remarks || "—"}</p>
          </section>
        ) : null}
        {data.reportSettings.showHeadteacherRemark ? (
          <section className="remarks">
            <div className="section-label">HEADTEACHER&apos;S REMARK</div>
            <p>{data.headRemark || "—"}</p>
          </section>
        ) : null}

        <section className="signatures">
          {signatures.slice(0, 4).map((signature, index) => (
            <div key={`${signature.role}-${index}`}>
              <div className="sig-space">{signature.signatureDataUrl ? <img src={signature.signatureDataUrl} alt="Signature" /> : null}</div>
              <strong>{signature.name || signature.role}</strong>
              <small>{signature.role}</small>
            </div>
          ))}
          {!signatures.length ? (
            <>
              <div><div className="sig-space" /><strong>{data.classTeacherName}</strong><small>Class Teacher</small></div>
              <div><div className="sig-space" /><strong>Headteacher</strong><small>Headteacher</small></div>
            </>
          ) : null}
        </section>

        <footer>
          <span>Report period: {formatDate(data.term.startDate)} — {formatDate(data.term.endDate)}</span>
          <span>Issued through SukuuNova</span>
        </footer>
      </article>
    </main>
  );
}

const styles = `
.official-shell{min-height:100vh;background:var(--color-bg);padding:var(--space-4);font-family:var(--sn-font-family);color:var(--color-text-primary)}
.official-toolbar{max-width:980px;margin:0 auto var(--space-3);display:flex;justify-content:space-between;gap:var(--space-3);align-items:center}
.official-toolbar span{display:block;font-size:var(--sn-font-2xs);font-weight:900;letter-spacing:.14em;color:var(--color-text-muted)}
.official-toolbar strong{display:block;margin-top:var(--space-1);font-size:var(--sn-font-sm)}
.toolbar-actions{display:flex;gap:var(--space-2);position:relative}
.toolbar-actions button{border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-primary);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3);font-size:var(--sn-font-2xs);font-weight:900;cursor:pointer}
.option-menu{position:absolute;top:calc(100% + var(--space-1));right:0;z-index:5;padding:var(--space-1);border-radius:var(--radius-md);background:var(--color-surface-raised);border:1px solid var(--color-border);box-shadow:var(--shadow-lg)}
.option-menu button{white-space:nowrap;border:0}
.paper{--primary:var(--color-brand);--accent:var(--color-brand-soft);position:relative;overflow:hidden;max-width:980px;min-height:1360px;margin:0 auto;background:var(--color-surface);border:1px solid var(--color-border);box-shadow:var(--shadow-xl);padding:var(--space-12)}
.watermark{position:absolute;inset:0;display:grid;place-items:center;font-size:var(--sn-font-5xl);font-weight:900;color:var(--primary);opacity:.04;transform:rotate(-25deg);pointer-events:none}
.school-head{display:grid;grid-template-columns:86px 1fr 86px;gap:var(--space-4);align-items:center;padding-bottom:var(--space-3);border-bottom:3px solid var(--primary)}
.logo,.student-photo{width:82px;height:82px;border:1px solid var(--color-border);border-radius:var(--radius-md);display:grid;place-items:center;overflow:hidden;background:var(--accent)}
.logo img,.student-photo img{width:100%;height:100%;object-fit:contain}.logo span{font-size:var(--sn-font-2xl);font-weight:950;color:var(--primary)}
.student-photo img{object-fit:cover}.student-photo span{font-size:var(--sn-font-2xs);font-weight:900;color:var(--color-text-muted)}
.school-title{text-align:center}.school-title small{font-size:var(--sn-font-2xs);font-weight:900;letter-spacing:.15em;color:var(--primary)}
.school-title h1{margin:var(--space-1) 0;font:700 var(--sn-font-2xl) Georgia,serif}.school-title p{margin:0;font-size:var(--sn-font-2xs);color:var(--color-text-muted)}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-2);margin:var(--space-4) 0}.meta div{padding:var(--space-2);border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface-soft)}
.meta small,.totals small,.info-grid small,.remarks small{display:block;font-size:var(--sn-font-2xs);letter-spacing:.1em;text-transform:uppercase;color:var(--color-text-muted);font-weight:900}.meta b{display:block;margin-top:var(--space-1);font-size:var(--sn-font-xs)}
.rule-line{display:flex;justify-content:space-between;gap:var(--space-3);align-items:center;margin:var(--space-3) 0 var(--space-2);color:var(--primary);font-size:var(--sn-font-2xs);font-weight:900;letter-spacing:.12em}.rule-line b{font-size:var(--sn-font-2xs);letter-spacing:.05em}
.marks{width:100%;border-collapse:collapse;font-size:var(--sn-font-xs)}.marks th,.marks td{border:1px solid var(--color-border);padding:var(--space-2)}.marks th{background:var(--accent);color:var(--color-text-secondary);font-size:var(--sn-font-2xs);text-transform:uppercase;letter-spacing:.06em}
.marks th:first-child,.marks td:first-child{text-align:left}.marks th:not(:first-child),.marks td:not(:first-child){text-align:center}
.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-2);margin-top:var(--space-3)}.totals div,.info-grid div{border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-3);background:var(--color-surface-soft)}.totals b{display:block;margin-top:var(--space-1);font-size:var(--sn-font-sm)}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-top:var(--space-2)}.info-grid b{display:block;margin-top:var(--space-1);font-size:var(--sn-font-xs);line-height:1.45}
.remarks{margin-top:var(--space-3)}.section-label{font-size:var(--sn-font-2xs);font-weight:900;letter-spacing:.12em;color:var(--primary);margin-bottom:var(--space-1)}
.remarks p{margin:0;min-height:42px;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-2);font-size:var(--sn-font-xs);line-height:1.6}.behavior{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-2)}
.behavior div{border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-2)}.behavior span{display:block;margin-top:var(--space-1);font-size:var(--sn-font-xs);color:var(--color-text-muted)}
.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-top:var(--space-6)}.signatures>div{min-height:88px;text-align:center}.sig-space{height:42px;border-bottom:1px solid var(--color-border-strong);display:flex;align-items:flex-end;justify-content:center}.sig-space img{max-width:100%;max-height:42px;object-fit:contain}
.signatures strong{display:block;margin-top:var(--space-1);font-size:var(--sn-font-2xs)}.signatures small{display:block;margin-top:var(--space-1);font-size:var(--sn-font-2xs);color:var(--color-text-muted)}
footer{display:flex;justify-content:space-between;gap:var(--space-3);border-top:1px solid var(--color-border);margin-top:var(--space-6);padding-top:var(--space-2);color:var(--color-text-muted);font-size:var(--sn-font-2xs)}
@media(max-width:700px){.official-shell{padding:var(--space-2)}.official-toolbar{flex-direction:column;align-items:stretch}.toolbar-actions button{flex:1}.paper{padding:var(--space-5);min-height:auto}.school-head{grid-template-columns:58px 1fr 58px;gap:var(--space-2)}.logo,.student-photo{width:56px;height:56px}.school-title h1{font-size:var(--sn-font-lg)}.meta{grid-template-columns:1fr 1fr}.totals{grid-template-columns:1fr 1fr}.info-grid{grid-template-columns:1fr}.behavior{grid-template-columns:1fr}.signatures{grid-template-columns:1fr 1fr}}
@media print{.official-shell{padding:0;background:var(--color-surface)}.official-toolbar{display:none}.paper{box-shadow:none;border:0;max-width:none;min-height:auto;padding:16mm;margin:0}.option-menu{display:none}.marks{break-inside:auto}}
`;
