/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useState } from "react";
import { REPORT_CARD_THEMES, reportCardThemeById } from "@/lib/report-card-themes";

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
  const [previewThemeId, setPreviewThemeId] = useState(data.reportSettings.themeId);
  const theme = reportCardThemeById(previewThemeId);
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
  const attendanceWidth = Math.max(0, Math.min(100, attendanceRate ?? 0));
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
          <div className="toolbar-title">
            <span>OFFICIAL REPORT CARD</span>
            <strong>{data.student.name} · {data.term.name}</strong>
            <small>Preview a design, then print or save it as PDF.</small>
          </div>
          <div className="toolbar-theme">
            <label htmlFor={`report-theme-${data.reportId}`}>Design</label>
            <select id={`report-theme-${data.reportId}`} value={previewThemeId} onChange={(event) => setPreviewThemeId(event.target.value)}>
              {REPORT_CARD_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="toolbar-actions">
            <button className="toolbar-primary" type="button" onClick={() => window.print()}>Print / Save PDF</button>
            <a href={`/api/mvp/report-cards/${encodeURIComponent(data.reportId)}/pdf?download=1`}>Archive PDF</a>
            <Link href="/school/settings/reporting/intelligence">Theme settings</Link>
          </div>
        </header>
      ) : null}

      <article className={`paper theme-${theme.key} header-${theme.headerMode} density-${theme.density} font-${theme.fontMode}`} style={vars}>
        <div className="document-frame" aria-hidden="true" />
        <div className="document-top-rule" aria-hidden="true"><i /><i /><i /></div>
        {data.watermark ? <div className="watermark">{data.watermark}</div> : null}

        <header className="school-head">
          <div className="logo-block">
            <div className="logo">
              {data.school.logoUrl
                ? <img src={data.school.logoUrl} alt={`${data.school.name} logo`} />
                : <span aria-label={`${data.school.name} logo placeholder`}>{data.school.name.slice(0, 1).toUpperCase()}</span>}
            </div>
          </div>

          <div className="school-title">
            <span className="report-kicker">OFFICIAL TERMINAL REPORT</span>
            <h1>{data.school.name}</h1>
            <div className="title-rule"><i /><b /><i /></div>
            <p>Academic Performance · Attendance · Conduct</p>
            <div className="term-ribbon"><strong>{data.term.name}</strong><span>{data.term.academicYear}</span></div>
            <small className="school-code">School code · {data.school.uniqueCode}</small>
          </div>

          <div className="portrait-block">
            <div className={`student-photo ${studentPhoto ? "has-photo" : ""}`}>
              {studentPhoto ? <img src={studentPhoto} alt={`${data.student.name} portrait`} /> : <span>{initials(data.student.name)}</span>}
            </div>
            <small>{studentPhoto ? "Learner" : "Learner photo"}</small>
          </div>
        </header>

        <section className="identity" aria-label="Learner and report details">
          <div className="identity-primary"><small>Learner</small><b>{data.student.name}</b><span>{data.student.admissionNo}</span></div>
          <div><small>Class / Form</small><b>{data.student.className}</b><span>{data.student.level ?? "Level not set"}</span></div>
          <div><small>Class teacher</small><b>{data.classTeacherName || "—"}</b><span>Assigned class lead</span></div>
          <div><small>Class roll</small><b>{data.classSize || "—"}</b><span>Active learners</span></div>
          <div><small>Report period</small><b>{formatDate(data.term.startDate)}</b><span>to {formatDate(data.term.endDate)}</span></div>
        </section>

        <section className="performance-section">
          <div className="section-heading">
            <div><span>01 · ACADEMIC PERFORMANCE</span><strong>Subject results</strong></div>
            <p>CA {data.gradingWeights.ca}% + Examination {data.gradingWeights.exam}% = 100%</p>
          </div>
          <div className="marks-wrap">
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
                {data.results.map((result) => {
                  const descriptor = gradeDescriptor(result.total, result.grade, data.gradingScale);
                  return (
                    <tr key={result.subjectId}>
                      <td><strong>{result.subject}</strong></td>
                      <td>{formatNumber(result.ca)}</td>
                      <td>{formatNumber(result.exam)}</td>
                      <td className="total-cell"><strong>{formatNumber(result.total)}</strong></td>
                      <td className="grade-cell"><strong className="grade-pill">{result.grade ?? "—"}</strong>{descriptor ? <small className="grade-descriptor">{descriptor}</small> : null}</td>
                      {data.reportSettings.showSubjectPosition ? <td>{ordinal(result.position)}{result.position != null && positionDenominator ? <small className="position-of"> of {positionDenominator}</small> : null}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="summary-section" aria-label="Academic summary">
          <div className="section-heading compact-heading"><div><span>02 · TERM SUMMARY</span><strong>Performance at a glance</strong></div></div>
          <div className="summary-grid">
            <div><small>Total marks</small><b>{formatNumber(data.summary.total)}</b><span>of {data.results.length * 100}</span></div>
            <div className="summary-emphasis"><small>Overall average</small><b>{formatNumber(data.summary.average)}<em>%</em></b><span>Across reported subjects</span></div>
            <div><small>Overall grade</small><b>{data.summary.grade ?? "—"}</b><span>School grading scale</span></div>
            {data.reportSettings.showOverallPosition ? <div><small>{positionScopeLabel} position</small><b>{ordinal(data.position)}</b><span>of {positionDenominator || "—"} ranked learners</span></div> : null}
          </div>
        </section>

        {data.reportSettings.showAttendance || data.reportSettings.showPromotion ? (
          <section className="school-life" aria-label="Attendance and promotion">
            {data.reportSettings.showAttendance ? (
              <div className="attendance-card">
                <div className="card-title"><span>03 · ATTENDANCE</span><strong>{attendanceRate == null ? "—" : `${attendanceRate}%`}</strong></div>
                <div className="attendance-progress" aria-label={`Attendance rate ${attendanceRate ?? 0}%`}><i style={{ width: `${attendanceWidth}%` }} /></div>
                <div className="attendance-stats">
                  <div><small>Present</small><b>{data.attendance.present}</b></div>
                  <div><small>Absent</small><b>{absentDays}</b></div>
                  <div><small>Late</small><b>{data.attendance.late}</b></div>
                  <div><small>School days</small><b>{expectedDays || "—"}</b></div>
                </div>
                <p>School days exclude weekends and configured school-calendar holidays or closures.</p>
              </div>
            ) : null}

            {data.reportSettings.showPromotion ? (
              <div className={`promotion-card promotion-${data.promotionDecision}`}>
                <span>04 · PROGRESSION</span>
                <strong>{promotion}</strong>
                <p>{data.promotionDecision === "promoted" ? "Approved for progression under the school's reporting policy." : data.promotionDecision === "not_promoted" ? "Learner remains at the current progression stage under school policy." : "The final progression decision has not yet been recorded."}</p>
                <i className="promotion-mark" aria-hidden="true">{data.promotionDecision === "promoted" ? "✓" : data.promotionDecision === "not_promoted" ? "—" : "?"}</i>
              </div>
            ) : null}
          </section>
        ) : null}

        {behavior.length ? (
          <section className="remarks behavior-section">
            <div className="section-label">05 · BEHAVIOUR / CONDUCT</div>
            <div className="behavior">{behavior.map((field) => <div key={field}><small>{field}</small><span>________________</span></div>)}</div>
          </section>
        ) : null}

        <section className="remark-grid">
          {data.reportSettings.showClassTeacherRemark ? <div className="remarks"><div className="section-label">CLASS TEACHER&apos;S REMARK</div><p>{data.remarks || "No remark recorded."}</p></div> : null}
          {data.reportSettings.showHeadteacherRemark ? <div className="remarks"><div className="section-label">HEADTEACHER&apos;S REMARK</div><p>{data.headRemark || "No remark recorded."}</p></div> : null}
        </section>

        <section className="signatures" aria-label="Official signatures">
          {signatures.slice(0, 4).map((signature, index) => (
            <div key={`${signature.role}-${index}`}>
              <div className="sig-space">{signature.signatureDataUrl ? <img src={signature.signatureDataUrl} alt={`${signature.role} signature`} /> : null}</div>
              <strong>{signature.name || signature.role}</strong>
              <small>{signature.role}</small>
            </div>
          ))}
          {!signatures.length ? (
            <>
              <div><div className="sig-space" /><strong>{data.classTeacherName || "Class Teacher"}</strong><small>Class Teacher</small></div>
              <div><div className="sig-space" /><strong>Headteacher</strong><small>Headteacher</small></div>
            </>
          ) : null}
        </section>

        <footer>
          <span><b>Report period</b>{formatDate(data.term.startDate)} — {formatDate(data.term.endDate)}</span>
          <span className="footer-centre">{data.school.name}</span>
          <span><b>{theme.name}</b>{data.status ? `${data.status.toUpperCase()} · ` : ""}Issued through SukuuNova</span>
        </footer>
      </article>
    </main>
  );
}

const styles = `
@page{size:A4 portrait;margin:10mm}
.official-shell{min-height:100vh;background:var(--color-bg);padding:20px;font-family:var(--sn-font-family);color:var(--color-text-primary)}
.official-shell.embedded{min-height:0;padding:0;background:transparent;break-after:page;page-break-after:always}
.official-toolbar{max-width:1080px;margin:0 auto 16px;display:grid;grid-template-columns:minmax(220px,1fr) minmax(210px,.7fr) auto;gap:12px;align-items:end;padding:13px;border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);box-shadow:var(--shadow-sm)}
.toolbar-title span{display:block;font-size:10px;font-weight:900;letter-spacing:.14em;color:var(--color-brand)}.toolbar-title strong{display:block;margin-top:3px;font-size:14px;color:var(--color-text-primary)}.toolbar-title small{display:block;margin-top:3px;font-size:10px;color:var(--color-text-muted)}
.toolbar-theme{display:grid;gap:4px}.toolbar-theme label{font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-muted)}.toolbar-theme select{width:100%;min-height:40px;border:1px solid var(--color-border-strong);border-radius:10px;background:var(--color-surface-soft);color:var(--color-text-primary);padding:0 10px;font:700 11px var(--sn-font-family)}
.toolbar-actions{display:flex;gap:7px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.toolbar-actions button,.toolbar-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);color:var(--color-text-primary);font:800 10px var(--sn-font-family);cursor:pointer;text-decoration:none}.toolbar-actions .toolbar-primary{background:var(--color-brand);border-color:var(--color-brand);color:var(--color-text-on-brand);box-shadow:0 8px 18px var(--color-brand-glow)}
.paper{--report-primary:var(--color-brand);--report-accent:var(--color-brand-soft);--report-ink:var(--color-text-primary);--report-paper:var(--color-surface);--report-muted:color-mix(in srgb,var(--report-ink) 59%,var(--report-paper));--report-subtle:color-mix(in srgb,var(--report-ink) 43%,var(--report-paper));--report-line:color-mix(in srgb,var(--report-ink) 15%,var(--report-paper));--report-line-strong:color-mix(in srgb,var(--report-ink) 29%,var(--report-paper));--report-primary-soft:color-mix(in srgb,var(--report-primary) 8%,var(--report-paper));--report-primary-mid:color-mix(in srgb,var(--report-primary) 17%,var(--report-paper));color-scheme:light;position:relative;overflow:hidden;width:190mm;max-width:100%;min-height:277mm;margin:0 auto;background:var(--report-paper);color:var(--report-ink);border:1px solid var(--report-line-strong);box-shadow:0 28px 70px color-mix(in srgb,var(--color-text-primary) 13%,transparent);padding:10mm 11mm 8mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.paper,.paper *{box-sizing:border-box}.paper *{color:inherit}.font-serif{font-family:Georgia,"Times New Roman",serif}.font-serif :where(.marks,.identity,.summary-grid,.school-life,.remarks,.signatures,footer){font-family:var(--sn-font-family)}.density-compact{padding:7mm 9mm 6mm;min-height:0}.density-compact .marks th,.density-compact .marks td{padding:4px 6px}.density-compact .identity>div{min-height:49px;padding:6px 7px}.density-compact .school-head{padding-bottom:9px}.density-compact .summary-grid>div{min-height:54px}.density-compact .remarks{margin-top:7px}.density-compact .signatures{margin-top:11px}
.document-frame{position:absolute;inset:5mm;border:1px solid transparent;pointer-events:none}.document-top-rule{display:grid;grid-template-columns:1fr 2fr 1fr;gap:3px;height:6px;margin:-10mm -11mm 7mm}.document-top-rule i{display:block;background:var(--report-primary)}.document-top-rule i:nth-child(2){background:var(--report-ink)}.density-compact .document-top-rule{margin:-7mm -9mm 5mm}.watermark{position:absolute;inset:0;display:grid;place-items:center;font:950 58px/1 var(--sn-font-family);letter-spacing:.08em;color:var(--report-primary);opacity:.028;transform:rotate(-27deg);pointer-events:none;z-index:0;white-space:nowrap}.paper>*:not(.watermark):not(.document-frame){position:relative;z-index:1}
.school-head{display:grid;grid-template-columns:90px minmax(0,1fr) 80px;gap:18px;align-items:center;padding:2px 0 15px;border-bottom:2px solid var(--report-primary)}.logo-block,.portrait-block{display:grid;justify-items:center;gap:5px}.logo{width:88px;height:88px;display:grid;place-items:center;overflow:hidden;background:var(--report-paper);padding:5px}.logo img{width:100%;height:100%;object-fit:contain}.logo span{display:grid;place-items:center;width:72px;height:72px;border:2px solid var(--report-primary);border-radius:50%;font:950 28px/1 var(--sn-font-family);color:var(--report-primary)}.portrait-block>small{font:800 7px/1.2 var(--sn-font-family);letter-spacing:.06em;text-transform:uppercase;color:var(--report-muted);text-align:center}.student-photo{width:70px;height:88px;border:1px solid var(--report-line-strong);border-radius:8px;display:grid;place-items:center;overflow:hidden;background:var(--report-primary-soft);box-shadow:inset 0 0 0 3px var(--report-paper)}.student-photo img{width:100%;height:100%;object-fit:cover}.student-photo span{font:950 18px/1 var(--sn-font-family);color:var(--report-primary)}
.school-title{text-align:center}.report-kicker{display:block;font:950 8px/1.2 var(--sn-font-family);letter-spacing:.2em;color:var(--report-primary)}.school-title h1{margin:5px auto 4px;max-width:520px;font-size:28px;line-height:1.03;color:var(--report-ink);letter-spacing:-.025em}.title-rule{width:130px;margin:6px auto;display:grid;grid-template-columns:1fr 8px 1fr;gap:5px;align-items:center}.title-rule i{height:1px;background:var(--report-primary)}.title-rule b{width:7px;height:7px;transform:rotate(45deg);background:var(--report-primary)}.school-title p{margin:0;font:700 8px/1.4 var(--sn-font-family);letter-spacing:.05em;text-transform:uppercase;color:var(--report-muted)}.term-ribbon{width:max-content;max-width:100%;margin:8px auto 4px;display:flex;align-items:center;justify-content:center;gap:7px;padding:5px 10px;border-radius:999px;background:var(--report-primary);font-family:var(--sn-font-family)}.term-ribbon strong,.term-ribbon span{color:var(--report-paper)}.term-ribbon strong{font-size:9px;font-weight:950}.term-ribbon span{font-size:8px;font-weight:750;opacity:.9}.school-code{display:block;font:750 7px/1.3 var(--sn-font-family);color:var(--report-muted)}
.identity{display:grid;grid-template-columns:1.55fr 1fr 1.18fr .68fr 1.1fr;gap:6px;margin:10px 0 12px}.identity>div{min-height:58px;padding:8px 9px;border:1px solid var(--report-line);border-radius:7px;background:var(--report-paper)}.identity-primary{border-left:4px solid var(--report-primary)!important;background:var(--report-primary-soft)!important}.identity small,.summary-grid small,.attendance-stats small{display:block;font:900 7px/1.2 var(--sn-font-family);letter-spacing:.08em;text-transform:uppercase;color:var(--report-muted)}.identity b{display:block;margin-top:4px;font:850 10px/1.22 var(--sn-font-family);color:var(--report-ink)}.identity-primary b{font-size:12px}.identity span{display:block;margin-top:3px;font:650 7px/1.25 var(--sn-font-family);color:var(--report-muted)}
.performance-section{margin-top:2px}.section-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:5px}.section-heading>div{display:grid;gap:2px}.section-heading span,.section-label,.card-title>span,.promotion-card>span{font:950 7px/1.2 var(--sn-font-family);letter-spacing:.13em;color:var(--report-primary)}.section-heading strong{font-size:13px;line-height:1.2;color:var(--report-ink)}.section-heading p{margin:0;font:800 7px/1.3 var(--sn-font-family);color:var(--report-muted)}.compact-heading{margin-top:8px}.marks-wrap{border:1px solid var(--report-line-strong);border-radius:7px;overflow:hidden}.marks{width:100%;border-collapse:collapse;font:650 8.4px/1.2 var(--sn-font-family);color:var(--report-ink)}.marks th,.marks td{border-right:1px solid var(--report-line);border-bottom:1px solid var(--report-line);padding:5px 7px;color:var(--report-ink)}.marks th:last-child,.marks td:last-child{border-right:0}.marks tbody tr:last-child td{border-bottom:0}.marks th{background:var(--report-primary);color:var(--report-paper);font-size:7px;font-weight:950;text-transform:uppercase;letter-spacing:.045em}.marks tbody tr:nth-child(even){background:var(--report-primary-soft)}.marks th:first-child,.marks td:first-child{text-align:left}.marks th:not(:first-child),.marks td:not(:first-child){text-align:center}.marks tbody td:first-child strong{font-weight:850}.total-cell strong{font-size:9px;color:var(--report-primary)}.grade-pill{display:inline-grid;place-items:center;min-width:24px;min-height:20px;padding:2px 5px;border:1px solid var(--report-primary-mid);border-radius:5px;background:var(--report-primary-soft);color:var(--report-primary);font-weight:950}.grade-descriptor{display:block;margin-top:2px;font-size:6px;line-height:1.2;color:var(--report-muted);font-weight:750}.position-of{display:block;margin-top:2px;font-size:6px;color:var(--report-muted)}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.summary-grid>div{min-height:61px;border:1px solid var(--report-line);border-radius:8px;padding:8px 9px;background:var(--report-paper);position:relative;overflow:hidden}.summary-grid>div:after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--report-primary-mid)}.summary-grid .summary-emphasis{background:var(--report-primary-soft);border-color:var(--report-primary-mid)}.summary-grid b{display:block;margin-top:5px;font:950 15px/1 var(--sn-font-family);color:var(--report-primary)}.summary-grid b em{font-style:normal;font-size:8px}.summary-grid>div>span{display:block;margin-top:4px;font:650 6.5px/1.3 var(--sn-font-family);color:var(--report-muted)}
.school-life{display:grid;grid-template-columns:1.45fr .82fr;gap:7px;margin-top:9px}.attendance-card,.promotion-card{border:1px solid var(--report-line);border-radius:9px;padding:9px 10px;background:var(--report-primary-soft)}.card-title{display:flex;justify-content:space-between;align-items:center;gap:8px}.card-title strong{font:950 13px/1 var(--sn-font-family);color:var(--report-primary)}.attendance-progress{height:5px;margin-top:7px;border-radius:99px;overflow:hidden;background:var(--report-primary-mid)}.attendance-progress i{display:block;height:100%;border-radius:inherit;background:var(--report-primary)}.attendance-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px}.attendance-stats>div{padding:5px 6px;border-radius:6px;background:var(--report-paper);border:1px solid var(--report-line)}.attendance-stats b{display:block;margin-top:2px;font:900 10px/1 var(--sn-font-family);color:var(--report-ink)}.attendance-card p,.promotion-card p{margin:5px 0 0;font:650 6.5px/1.35 var(--sn-font-family);color:var(--report-muted)}.promotion-card{display:grid;align-content:center;position:relative;overflow:hidden;padding-right:48px}.promotion-card strong{display:block;margin-top:5px;font:950 13px/1.1 var(--sn-font-family);color:var(--report-primary)}.promotion-mark{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:31px;height:31px;border:1px solid var(--report-primary-mid);border-radius:50%;background:var(--report-paper);font:950 15px/1 var(--sn-font-family);color:var(--report-primary)}
.remark-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.remarks{margin-top:8px}.section-label{margin-bottom:4px}.remarks p{margin:0;min-height:43px;border:1px solid var(--report-line);border-left:3px solid var(--report-primary);border-radius:7px;padding:7px 8px;font:650 8px/1.5 var(--sn-font-family);background:var(--report-paper);color:var(--report-ink)}.behavior{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.behavior div{border:1px solid var(--report-line);border-radius:7px;padding:7px;background:var(--report-primary-soft)}.behavior small{display:block;font:900 7px/1.2 var(--sn-font-family);color:var(--report-muted)}.behavior span{display:block;margin-top:4px;font-size:8px;color:var(--report-muted)}
.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:14px}.signatures>div{min-height:66px;text-align:center}.sig-space{height:34px;border-bottom:1px solid var(--report-primary);display:flex;align-items:flex-end;justify-content:center}.sig-space img{max-width:100%;max-height:33px;object-fit:contain}.signatures strong{display:block;margin-top:4px;font:800 7.5px/1.3 var(--sn-font-family);color:var(--report-ink)}.signatures small{display:block;margin-top:1px;font:700 6.5px/1.2 var(--sn-font-family);text-transform:uppercase;letter-spacing:.05em;color:var(--report-muted)}
footer{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:end;border-top:1px solid var(--report-primary);margin-top:11px;padding-top:6px;color:var(--report-muted);font:650 6.5px/1.35 var(--sn-font-family)}footer>span:last-child{text-align:right}footer b{display:block;margin-bottom:2px;color:var(--report-ink);font-weight:850}.footer-centre{text-align:center;font-weight:850;color:var(--report-primary)}
/* Header families create genuinely different document compositions. */
.header-band .school-head{margin:0 -5mm 10px;padding:5mm;border:0;border-radius:8px;background:var(--report-primary)}.header-band .school-title h1,.header-band .report-kicker,.header-band .school-title p,.header-band .school-code{color:var(--report-paper)}.header-band .title-rule i,.header-band .title-rule b{background:var(--report-paper)}.header-band .term-ribbon{background:var(--report-paper)}.header-band .term-ribbon strong,.header-band .term-ribbon span{color:var(--report-primary)}.header-band .logo{border-radius:12px;background:var(--report-paper)}.header-band .student-photo{border-color:var(--report-paper);box-shadow:none}.header-band .portrait-block>small{color:var(--report-paper)}
.header-formal .document-frame{border:2px solid var(--report-primary);box-shadow:inset 0 0 0 3px var(--report-paper),inset 0 0 0 4px var(--report-primary-mid)}.header-formal .school-head{border-bottom:1px solid var(--report-line-strong)}.header-formal .logo{border:1px solid var(--report-primary-mid);border-radius:50%;padding:9px}.header-formal .student-photo{border-radius:2px}
.header-minimal .document-top-rule{height:3px;grid-template-columns:1fr}.header-minimal .document-top-rule i:not(:first-child){display:none}.header-minimal .school-head{border-bottom:1px solid var(--report-line-strong)}.header-minimal .title-rule{display:none}.header-minimal .term-ribbon{background:transparent;border:1px solid var(--report-line-strong)}.header-minimal .term-ribbon strong,.header-minimal .term-ribbon span{color:var(--report-ink)}.header-minimal .marks th{background:var(--report-primary-soft);color:var(--report-ink);border-bottom:2px solid var(--report-primary)}
.header-crest .logo{border:2px solid var(--report-primary-mid);border-radius:50%;padding:8px}.header-crest .school-head{border-bottom:3px double var(--report-primary)}
/* Named themes add personality beyond palette swapping. */
.theme-ghana-classic .school-title h1,.theme-heritage-green .school-title h1,.theme-burgundy-ivory .school-title h1,.theme-cocoa-earth .school-title h1{text-transform:uppercase;letter-spacing:.015em}
.theme-scholar-blue .summary-grid>div,.theme-skyline-blue .summary-grid>div{border-radius:12px}.theme-scholar-blue .marks-wrap,.theme-skyline-blue .marks-wrap{border-radius:10px}
.theme-modern-teal .school-head,.theme-emerald-modern .school-head{border-radius:10px}.theme-modern-teal .identity-primary,.theme-emerald-modern .identity-primary{box-shadow:inset 0 -3px 0 var(--report-primary-mid)}
.theme-formal-navy .school-title h1,.theme-clean-mono .school-title h1,.theme-prestige-gold .school-title h1{letter-spacing:.04em;text-transform:uppercase}
.theme-minimal-slate .identity>div,.theme-clean-mono .identity>div,.theme-graphite-lime .identity>div{border-radius:2px}.theme-minimal-slate .summary-grid>div,.theme-clean-mono .summary-grid>div,.theme-graphite-lime .summary-grid>div{border-radius:2px}.theme-clean-mono .watermark{display:none}
.theme-royal-purple .document-top-rule,.theme-academic-indigo .document-top-rule{grid-template-columns:2fr 1fr 2fr}.theme-royal-purple .student-photo,.theme-academic-indigo .student-photo{border-radius:14px}
.theme-warm-amber .paper,.theme-cocoa-earth .paper{font-variant-numeric:oldstyle-nums}.theme-warm-amber .title-rule b,.theme-cocoa-earth .title-rule b{border-radius:50%;transform:none}
.theme-crest-red .school-head,.theme-burgundy-ivory .school-head{border-bottom-width:4px}.theme-crest-red .grade-pill,.theme-burgundy-ivory .grade-pill{border-radius:99px}
.theme-executive-compact .school-head,.theme-midnight-teal .school-head{grid-template-columns:72px 1fr 68px}.theme-executive-compact .logo,.theme-midnight-teal .logo{width:68px;height:68px}.theme-executive-compact .student-photo,.theme-midnight-teal .student-photo{width:60px;height:74px}.theme-executive-compact .school-title h1,.theme-midnight-teal .school-title h1{font-size:22px}.theme-executive-compact .identity,.theme-midnight-teal .identity{margin:7px 0}.theme-executive-compact .signatures,.theme-midnight-teal .signatures{margin-top:8px}
.theme-prestige-gold .document-frame{border-width:2px}.theme-prestige-gold .title-rule{width:165px}.theme-prestige-gold .summary-emphasis{box-shadow:inset 0 0 0 1px var(--report-primary-mid)}
.theme-ocean-cyan .school-head{border-radius:14px 14px 5px 5px}.theme-ocean-cyan .marks th{letter-spacing:.08em}.theme-ocean-cyan .attendance-progress{height:7px}
.theme-emerald-modern .remarks p{border-left-width:5px}.theme-emerald-modern .summary-grid>div{box-shadow:0 3px 0 var(--report-primary-mid)}
.theme-cocoa-earth .document-top-rule i:nth-child(2){background:var(--report-primary-mid)}
.theme-graphite-lime .marks tbody tr:nth-child(even){background:transparent}.theme-graphite-lime .marks tbody tr:hover{background:var(--report-primary-soft)}
.theme-skyline-blue .document-top-rule{height:9px}.theme-skyline-blue .identity>div{background:var(--report-primary-soft)}
.theme-midnight-teal .promotion-card{border-left:4px solid var(--report-primary)}
@media(max-width:820px){.official-shell{padding:8px}.official-toolbar{grid-template-columns:1fr;align-items:stretch}.toolbar-actions{justify-content:flex-start}.paper{width:100%;min-height:0;padding:20px}.document-top-rule{margin:-20px -20px 14px}.school-head{grid-template-columns:70px 1fr 62px;gap:10px}.logo{width:66px;height:66px}.student-photo{width:58px;height:72px}.school-title h1{font-size:21px}.identity{grid-template-columns:repeat(2,1fr)}.identity-primary{grid-column:span 2}.marks{font-size:8px}.summary-grid{grid-template-columns:repeat(2,1fr)}.school-life,.remark-grid{grid-template-columns:1fr}.signatures{grid-template-columns:repeat(2,1fr)}footer{grid-template-columns:1fr}.footer-centre,footer>span:last-child{text-align:left}.header-band .school-head{margin:0 0 10px;padding:12px}}
@media print{.official-toolbar{display:none!important}.official-shell{min-height:0;padding:0!important;background:transparent!important}.official-shell.embedded{break-after:page;page-break-after:always}.paper{width:100%;max-width:none;min-height:0;border:0;box-shadow:none;margin:0;padding:6mm 7mm 5mm}.document-top-rule{margin:-6mm -7mm 5mm}.document-frame{inset:2mm}.watermark{opacity:.025}.marks-wrap{break-inside:avoid}.school-life,.remark-grid,.signatures{break-inside:avoid}.paper{orphans:3;widows:3}}
`;
