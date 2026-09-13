"use client";

import { useMemo, useState, type FormEvent } from "react";

type TemplateSummary = {
  key: "ghana_standard" | "british" | "american" | "cambridge" | "montessori" | "tvet" | "ib";
  name: string;
  description: string;
  levelCount: number;
  pathwayCount: number;
  firstLevel: string | null;
  terminalLevel: string | null;
};

type Framework = { id: string; schoolId: string; name: string; templateKey: string | null; status: string; isDefault: boolean };
type Grade = { id: string; frameworkId: string; key: string; name: string; shortName: string | null; phase: string; sequence: number; kind: string; isTerminal: boolean; pathwayRequired: boolean; isActive: boolean };
type Pathway = { id: string; frameworkId: string; code: string; name: string; category: string | null; isActive: boolean };
type Progression = { id: string; frameworkId: string; fromGradeLevelId: string; toGradeLevelId: string | null; targetPathwayId: string | null; outcome: "advance" | "complete" | "exit"; priority: number; isDefault: boolean; isActive: boolean };
type Section = { id: string; academicYearId: string; gradeLevelId: string; classId: string; pathwayId: string | null; sectionCode: string; displayName: string; capacity: number | null; isActive: boolean };
type StructureState = { frameworks: Framework[]; grades: Grade[]; pathways: Pathway[]; progression: Progression[]; sections: Section[] };
type AcademicYear = { id: string; name: string; startDate: string; endDate: string; isLocked: boolean };
type SchoolClass = { id: string; name: string; level: string | null };
type RolloverHistory = {
  id: string;
  sourceAcademicYearId: string;
  targetAcademicYearId: string;
  frameworkId: string;
  status: string;
  createdAt: string;
  validatedAt: string | null;
  committedAt: string | null;
  totalItems: number;
  blockedItems: number;
  appliedItems: number;
};
type RolloverItem = {
  studentId: string;
  studentName: string;
  admissionNo: string;
  sourceYearEnrollmentId: string;
  decisionId: string | null;
  sourceGradeLevelId: string;
  targetGradeLevelId: string | null;
  targetPathwayId: string | null;
  targetClassSectionId: string | null;
  targetClassId: string | null;
  outcome: "promoted" | "retained" | "graduated" | "transferred" | "withdrawn" | "deferred";
  status: "ready" | "blocked";
  blockers: string[];
};
type RolloverPlan = {
  items: RolloverItem[];
  loads: Record<string, number>;
  summary: { total: number; ready: number; blocked: number; promoted: number; retained: number; graduated: number; transferred: number; withdrawn: number };
};
type DecisionDraft = { outcome: RolloverItem["outcome"]; targetGradeLevelId: string; targetPathwayId: string };

type Props = {
  templates: TemplateSummary[];
  initialState: StructureState;
  initialRollovers: RolloverHistory[];
  academicYears: AcademicYear[];
  classes: SchoolClass[];
};

const API = "/api/school/academic-structure";
const blockerCopy: Record<string, string> = {
  NO_PROGRESSION_RULE: "No next-grade rule is configured for this learner's current level.",
  PATHWAY_REQUIRED: "A programme/pathway must be chosen before placement.",
  NO_TARGET_SECTION: "The target grade/pathway has no section mapped in the next academic year.",
  SECTION_CAPACITY_EXCEEDED: "Every matching target section is full.",
  DECISION_DEFERRED: "The learner's promotion decision is still deferred.",
  TARGET_YEAR_ALREADY_ENROLLED: "The learner already has a next-year enrollment and needs manual review.",
};

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || "The request could not be completed.");
  return body;
}

