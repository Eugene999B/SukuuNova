/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useState } from "react";
import { REPORT_CARD_THEMES, reportCardThemeById } from "@/lib/report-card-themes";

type Result = { subjectId: string; subject: string; ca: number | null; exam: number | null; total: number | null; grade: string | null; position: number | null };
type GradeBand = { min: number; max: number; grade: string; label?: string; remark?: string };
type Signature = { role: string; name: string; signatureDataUrl?: string };
type Attendance = { present: number; late: number; totalRecorded: number; expectedDays?: number; absent?: number; attendanceRate?: number | null };
type Trait = { fieldKey: string; label: string; value: string; displayOrder: number };
type StructuredPromotion = { outcome: "promoted" | "retained" | "graduated" | "transferred" | "withdrawn" | "deferred"; status: string; reason: string | null; targetGradeName: string | null; targetPathwayName: string | null } | null;
type SchoolIdentity = {
  name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown;
  motto?: string | null; postalAddress?: string | null; physicalAddress?: string | null; town?: string | null; district?: string | null; region?: string | null; country?: string | null;
  email?: string | null; phonePrimary?: string | null; phoneSecondary?: string | null; website?: string | null; locationText?: string | null; departmentName?: string | null; identifierLabel?: string | null; documentFooter?: string | null;
};
type Data = {
  reportId: string;
  status?: string;
  school: SchoolIdentity;
  student: { name: string; admissionNo: string; photoUrl: string | null; className: string; level: string | null };
  term: { name: string; academicYear: string; startDate: Date | string; endDate: Date | string };
  gradingWeights: { ca: number; exam: number };
  gradingScale?: GradeBand[];
  results: Result[];
  summary: { total: number | null; average: number | null; grade: string | null };
  position: number | null;
  classSize: number;
  classRoll?: number;
  rankedCount: number;
  remarks: string;
  headRemark: string | null;
  attendance: Attendance;
  promotionDecision: "promoted" | "not_promoted" | "decision_required";
  structuredPromotion?: StructuredPromotion;
  yearEndSession?: boolean;
  calendar?: { vacationDate?: Date | string | null; reopeningDate?: Date | string | null };
  reportTraits?: Trait[];
  reportingPolicy?: { id: string | null; version: number | null; name: string | null } | null;
  reportSettings: {
    themeId: string; positionScope: "class" | "year_group"; showOverallPosition: boolean; showSubjectPosition: boolean; showAttendance: boolean; showPromotion: boolean; showStudentPhoto: boolean; showClassTeacherRemark: boolean; showHeadteacherRemark: boolean; behaviorRatingFields: unknown; promotionRule: string; positionPromotionCutoffPercent: number;
  };
  watermark: string;
  classTeacherName: string;
};

