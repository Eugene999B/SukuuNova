"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileEdit, Plus, Save, Send, Sparkles } from "lucide-react";
import TeacherDocumentEditor, { starterLessonBlocks, type LessonBlock } from "@/components/TeacherDocumentEditor";

type Planner = {
  framework: "standards_based" | "secondary_learner_planner";
  strand: string;
  subStrand: string;
  contentStandard: string;
  learningIndicators: string;
  essentialQuestions: string;
  coreCompetencies: string;
  pedagogicalStrategies: string;
  assessmentStrategies: string;
  gesiSel: string;
  ghanaianValues: string;
  references: string;
  durationMinutes: number;
  periodLabel: string;
};
type Assignment = { classId: string; subjectId: string; class: { name: string; level: string | null; _count?: { students: number } }; subject: { name: string } };
type Term = { id: string; name: string; startDate: string; endDate: string; isLocked: boolean; academicYear: { name: string }; lifecycle: { state: string; daysUntilEnd: number } };
type Row = { id: string; updatedAt: string; classId: string; className: string; subjectId: string; subjectName: string; termId: string | null; termName: string | null; title: string; topic: string | null; subTopic: string | null; curriculumObjective: string | null; learningOutcomes: string | null; priorKnowledge: string | null; materials: string | null; introduction: string | null; development: string | null; differentiatedActivities: string | null; assessment: string | null; conclusion: string | null; homework: string | null; objective: string | null; content: string; resources: unknown; documentContent: unknown; plannedDate: string; status: string; reviewNote: string | null; reviewerName: string | null; reviewedAt: string | null; submittedAt: string | null; completedAt: string | null; reflection: string | null };
type Data = { assignments: Assignment[]; terms: Term[]; activeTermId: string | null; timezone: string; rows: Row[] };
type Form = { id?: string; expectedUpdatedAt?: string; classId: string; subjectId: string; plannedDate: string; weekNumber: number; title: string; topic: string; subTopic: string; curriculumObjective: string; learningOutcomes: string; priorKnowledge: string; materials: string; introduction: string; development: string; differentiatedActivities: string; assessment: string; conclusion: string; homework: string; objective: string; resources: { label: string; url: string }[]; blocks: LessonBlock[]; planner: Planner };