async function postAction(payload: Record<string, unknown>) {
  return readJson(await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

function prettyDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function AcademicStructureWorkspace({ templates, initialState, initialRollovers, academicYears, classes }: Props) {
  const chronologicalYears = useMemo(() => [...academicYears].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()), [academicYears]);
  const initialTargetYear = chronologicalYears.at(-1)?.id ?? "";
  const initialSourceYear = chronologicalYears.length > 1 ? chronologicalYears.at(-2)?.id ?? "" : chronologicalYears.at(-1)?.id ?? "";
  const [tab, setTab] = useState<"structure" | "rollover">("structure");
  const [state, setState] = useState(initialState);
  const [rollovers, setRollovers] = useState(initialRollovers);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState(initialState.frameworks.find((item) => item.isDefault)?.id ?? initialState.frameworks[0]?.id ?? "");
  const [structureYearId, setStructureYearId] = useState(initialTargetYear);
  const [sourceYearId, setSourceYearId] = useState(initialSourceYear);
  const [targetYearId, setTargetYearId] = useState(initialTargetYear);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [plan, setPlan] = useState<RolloverPlan | null>(null);
  const [preparedRunId, setPreparedRunId] = useState("");
  const [commitConfirmed, setCommitConfirmed] = useState(false);
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, DecisionDraft>>({});

  const selectedFramework = state.frameworks.find((item) => item.id === selectedFrameworkId) ?? null;
  const grades = state.grades.filter((item) => item.frameworkId === selectedFrameworkId && item.isActive).sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
  const pathways = state.pathways.filter((item) => item.frameworkId === selectedFrameworkId && item.isActive).sort((a, b) => a.name.localeCompare(b.name));
  const progression = state.progression.filter((item) => item.frameworkId === selectedFrameworkId && item.isActive);
  const sections = state.sections.filter((item) => item.academicYearId === structureYearId && grades.some((grade) => grade.id === item.gradeLevelId));
  const mappedClassIds = new Set(sections.map((item) => item.classId));
  const unmappedClasses = classes.filter((item) => !mappedClassIds.has(item.id));

  const gradeById = useMemo(() => new Map(state.grades.map((item) => [item.id, item])), [state.grades]);
  const pathwayById = useMemo(() => new Map(state.pathways.map((item) => [item.id, item])), [state.pathways]);
  const sectionById = useMemo(() => new Map(state.sections.map((item) => [item.id, item])), [state.sections]);
  const yearById = useMemo(() => new Map(academicYears.map((item) => [item.id, item])), [academicYears]);
  const classById = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes]);

  async function refreshState() {
    const body = await readJson(await fetch(API, { cache: "no-store" }));
    setState(body.state);
    setRollovers((body.rollovers ?? []).map((item: RolloverHistory) => ({ ...item })));
    setSelectedFrameworkId((current) => body.state.frameworks.some((item: Framework) => item.id === current)
      ? current
      : body.state.frameworks.find((item: Framework) => item.isDefault)?.id ?? body.state.frameworks[0]?.id ?? "");
  }

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The action could not be completed." });
    } finally {
      setBusy("");
    }
  }

  async function installTemplate(template: TemplateSummary) {
    await run(`template:${template.key}`, async () => {
      const result = await postAction({ action: "installTemplate", templateKey: template.key, makeDefault: state.frameworks.length === 0 });
      await refreshState();
      setSelectedFrameworkId(result.id);
      setNotice({ tone: "ok", text: `${result.name} is ready. Now map the school's real classes to these grade levels.` });
    });
  }

  async function createCustomFramework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    await run("custom-framework", async () => {
      const result = await postAction({ action: "createCustomFramework", name, makeDefault: state.frameworks.length === 0 });
      await refreshState();
      setSelectedFrameworkId(result.id);
      event.currentTarget.reset();
      setNotice({ tone: "ok", text: "Custom framework created. Add its grade levels and progression rules below." });
    });
  }

  async function addGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run("add-grade", async () => {
      await postAction({
        action: "addGradeLevel",
        frameworkId: selectedFrameworkId,
        key: String(form.get("key") || ""),
        name: String(form.get("name") || ""),
        shortName: String(form.get("shortName") || "") || null,
        phase: String(form.get("phase") || ""),
        sequence: Number(form.get("sequence")),
        kind: String(form.get("kind") || "grade"),
        isTerminal: form.get("isTerminal") === "on",
        pathwayRequired: form.get("pathwayRequired") === "on",
      });
      await refreshState();
      event.currentTarget.reset();
      setNotice({ tone: "ok", text: "Grade/level added." });
    });
  }

  async function addPathway(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run("add-pathway", async () => {
      await postAction({ action: "createPathway", frameworkId: selectedFrameworkId, code: String(form.get("code") || ""), name: String(form.get("name") || ""), category: String(form.get("category") || "") || null });
      await refreshState();
      event.currentTarget.reset();
      setNotice({ tone: "ok", text: "Pathway added." });
    });
  }

  async function addProgression(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const outcome = String(form.get("outcome") || "advance");
    await run("add-progression", async () => {
      await postAction({
        action: "setProgressionRule",
        frameworkId: selectedFrameworkId,
        fromGradeLevelId: String(form.get("fromGradeLevelId") || ""),
        toGradeLevelId: outcome === "advance" ? String(form.get("toGradeLevelId") || "") || null : null,
        targetPathwayId: String(form.get("targetPathwayId") || "") || null,
        outcome,
        priority: 100,
        isDefault: form.get("isDefault") === "on",
      });
      await refreshState();
      setNotice({ tone: "ok", text: "Progression rule added." });
    });
  }

  async function mapSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const classId = String(form.get("classId") || "");
    const schoolClass = classById.get(classId);
    await run("map-section", async () => {
      await postAction({
        action: "mapClassSection",
        academicYearId: structureYearId,
        gradeLevelId: String(form.get("gradeLevelId") || ""),
        classId,
        pathwayId: String(form.get("pathwayId") || "") || null,
        sectionCode: String(form.get("sectionCode") || ""),
        displayName: String(form.get("displayName") || "") || schoolClass?.name || undefined,
        capacity: String(form.get("capacity") || "") ? Number(form.get("capacity")) : null,
      });
      await refreshState();
      event.currentTarget.reset();
      setNotice({ tone: "ok", text: `${schoolClass?.name ?? "Class"} is now mapped into the academic structure for ${yearById.get(structureYearId)?.name ?? "the selected year"}.` });
    });
  }

  async function previewRollover() {
    if (!selectedFrameworkId || !sourceYearId || !targetYearId) return;
    await run("preview-rollover", async () => {
      const next = await postAction({ action: "previewRollover", frameworkId: selectedFrameworkId, sourceAcademicYearId: sourceYearId, targetAcademicYearId: targetYearId });
      setPlan(next);
      setPreparedRunId("");
      setCommitConfirmed(false);
      setNotice({ tone: next.summary.blocked ? "error" : "ok", text: next.summary.blocked ? `${next.summary.blocked} learner(s) still need resolution before rollover can be validated.` : "Rollover preview is clean. Review the placements before validating it." });
    });
  }

  async function saveDecision(item: RolloverItem) {
    const draft = decisionDrafts[item.studentId] ?? {
      outcome: item.outcome === "deferred" ? "promoted" : item.outcome,
      targetGradeLevelId: item.targetGradeLevelId ?? "",
      targetPathwayId: item.targetPathwayId ?? "",
    };
    await run(`decision:${item.studentId}`, async () => {
      await postAction({
        action: "recordPromotionDecision",
        studentId: item.studentId,
        sourceAcademicYearId: sourceYearId,
        targetAcademicYearId: targetYearId,
        outcome: draft.outcome,
        targetGradeLevelId: draft.targetGradeLevelId || null,
        targetPathwayId: draft.targetPathwayId || null,
      });
      setNotice({ tone: "ok", text: `${item.studentName}'s year-end decision was updated. Rechecking the rollover…` });
      const next = await postAction({ action: "previewRollover", frameworkId: selectedFrameworkId, sourceAcademicYearId: sourceYearId, targetAcademicYearId: targetYearId });
      setPlan(next);
    });
  }

  async function prepareRollover() {
    if (!plan || plan.summary.blocked) return;
    await run("prepare-rollover", async () => {
      const result = await postAction({ action: "prepareRollover", frameworkId: selectedFrameworkId, sourceAcademicYearId: sourceYearId, targetAcademicYearId: targetYearId });
      setPreparedRunId(result.id);
      await refreshState();
      setNotice({ tone: "ok", text: "The rollover is validated and frozen for commit. No learner has been moved yet." });
    });
  }

  async function commitRollover(runId = preparedRunId) {
    if (!runId || !commitConfirmed) return;
    await run(`commit:${runId}`, async () => {
      const result = await postAction({ action: "commitRollover", rolloverId: runId });
      await refreshState();
      setPreparedRunId("");
      setPlan(null);
      setCommitConfirmed(false);
      setNotice({ tone: "ok", text: `Year rollover committed: ${result.summary?.promoted ?? 0} promoted, ${result.summary?.retained ?? 0} retained, ${result.summary?.graduated ?? 0} graduated.` });
    });
  }

  async function cancelRollover(runId: string) {
    await run(`cancel:${runId}`, async () => {
      await postAction({ action: "cancelRollover", rolloverId: runId });
      await refreshState();
      if (preparedRunId === runId) setPreparedRunId("");
      setNotice({ tone: "ok", text: "The open rollover plan was cancelled. No learner history was changed." });
    });
  }

  const phases = [...new Set(grades.map((item) => item.phase))];
  const openValidatedRun = rollovers.find((item) => item.status === "validated" && item.frameworkId === selectedFrameworkId);

  return <div className="structure-page">
    <section className="structure-hero">
      <div>
        <span className="structure-overline">ACADEMIC STRUCTURE · SOURCE OF TRUTH</span>
        <h1>Grades define progression. Sections define placement.</h1>
        <p>SukuuNova now treats a level such as Basic 2 as the academic destination and Basic 2A / 2B as annual placements inside that level. Historical term enrollment stays intact.</p>
      </div>
      <div className="structure-hero-rule"><strong>Core rule</strong><span>Promotion ≠ section assignment</span><small>Preview every year-end movement before commit.</small></div>
    </section>

    <div className="structure-tabs" role="tablist" aria-label="Academic structure workspace">
      <button className={tab === "structure" ? "active" : ""} onClick={() => setTab("structure")}>School Structure</button>
      <button className={tab === "rollover" ? "active" : ""} onClick={() => setTab("rollover")}>Year-End Rollover</button>
    </div>

    {notice ? <div className={`structure-notice ${notice.tone}`}>{notice.text}</div> : null}

    {tab === "structure" ? <>
      <section className="structure-card">
        <div className="structure-section-head">
          <div><span className="structure-overline">01 · FRAMEWORK</span><h2>Choose how this school is organised</h2><p>Templates are starting points. Their labels and progression live in data, not hard-coded application logic.</p></div>
          {state.frameworks.length ? <label className="structure-field compact"><span>Working framework</span><select value={selectedFrameworkId} onChange={(event) => setSelectedFrameworkId(event.target.value)}>{state.frameworks.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " · Default" : ""}</option>)}</select></label> : null}
        </div>
        <div className="template-grid">
          {templates.map((template) => <article className={`template-card ${selectedFramework?.templateKey === template.key ? "selected" : ""}`} key={template.key}>
            <div><strong>{template.name}</strong><p>{template.description}</p></div>
            <div className="template-meta"><span>{template.levelCount} levels</span><span>{template.pathwayCount} pathways</span></div>
            <small>{template.firstLevel} → {template.terminalLevel}</small>
            <button disabled={Boolean(busy)} onClick={() => installTemplate(template)}>{busy === `template:${template.key}` ? "Installing…" : "Install template"}</button>
          </article>)}
        </div>
        <form className="inline-form" onSubmit={createCustomFramework}><label className="structure-field"><span>Or create a custom framework</span><input name="name" placeholder="e.g. Montessori + Cambridge Hybrid" maxLength={120} /></label><button disabled={Boolean(busy)}>Create custom</button></form>
      </section>

      {selectedFramework ? <>
        <section className="structure-stat-grid">
          <div><span>Levels</span><strong>{grades.length}</strong><small>{selectedFramework.name}</small></div>
          <div><span>Pathways</span><strong>{pathways.length}</strong><small>Programme branches</small></div>
          <div><span>Mapped sections</span><strong>{sections.length}</strong><small>{yearById.get(structureYearId)?.name ?? "Choose a year"}</small></div>
          <div><span>Unmapped classes</span><strong>{unmappedClasses.length}</strong><small>Need academic meaning</small></div>
        </section>

        <section className="structure-card">
          <div className="structure-section-head"><div><span className="structure-overline">02 · LEVELS & PROGRESSION</span><h2>{selectedFramework.name}</h2><p>The sequence below is the academic ladder. Sections do not appear here because A/B/C are placements, not promotion destinations.</p></div></div>
          <div className="phase-list">
            {phases.map((phase) => <div className="phase-block" key={phase}><h3>{phase}</h3><div className="level-list">{grades.filter((item) => item.phase === phase).map((item) => {
              const rules = progression.filter((rule) => rule.fromGradeLevelId === item.id && rule.isDefault);
              return <div className="level-row" key={item.id}><div className="level-sequence">{item.sequence}</div><div className="level-copy"><strong>{item.name}</strong><small>{item.kind.replaceAll("_", " ")}{item.pathwayRequired ? " · pathway required" : ""}{item.isTerminal ? " · terminal" : ""}</small></div><div className="level-next">{rules.length ? rules.map((rule) => rule.outcome === "advance" ? gradeById.get(rule.toGradeLevelId ?? "")?.name ?? "Next level" : rule.outcome === "complete" ? "Graduate / complete" : "Exit").join(" · ") : "No default progression"}</div></div>;
            })}</div></div>)}
          </div>
          {pathways.length ? <div className="pathway-strip"><strong>Pathways</strong>{pathways.map((item) => <span key={item.id}>{item.name}</span>)}</div> : null}
          <details className="structure-details"><summary>Customise this framework</summary><div className="custom-grid">
            <form className="structure-form" onSubmit={addGrade}><h3>Add level</h3><label className="structure-field"><span>Name</span><input name="name" required placeholder="Grade / stage name" /></label><div className="form-split"><label className="structure-field"><span>Key</span><input name="key" required placeholder="grade_1" /></label><label className="structure-field"><span>Short name</span><input name="shortName" placeholder="G1" /></label></div><div className="form-split"><label className="structure-field"><span>Phase</span><input name="phase" required placeholder="Primary" /></label><label className="structure-field"><span>Sequence</span><input name="sequence" type="number" min="0" required /></label></div><label className="structure-field"><span>Kind</span><select name="kind"><option value="grade">Grade</option><option value="year">Year</option><option value="stage">Stage</option><option value="level">Level</option><option value="early_years">Early years</option></select></label><label className="check-row"><input name="pathwayRequired" type="checkbox" /> Pathway required before placement</label><label className="check-row"><input name="isTerminal" type="checkbox" /> Terminal/completion level</label><button disabled={Boolean(busy)}>Add level</button></form>
            <form className="structure-form" onSubmit={addPathway}><h3>Add pathway</h3><label className="structure-field"><span>Name</span><input name="name" required placeholder="General Science" /></label><label className="structure-field"><span>Code</span><input name="code" required placeholder="GENERAL_SCIENCE" /></label><label className="structure-field"><span>Category</span><input name="category" placeholder="SHS Programme" /></label><button disabled={Boolean(busy)}>Add pathway</button></form>
            <form className="structure-form" onSubmit={addProgression}><h3>Add progression rule</h3><label className="structure-field"><span>From</span><select name="fromGradeLevelId" required>{grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="structure-field"><span>Outcome</span><select name="outcome"><option value="advance">Advance</option><option value="complete">Complete / graduate</option><option value="exit">Exit</option></select></label><label className="structure-field"><span>To level (for advance)</span><select name="toGradeLevelId"><option value="">Choose level</option>{grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="structure-field"><span>Target pathway (optional)</span><select name="targetPathwayId"><option value="">No fixed pathway</option>{pathways.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="check-row"><input name="isDefault" type="checkbox" defaultChecked /> Default rule from this level</label><button disabled={Boolean(busy)}>Add progression</button></form>
          </div></details>
        </section>

        <section className="structure-card">
          <div className="structure-section-head"><div><span className="structure-overline">03 · ANNUAL SECTIONS</span><h2>Map real classes into the structure</h2><p>A class such as Basic 1A is mapped to the grade Basic 1 for a specific academic year. Existing confirmed enrollment is used to reconstruct year-grade history safely.</p></div><label className="structure-field compact"><span>Academic year</span><select value={structureYearId} onChange={(event) => setStructureYearId(event.target.value)}>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isLocked ? " · Locked" : ""}</option>)}</select></label></div>
          <form className="section-map-form" onSubmit={mapSection}>
            <label className="structure-field"><span>Existing class</span><select name="classId" required><option value="">Choose class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.level ? ` · ${item.level}` : ""}</option>)}</select></label>
            <label className="structure-field"><span>Grade / level</span><select name="gradeLevelId" required><option value="">Choose level</option>{grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="structure-field"><span>Pathway</span><select name="pathwayId"><option value="">None / general</option>{pathways.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="structure-field"><span>Section code</span><input name="sectionCode" required placeholder="A, B, Gold…" /></label>
            <label className="structure-field"><span>Display name</span><input name="displayName" placeholder="Defaults to class name" /></label>
            <label className="structure-field"><span>Capacity</span><input name="capacity" type="number" min="1" max="5000" placeholder="Optional" /></label>
            <button disabled={Boolean(busy) || yearById.get(structureYearId)?.isLocked}>{busy === "map-section" ? "Saving…" : "Save section mapping"}</button>
          </form>
          {yearById.get(structureYearId)?.isLocked ? <div className="structure-warning">This academic year is locked, so its section meaning cannot be changed.</div> : null}
          <div className="section-table-wrap"><table className="structure-table"><thead><tr><th>Section</th><th>Grade</th><th>Pathway</th><th>Capacity</th><th>Legacy class</th></tr></thead><tbody>{sections.length ? sections.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((item) => <tr key={item.id}><td><strong>{item.displayName}</strong><small>{item.sectionCode}</small></td><td>{gradeById.get(item.gradeLevelId)?.name ?? "Unknown"}</td><td>{item.pathwayId ? pathwayById.get(item.pathwayId)?.name ?? "Unknown" : "General"}</td><td>{item.capacity ?? "No limit"}</td><td>{classById.get(item.classId)?.name ?? item.classId}</td></tr>) : <tr><td colSpan={5} className="empty-cell">No classes are mapped for this academic year yet.</td></tr>}</tbody></table></div>
        </section>
      </> : <section className="structure-empty"><strong>Install a framework first.</strong><p>For most Ghanaian schools, choose Ghana Standard. It begins with Creche, Nursery 1, Nursery 2, KG 1 and KG 2 before Basic/JHS/SHS.</p></section>}
    </> : <>
      <section className="structure-card">
        <div className="structure-section-head"><div><span className="structure-overline">YEAR-END · PREVIEW FIRST</span><h2>Build the next academic year without rewriting the old one</h2><p>Rollover reads the learner's current year-grade record, promotion decision, progression rules and target sections. Nothing moves during preview.</p></div></div>
        <div className="rollover-controls">
          <label className="structure-field"><span>Framework</span><select value={selectedFrameworkId} onChange={(event) => { setSelectedFrameworkId(event.target.value); setPlan(null); }}><option value="">Choose framework</option>{state.frameworks.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="structure-field"><span>From academic year</span><select value={sourceYearId} onChange={(event) => { setSourceYearId(event.target.value); setPlan(null); }}>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <div className="rollover-arrow" aria-hidden="true">→</div>
          <label className="structure-field"><span>To academic year</span><select value={targetYearId} onChange={(event) => { setTargetYearId(event.target.value); setPlan(null); }}>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <button disabled={Boolean(busy) || !selectedFrameworkId || !sourceYearId || !targetYearId || sourceYearId === targetYearId} onClick={previewRollover}>{busy === "preview-rollover" ? "Checking…" : "Preview rollover"}</button>
        </div>
        {sourceYearId === targetYearId ? <div className="structure-warning">Choose two different academic years.</div> : null}
      </section>

      {plan ? <>
        <section className="rollover-summary">
          <div><span>Learners</span><strong>{plan.summary.total}</strong></div><div className="good"><span>Ready</span><strong>{plan.summary.ready}</strong></div><div className={plan.summary.blocked ? "bad" : "good"}><span>Blocked</span><strong>{plan.summary.blocked}</strong></div><div><span>Promoted</span><strong>{plan.summary.promoted}</strong></div><div><span>Retained</span><strong>{plan.summary.retained}</strong></div><div><span>Graduating</span><strong>{plan.summary.graduated}</strong></div>
        </section>

        {plan.summary.blocked ? <section className="structure-card">
          <div className="structure-section-head"><div><span className="structure-overline">BLOCKERS · RESOLVE BEFORE VALIDATION</span><h2>{plan.summary.blocked} learner(s) need a decision or destination</h2><p>SukuuNova will not guess a missing pathway, silently overfill a section, or overwrite an existing next-year enrollment.</p></div></div>
          <div className="blocker-list">{plan.items.filter((item) => item.status === "blocked").map((item) => {
            const draft = decisionDrafts[item.studentId] ?? { outcome: item.outcome === "deferred" ? "promoted" : item.outcome, targetGradeLevelId: item.targetGradeLevelId ?? "", targetPathwayId: item.targetPathwayId ?? "" };
            const decisionCanHelp = item.blockers.some((blocker) => ["NO_PROGRESSION_RULE", "PATHWAY_REQUIRED", "DECISION_DEFERRED"].includes(blocker));
            return <article className="blocker-card" key={item.studentId}><div className="blocker-person"><strong>{item.studentName}</strong><span>{item.admissionNo || item.studentId}</span><small>{gradeById.get(item.sourceGradeLevelId)?.name ?? "Current level"} → {item.targetGradeLevelId ? gradeById.get(item.targetGradeLevelId)?.name ?? "Target level" : "Unresolved"}</small></div><div className="blocker-reasons">{item.blockers.map((blocker) => <span key={blocker}>{blockerCopy[blocker] ?? blocker}</span>)}</div>{decisionCanHelp ? <div className="decision-editor"><select value={draft.outcome} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [item.studentId]: { ...draft, outcome: event.target.value as DecisionDraft["outcome"] } }))}><option value="promoted">Promoted</option><option value="retained">Retained</option><option value="graduated">Graduated</option><option value="transferred">Transferred / exit</option><option value="withdrawn">Withdrawn</option><option value="deferred">Deferred</option></select><select value={draft.targetGradeLevelId} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [item.studentId]: { ...draft, targetGradeLevelId: event.target.value } }))}><option value="">Use progression / no target</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select><select value={draft.targetPathwayId} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [item.studentId]: { ...draft, targetPathwayId: event.target.value } }))}><option value="">No pathway selected</option>{pathways.map((pathway) => <option key={pathway.id} value={pathway.id}>{pathway.name}</option>)}</select><button disabled={Boolean(busy)} onClick={() => saveDecision(item)}>{busy === `decision:${item.studentId}` ? "Saving…" : "Save decision"}</button></div> : <button className="link-button" onClick={() => setTab("structure")}>Open School Structure to fix sections/capacity</button>}</article>;
          })}</div>
        </section> : null}

        <section className="structure-card">
          <div className="structure-section-head"><div><span className="structure-overline">PLACEMENT PREVIEW</span><h2>Proposed next-year destinations</h2><p>Promotion and retention determine the grade first. The planner then chooses a compatible section with available capacity.</p></div>{!plan.summary.blocked ? <button disabled={Boolean(busy)} onClick={prepareRollover}>{busy === "prepare-rollover" ? "Validating…" : "Validate rollover"}</button> : null}</div>
          <div className="section-table-wrap"><table className="structure-table"><thead><tr><th>Learner</th><th>Outcome</th><th>From</th><th>Target level</th><th>Target section</th><th>Status</th></tr></thead><tbody>{plan.items.slice(0, 250).map((item) => <tr key={item.studentId}><td><strong>{item.studentName}</strong><small>{item.admissionNo}</small></td><td>{item.outcome.replaceAll("_", " ")}</td><td>{gradeById.get(item.sourceGradeLevelId)?.name ?? "—"}</td><td>{item.targetGradeLevelId ? gradeById.get(item.targetGradeLevelId)?.name ?? "—" : "—"}</td><td>{item.targetClassSectionId ? sectionById.get(item.targetClassSectionId)?.displayName ?? "Resolved section" : "—"}</td><td><span className={`status-pill ${item.status}`}>{item.status}</span></td></tr>)}</tbody></table>{plan.items.length > 250 ? <p className="table-note">Showing the first 250 learners. The validated run still contains the full cohort.</p> : null}</div>
        </section>
      </> : null}

      {(preparedRunId || openValidatedRun) ? <section className="commit-card">
        <div><span className="structure-overline">FINAL COMMIT</span><h2>Validated rollover is ready</h2><p>Commit creates next-year year enrollment and draft term enrollment. It does not rewrite the learner's old term history or the legacy current-class projection.</p></div>
        <label className="check-row commit-check"><input type="checkbox" checked={commitConfirmed} onChange={(event) => setCommitConfirmed(event.target.checked)} /> I have reviewed the preview and understand this creates next-year draft enrollments.</label>
        <button className="danger-action" disabled={!commitConfirmed || Boolean(busy)} onClick={() => commitRollover(preparedRunId || openValidatedRun?.id || "")}>{busy.startsWith("commit:") ? "Committing…" : "Commit year rollover"}</button>
      </section> : null}

      <section className="structure-card">
        <div className="structure-section-head"><div><span className="structure-overline">AUDIT TRAIL</span><h2>Recent rollover runs</h2><p>Prepared, cancelled and committed operations stay visible so leadership can tell exactly what happened.</p></div></div>
        <div className="run-list">{rollovers.length ? rollovers.map((runItem) => <article key={runItem.id}><div><strong>{yearById.get(runItem.sourceAcademicYearId)?.name ?? "Source year"} → {yearById.get(runItem.targetAcademicYearId)?.name ?? "Target year"}</strong><span>{state.frameworks.find((item) => item.id === runItem.frameworkId)?.name ?? "Framework"}</span><small>{prettyDate(runItem.committedAt || runItem.validatedAt || runItem.createdAt)}</small></div><div className="run-metrics"><span className={`status-pill ${runItem.status}`}>{runItem.status}</span><small>{runItem.appliedItems}/{runItem.totalItems} applied · {runItem.blockedItems} blocked</small></div>{["draft", "validated"].includes(runItem.status) ? <button className="link-button" disabled={Boolean(busy)} onClick={() => cancelRollover(runItem.id)}>Cancel</button> : null}</article>) : <div className="structure-empty"><strong>No rollover history yet.</strong><p>Previewing does not create a run. A history entry appears only after validation/preparation.</p></div>}</div>
      </section>
    </>}
  </div>;
}