const ordinal = (value: number | null) => {
  if (value == null) return "—";
  const mod100 = value % 100;
  return `${value}${mod100 >= 11 && mod100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;
};
const formatNumber = (value: number | null) => value == null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);
const formatDate = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-GH", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "ST";
const cleanParts = (values: Array<string | null | undefined>) => values.filter((value): value is string => Boolean(value?.trim()));
function gradeDescriptor(total: number | null, grade: string | null, scale: GradeBand[] | undefined) {
  if (total == null || !scale?.length) return null;
  const band = scale.find((item) => total >= item.min && total <= item.max && (!grade || item.grade === grade)) ?? scale.find((item) => total >= item.min && total <= item.max);
  return band?.remark?.trim() || band?.label?.trim() || null;
}
function promotionText(data: Data) {
  if (!data.yearEndSession || !data.reportSettings.showPromotion) return null;
  const structured = data.structuredPromotion;
  if (structured?.outcome === "promoted") return { label: "PROMOTED TO", value: structured.targetGradeName ?? "Next Grade", note: structured.targetPathwayName ?? null };
  if (structured?.outcome === "retained") return { label: "YEAR-END DECISION", value: `Retained in ${data.student.className}`, note: structured.reason };
  if (structured?.outcome === "graduated") return { label: "YEAR-END DECISION", value: "Completed / Graduated", note: structured.targetPathwayName ?? null };
  if (structured?.outcome === "deferred") return { label: "YEAR-END DECISION", value: "Referred for Review", note: structured.reason };
  if (structured?.outcome === "transferred") return { label: "YEAR-END DECISION", value: "Transferred Out", note: structured.reason };
  if (structured?.outcome === "withdrawn") return { label: "YEAR-END DECISION", value: "Withdrawn", note: structured.reason };
  if (data.promotionDecision === "promoted") return { label: "YEAR-END DECISION", value: "Promoted", note: null };
  if (data.promotionDecision === "not_promoted") return { label: "YEAR-END DECISION", value: "Not Promoted", note: null };
  return { label: "YEAR-END DECISION", value: "Decision Pending", note: null };
}

export default function OfficialReportCard({ data, signatures, embedded = false }: { data: Data; signatures: Signature[]; embedded?: boolean }) {
  const [previewThemeId, setPreviewThemeId] = useState(data.reportSettings.themeId);
  const theme = reportCardThemeById(previewThemeId);
  const positionDenominator = data.rankedCount || data.classRoll || data.classSize;
  const classRoll = data.classRoll ?? data.classSize;
  const expectedDays = data.attendance.expectedDays ?? data.attendance.totalRecorded;
  const absentDays = data.attendance.absent ?? Math.max(0, expectedDays - data.attendance.present);
  const attendanceRate = data.attendance.attendanceRate ?? (expectedDays > 0 ? Math.round((data.attendance.present / expectedDays) * 1000) / 10 : null);
  const studentPhoto = data.reportSettings.showStudentPhoto && data.student.photoUrl && data.student.photoUrl !== data.school.logoUrl ? data.student.photoUrl : null;
  const promotion = promotionText(data);
  const contacts = cleanParts([data.school.postalAddress, data.school.email, cleanParts([data.school.phonePrimary, data.school.phoneSecondary]).join(" / "), data.school.locationText || cleanParts([data.school.town, data.school.region]).join(", ")]);
  const addressLine = cleanParts([data.school.physicalAddress, data.school.district, data.school.region, data.school.country]).join(" · ");
  const vars = { ["--rc-primary" as string]: theme.primary, ["--rc-accent" as string]: theme.accent, ["--rc-ink" as string]: theme.ink };
  const traits = [...(data.reportTraits ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const reference = data.reportId.slice(-10).toUpperCase();

  return (
    <main className={`official-v2-shell ${embedded ? "embedded" : ""}`}>
      <style>{styles}</style>
      {!embedded ? (
        <header className="official-v2-toolbar">
          <div><span>OFFICIAL REPORT CARD · V2</span><strong>{data.student.name} · {data.term.name}</strong><small>Institutional print preview. Approved reports preserve the identity and policy used when they were issued.</small></div>
          <label><span>Document style</span><select value={previewThemeId} onChange={(event) => setPreviewThemeId(event.target.value)}>{REPORT_CARD_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="toolbar-actions"><button type="button" onClick={() => window.print()}>Print / Save PDF</button><a href={`/api/mvp/report-cards/${encodeURIComponent(data.reportId)}/pdf?download=1`}>Archive PDF</a><Link href="/school/settings/identity">School identity</Link></div>
        </header>
      ) : null}

      <article className={`official-v2-paper font-${theme.fontMode}`} style={vars}>
        {data.watermark ? <div className="rc-watermark">{data.watermark}</div> : null}
        <header className="rc-letterhead">
          <div className="rc-logo">{data.school.logoUrl ? <img src={data.school.logoUrl} alt={`${data.school.name} crest`} /> : <span>{data.school.name.slice(0, 1)}</span>}</div>
          <div className="rc-school-copy">
            <h1>{data.school.name}</h1>
            {data.school.motto ? <strong className="rc-motto">{data.school.motto}</strong> : null}
            {contacts.map((line) => <span key={line}>{line}</span>)}
            {addressLine ? <span>{addressLine}</span> : null}
            {data.school.departmentName ? <span><b>Department:</b> {data.school.departmentName}</span> : null}
          </div>
          <div className={`rc-photo ${studentPhoto ? "with-photo" : ""}`}>{studentPhoto ? <img src={studentPhoto} alt={`${data.student.name} portrait`} /> : <span>{initials(data.student.name)}</span>}<small>Learner</small></div>
        </header>

        <div className="rc-title-block"><span>ACADEMIC REPORT</span><h2>END-OF-TERM REPORT</h2><div /></div>

        <section className="rc-identity-grid" aria-label="Learner details">
          <Field label="Name" value={data.student.name} wide />
          <Field label={data.school.identifierLabel || "Admission No."} value={data.student.admissionNo} />
          <Field label="Class" value={data.student.className} />
          <Field label="Number on Roll" value={classRoll ? String(classRoll) : "—"} />
          <Field label="Academic Year" value={data.term.academicYear} />
          <Field label="Term / Session" value={data.term.name} />
          {data.reportSettings.showOverallPosition ? <Field label={`${data.reportSettings.positionScope === "year_group" ? "Year-group" : "Class"} Position`} value={data.position == null ? "—" : `${ordinal(data.position)} of ${positionDenominator || "—"}`} /> : null}
        </section>

        <section className="rc-calendar-strip">
          <Field label="Vacation Date" value={formatDate(data.calendar?.vacationDate ?? data.term.endDate)} />
          <Field label="Re-opening Date" value={formatDate(data.calendar?.reopeningDate)} />
          {promotion ? <div className="rc-promotion-field"><small>{promotion.label}</small><strong>{promotion.value}</strong>{promotion.note ? <span>{promotion.note}</span> : null}</div> : <div className="rc-promotion-field muted"><small>Reporting Period</small><strong>{formatDate(data.term.startDate)} – {formatDate(data.term.endDate)}</strong></div>}
        </section>

        <section className="rc-results-section">
          <div className="rc-section-title"><strong>Academic Performance</strong><span>Class / continuous assessment {formatNumber(data.gradingWeights.ca)}% + examination {formatNumber(data.gradingWeights.exam)}% = 100%</span></div>
          <table className="rc-results">
            <thead><tr><th>Subject</th><th>Class Score<br/><span>({formatNumber(data.gradingWeights.ca)}%)</span></th><th>Exam Score<br/><span>({formatNumber(data.gradingWeights.exam)}%)</span></th><th>Total<br/><span>(100%)</span></th><th>Grade</th>{data.reportSettings.showSubjectPosition ? <th>Position</th> : null}<th>Remarks</th></tr></thead>
            <tbody>
              {data.results.map((result) => <tr key={result.subjectId}><td>{result.subject}</td><td>{formatNumber(result.ca)}</td><td>{formatNumber(result.exam)}</td><td><b>{formatNumber(result.total)}</b></td><td><b>{result.grade ?? "—"}</b></td>{data.reportSettings.showSubjectPosition ? <td>{ordinal(result.position)}</td> : null}<td>{gradeDescriptor(result.total, result.grade, data.gradingScale) ?? "—"}</td></tr>)}
              <tr className="rc-total-row"><td colSpan={3}>TERM TOTAL / SUMMARY</td><td><b>{formatNumber(data.summary.total)}</b></td><td><b>{data.summary.grade ?? "—"}</b></td>{data.reportSettings.showSubjectPosition ? <td>{data.position == null ? "—" : ordinal(data.position)}</td> : null}<td>Average: {formatNumber(data.summary.average)}%</td></tr>
            </tbody>
          </table>
        </section>

        <section className="rc-lower-grid">
          <div className="rc-grading-box">
            <div className="rc-box-title">Grading System</div>
            <div className="rc-grade-list">{(data.gradingScale ?? []).map((band, index) => <div key={`${band.grade}-${index}`}><span>{formatNumber(band.min)}–{formatNumber(band.max)}</span><b>{band.grade}</b><em>{band.remark || band.label || "—"}</em></div>)}</div>
          </div>

          <div className="rc-life-box">
            {data.reportSettings.showAttendance ? <div className="rc-attendance"><div className="rc-box-title">Attendance</div><strong>{data.attendance.present} out of {expectedDays || "—"}</strong><span>{absentDays} absent · {data.attendance.late} late{attendanceRate != null ? ` · ${attendanceRate}%` : ""}</span></div> : null}
            {traits.length ? <div className="rc-traits"><div className="rc-box-title">Learner Development</div>{traits.map((trait) => <div key={trait.fieldKey}><span>{trait.label}</span><b>{trait.value}</b></div>)}</div> : null}
          </div>
        </section>

        <section className="rc-remarks-grid">
          {data.reportSettings.showClassTeacherRemark ? <div><small>CLASS TEACHER&apos;S REMARK</small><p>{data.remarks || "No remark recorded."}</p></div> : null}
          {data.reportSettings.showHeadteacherRemark ? <div><small>HEADTEACHER / PRINCIPAL&apos;S REMARK</small><p>{data.headRemark || "No remark recorded."}</p></div> : null}
        </section>

        <section className="rc-signatures">
          {(signatures.length ? signatures.slice(0, 4) : [{ role: "Class Teacher", name: data.classTeacherName }, { role: "Headteacher / Principal", name: "Headteacher / Principal" }]).map((signature, index) => <div key={`${signature.role}-${index}`}><div className="rc-signature-space">{signature.signatureDataUrl ? <img src={signature.signatureDataUrl} alt={`${signature.role} signature`} /> : null}</div><strong>{signature.name || signature.role}</strong><span>{signature.role}</span></div>)}
        </section>

        <footer className="rc-footer"><div><strong>{data.school.name}</strong><span>{data.school.documentFooter || data.school.motto || "Official learner academic record"}</span></div><div className="rc-ref"><span>Document Ref.</span><b>{reference}</b></div><div><span>Issued through SukuuNova</span><small>{data.reportingPolicy?.version ? `Reporting policy v${data.reportingPolicy.version}` : "Verified school record"}</small></div></footer>
      </article>
    </main>
  );
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "wide" : ""}><small>{label}</small><strong>{value}</strong></div>;
}

const styles = `
@page{size:A4 portrait;margin:7mm}
*{box-sizing:border-box}.official-v2-shell{min-height:100vh;background:var(--color-bg);padding:18px;font-family:Arial,Helvetica,sans-serif;color:#111}.official-v2-toolbar{max-width:1120px;margin:0 auto 14px;display:grid;grid-template-columns:1fr 190px auto;gap:12px;align-items:end;padding:14px 16px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);color:var(--color-text-primary)}.official-v2-toolbar>div:first-child{display:grid;gap:3px}.official-v2-toolbar>div:first-child>span,.official-v2-toolbar label span{font-size:8px;font-weight:900;letter-spacing:.13em;color:var(--color-text-muted)}.official-v2-toolbar>div:first-child>strong{font-size:13px}.official-v2-toolbar>div:first-child>small{font-size:9px;color:var(--color-text-secondary)}.official-v2-toolbar label{display:grid;gap:5px}.official-v2-toolbar select{height:36px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg);color:var(--color-text-primary);padding:0 8px}.toolbar-actions{display:flex;gap:7px;flex-wrap:wrap}.toolbar-actions button,.toolbar-actions a{height:36px;border:1px solid var(--color-border);border-radius:8px;padding:0 10px;display:inline-flex;align-items:center;background:var(--color-surface);color:var(--color-text-primary);text-decoration:none;font-size:9px;font-weight:900}.toolbar-actions button{border-color:var(--color-brand);background:var(--color-brand);color:white;cursor:pointer}
.official-v2-paper{position:relative;width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:#111;padding:8mm 9mm 7mm;box-shadow:0 16px 44px rgba(15,23,42,.16);overflow:hidden;font-family:Georgia,'Times New Roman',serif}.official-v2-paper.font-sans{font-family:Arial,Helvetica,sans-serif}.rc-watermark{position:absolute;inset:47% auto auto 50%;transform:translate(-50%,-50%) rotate(-31deg);font-size:48px;font-weight:900;letter-spacing:.12em;color:rgba(0,0,0,.035);white-space:nowrap;pointer-events:none}.rc-letterhead{display:grid;grid-template-columns:25mm 1fr 25mm;gap:5mm;align-items:start;border-bottom:1.4px solid var(--rc-primary,#111);padding-bottom:3.2mm}.rc-logo,.rc-photo{height:24mm;display:grid;place-items:center}.rc-logo img{width:23mm;height:23mm;object-fit:contain}.rc-logo span{width:20mm;height:20mm;border:1px solid #bbb;border-radius:50%;display:grid;place-items:center;font-size:22px;font-weight:900}.rc-photo{border:1px solid #777;position:relative;overflow:hidden;background:#fafafa}.rc-photo img{width:100%;height:100%;object-fit:cover}.rc-photo>span{font-size:18px;font-weight:900;color:#777}.rc-photo small{position:absolute;bottom:0;left:0;right:0;padding:1mm;background:rgba(255,255,255,.9);font:700 6px Arial;text-transform:uppercase;text-align:center;letter-spacing:.08em}.rc-school-copy{text-align:center;display:grid;justify-items:center;gap:.7mm}.rc-school-copy h1{margin:0;font-size:20px;line-height:1.05;text-transform:uppercase;letter-spacing:.02em;color:var(--rc-ink,#111)}.rc-motto{font-size:8px;font-style:italic;text-transform:uppercase;letter-spacing:.05em}.rc-school-copy span{font:500 7.4px Arial,Helvetica,sans-serif;line-height:1.25}.rc-school-copy span b{font-weight:800}.rc-title-block{text-align:center;padding:2.2mm 0 1.8mm}.rc-title-block span{display:block;font:800 6.5px Arial;letter-spacing:.17em;color:#555}.rc-title-block h2{margin:.7mm 0;font-size:13px;text-decoration:underline;text-underline-offset:2px}.rc-title-block div{width:24mm;height:1px;background:var(--rc-accent,#777);margin:1mm auto 0}
.rc-identity-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:0;border:1px solid #777;border-bottom:0}.rc-identity-grid>div{min-height:11mm;padding:1.6mm 2mm;border-right:1px solid #aaa;border-bottom:1px solid #aaa;display:grid;align-content:center;gap:.7mm}.rc-identity-grid>div:nth-child(4n){border-right:0}.rc-identity-grid .wide{grid-column:span 2}.rc-identity-grid small,.rc-calendar-strip small,.rc-promotion-field small{font:800 6.2px Arial;text-transform:uppercase;letter-spacing:.08em;color:#555}.rc-identity-grid strong,.rc-calendar-strip strong,.rc-promotion-field strong{font-size:9.2px;line-height:1.2}.rc-calendar-strip{display:grid;grid-template-columns:1fr 1fr 1.45fr;border:1px solid #777;border-top:0}.rc-calendar-strip>div{min-height:12mm;padding:1.5mm 2mm;border-right:1px solid #aaa;display:grid;align-content:center;gap:.7mm}.rc-calendar-strip>div:last-child{border-right:0}.rc-promotion-field{background:rgba(0,0,0,.018)}.rc-promotion-field strong{color:var(--rc-primary,#111);text-transform:uppercase}.rc-promotion-field span{font:600 6.5px Arial;color:#555}.rc-promotion-field.muted strong{font-size:7.4px;text-transform:none;color:#333}
.rc-results-section{margin-top:2.6mm}.rc-section-title{display:flex;justify-content:space-between;align-items:end;gap:8mm;padding:0 0 1.2mm}.rc-section-title strong{font-size:9px;text-transform:uppercase;letter-spacing:.05em}.rc-section-title span{font:600 6.5px Arial;color:#555}.rc-results{width:100%;border-collapse:collapse;table-layout:fixed;font:7.2px Arial,Helvetica,sans-serif}.rc-results th,.rc-results td{border:1px solid #777;padding:1.35mm 1.1mm;text-align:center;vertical-align:middle;line-height:1.15}.rc-results th{background:#f1f1f1;font-weight:900;text-transform:uppercase;font-size:6.3px;letter-spacing:.025em}.rc-results th span{font-size:5.8px}.rc-results th:first-child,.rc-results td:first-child{text-align:left;width:24%}.rc-results th:last-child,.rc-results td:last-child{text-align:left;width:18%}.rc-results td:first-child{font-weight:700}.rc-total-row td{background:#fafafa;font-weight:800}.rc-total-row td:first-child{text-align:right;letter-spacing:.04em}
.rc-lower-grid{display:grid;grid-template-columns:1.25fr .9fr;gap:3mm;margin-top:2.5mm;align-items:start}.rc-grading-box,.rc-life-box{border:1px solid #777;padding:2mm}.rc-box-title{font:900 6.4px Arial;text-transform:uppercase;letter-spacing:.09em;padding-bottom:1mm;border-bottom:1px solid #aaa;margin-bottom:1mm}.rc-grade-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:3mm}.rc-grade-list>div{display:grid;grid-template-columns:13mm 7mm 1fr;gap:1mm;padding:.55mm 0;border-bottom:.5px dotted #bbb;font:6.5px Arial}.rc-grade-list b{text-align:center}.rc-grade-list em{font-style:normal}.rc-life-box{display:grid;gap:2mm}.rc-attendance strong{display:block;font-size:13px;margin:.5mm 0}.rc-attendance span{font:6.7px Arial;color:#444}.rc-traits>div:not(.rc-box-title){display:flex;justify-content:space-between;gap:4mm;padding:.8mm 0;border-bottom:.5px dotted #bbb;font:6.8px Arial}.rc-traits b{text-align:right}
.rc-remarks-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:2.5mm}.rc-remarks-grid>div{border:1px solid #777;min-height:16mm;padding:2mm}.rc-remarks-grid small{font:900 6.2px Arial;letter-spacing:.08em}.rc-remarks-grid p{margin:1.2mm 0 0;font-size:8px;line-height:1.35}.rc-signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:5mm;margin-top:3mm;padding-top:1mm}.rc-signatures>div{text-align:center}.rc-signature-space{height:10mm;border-bottom:1px dotted #555;display:flex;align-items:end;justify-content:center}.rc-signature-space img{max-width:24mm;max-height:9mm;object-fit:contain}.rc-signatures strong{display:block;margin-top:1mm;font-size:7px}.rc-signatures span{display:block;font:6px Arial;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-top:.5mm}.rc-footer{position:absolute;left:9mm;right:9mm;bottom:6mm;border-top:1px solid #777;padding-top:1.8mm;display:grid;grid-template-columns:1fr auto 1fr;gap:5mm;align-items:end;font:6px Arial;color:#555}.rc-footer>div{display:grid;gap:.4mm}.rc-footer>div:last-child{text-align:right}.rc-footer strong{font-size:6.5px;color:#222}.rc-footer small{font-size:5.7px}.rc-ref{text-align:center}.rc-ref b{font-size:6.5px;color:#222;letter-spacing:.08em}
@media(max-width:900px){.official-v2-toolbar{grid-template-columns:1fr}.official-v2-paper{transform-origin:top left}.official-v2-shell{overflow:auto}}@media print{html,body{background:white!important}.official-v2-shell{padding:0;background:white}.official-v2-toolbar{display:none!important}.official-v2-paper{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;overflow:visible}.rc-footer{position:fixed;left:0;right:0;bottom:0}.rc-watermark{-webkit-print-color-adjust:exact;print-color-adjust:exact}.rc-results th{-webkit-print-color-adjust:exact;print-color-adjust:exact}.official-v2-paper{--rc-primary:#111!important;--rc-accent:#444!important;--rc-ink:#111!important}}
`;