const today = () => new Date().toISOString().slice(0, 10);
const defaultPlanner = (): Planner => ({ framework: "standards_based", strand: "", subStrand: "", contentStandard: "", learningIndicators: "", essentialQuestions: "", coreCompetencies: "", pedagogicalStrategies: "", assessmentStrategies: "", gesiSel: "", ghanaianValues: "", references: "", durationMinutes: 60, periodLabel: "" });
const empty = (assignment?: Assignment): Form => ({ classId: assignment?.classId || "", subjectId: assignment?.subjectId || "", plannedDate: today(), weekNumber: 1, title: "", topic: "", subTopic: "", curriculumObjective: "", learningOutcomes: "", priorKnowledge: "", materials: "", introduction: "", development: "", differentiatedActivities: "", assessment: "", conclusion: "", homework: "", objective: "", resources: [], blocks: starterLessonBlocks(), planner: defaultPlanner() });
function content(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function plannerFrom(value: unknown): Planner { const item = content(content(value).planner); return { ...defaultPlanner(), ...item } as Planner; }
function blocksFrom(value: unknown): LessonBlock[] { const blocks = content(value).blocks; return Array.isArray(blocks) && blocks.length ? blocks as LessonBlock[] : starterLessonBlocks(); }
function resourcesFrom(value: unknown): { label: string; url: string }[] { return Array.isArray(value) ? value.filter((item): item is { label: string; url: string } => !!item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string" && typeof (item as { url?: unknown }).url === "string") : []; }
function formFrom(row: Row): Form { const doc = content(row.documentContent); return { id: row.id, expectedUpdatedAt: row.updatedAt, classId: row.classId, subjectId: row.subjectId, plannedDate: row.plannedDate.slice(0, 10), weekNumber: Number(doc.weekNumber || 1), title: row.title, topic: row.topic || "", subTopic: row.subTopic || "", curriculumObjective: row.curriculumObjective || "", learningOutcomes: row.learningOutcomes || "", priorKnowledge: row.priorKnowledge || "", materials: row.materials || "", introduction: row.introduction || "", development: row.development || "", differentiatedActivities: row.differentiatedActivities || "", assessment: row.assessment || "", conclusion: row.conclusion || "", homework: row.homework || "", objective: row.objective || "", resources: resourcesFrom(row.resources), blocks: blocksFrom(row.documentContent), planner: plannerFrom(row.documentContent) }; }
async function api(init?: RequestInit) { const response = await fetch("/api/teacher/lesson-studio", init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || "Lesson request failed."); return body; }

export default function TeacherGhanaLessonPlanner() {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(empty());
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [reflection, setReflection] = useState("");

  const assignments = useMemo(() => data?.assignments ?? [], [data]);
  const activeTerm = data?.terms.find((term) => term.id === data.activeTermId) ?? null;
  const visible = useMemo(() => { const rows = data?.rows ?? []; return filter === "all" ? rows : rows.filter((row) => row.status === filter); }, [data, filter]);
  const selectedAssignment = assignments.find((item) => item.classId === form.classId && item.subjectId === form.subjectId);
  const classSize = selectedAssignment?.class._count?.students ?? null;

  async function load() {
    const next = await api() as Data;
    setData(next);
    setForm((current) => current.classId ? current : empty(next.assignments[0]));
  }
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load lesson plans.")); }, []);

  function start() { setForm(empty(assignments[0])); setStep(1); setEditing(true); setError(""); setNotice(""); }
  function edit(row: Row) { setForm(formFrom(row)); setStep(1); setEditing(true); setError(""); setNotice(""); }
  function patchPlanner(patch: Partial<Planner>) { setForm((current) => ({ ...current, planner: { ...current.planner, ...patch } })); }
  function validateForSubmit() {
    if (!form.title.trim()) return "Add a lesson title.";
    if (!form.planner.strand.trim()) return "Add the curriculum strand.";
    if (!form.planner.subStrand.trim()) return "Add the sub-strand.";
    if (!form.planner.contentStandard.trim()) return "Add the content standard.";
    if (!form.learningOutcomes.trim()) return "Add measurable learning outcomes.";
    if (!form.planner.learningIndicators.trim()) return "Add the learning indicator(s).";
    if (!form.introduction.trim() || !form.development.trim() || !form.conclusion.trim()) return "Complete Starter, Main learning and Reflection/Plenary before submission.";
    if (!form.assessment.trim()) return "Add assessment evidence before submission.";
    return "";
  }

  async function save(status: "draft" | "submitted") {
    if (!data?.activeTermId) { setError("There is no active academic term today."); return; }
    if (status === "submitted") { const invalid = validateForSubmit(); if (invalid) { setError(invalid); return; } }
    setBusy(true); setError(""); setNotice("");
    try {
      await api({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", ...form, curriculumObjective: form.curriculumObjective || form.planner.contentStandard, termId: data.activeTermId, status }) });
      setNotice(status === "submitted" ? "Lesson note submitted to academic leadership for verification." : "Lesson note saved as a private draft.");
      setEditing(false); setForm(empty(assignments[0])); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save lesson."); }
    finally { setBusy(false); }
  }

  async function transition(row: Row, status: "completed" | "archived") {
    setBusy(true); setError("");
    try {
      await api({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "transition", id: row.id, status, reflection: status === "completed" ? reflection : undefined }) });
      setNotice(status === "completed" ? "Lesson marked taught and reflection saved." : "Lesson archived."); setReflection(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update lesson."); }
    finally { setBusy(false); }
  }

  const counts = Object.fromEntries(["draft", "submitted", "approved", "changes_requested", "completed", "archived"].map((status) => [status, (data?.rows ?? []).filter((row) => row.status === status).length]));

  if (!editing) return <div className="tglp-page">
    <section className="tglp-hero"><div><span>GHANA LESSON PLANNER</span><h1>Weekly lesson notes aligned to NaCCA/GES teaching structures.</h1><p>Use the Standards-Based format for Basic School or the Secondary Learner Planner structure. The school term is automatic; you work with week, date, curriculum alignment, lesson phases and evidence of learning.</p></div><div className="tglp-term"><Clock3 size={19}/><span>Current school term</span><strong>{activeTerm?.name || "No active term"}</strong><small>{activeTerm ? `${activeTerm.academicYear.name} · ${activeTerm.lifecycle.daysUntilEnd} day(s) to configured end` : "Leadership controls the academic calendar."}</small></div></section>
    {error ? <div className="tglp-alert bad" role="alert">{error}</div> : null}{notice ? <div className="tglp-alert good" role="status"><CheckCircle2 size={16}/>{notice}</div> : null}
    <section className="tglp-kpis"><article><strong>{data?.rows.length ?? 0}</strong><span>My notes</span></article><article><strong>{counts.submitted || 0}</strong><span>Awaiting vetting</span></article><article><strong>{counts.changes_requested || 0}</strong><span>Returned for changes</span></article><article><strong>{(counts.approved || 0) + (counts.completed || 0)}</strong><span>Approved / taught</span></article></section>
    <section className="tglp-pipeline"><header><div><span>WEEKLY NOTE PIPELINE</span><h2>Draft → submit → leadership review → teach → reflect</h2></div><button className="tglp-primary" type="button" disabled={!activeTerm || !assignments.length} onClick={start}><Plus size={16}/>New lesson note</button></header><nav>{[["all", "All"], ["draft", "Drafts"], ["submitted", "Awaiting review"], ["changes_requested", "Needs changes"], ["approved", "Approved"], ["completed", "Taught"]].map(([key, label]) => <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</nav><div className="tglp-list">{visible.length ? visible.map((row) => <article key={row.id}><div className="tglp-doc-icon"><FileEdit size={19}/></div><div><span>{row.className} · {row.subjectName} · {new Date(row.plannedDate).toLocaleDateString("en-GH")}</span><h3>{row.title}</h3><p>{plannerFrom(row.documentContent).strand || row.topic || row.learningOutcomes || row.content.slice(0, 160)}</p>{row.reviewNote ? <div className="tglp-review"><b>{row.status === "changes_requested" ? "Leadership requested changes" : "Review note"}</b><span>{row.reviewNote}</span></div> : null}</div><aside><span className={`tglp-status ${row.status}`}>{row.status.replaceAll("_", " ")}</span>{["draft", "changes_requested"].includes(row.status) ? <button type="button" onClick={() => edit(row)}>Continue editing</button> : null}{row.status === "approved" ? <><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="Reflection after teaching…"/><button type="button" disabled={busy || reflection.trim().length < 10} onClick={() => void transition(row, "completed")}>Mark taught</button></> : null}{row.status === "completed" ? <button type="button" disabled={busy} onClick={() => void transition(row, "archived")}>Archive</button> : null}</aside></article>) : <div className="tglp-empty"><BookOpenCheck size={32}/><b>No lesson notes in this view.</b><span>Create a new note or change the filter.</span></div>}</div></section>
  </div>;

  return <div className="tglp-editor">
    <section className="tglp-editor-head"><div><span>{form.id ? "EDIT WEEKLY LESSON NOTE" : "NEW WEEKLY LESSON NOTE"}</span><h1>{form.title || "Untitled Ghana lesson note"}</h1><p>{selectedAssignment ? `${selectedAssignment.class.level ? `${selectedAssignment.class.level} · ` : ""}${selectedAssignment.class.name} · ${selectedAssignment.subject.name}` : "Choose a teaching context"} · {activeTerm?.name || "No active term"}</p></div><div><button type="button" onClick={() => setEditing(false)}>Cancel</button><button type="button" disabled={busy} onClick={() => void save("draft")}><Save size={15}/>Save draft</button><button className="tglp-primary" type="button" disabled={busy || !activeTerm} onClick={() => void save("submitted")}><Send size={15}/>Submit for vetting</button></div></section>
    {error ? <div className="tglp-alert bad" role="alert">{error}</div> : null}
    <nav className="tglp-steps"><button type="button" className={step === 1 ? "active" : ""} onClick={() => setStep(1)}><b>1</b><span>Header & curriculum</span></button><button type="button" className={step === 2 ? "active" : ""} onClick={() => setStep(2)}><b>2</b><span>Lesson phases</span></button><button type="button" className={step === 3 ? "active" : ""} onClick={() => setStep(3)}><b>3</b><span>Rich note & submit</span></button></nav>

    {step === 1 ? <section className="tglp-section"><header><div><span>WEEKLY HEADER</span><h2>Curriculum alignment first</h2><p>These fields mirror the information supervisors expect to see before the lesson activities.</p></div><Sparkles size={21}/></header>
      <div className="tglp-grid">
        <label className="wide"><span>Planning format</span><select value={form.planner.framework} onChange={(event) => patchPlanner({ framework: event.target.value as Planner["framework"] })}><option value="standards_based">Basic School · Standards-Based Curriculum</option><option value="secondary_learner_planner">Secondary · Learner Planner / 2024 curriculum structure</option></select></label>
        <label className="wide"><span>Class & subject</span><select value={`${form.classId}:${form.subjectId}`} onChange={(event) => { const chosen = assignments.find((item) => `${item.classId}:${item.subjectId}` === event.target.value); if (chosen) setForm({ ...form, classId: chosen.classId, subjectId: chosen.subjectId }); }}>{assignments.map((item) => <option key={`${item.classId}:${item.subjectId}`} value={`${item.classId}:${item.subjectId}`}>{item.class.level ? `${item.class.level} · ` : ""}{item.class.name} · {item.subject.name}</option>)}</select></label>
        <label><span>Week</span><input type="number" min={1} max={60} value={form.weekNumber} onChange={(event) => setForm({ ...form, weekNumber: Number(event.target.value) })}/></label><label><span>Teaching date</span><input type="date" value={form.plannedDate} onChange={(event) => setForm({ ...form, plannedDate: event.target.value })}/></label><label><span>Duration (minutes)</span><input type="number" min={1} max={360} value={form.planner.durationMinutes} onChange={(event) => patchPlanner({ durationMinutes: Number(event.target.value) })}/></label><label><span>Period / lesson</span><input value={form.planner.periodLabel} onChange={(event) => patchPlanner({ periodLabel: event.target.value })} placeholder="e.g. Period 3"/></label><div className="tglp-readonly"><span>Class size</span><strong>{classSize ?? "—"}</strong><small>From the live class roster</small></div>
        <label className="wide"><span>Lesson title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Clear lesson title"/></label>
        <label><span>Topic</span><input value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })}/></label><label><span>Sub-topic</span><input value={form.subTopic} onChange={(event) => setForm({ ...form, subTopic: event.target.value })}/></label>
        <label><span>Strand *</span><textarea rows={3} value={form.planner.strand} onChange={(event) => patchPlanner({ strand: event.target.value })}/></label><label><span>Sub-strand *</span><textarea rows={3} value={form.planner.subStrand} onChange={(event) => patchPlanner({ subStrand: event.target.value })}/></label>
        <label className="wide"><span>Content standard *</span><textarea rows={3} value={form.planner.contentStandard} onChange={(event) => { patchPlanner({ contentStandard: event.target.value }); setForm((current) => ({ ...current, curriculumObjective: event.target.value })); }} placeholder="Use the official curriculum wording/code where applicable."/></label>
        <label><span>Learning outcomes *</span><textarea rows={4} value={form.learningOutcomes} onChange={(event) => setForm({ ...form, learningOutcomes: event.target.value })} placeholder="By the end of the lesson, learners can…"/></label><label><span>Learning indicator(s) *</span><textarea rows={4} value={form.planner.learningIndicators} onChange={(event) => patchPlanner({ learningIndicators: event.target.value })} placeholder="Indicator codes and observable learning evidence"/></label>
        <label><span>Performance indicator / success criteria</span><textarea rows={3} value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })}/></label><label><span>Essential question(s)</span><textarea rows={3} value={form.planner.essentialQuestions} onChange={(event) => patchPlanner({ essentialQuestions: event.target.value })}/></label>
        <label><span>Core competencies / 21st-century skills</span><textarea rows={4} value={form.planner.coreCompetencies} onChange={(event) => patchPlanner({ coreCompetencies: event.target.value })} placeholder="e.g. CP, CC, CI, DL… and the activity that develops them"/></label><label><span>Ghanaian values</span><textarea rows={4} value={form.planner.ghanaianValues} onChange={(event) => patchPlanner({ ghanaianValues: event.target.value })}/></label>
        <label><span>GESI / SEL considerations</span><textarea rows={4} value={form.planner.gesiSel} onChange={(event) => patchPlanner({ gesiSel: event.target.value })} placeholder="Inclusion, participation, social-emotional support and accommodations"/></label><label><span>Pedagogical strategies</span><textarea rows={4} value={form.planner.pedagogicalStrategies} onChange={(event) => patchPlanner({ pedagogicalStrategies: event.target.value })} placeholder="Think-pair-share, modelling, inquiry, group work…"/></label>
      </div>
    </section> : null}

    {step === 2 ? <section className="tglp-section"><header><div><span>LESSON PHASES</span><h2>Starter → Main learning → Reflection</h2><p>Keep the lesson learner-centred and show how understanding will be checked during the lesson.</p></div><BookOpenCheck size={21}/></header>
      <div className="tglp-phase-grid">
        <article><span>PHASE 1 · STARTER</span><h3>Activate prior learning</h3><label>Prior knowledge<textarea rows={4} value={form.priorKnowledge} onChange={(event) => setForm({ ...form, priorKnowledge: event.target.value })}/></label><label>Starter / introduction *<textarea rows={6} value={form.introduction} onChange={(event) => setForm({ ...form, introduction: event.target.value })} placeholder="Hook, review, diagnostic question or short opening activity"/></label></article>
        <article><span>PHASE 2 · MAIN</span><h3>Teach, practise and apply</h3><label>Main learning activities *<textarea rows={10} value={form.development} onChange={(event) => setForm({ ...form, development: event.target.value })} placeholder="Teacher activity, learner activity, guided practice, collaboration and independent application"/></label><label>TLRs / materials<textarea rows={4} value={form.materials} onChange={(event) => setForm({ ...form, materials: event.target.value })}/></label><label>Differentiation<textarea rows={4} value={form.differentiatedActivities} onChange={(event) => setForm({ ...form, differentiatedActivities: event.target.value })} placeholder="Support, extension and adaptations for different learner needs"/></label></article>
        <article><span>PHASE 3 · REFLECTION</span><h3>Check, consolidate and close</h3><label>Assessment evidence *<textarea rows={6} value={form.assessment} onChange={(event) => setForm({ ...form, assessment: event.target.value })} placeholder="Questions, observation, practical task, exit ticket, exercise or peer/self assessment"/></label><label>Assessment strategy<textarea rows={4} value={form.planner.assessmentStrategies} onChange={(event) => patchPlanner({ assessmentStrategies: event.target.value })}/></label><label>Reflection / plenary *<textarea rows={5} value={form.conclusion} onChange={(event) => setForm({ ...form, conclusion: event.target.value })}/></label><label>Homework / extension<textarea rows={4} value={form.homework} onChange={(event) => setForm({ ...form, homework: event.target.value })}/></label></article>
      </div>
      <label className="tglp-reference"><span>References / curriculum pages</span><textarea rows={3} value={form.planner.references} onChange={(event) => patchPlanner({ references: event.target.value })} placeholder="NaCCA curriculum, approved textbook, teacher manual, page numbers or approved web resources"/></label>
    </section> : null}

    {step === 3 ? <section className="tglp-section"><header><div><span>RICH DOCUMENT & VETTING</span><h2>Add diagrams, tables, pictures and polished teaching detail</h2><p>The structured planner above remains searchable. This editor is for the actual teaching document you want leadership to review.</p></div><FileEdit size={21}/></header><TeacherDocumentEditor value={form.blocks} onChange={(blocks) => setForm({ ...form, blocks })}/><div className="tglp-submit-note"><CheckCircle2 size={19}/><div><strong>Submission route</strong><span>Save privately as draft, or send the completed weekly note to academic leadership for vetting. Returned notes keep the reviewer comment and can be revised and resubmitted.</span></div></div></section> : null}

    <footer className="tglp-editor-footer"><button type="button" onClick={() => step === 1 ? setEditing(false) : setStep(step - 1)}><ChevronLeft size={15}/>{step === 1 ? "Cancel" : "Back"}</button><div><button type="button" disabled={busy} onClick={() => void save("draft")}><Save size={15}/>Save draft</button>{step < 3 ? <button className="tglp-primary" type="button" onClick={() => setStep(step + 1)}>Continue<ChevronRight size={15}/></button> : <button className="tglp-primary" type="button" disabled={busy || !activeTerm} onClick={() => void save("submitted")}><Send size={15}/>Submit for vetting</button>}</div></footer>
  </div>;
}
