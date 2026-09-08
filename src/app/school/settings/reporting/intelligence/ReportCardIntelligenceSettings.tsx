"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type GradeBand = { min: number; max: number; grade: string; label?: string; remark?: string };
type Theme = {
  id: string;
  key: string;
  name: string;
  description: string;
  density: "standard" | "compact";
  primary: string;
  accent: string;
  ink: string;
  paper: string;
  headerMode: "crest" | "band" | "formal" | "minimal";
  fontMode: "serif" | "sans";
};
type Staff = { id: string; name: string; roles: string[]; hasSignature: boolean };
type ClassRow = { id: string; name: string; level: string | null };
type SignatureSlot = { userId: string; role: string };
type Config = {
  classAssessmentWeight: number;
  examWeight: number;
  classAssessmentTypes: string[];
  examTypes: string[];
  rounding: "nearest" | "down" | "up";
  missingScorePolicy: "blank" | "zero";
  gradingScale: GradeBand[];
  themeId: string;
  showStudentPhoto: boolean;
  showOverallPosition: boolean;
  showSubjectPosition: boolean;
  showAttendance: boolean;
  showPromotion: boolean;
  showClassTeacherRemark: boolean;
  showHeadteacherRemark: boolean;
  signatureSlots: SignatureSlot[];
  finalTermNumber: number;
  autoApplyPromotion: boolean;
  classProgression: Record<string, string>;
  themes: Theme[];
  staff: Staff[];
  classes: ClassRow[];
  currentUserId: string;
};

const fallback: Config = {
  classAssessmentWeight: 30,
  examWeight: 70,
  classAssessmentTypes: ["Exercise", "Homework", "Participation", "Quiz", "Project", "Classwork"],
  examTypes: ["Exam", "Examination"],
  rounding: "nearest",
  missingScorePolicy: "blank",
  gradingScale: [
    { min: 80, max: 100, grade: "A", label: "Excellent", remark: "Excellent" },
    { min: 70, max: 79.99, grade: "B", label: "Very Good", remark: "Very good" },
    { min: 60, max: 69.99, grade: "C", label: "Good", remark: "Good" },
    { min: 50, max: 59.99, grade: "D", label: "Pass", remark: "Pass" },
    { min: 40, max: 49.99, grade: "E", label: "Needs Improvement", remark: "Needs improvement" },
    { min: 0, max: 39.99, grade: "F", label: "Below Standard", remark: "Work harder" },
  ],
  themeId: "preset-ghana-classic",
  showStudentPhoto: true,
  showOverallPosition: true,
  showSubjectPosition: true,
  showAttendance: true,
  showPromotion: true,
  showClassTeacherRemark: true,
  showHeadteacherRemark: true,
  signatureSlots: [],
  finalTermNumber: 3,
  autoApplyPromotion: true,
  classProgression: {},
  themes: [],
  staff: [],
  classes: [],
  currentUserId: "",
};

function savePayload(config: Config) {
  return {
    classAssessmentWeight: Number(config.classAssessmentWeight),
    examWeight: Number(config.examWeight),
    classAssessmentTypes: config.classAssessmentTypes,
    examTypes: config.examTypes,
    rounding: config.rounding,
    missingScorePolicy: config.missingScorePolicy,
    gradingScale: config.gradingScale.map((row) => ({ ...row, min: Number(row.min), max: Number(row.max) })),
    themeId: config.themeId,
    showStudentPhoto: config.showStudentPhoto,
    showOverallPosition: config.showOverallPosition,
    showSubjectPosition: config.showSubjectPosition,
    showAttendance: config.showAttendance,
    showPromotion: config.showPromotion,
    showClassTeacherRemark: config.showClassTeacherRemark,
    showHeadteacherRemark: config.showHeadteacherRemark,
    signatureSlots: config.signatureSlots,
    finalTermNumber: Number(config.finalTermNumber),
    autoApplyPromotion: config.autoApplyPromotion,
    classProgression: Object.fromEntries(Object.entries(config.classProgression).filter(([, next]) => Boolean(next))),
  };
}

