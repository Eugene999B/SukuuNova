/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { reportCardThemeById } from "@/lib/report-card-themes";

type Result = {
  subjectId: string;
  subject: string;
  ca: number | null;
  exam: number | null;
  total: number | null;
  grade: string | null;
  position: number | null;
};

type GradeBand = { min: number; max: number; grade: string; label?: string; remark?: string };

type Signature = {
  role: string;
  name: string;
  signatureDataUrl?: string;
};

type Attendance = {
  present: number;
  late: number;
  totalRecorded: number;
  expectedDays?: number;
  absent?: number;
  attendanceRate?: number | null;
};

type Data = {
  reportId: string;
  status?: string;
  school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown };
  student: { name: string; admissionNo: string; photoUrl: string | null; className: string; level: string | null };
  term: { name: string; academicYear: string; startDate: Date | string; endDate: Date | string };
  gradingWeights: { ca: number; exam: number };
  gradingScale?: GradeBand[];
  results: Result[];
  summary: { total: number | null; average: number | null; grade: string | null };
  position: number | null;
  classSize: number;
  rankedCount: number;
  remarks: string;
  headRemark: string | null;
  attendance: Attendance;
  promotionDecision: "promoted" | "not_promoted" | "decision_required";
  reportSettings: {
    themeId: string;
    positionScope: "class" | "year_group";
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
const formatNumber = (value: number | null) => value == null ? "—" : value.toFixed(1);
const formatDate = (value: Date | string) => new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "ST";

function gradeDescriptor(total: number | null, grade: string | null, scale: GradeBand[] | undefined) {
  if (total == null || !scale?.length) return null;
  const band = scale.find((item) => total >= item.min && total <= item.max && (!grade || item.grade === grade))
    ?? scale.find((item) => total >= item.min && total <= item.max);
  return band?.remark?.trim() || band?.label?.trim() || null;
}

export default function OfficialReportCard({ data, signatures, embedded = false }: { data: Data; signatures: Signature[]; embedded?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const theme = reportCardThemeById(data.reportSettings.themeId);
  const behavior = Array.isArray(data.reportSettings.behaviorRatingFields)
    ? data.reportSettings.behaviorRatingFields.filter((item): item is string => typeof item === "string")
    : [];
  const promotion = data.promotionDecision === "promoted"
    ? "PROMOTED"
    : data.promotionDecision === "not_promoted"
      ? "NOT PROMOTED"
      : "DECISION REQUIRED";
  const positionScopeLabel = data.reportSettings.positionScope === "year_group" ? "Year-group" : "Class";
  const positionDenominator = data.rankedCount || data.classSize;
  const expectedDays = data.attendance.expectedDays ?? data.attendance.totalRecorded;
  const absentDays = data.attendance.absent ?? Math.max(0, expectedDays - data.attendance.present);
  const attendanceRate = data.attendance.attendanceRate ?? (expectedDays > 0 ? Math.round((data.attendance.present / expectedDays) * 1000) / 10 : null);
  const studentPhoto = data.reportSettings.showStudentPhoto && data.student.photoUrl && data.student.photoUrl !== data.school.logoUrl
    ? data.student.photoUrl
    : null;
  const vars = {
    ["--report-primary" as string]: theme.primary,
    ["--report-accent" as string]: theme.accent,
    ["--report-ink" as string]: theme.ink,
    ["--report-paper" as string]: theme.paper,
  };

  return (
    <main className={`official-shell ${embedded ? "embedded" : ""}`}>
      <style>{styles}</style>
      {!embedded ? (
        <header className="official-toolbar">
          <div><span>OFFICIAL REPORT CARD</span><strong>{data.student.name} · {data.term.name}</strong></div>
          <div className="toolbar-actions">
            <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
            <a href={`/api/mvp/report-cards/${encodeURIComponent(data.reportId)}/pdf?download=1`}>Download PDF</a>
            <button type="button" onClick={() => setMenuOpen((open) => !open)}>Options</button>
            {menuOpen ? <div className="option-menu"><button type="button" onClick={() => window.print()}>Print current report</button></div> : null}
          </div>
        </header>
      ) : null}

      <article className={`paper theme-${theme.key} header-${theme.headerMode} density-${theme.density} font-${theme.fontMode}`} style={vars}>
        {data.watermark ? <div className="watermark">{data.watermark}</div> : null}
        <div className="document-top-rule" />

        <header className="school-head">
          <div className="logo-block">
            <div className="logo">{data.school.logoUrl ? <img src={data.school.logoUrl} alt={`${data.school.name} logo`} /> : <span>{data.school.name.slice(0, 1)}</span>}</div>
            <small>School crest</small>
          </div>
          <div className="school-title">
            <span className="report-kicker">OFFICIAL TERMINAL REPORT CARD</span>
            <h1>{data.school.name}</h1>
            <p>Academic performance · Conduct · Attendance</p>
            <div className="term-ribbon"><strong>{data.term.name}</strong><span>{data.term.academicYear}</span></div>
            <small className="school-code">School code: {data.school.uniqueCode}</small>
          </div>
          <div className="portrait-block">
            <div className={`student-photo ${studentPhoto ? "has-photo" : ""}`}>
              {studentPhoto ? <img src={studentPhoto} alt={`${data.student.name} portrait`} /> : <span>{initials(data.student.name)}</span>}
            </div>
            <small>{studentPhoto ? "Learner photo" : "Photo not added"}</small>
          </div>
        </header>

        <section className="identity" aria-label="Learner and report details">
          <div className="identity-primary"><small>Learner</small><b>{data.student.name}</b><span>{data.student.admissionNo}</span></div>
          <div><small>Class</small><b>{data.student.className}</b><span>{data.student.level ?? "Level not set"}</span></div>
          <div><small>Class teacher</small><b>{data.classTeacherName || "—"}</b><span>Assigned head of class</span></div>
          <div><small>Class roll</small><b>{data.classSize || "—"}</b><span>Active learners in scope</span></div>
          <div><small>Report period</small><b>{formatDate(data.term.startDate)}</b><span>to {formatDate(data.term.endDate)}</span></div>
        </section>

        <section className="performance-section">
          <div className="section-heading">
            <div><span>ACADEMIC PERFORMANCE</span><strong>Subject results</strong></div>
            <p>CA {data.gradingWeights.ca}% + Examination {data.gradingWeights.exam}% = 100%</p>
          </div>
          <table className="marks">
            <thead><tr><th>Subject</th><th>CA / {data.gradingWeights.ca}</th><th>Exam / {data.gradingWeights.exam}</th><th>Total / 100</th><th>Grade</th>{data.reportSettings.showSubjectPosition ? <th>Position</th> : null}</tr></thead>
            <tbody>{data.results.map((result) => {
              const descriptor = gradeDescriptor(result.total, result.grade, data.gradingScale);
              return <tr key={result.subjectId}><td>{result.subject}</td><td>{formatNumber(result.ca)}</td><td>{formatNumber(result.exam)}</td><td><strong>{formatNumber(result.total)}</strong></td><td className="grade-cell"><strong className="grade-pill">{result.grade ?? "—"}</strong>{descriptor ? <small className="grade-descriptor">{descriptor}</small> : null}</td>{data.reportSettings.showSubjectPosition ? <td>{ordinal(result.position)}{result.position != null && positionDenominator ? ` / ${positionDenominator}` : ""}</td> : null}</tr>;
            })}</tbody>
          </table>
        </section>

        <section className="summary-grid" aria-label="Academic summary">
          <div><small>Total marks</small><b>{formatNumber(data.summary.total)} <span>/ {data.results.length * 100}</span></b></div>
          <div><small>Overall average</small><b>{formatNumber(data.summary.average)}<span>%</span></b></div>
          <div><small>Overall grade</small><b>{data.summary.grade ?? "—"}</b></div>
          {data.reportSettings.showOverallPosition ? <div><small>{positionScopeLabel} position</small><b>{ordinal(data.position)} <span>/ {positionDenominator || "—"}</span></b></div> : null}
        </section>

        {data.reportSettings.showAttendance || data.reportSettings.showPromotion ? (
          <section className="school-life" aria-label="Attendance and promotion">
            {data.reportSettings.showAttendance ? (
              <div className="attendance-card">
                <div className="card-title"><span>ATTENDANCE</span><strong>{data.attendance.present} / {expectedDays || "—"} school days</strong></div>
                <div className="attendance-stats">
                  <div><small>Present</small><b>{data.attendance.present}</b></div>
                  <div><small>Absent</small><b>{absentDays}</b></div>
                  <div><small>Late</small><b>{data.attendance.late}</b></div>
                  <div><small>Rate</small><b>{attendanceRate == null ? "—" : `${attendanceRate}%`}</b></div>
                </div>
                <p>Expected days exclude Saturdays, Sundays and school-calendar holidays or closures.</p>
              </div>
            ) : null}
            {data.reportSettings.showPromotion ? (
              <div className={`promotion-card promotion-${data.promotionDecision}`}>
                <span>PROMOTION / PROGRESSION</span>
                <strong>{promotion}</strong>
                <p>{data.promotionDecision === "promoted" ? "Learner has been approved for progression under the school policy." : data.promotionDecision === "not_promoted" ? "Learner remains at the current progression stage under the school policy." : "A final progression decision has not yet been recorded."}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {behavior.length ? <section className="remarks"><div className="section-label">BEHAVIOUR / CONDUCT</div><div className="behavior">{behavior.map((field) => <div key={field}><small>{field}</small><span>________________</span></div>)}</div></section> : null}
        <section className="remark-grid">
          {data.reportSettings.showClassTeacherRemark ? <div className="remarks"><div className="section-label">CLASS TEACHER&apos;S REMARK</div><p>{data.remarks || "No remark recorded."}</p></div> : null}
          {data.reportSettings.showHeadteacherRemark ? <div className="remarks"><div className="section-label">HEADTEACHER&apos;S REMARK</div><p>{data.headRemark || "No remark recorded."}</p></div> : null}
        </section>

        <section className="signatures" aria-label="Official signatures">
          {signatures.slice(0, 4).map((signature, index) => <div key={`${signature.role}-${index}`}><div className="sig-space">{signature.signatureDataUrl ? <img src={signature.signatureDataUrl} alt={`${signature.role} signature`} /> : null}</div><strong>{signature.name || signature.role}</strong><small>{signature.role}</small></div>)}
          {!signatures.length ? <><div><div className="sig-space" /><strong>{data.classTeacherName}</strong><small>Class Teacher</small></div><div><div className="sig-space" /><strong>Headteacher</strong><small>Headteacher</small></div></> : null}
        </section>

        <footer>
          <span>Report period: {formatDate(data.term.startDate)} — {formatDate(data.term.endDate)}</span>
          <span>{theme.name} · {data.status ? `${data.status.toUpperCase()} · ` : ""}Issued through SukuuNova</span>
        </footer>
      </article>
    </main>
  );
}

const styles = `
.official-shell{min-height:100vh;background:var(--color-bg);padding:var(--space-4);font-family:var(--sn-font-family);color:var(--color-text-primary)}
.official-shell.embedded{min-height:0;padding:0;background:transparent}.official-toolbar{max-width:940px;margin:0 auto var(--space-3);display:flex;justify-content:space-between;gap:var(--space-3);align-items:center}.official-toolbar span{display:block;font-size:var(--sn-font-2xs);font-weight:900;letter-spacing:.14em;color:var(--color-text-muted)}.official-toolbar strong{display:block;margin-top:var(--space-1);font-size:var(--sn-font-sm)}
.toolbar-actions{display:flex;gap:var(--space-2);position:relative;align-items:center}.toolbar-actions button,.toolbar-actions a{border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-primary);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3);font-size:var(--sn-font-2xs);font-weight:900;cursor:pointer;text-decoration:none}.option-menu{position:absolute;top:calc(100% + var(--space-1));right:0;z-index:5;padding:var(--space-1);border-radius:var(--radius-md);background:var(--color-surface-raised);border:1px solid var(--color-border);box-shadow:var(--shadow-lg)}.option-menu button{white-space:nowrap;border:0}
.paper{--report-primary:var(--color-brand);--report-accent:var(--color-brand-soft);--report-ink:var(--color-text-primary);--report-paper:var(--color-surface);--report-muted:color-mix(in srgb,var(--report-ink) 62%,var(--report-paper));--report-subtle:color-mix(in srgb,var(--report-ink) 48%,var(--report-paper));--report-line:color-mix(in srgb,var(--report-ink) 18%,var(--report-paper));--report-line-strong:color-mix(in srgb,var(--report-ink) 34%,var(--report-paper));--report-primary-soft:color-mix(in srgb,var(--report-primary) 8%,var(--report-paper));color-scheme:light;position:relative;overflow:hidden;max-width:940px;min-height:1320px;margin:0 auto;background:var(--report-paper);color:var(--report-ink);border:1px solid var(--report-line);box-shadow:var(--shadow-xl);padding:34px 38px}.paper,.paper *{box-sizing:border-box}.paper *{color:inherit}.font-serif{font-family:Georgia,"Times New Roman",serif}.font-serif .marks,.font-serif .identity,.font-serif .summary-grid,.font-serif .school-life,.font-serif .remarks,.font-serif .signatures,.font-serif footer{font-family:var(--sn-font-family)}.density-compact{padding:26px 30px;min-height:0}.density-compact .marks th,.density-compact .marks td{padding:6px 8px}.density-compact .school-head{padding-bottom:12px}.density-compact .remarks{margin-top:8px}.density-compact .signatures{margin-top:14px}
.document-top-rule{height:7px;background:var(--report-primary);margin:-34px -38px 20px}.density-compact .document-top-rule{margin:-26px -30px 14px}.header-band .document-top-rule{height:15px}.header-formal{outline:2px solid var(--report-primary);outline-offset:-12px}.header-minimal .document-top-rule{height:3px}.watermark{position:absolute;inset:0;display:grid;place-items:center;font-size:60px;font-weight:900;color:var(--report-primary);opacity:.035;transform:rotate(-25deg);pointer-events:none;z-index:0}.paper> *:not(.watermark){position:relative;z-index:1}
.school-head{display:grid;grid-template-columns:102px minmax(0,1fr) 92px;gap:20px;align-items:center;padding:4px 0 18px;border-bottom:3px solid var(--report-primary)}.header-band .school-head{background:var(--report-accent);margin:0 -18px;padding:16px 18px;border-bottom:0}.header-minimal .school-head{border-bottom:1px solid var(--report-primary)}.logo-block,.portrait-block{display:grid;justify-items:center;gap:5px}.logo-block>small,.portrait-block>small{font-family:var(--sn-font-family);font-size:8px;font-weight:800;color:var(--report-muted);text-align:center}.logo{width:94px;height:94px;border:1px solid var(--report-line-strong);border-radius:12px;display:grid;place-items:center;overflow:hidden;background:var(--report-paper);padding:7px}.logo img{width:100%;height:100%;object-fit:contain}.logo span{font-size:30px;font-weight:950;color:var(--report-primary)}.student-photo{width:82px;height:104px;border:2px solid var(--report-primary);border-radius:10px;display:grid;place-items:center;overflow:hidden;background:var(--report-primary-soft)}.student-photo img{width:100%;height:100%;object-fit:cover}.student-photo span{font-family:var(--sn-font-family);font-size:20px;font-weight:950;color:var(--report-primary)}
.school-title{text-align:center}.report-kicker{display:block;font-family:var(--sn-font-family);font-size:9px;font-weight:950;letter-spacing:.18em;color:var(--report-primary)}.school-title h1{margin:4px 0 3px;font-size:29px;line-height:1.08;color:var(--report-ink);letter-spacing:-.02em}.school-title p{margin:0;font-family:var(--sn-font-family);font-size:10px;font-weight:650;color:var(--report-muted)}.term-ribbon{width:max-content;max-width:100%;margin:9px auto 5px;display:flex;align-items:center;justify-content:center;gap:8px;padding:5px 10px;border:1px solid var(--report-primary);border-radius:999px;background:var(--report-primary-soft);font-family:var(--sn-font-family)}.term-ribbon strong{font-size:10px;font-weight:950;color:var(--report-primary)}.term-ribbon span{font-size:9px;font-weight:800;color:var(--report-ink)}.school-code{display:block;font-family:var(--sn-font-family);font-size:8px;font-weight:750;color:var(--report-muted)}
.identity{display:grid;grid-template-columns:1.55fr 1fr 1.2fr .72fr 1.15fr;gap:7px;margin:13px 0}.identity>div{min-height:65px;padding:9px 10px;border:1px solid var(--report-line);border-radius:9px;background:var(--report-primary-soft)}.identity-primary{border-left:4px solid var(--report-primary)!important}.identity small,.summary-grid small,.attendance-stats small{display:block;font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:var(--report-muted);font-weight:900}.identity b{display:block;margin-top:4px;font-size:11px;line-height:1.2;color:var(--report-ink)}.identity-primary b{font-size:13px}.identity span{display:block;margin-top:3px;font-size:8px;line-height:1.25;color:var(--report-muted)}
.performance-section{margin-top:10px}.section-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:6px}.section-heading div{display:grid;gap:2px}.section-heading span,.section-label,.card-title>span,.promotion-card>span{font-family:var(--sn-font-family);font-size:8px;font-weight:950;letter-spacing:.13em;color:var(--report-primary)}.section-heading strong{font-size:14px;color:var(--report-ink)}.section-heading p{margin:0;font-family:var(--sn-font-family);font-size:8px;font-weight:800;color:var(--report-muted)}.marks{width:100%;border-collapse:collapse;font-size:10px;color:var(--report-ink)}.marks th,.marks td{border:1px solid var(--report-line-strong);padding:7px 8px;color:var(--report-ink)}.marks th{background:var(--report-primary);color:var(--report-paper);font-size:8px;font-weight:950;text-transform:uppercase;letter-spacing:.05em}.header-minimal .marks th,.theme-clean-mono .marks th{background:var(--report-primary-soft);color:var(--report-ink);border-top:2px solid var(--report-primary);border-bottom:2px solid var(--report-primary)}.marks tbody tr:nth-child(even){background:var(--report-primary-soft)}.marks th:first-child,.marks td:first-child{text-align:left}.marks th:not(:first-child),.marks td:not(:first-child){text-align:center}.marks tbody td:first-child{font-weight:750}.grade-pill{display:inline-grid;place-items:center;min-width:25px;min-height:22px;padding:2px 5px;border-radius:6px;background:var(--report-primary-soft);color:var(--report-primary);font-weight:950}.grade-descriptor{display:block;margin-top:3px;font-size:7px;line-height:1.25;color:var(--report-muted);font-weight:750}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}.summary-grid>div{min-height:60px;border:1px solid var(--report-line);border-radius:9px;padding:8px 10px;background:var(--report-paper)}.summary-grid>div:first-child{background:var(--report-primary-soft)}.summary-grid b{display:block;margin-top:5px;font-size:16px;line-height:1;color:var(--report-primary)}.summary-grid b span{font-size:9px;color:var(--report-muted);font-weight:800}
.school-life{display:grid;grid-template-columns:1.45fr .85fr;gap:8px;margin-top:9px}.attendance-card,.promotion-card{border:1px solid var(--report-line);border-radius:10px;padding:10px 11px;background:var(--report-primary-soft)}.card-title{display:flex;justify-content:space-between;align-items:center;gap:8px}.card-title strong{font-size:12px;color:var(--report-primary)}.attendance-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}.attendance-stats>div{padding:6px 7px;border-radius:7px;background:var(--report-paper);border:1px solid var(--report-line)}.attendance-stats b{display:block;margin-top:2px;font-size:12px;color:var(--report-ink)}.attendance-card p,.promotion-card p{margin:6px 0 0;font-size:8px;line-height:1.4;color:var(--report-muted)}.promotion-card{display:grid;align-content:center}.promotion-card strong{display:block;margin-top:5px;font-size:15px;color:var(--report-primary)}
.remark-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.remarks{margin-top:10px}.section-label{margin-bottom:5px}.remarks p{margin:0;min-height:48px;border:1px solid var(--report-line);border-left:4px solid var(--report-primary);border-radius:8px;padding:8px 9px;font-size:9px;line-height:1.55;background:var(--report-paper);color:var(--report-ink)}.behavior{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.behavior div{border:1px solid var(--report-line);border-radius:8px;padding:8px;background:var(--report-primary-soft)}.behavior small{display:block;font-size:8px;font-weight:900;color:var(--report-muted)}.behavior span{display:block;margin-top:5px;font-size:9px;color:var(--report-muted)}
.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px}.signatures>div{min-height:78px;text-align:center}.sig-space{height:38px;border-bottom:1px solid var(--report-primary);display:flex;align-items:flex-end;justify-content:center}.sig-space img{max-width:100%;max-height:38px;object-fit:contain}.signatures strong{display:block;margin-top:5px;font-size:9px;color:var(--report-ink)}.signatures small{display:block;margin-top:2px;font-size:8px;color:var(--report-muted)}footer{display:flex;justify-content:space-between;gap:14px;border-top:1px solid var(--report-primary);margin-top:14px;padding-top:7px;color:var(--report-muted);font-family:var(--sn-font-family);font-size:8px}
.theme-royal-purple .school-head,.theme-crest-red .school-head{border-bottom-width:5px}.theme-formal-navy .school-title h1,.theme-clean-mono .school-title h1{text-transform:uppercase;letter-spacing:.02em}.theme-executive-compact .school-head{grid-template-columns:74px 1fr 72px}.theme-executive-compact .logo{width:68px;height:68px}.theme-executive-compact .student-photo{width:64px;height:80px}.theme-executive-compact .school-title h1{font-size:23px}.theme-executive-compact .identity>div{min-height:52px}.theme-executive-compact .signatures{margin-top:10px}
@media(max-width:760px){.official-shell{padding:var(--space-2)}.official-toolbar{flex-direction:column;align-items:stretch}.toolbar-actions{flex-wrap:wrap}.paper{padding:22px;min-height:auto}.document-top-rule{margin:-22px -22px 14px}.school-head{grid-template-columns:64px 1fr 62px;gap:8px}.logo{width:60px;height:60px;padding:4px}.student-photo{width:58px;height:72px}.school-title h1{font-size:20px}.report-kicker{font-size:7px}.identity{grid-template-columns:1fr 1fr}.identity-primary{grid-column:1/-1}.summary-grid{grid-template-columns:1fr 1fr}.school-life{grid-template-columns:1fr}.remark-grid{grid-template-columns:1fr}.behavior{grid-template-columns:1fr}.signatures{grid-template-columns:1fr 1fr}}
@media print{@page{size:A4;margin:0}.official-shell{padding:0;background:var(--report-paper)}.official-toolbar{display:none}.paper{box-shadow:none;border:0;max-width:none;width:210mm;min-height:297mm;padding:9mm 11mm;margin:0}.paper,.paper *{print-color-adjust:exact;-webkit-print-color-adjust:exact}.paper .document-top-rule{margin:-9mm -11mm 5mm}.density-compact{padding:7mm 9mm}.density-compact .document-top-rule{margin:-7mm -9mm 4mm}.embedded .paper{break-after:page;page-break-after:always}.embedded:last-child .paper{break-after:auto;page-break-after:auto}.option-menu{display:none}.marks{break-inside:auto}.school-head,.identity,.summary-grid,.school-life,.remarks,.signatures{break-inside:avoid}.watermark{opacity:.025}}
`;
