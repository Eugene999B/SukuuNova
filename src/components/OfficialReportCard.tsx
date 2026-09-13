/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useState } from "react";
import { REPORT_CARD_THEMES, reportCardThemeById } from "@/lib/report-card-themes";
import { OFFICIAL_REPORT_CARD_STYLES } from "@/lib/official-report-card-styles";

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
      <style>{OFFICIAL_REPORT_CARD_STYLES}</style>
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
