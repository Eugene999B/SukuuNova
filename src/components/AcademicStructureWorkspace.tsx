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
  NO_TARGET_SECTION: "The target grade/pathway has no category configured in the next academic year.",
  SECTION_CAPACITY_EXCEEDED: "Every matching target category is full.",
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

export function AcademicStructureWorkspace({ templates, initialState, initialRollovers, academicYears }: Props) {
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
  const sections = state.sections.filter((item) => item.academicYearId === structureYearId && grades.some((grade) => grade.id === item.gradeLevelId) && item.isActive);
  const configuredLevelIds = new Set(sections.map((item) => item.gradeLevelId));
  const unconfiguredLevels = grades.filter((item) => !configuredLevelIds.has(item.id));

  const gradeById = useMemo(() => new Map(state.grades.map((item) => [item.id, item])), [state.grades]);
  const pathwayById = useMemo(() => new Map(state.pathways.map((item) => [item.id, item])), [state.pathways]);
  const sectionById = useMemo(() => new Map(state.sections.map((item) => [item.id, item])), [state.sections]);
  const yearById = useMemo(() => new Map(academicYears.map((item) => [item.id, item])), [academicYears]);

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
    const installed = state.frameworks.find((item) => item.templateKey === template.key && item.status === "active");
    if (installed) {
      setSelectedFrameworkId(installed.id);
      setNotice({ tone: "ok", text: `${installed.name} is already installed. Add categories to the standard levels below.` });
      return;
    }
    await run(`template:${template.key}`, async () => {
      const result = await postAction({ action: "installTemplate", templateKey: template.key, makeDefault: true });
      await refreshState();
      setSelectedFrameworkId(result.id);
      setNotice({ tone: "ok", text: `${result.name} is now the school structure. Add only the categories/streams each level needs.` });
    });
  }

  async function addCategories(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("categories") || "").trim();
    const categories = raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : ["Main"];
    const gradeLevelId = String(form.get("gradeLevelId") || "");
    await run("add-categories", async () => {
      const result = await postAction({
        action: "addLevelCategories",
        academicYearId: structureYearId,
        gradeLevelId,
        categories,
        pathwayId: String(form.get("pathwayId") || "") || null,
        capacity: String(form.get("capacity") || "") ? Number(form.get("capacity")) : null,
      });
      await refreshState();
      event.currentTarget.reset();
      const levelName = gradeById.get(gradeLevelId)?.name ?? "Level";
      setNotice({ tone: "ok", text: `${result.count} categor${result.count === 1 ? "y" : "ies"} saved for ${levelName}. No separate class creation is needed.` });
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
      const next = await postAction({ action: "previewRollover", frameworkId: selectedFrameworkId, sourceAcademicYearId: sourceYearId, targetAcademicYearId: targetYearId });
      setPlan(next);
      setNotice({ tone: "ok", text: `${item.studentName}'s year-end decision was updated.` });
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
        <h1>Choose the standard. Add only your categories.</h1>
        <p>The installed template defines the school's class levels and progression. A school only adds categories such as A, B and C where a level has multiple classes.</p>
      </div>
      <div className="structure-hero-rule"><strong>Core rule</strong><span>Template level + category = class</span><small>Example: Basic 3 + A/B/C becomes Basic 3A, Basic 3B and Basic 3C.</small></div>
    </section>

    <div className="structure-tabs" role="tablist" aria-label="Academic structure workspace">
      <button className={tab === "structure" ? "active" : ""} onClick={() => setTab("structure")}>School Structure</button>
      <button className={tab === "rollover" ? "active" : ""} onClick={() => setTab("rollover")}>Year-End Rollover</button>
    </div>

    {notice ? <div className={`structure-notice ${notice.tone}`}>{notice.text}</div> : null}

    {tab === "structure" ? <>
      <section className="structure-card">
        <div className="structure-section-head">
          <div><span className="structure-overline">01 · STANDARD TEMPLATE</span><h2>Install the school's education structure</h2><p>The selected template supplies the standard levels. Schools do not create extra class levels here.</p></div>
          {state.frameworks.length ? <label className="structure-field compact"><span>Installed structure</span><select value={selectedFrameworkId} onChange={(event) => setSelectedFrameworkId(event.target.value)}>{state.frameworks.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " · Default" : ""}</option>)}</select></label> : null}
        </div>
        <div className="template-grid">
          {templates.map((template) => {
            const installed = state.frameworks.some((item) => item.templateKey === template.key && item.status === "active");
            const selected = selectedFramework?.templateKey === template.key;
            return <article className={`template-card ${selected ? "selected" : ""}`} key={template.key} style={{ minWidth: 0, overflow: "hidden" }}>
              <div style={{ minWidth: 0 }}><strong>{template.name}</strong><p style={{ overflowWrap: "anywhere" }}>{template.description}</p></div>
              <div className="template-meta"><span>{template.levelCount} levels</span><span>{template.pathwayCount} pathways</span></div>
              <small>{template.firstLevel} → {template.terminalLevel}</small>
              <button style={{ width: "100%" }} disabled={Boolean(busy)} onClick={() => installTemplate(template)}>{busy === `template:${template.key}` ? "Installing…" : installed ? selected ? "Installed · Selected" : "Use installed template" : "Install template"}</button>
            </article>;
          })}
        </div>
      </section>

      {selectedFramework ? <>
        <section className="structure-stat-grid">
          <div><span>Standard levels</span><strong>{grades.length}</strong><small>{selectedFramework.name}</small></div>
          <div><span>Categories</span><strong>{sections.length}</strong><small>{yearById.get(structureYearId)?.name ?? "Choose a year"}</small></div>
          <div><span>Configured levels</span><strong>{configuredLevelIds.size}</strong><small>Have at least one category</small></div>
          <div><span>Still to configure</span><strong>{unconfiguredLevels.length}</strong><small>Can use one Main category</small></div>
        </section>

        <section className="structure-card">
          <div className="structure-section-head"><div><span className="structure-overline">02 · SCHOOL CLASS STRUCTURE</span><h2>{selectedFramework.name}</h2><p>These levels come from the installed standard and cannot be invented from this screen. Add categories only where the school needs them.</p></div><label className="structure-field compact"><span>Academic year</span><select value={structureYearId} onChange={(event) => setStructureYearId(event.target.value)}>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isLocked ? " · Locked" : ""}</option>)}</select></label></div>
          <div className="phase-list">
            {phases.map((phase) => <div className="phase-block" key={phase}><h3>{phase}</h3><div className="level-list">{grades.filter((item) => item.phase === phase).map((item) => {
              const rules = progression.filter((rule) => rule.fromGradeLevelId === item.id && rule.isDefault);
              const levelSections = sections.filter((section) => section.gradeLevelId === item.id).sort((a, b) => a.displayName.localeCompare(b.displayName));
              return <div className="level-row" key={item.id}>
                <div className="level-sequence">{item.sequence}</div>
                <div className="level-copy"><strong>{item.name}</strong><small>{levelSections.length ? levelSections.map((section) => section.displayName).join(" · ") : "No categories yet"}</small></div>
                <div className="level-next">{rules.length ? rules.map((rule) => rule.outcome === "advance" ? gradeById.get(rule.toGradeLevelId ?? "")?.name ?? "Next level" : rule.outcome === "complete" ? "Complete" : "Exit").join(" · ") : "Template progression"}</div>
              </div>;
            })}</div></div>)}
          </div>
          {pathways.length ? <div className="pathway-strip"><strong>Programmes</strong>{pathways.map((item) => <span key={item.id}>{item.name}</span>)}</div> : null}
        </section>

        <section className="structure-card">
          <div className="structure-section-head"><div><span className="structure-overline">03 · CATEGORIES / STREAMS</span><h2>Add A, B, C — not new class levels</h2><p>Select a standard level and enter its categories separated by commas. Leave the category box empty to create one unsplit class for that level.</p></div></div>
          <form className="section-map-form" onSubmit={addCategories}>
            <label className="structure-field"><span>Standard level</span><select name="gradeLevelId" required><option value="">Choose level</option>{grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="structure-field"><span>Categories</span><input name="categories" placeholder="A, B, C · blank = one class" /></label>
            <label className="structure-field"><span>Programme / pathway</span><select name="pathwayId"><option value="">General / none</option>{pathways.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="structure-field"><span>Capacity per category</span><input name="capacity" type="number" min="1" max="5000" placeholder="Optional" /></label>
            <button disabled={Boolean(busy) || !structureYearId || yearById.get(structureYearId)?.isLocked}>{busy === "add-categories" ? "Saving…" : "Add categories"}</button>
          </form>
          {yearById.get(structureYearId)?.isLocked ? <div className="structure-warning">This academic year is locked, so its class structure cannot be changed.</div> : null}
          <div className="section-table-wrap"><table className="structure-table"><thead><tr><th>Class</th><th>Standard level</th><th>Category</th><th>Programme</th><th>Capacity</th></tr></thead><tbody>{sections.length ? [...sections].sort((a, b) => a.displayName.localeCompare(b.displayName)).map((item) => <tr key={item.id}><td><strong>{item.displayName}</strong></td><td>{gradeById.get(item.gradeLevelId)?.name ?? "Unknown"}</td><td>{item.sectionCode === "MAIN" ? "Single class" : item.sectionCode}</td><td>{item.pathwayId ? pathwayById.get(item.pathwayId)?.name ?? "Unknown" : "General"}</td><td>{item.capacity ?? "No limit"}</td></tr>) : <tr><td colSpan={5} className="empty-cell">No categories have been added for this academic year yet.</td></tr>}</tbody></table></div>
        </section>
      </> : <section className="structure-empty"><strong>Install a standard template first.</strong><p>Choose the education system the school follows. The template becomes the class-level structure; after that you only add categories.</p></section>}
    </> : <>
      <section className="structure-card">
        <div className="structure-section-head"><div><span className="structure-overline">YEAR-END · PREVIEW FIRST</span><h2>Build the next academic year without rewriting the old one</h2><p>Rollover reads the learner's current year-grade record, promotion decision, progression rules and target categories. Nothing moves during preview.</p></div></div>
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
          <div className="structure-section-head"><div><span className="structure-overline">BLOCKERS · RESOLVE BEFORE VALIDATION</span><h2>{plan.summary.blocked} learner(s) need a decision or destination</h2><p>SukuuNova will not guess a missing pathway, silently overfill a category, or overwrite an existing next-year enrollment.</p></div></div>
          <div className="blocker-list">{plan.items.filter((item) => item.status === "blocked").map((item) => {
            const draft = decisionDrafts[item.studentId] ?? { outcome: item.outcome === "deferred" ? "promoted" : item.outcome, targetGradeLevelId: item.targetGradeLevelId ?? "", targetPathwayId: item.targetPathwayId ?? "" };
            const decisionCanHelp = item.blockers.some((blocker) => ["NO_PROGRESSION_RULE", "PATHWAY_REQUIRED", "DECISION_DEFERRED"].includes(blocker));
            return <article className="blocker-card" key={item.studentId}><div className="blocker-person"><strong>{item.studentName}</strong><span>{item.admissionNo || item.studentId}</span><small>{gradeById.get(item.sourceGradeLevelId)?.name ?? "Current level"} → {item.targetGradeLevelId ? gradeById.get(item.targetGradeLevelId)?.name ?? "Target level" : "Unresolved"}</small></div><div className="blocker-reasons">{item.blockers.map((blocker) => <span key={blocker}>{blockerCopy[blocker] ?? blocker}</span>)}</div>{decisionCanHelp ? <div className="decision-editor"><select value={draft.outcome} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [item.studentId]: { ...draft, outcome: event.target.value as DecisionDraft["outcome"] } }))}><option value="promoted">Promoted</option><option value="retained">Retained</option><option value="graduated">Graduated</option><option value="transferred">Transferred / exit</option><option value="withdrawn">Withdrawn</option><option value="deferred">Deferred</option></select><select value={draft.targetGradeLevelId} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [item.studentId]: { ...draft, targetGradeLevelId: event.target.value } }))}><option value="">Use progression / no target</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select><select value={draft.targetPathwayId} onChange={(event) => setDecisionDrafts((current) => ({ ...current, [item.studentId]: { ...draft, targetPathwayId: event.target.value } }))}><option value="">No pathway selected</option>{pathways.map((pathway) => <option key={pathway.id} value={pathway.id}>{pathway.name}</option>)}</select><button disabled={Boolean(busy)} onClick={() => saveDecision(item)}>{busy === `decision:${item.studentId}` ? "Saving…" : "Save decision"}</button></div> : <button className="link-button" onClick={() => setTab("structure")}>Open School Structure to fix categories/capacity</button>}</article>;
          })}</div>
        </section> : null}

        <section className="structure-card">
          <div className="structure-section-head"><div><span className="structure-overline">PLACEMENT PREVIEW</span><h2>Proposed next-year destinations</h2><p>Promotion and retention determine the standard level first. The planner then chooses a compatible category with available capacity.</p></div>{!plan.summary.blocked ? <button disabled={Boolean(busy)} onClick={prepareRollover}>{busy === "prepare-rollover" ? "Validating…" : "Validate rollover"}</button> : null}</div>
          <div className="section-table-wrap"><table className="structure-table"><thead><tr><th>Learner</th><th>Outcome</th><th>From</th><th>Target level</th><th>Target class</th><th>Status</th></tr></thead><tbody>{plan.items.slice(0, 250).map((item) => <tr key={item.studentId}><td><strong>{item.studentName}</strong><small>{item.admissionNo}</small></td><td>{item.outcome.replaceAll("_", " ")}</td><td>{gradeById.get(item.sourceGradeLevelId)?.name ?? "—"}</td><td>{item.targetGradeLevelId ? gradeById.get(item.targetGradeLevelId)?.name ?? "—" : "—"}</td><td>{item.targetClassSectionId ? sectionById.get(item.targetClassSectionId)?.displayName ?? "Resolved class" : "—"}</td><td><span className={`status-pill ${item.status}`}>{item.status}</span></td></tr>)}</tbody></table>{plan.items.length > 250 ? <p className="table-note">Showing the first 250 learners. The validated run still contains the full cohort.</p> : null}</div>
        </section>
      </> : null}

      {(preparedRunId || openValidatedRun) ? <section className="commit-card">
        <div><span className="structure-overline">FINAL COMMIT</span><h2>Validated rollover is ready</h2><p>Commit creates next-year year enrollment and draft term enrollment. It does not rewrite old term history.</p></div>
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