export default function ReportCardIntelligenceSettings() {
  const [config, setConfig] = useState<Config>(fallback);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/school/settings/reporting/config", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || "Unable to load report settings.");
        setConfig({ ...fallback, ...payload });
        setLoaded(true);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load report settings."));
  }, []);

  const totalWeight = Number(config.classAssessmentWeight) + Number(config.examWeight);
  const selectedTheme = config.themes.find((theme) => theme.id === config.themeId);
  const signerIds = useMemo(() => new Set(config.signatureSlots.map((slot) => slot.userId)), [config.signatureSlots]);

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (Math.abs(totalWeight - 100) > .001) throw new Error("Class assessment and examination weights must total 100%.");
      const response = await fetch("/api/school/settings/reporting/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(savePayload(config)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Unable to save report settings.");
      setMessage("Report-card grading, design, signers and progression rules saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save report settings.");
    } finally {
      setBusy(false);
    }
  };

  const updateList = (key: "classAssessmentTypes" | "examTypes", index: number, value: string) => {
    setConfig((current) => ({ ...current, [key]: current[key].map((item, itemIndex) => itemIndex === index ? value : item) }));
  };
  const addType = (key: "classAssessmentTypes" | "examTypes") => setConfig((current) => ({ ...current, [key]: [...current[key], key === "classAssessmentTypes" ? "New assessment" : "New exam"] }));
  const removeType = (key: "classAssessmentTypes" | "examTypes", index: number) => setConfig((current) => ({ ...current, [key]: current[key].filter((_, itemIndex) => itemIndex !== index) }));
  const updateGrade = (index: number, patch: Partial<GradeBand>) => setConfig((current) => ({ ...current, gradingScale: current.gradingScale.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));
  const addGrade = () => setConfig((current) => ({ ...current, gradingScale: [...current.gradingScale, { min: 0, max: 0, grade: "New", label: "", remark: "" }] }));
  const updateSigner = (index: number, patch: Partial<SignatureSlot>) => setConfig((current) => ({ ...current, signatureSlots: current.signatureSlots.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));
  const addSigner = () => {
    const candidate = config.staff.find((person) => !signerIds.has(person.id));
    if (!candidate || config.signatureSlots.length >= 4) return;
    setConfig((current) => ({ ...current, signatureSlots: [...current.signatureSlots, { userId: candidate.id, role: candidate.roles[0] || "School Official" }] }));
  };

  return (
    <main className="rc-intel-page">
      <header className="rc-intel-head">
        <div>
          <span className="rc-kicker">ACADEMIC REPORTING · SOURCE OF TRUTH</span>
          <h1>Configure the calculation once, then print the same truth everywhere.</h1>
          <p>Assessment weights, grading bands, report design, positions, signers and promotion rules all feed the same Gradebook → Report Card → Approval → Print workflow.</p>
        </div>
        <div className="rc-head-actions">
          <Link href="/account/signature">My signature</Link>
          <Link href="/school/report-cards">Report cards</Link>
          <button className="rc-btn primary" type="button" disabled={!loaded || busy || Math.abs(totalWeight - 100) > .001} onClick={() => void save()}>{busy ? "Saving…" : "Save reporting setup"}</button>
        </div>
      </header>

      {message ? <div className="rc-message" role="status">{message}</div> : null}

      <section className="rc-section">
        <div className="rc-section-head"><div><span className="rc-kicker">01 · SUBJECT RESULT MODEL</span><h2>How every subject reaches its terminal mark</h2><p>Raw work keeps its real maximum mark—17/20 remains 17/20 in the gradebook. SukuuNova normalizes it before applying these school-wide report weights.</p></div></div>
        <div className="rc-grid-two">
          <div>
            <div className="rc-weight-grid">
              <label className="rc-field"><span>Class assessment</span><input type="number" min="0" max="100" value={config.classAssessmentWeight} onChange={(event) => setConfig((current) => ({ ...current, classAssessmentWeight: Number(event.target.value) }))} /></label>
              <div className="rc-weight-plus">+</div>
              <label className="rc-field"><span>Examination</span><input type="number" min="0" max="100" value={config.examWeight} onChange={(event) => setConfig((current) => ({ ...current, examWeight: Number(event.target.value) }))} /></label>
              <div className={`rc-weight-total ${Math.abs(totalWeight - 100) > .001 ? "bad" : ""}`}>{totalWeight}/100</div>
            </div>
            <div className="rc-callout">The official subject total is normalized to 100 so grading bands and positions remain comparable even when teachers use different raw maximum marks.</div>
          </div>
          <div className="rc-grid-two">
            <label className="rc-field"><span>Rounding</span><select value={config.rounding} onChange={(event) => setConfig((current) => ({ ...current, rounding: event.target.value as Config["rounding"] }))}><option value="nearest">Nearest</option><option value="up">Round up</option><option value="down">Round down</option></select></label>
            <label className="rc-field"><span>Missing score</span><select value={config.missingScorePolicy} onChange={(event) => setConfig((current) => ({ ...current, missingScorePolicy: event.target.value as Config["missingScorePolicy"] }))}><option value="blank">Keep result incomplete</option><option value="zero">Treat missing as zero</option></select></label>
          </div>
        </div>
      </section>

      <div className="rc-grid-two">
        <TypeEditor title="Class assessment types" values={config.classAssessmentTypes} update={(index, value) => updateList("classAssessmentTypes", index, value)} add={() => addType("classAssessmentTypes")} remove={(index) => removeType("classAssessmentTypes", index)} />
        <TypeEditor title="Examination types" values={config.examTypes} update={(index, value) => updateList("examTypes", index, value)} add={() => addType("examTypes")} remove={(index) => removeType("examTypes", index)} />
      </div>

      <section className="rc-section">
        <div className="rc-section-head"><div><span className="rc-kicker">02 · SCHOOL GRADING SCALE</span><h2>The school decides what A, B, C and every remark mean</h2><p>These bands drive subject grades and the overall grade on official reports. They are not hardcoded to one convention.</p></div><button className="rc-btn soft" type="button" onClick={addGrade}>+ Add band</button></div>
        <div className="rc-grade-wrap"><table className="rc-grade-table"><thead><tr><th>Minimum</th><th>Maximum</th><th>Grade</th><th>Label</th><th>Default remark</th><th /></tr></thead><tbody>{config.gradingScale.map((band, index) => <tr key={`${band.grade}-${index}`}><td><input type="number" min="0" max="100" step=".01" value={band.min} onChange={(event) => updateGrade(index, { min: Number(event.target.value) })} /></td><td><input type="number" min="0" max="100" step=".01" value={band.max} onChange={(event) => updateGrade(index, { max: Number(event.target.value) })} /></td><td><input value={band.grade} onChange={(event) => updateGrade(index, { grade: event.target.value })} /></td><td><input value={band.label || ""} onChange={(event) => updateGrade(index, { label: event.target.value })} /></td><td><input value={band.remark || ""} onChange={(event) => updateGrade(index, { remark: event.target.value })} /></td><td><button className="rc-btn danger" type="button" disabled={config.gradingScale.length <= 1} onClick={() => setConfig((current) => ({ ...current, gradingScale: current.gradingScale.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</button></td></tr>)}</tbody></table></div>
      </section>

      <section className="rc-section">
        <div className="rc-section-head">
          <div>
            <span className="rc-kicker">03 · REPORT DESIGN</span>
            <h2>Choose the school&apos;s official print theme</h2>
            <p>{config.themes.length || 20} professionally designed layouts are available. Every design uses the school&apos;s own identity, logo, learner data and reporting rules; design never changes the academic calculation.</p>
          </div>
          {selectedTheme ? <span className="rc-kicker">SELECTED · {selectedTheme.name}</span> : null}
        </div>
        <div className="rc-theme-grid">
          {config.themes.map((theme) => {
            const previewStyle = {
              background: theme.paper,
              color: theme.ink,
              borderColor: theme.primary,
              ["--rc-preview-primary" as string]: theme.primary,
              ["--rc-preview-accent" as string]: theme.accent,
            } as CSSProperties;
            return (
              <label key={theme.id} data-theme-key={theme.key} className={`rc-theme-card ${config.themeId === theme.id ? "selected" : ""}`}>
                <input type="radio" name="report-theme" value={theme.id} checked={config.themeId === theme.id} onChange={() => setConfig((current) => ({ ...current, themeId: theme.id }))} />
                <div className={`rc-theme-preview rc-preview-${theme.headerMode} rc-preview-font-${theme.fontMode}`} style={previewStyle}>
                  <div className="rc-theme-preview-head" style={{ borderBottomColor: theme.primary, background: theme.headerMode === "band" ? theme.primary : theme.paper }} />
                  <div className="rc-theme-preview-lines">{Array.from({ length: theme.density === "compact" ? 35 : 25 }, (_, index) => <span key={index} style={{ background: index % 5 === 0 ? theme.accent : undefined }} />)}</div>
                </div>
                <div className="rc-theme-meta"><span>{theme.headerMode}</span><span>{theme.fontMode}</span><span>{theme.density}</span></div>
                <strong>{theme.name}</strong>
                <p>{theme.description}</p>
              </label>
            );
          })}
        </div>
      </section>

      <section className="rc-section">
        <div className="rc-section-head"><div><span className="rc-kicker">04 · WHAT PRINTS</span><h2>Control the official document content</h2><p>Schools can hide positions or optional sections without changing stored academic evidence.</p></div></div>
        <div className="rc-policy-grid">
          <Toggle label="Learner photograph" detail="Use the stored student photo in the report header." checked={config.showStudentPhoto} onChange={(value) => setConfig((current) => ({ ...current, showStudentPhoto: value }))} />
          <Toggle label="Overall class position" detail="Show the learner's overall position and class size." checked={config.showOverallPosition} onChange={(value) => setConfig((current) => ({ ...current, showOverallPosition: value }))} />
          <Toggle label="Subject positions" detail="Show each learner's position for every subject." checked={config.showSubjectPosition} onChange={(value) => setConfig((current) => ({ ...current, showSubjectPosition: value }))} />
          <Toggle label="Attendance" detail="Show the term attendance summary." checked={config.showAttendance} onChange={(value) => setConfig((current) => ({ ...current, showAttendance: value }))} />
          <Toggle label="Promotion decision" detail="Show promoted/not promoted on the final-term report." checked={config.showPromotion} onChange={(value) => setConfig((current) => ({ ...current, showPromotion: value }))} />
          <Toggle label="Class teacher remark" detail="Written only by the class's assigned head/class teacher." checked={config.showClassTeacherRemark} onChange={(value) => setConfig((current) => ({ ...current, showClassTeacherRemark: value }))} />
          <Toggle label="Headteacher remark" detail="Written or confirmed during the approval stage." checked={config.showHeadteacherRemark} onChange={(value) => setConfig((current) => ({ ...current, showHeadteacherRemark: value }))} />
        </div>
      </section>

      <section className="rc-section">
        <div className="rc-section-head"><div><span className="rc-kicker">05 · OFFICIAL SIGNERS</span><h2>Choose who appears on issued report cards</h2><p>Select staff accounts and label their printed roles. Each person manages their own signature; approval freezes the signature used for the issued report.</p></div><button className="rc-btn soft" type="button" disabled={config.signatureSlots.length >= 4 || config.signatureSlots.length >= config.staff.length} onClick={addSigner}>+ Add signer</button></div>
        <div className="rc-signer-list">
          {config.signatureSlots.length ? config.signatureSlots.map((slot, index) => {
            const person = config.staff.find((staff) => staff.id === slot.userId);
            return (
              <div className="rc-signer-row" key={`${slot.userId}-${index}`}>
                <label className="rc-field"><span>Staff member</span><select value={slot.userId} onChange={(event) => updateSigner(index, { userId: event.target.value })}>{config.staff.filter((staff) => staff.id === slot.userId || !signerIds.has(staff.id)).map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></label>
                <label className="rc-field"><span>Printed role</span><input value={slot.role} onChange={(event) => updateSigner(index, { role: event.target.value })} /></label>
                <div className="rc-signer-person"><strong>{person?.name ?? "Unknown staff"}</strong><small className={person?.hasSignature ? "rc-signature-ready" : "rc-signature-missing"}>{person?.hasSignature ? "Signature ready" : "Signature not saved yet"}</small>{person?.id === config.currentUserId ? <small><Link href="/account/signature">Manage my signature</Link></small> : null}</div>
                <button className="rc-btn danger" type="button" onClick={() => setConfig((current) => ({ ...current, signatureSlots: current.signatureSlots.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</button>
              </div>
            );
          }) : <div className="rc-callout">No signers selected. Add the class teacher, headteacher, administrator or another active school official whose signature should appear.</div>}
        </div>
      </section>

      <section className="rc-section">
        <div className="rc-section-head"><div><span className="rc-kicker">06 · FINAL-TERM PROMOTION</span><h2>Move promoted learners into the next class safely</h2><p>Set the final term and map each class to its next class. The assigned class teacher records each learner&apos;s decision; SukuuNova can apply it after final approval.</p></div></div>
        <div className="rc-grid-two">
          <label className="rc-field"><span>Final term number</span><select value={config.finalTermNumber} onChange={(event) => setConfig((current) => ({ ...current, finalTermNumber: Number(event.target.value) }))}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>Term {value}{value === 3 ? " (common Ghana setup)" : ""}</option>)}</select></label>
          <Toggle label="Apply approved promotions automatically" detail="After the final report is approved, move learners marked Promoted to the mapped next class." checked={config.autoApplyPromotion} onChange={(value) => setConfig((current) => ({ ...current, autoApplyPromotion: value }))} />
        </div>
        <div className="rc-progression-list">{config.classes.map((klass) => <div className="rc-progression-row" key={klass.id}><strong>{klass.level ? `${klass.level} · ` : ""}{klass.name}</strong><span>→</span><label className="rc-field"><span>Next class</span><select value={config.classProgression[klass.id] || ""} onChange={(event) => setConfig((current) => ({ ...current, classProgression: { ...current.classProgression, [klass.id]: event.target.value } }))}><option value="">No automatic next class</option>{config.classes.filter((candidate) => candidate.id !== klass.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.level ? `${candidate.level} · ` : ""}{candidate.name}</option>)}</select></label></div>)}</div>
      </section>
    </main>
  );
}

function TypeEditor({ title, values, update, add, remove }: { title: string; values: string[]; update: (index: number, value: string) => void; add: () => void; remove: (index: number) => void }) {
  return (
    <section className="rc-section">
      <div className="rc-section-head"><div><span className="rc-kicker">ASSESSMENT TYPES</span><h2>{title}</h2></div><button className="rc-btn soft" type="button" onClick={add}>+ Add type</button></div>
      <div className="rc-type-list">{values.map((value, index) => <div className="rc-type-row" key={`${value}-${index}`}><input aria-label={`${title} ${index + 1}`} value={value} onChange={(event) => update(index, event.target.value)} /><button className="rc-btn danger" type="button" disabled={values.length <= 1} onClick={() => remove(index)}>Remove</button></div>)}</div>
    </section>
  );
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="rc-toggle"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
