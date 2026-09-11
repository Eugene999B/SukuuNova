"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  FileCheck2,
  FileEdit,
  GraduationCap,
  Layers3,
  Plus,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import TeacherDocumentEditor, { starterLessonBlocks, type LessonBlock } from "@/components/TeacherDocumentEditor";

type Assignment = { classId: string; subjectId: string; class: { name: string; level: string | null; _count?: { students: number } }; subject: { name: string } };
type Term = { id: string; name: string; startDate: string; endDate: string; isLocked: boolean; academicYear: { name: string }; lifecycle: { state: string; daysUntilEnd: number } };
type PlannerTemplate = "basic_nacca" | "shs_learning_planner";
type GhanaPlanner = {
  template: PlannerTemplate;
  weekEnding: string;
  durationMinutes: number | null;
  classSize: number | null;
  strand: string;
  subStrand: string;
  contentStandard: string;
  learningIndicators: string;
  performanceIndicators: string;
  essentialQuestions: string;
  pedagogicalStrategies: string;
  teachingLearningResources: string;
  relevance: string;
  differentiationApproaching: string;
  differentiationProficient: string;
  differentiationHighlyProficient: string;
  keywords: string;
  coreCompetencies: string;
  sharedGhanaianValues: string;
  gesi: string;
  sel: string;
  ictIntegration: string;
  starterTeacherActivity: string;
  starterLearnerActivity: string;
  mainTeacherActivity: string;
  mainLearnerActivity: string;
  depthOfKnowledge: string;
  lessonClosure: string;
  reflectionRemarks: string;
  reference: string;
};
type Row = {
  id: string; updatedAt: string; classId: string; className: string; subjectId: string; subjectName: string; termId: string | null; termName: string | null;
  title: string; topic: string | null; subTopic: string | null; curriculumObjective: string | null; learningOutcomes: string | null; priorKnowledge: string | null;
  materials: string | null; introduction: string | null; development: string | null; differentiatedActivities: string | null; assessment: string | null; conclusion: string | null;
  homework: string | null; objective: string | null; content: string; resources: unknown; documentContent: unknown; plannedDate: string; status: string; reviewNote: string | null;
  reviewerName: string | null; reviewedAt: string | null; submittedAt: string | null; completedAt: string | null; reflection: string | null;
};
type Data = { assignments: Assignment[]; terms: Term[]; activeTermId: string | null; timezone: string; rows: Row[] };
type Form = {
  id?: string; expectedUpdatedAt?: string; classId: string; subjectId: string; plannedDate: string; weekNumber: number; title: string; topic: string; subTopic: string;
  learningOutcomes: string; priorKnowledge: string; homework: string; assessment: string; blocks: LessonBlock[]; ghana: GhanaPlanner;
};

const today = () => new Date().toISOString().slice(0, 10);
function emptyPlanner(template: PlannerTemplate = "basic_nacca"): GhanaPlanner {
  return {
    template, weekEnding: "", durationMinutes: 60, classSize: null, strand: "", subStrand: "", contentStandard: "", learningIndicators: "", performanceIndicators: "", essentialQuestions: "", pedagogicalStrategies: "",
    teachingLearningResources: "", relevance: "", differentiationApproaching: "", differentiationProficient: "", differentiationHighlyProficient: "", keywords: "", coreCompetencies: "", sharedGhanaianValues: "", gesi: "", sel: "", ictIntegration: "",
    starterTeacherActivity: "", starterLearnerActivity: "", mainTeacherActivity: "", mainLearnerActivity: "", depthOfKnowledge: "", lessonClosure: "", reflectionRemarks: "", reference: "",
  };
}
function likelyTemplate(level: string | null | undefined): PlannerTemplate {
  const value = (level || "").toLowerCase();
  return /shs|senior|form\s*[123]/.test(value) ? "shs_learning_planner" : "basic_nacca";
}
function empty(assignment?: Assignment): Form {
  const template = likelyTemplate(assignment?.class.level);
  return { classId: assignment?.classId || "", subjectId: assignment?.subjectId || "", plannedDate: today(), weekNumber: 1, title: "", topic: "", subTopic: "", learningOutcomes: "", priorKnowledge: "", homework: "", assessment: "", blocks: starterLessonBlocks(), ghana: { ...emptyPlanner(template), classSize: assignment?.class._count?.students || null } };
}
function documentData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { blocks: starterLessonBlocks(), ghana: null as GhanaPlanner | null, weekNumber: 1 };
  const source = value as { blocks?: unknown; ghanaPlanner?: unknown; weekNumber?: unknown };
  const blocks = Array.isArray(source.blocks) && source.blocks.length ? source.blocks as LessonBlock[] : starterLessonBlocks();
  const ghana = source.ghanaPlanner && typeof source.ghanaPlanner === "object" && !Array.isArray(source.ghanaPlanner) ? source.ghanaPlanner as GhanaPlanner : null;
  return { blocks, ghana, weekNumber: Number(source.weekNumber) || 1 };
}
function formFrom(row: Row): Form {
  const doc = documentData(row.documentContent);
  const fallback = emptyPlanner();
  const ghana = doc.ghana ? { ...fallback, ...doc.ghana } : { ...fallback, strand: row.topic || "", subStrand: row.subTopic || "", contentStandard: row.curriculumObjective || "", learningIndicators: row.objective || "", teachingLearningResources: row.materials || "", starterTeacherActivity: row.introduction || "", mainTeacherActivity: row.development || "", depthOfKnowledge: row.assessment || "", lessonClosure: row.conclusion || "" };
  return { id: row.id, expectedUpdatedAt: row.updatedAt, classId: row.classId, subjectId: row.subjectId, plannedDate: row.plannedDate.slice(0, 10), weekNumber: doc.weekNumber, title: row.title, topic: row.topic || "", subTopic: row.subTopic || "", learningOutcomes: row.learningOutcomes || "", priorKnowledge: row.priorKnowledge || "", homework: row.homework || "", assessment: row.assessment || "", blocks: doc.blocks, ghana };
}
async function api(init?: RequestInit) {
  const response = await fetch("/api/teacher/lesson-studio", init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Lesson request failed.");
  return body;
}

export default function TeacherLessonStudioV2() {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(empty());
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [reflection, setReflection] = useState("");

  const activeTerm = data?.terms.find((term) => term.id === data.activeTermId) || null;
  const assignments = useMemo(() => data?.assignments || [], [data]);
  const visible = useMemo(() => { const rows = data?.rows || []; return filter === "all" ? rows : rows.filter((row) => row.status === filter); }, [data, filter]);
  const selectedAssignment = assignments.find((item) => item.classId === form.classId && item.subjectId === form.subjectId);
  const counts = Object.fromEntries(["draft", "submitted", "approved", "changes_requested", "completed", "archived"].map((status) => [status, (data?.rows || []).filter((row) => row.status === status).length]));

  const load = async () => {
    try {
      const next = await api() as Data;
      setData(next);
      setForm((current) => current.classId ? current : empty(next.assignments[0]));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load lesson plans."); }
  };
  useEffect(() => { void load(); }, []);

  function start() { setForm(empty(assignments[0])); setStep(1); setEditing(true); setError(""); setNotice(""); }
  function edit(row: Row) { setForm(formFrom(row)); setStep(1); setEditing(true); setError(""); setNotice(""); }
  function duplicate(row: Row) { const copy = formFrom(row); delete copy.id; delete copy.expectedUpdatedAt; copy.title = `${copy.title} · copy`; copy.plannedDate = today(); setForm(copy); setStep(1); setEditing(true); setError(""); setNotice(""); }
  function patchGhana(patch: Partial<GhanaPlanner>) { setForm((current) => ({ ...current, ghana: { ...current.ghana, ...patch } })); }

  function validateStep(target: number) {
    if (target > 1 && (!form.classId || !form.subjectId || !form.title.trim() || !form.plannedDate)) return "Choose the teaching context, week/date and title first.";
    if (target > 2 && (!form.ghana.strand.trim() || !form.ghana.subStrand.trim() || !form.ghana.contentStandard.trim() || !form.ghana.learningIndicators.trim())) return "Complete Strand, Sub-strand, Content Standard and Learning Indicator(s) before lesson design.";
    if (target > 3 && (!form.ghana.starterTeacherActivity.trim() && !form.ghana.starterLearnerActivity.trim())) return "Add a starter activity before continuing.";
    return "";
  }
  function go(target: number) { const message = validateStep(target); if (message) { setError(message); return; } setError(""); setStep(target); }

  async function save(status: "draft" | "submitted") {
    if (!data?.activeTermId) { setError("There is no active academic term today."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const g = form.ghana;
      const differentiation = [g.differentiationApproaching && `Approaching proficiency: ${g.differentiationApproaching}`, g.differentiationProficient && `Proficient: ${g.differentiationProficient}`, g.differentiationHighlyProficient && `Highly proficient: ${g.differentiationHighlyProficient}`].filter(Boolean).join("\n\n");
      await api({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        action: "save", id: form.id, expectedUpdatedAt: form.expectedUpdatedAt, classId: form.classId, subjectId: form.subjectId, termId: data.activeTermId, plannedDate: form.plannedDate, weekNumber: form.weekNumber, status,
        title: form.title, topic: form.topic || g.strand, subTopic: form.subTopic || g.subStrand, curriculumObjective: g.contentStandard, learningOutcomes: form.learningOutcomes, priorKnowledge: form.priorKnowledge,
        materials: g.teachingLearningResources, introduction: [g.starterTeacherActivity, g.starterLearnerActivity].filter(Boolean).join("\n\n"), development: [g.mainTeacherActivity, g.mainLearnerActivity].filter(Boolean).join("\n\n"), differentiatedActivities: differentiation,
        assessment: form.assessment || g.depthOfKnowledge, conclusion: g.lessonClosure, homework: form.homework, objective: g.learningIndicators.slice(0, 500), resources: [], blocks: form.blocks, ghanaPlanner: g,
      }) });
      setNotice(status === "submitted" ? "Learning plan submitted to academic leadership for verification." : "Learning plan saved as a private draft.");
      setEditing(false); setForm(empty(assignments[0])); setStep(1); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the learning plan."); }
    finally { setBusy(false); }
  }

  async function transition(row: Row, status: "completed" | "archived") {
    setBusy(true); setError("");
    try {
      await api({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "transition", id: row.id, status, reflection: status === "completed" ? reflection : undefined }) });
      setNotice(status === "completed" ? "Lesson marked taught and reflection saved." : "Learning plan archived."); setReflection(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the learning plan."); }
    finally { setBusy(false); }
  }

  return <main className="tlp-page">
    <section className="tlp-hero">
      <div><span>GHANA · TEACHER LEARNING PLANNER</span><h1>Plan from the curriculum, teach from one clear document, submit it for verification.</h1><p>SukuuNova supports the familiar NaCCA Basic/JHS lesson-note structure and the newer SHS Weekly Learning Planner approach, including curriculum alignment, differentiation, DoK assessment, cross-cutting skills and rich teaching notes.</p></div>
      <aside><GraduationCap size={22}/><span>School-selected term</span><strong>{activeTerm?.name || "No active term"}</strong><small>{activeTerm ? `${activeTerm.academicYear.name} · ${activeTerm.lifecycle.daysUntilEnd} day(s) to configured end` : "Leadership must configure the current term."}</small></aside>
    </section>

    {error ? <div className="tlp-alert bad" role="alert">{error}</div> : null}
    {notice ? <div className="tlp-alert good" role="status"><CheckCircle2 size={17}/>{notice}</div> : null}

    {!editing ? <>
      <section className="tlp-kpis"><article><strong>{data?.rows.length || 0}</strong><span>My plans</span></article><article><strong>{counts.submitted || 0}</strong><span>Awaiting review</span></article><article><strong>{counts.changes_requested || 0}</strong><span>Needs revision</span></article><article><strong>{(counts.approved || 0) + (counts.completed || 0)}</strong><span>Approved / taught</span></article></section>
      <section className="tlp-card">
        <header><div><span>MY LEARNING PLANS</span><h2>Weekly planning & verification</h2><p>Draft privately, submit when complete, respond to review notes, and record a reflection after teaching.</p></div><button className="tlp-primary" disabled={!activeTerm || !assignments.length} onClick={start}><Plus size={16}/>New learning plan</button></header>
        <div className="tlp-tabs">{[["all","All"],["draft","Drafts"],["submitted","Awaiting review"],["changes_requested","Needs changes"],["approved","Approved"],["completed","Taught"]].map(([key, label]) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
        <div className="tlp-list">{visible.length ? visible.map((row) => <article key={row.id}><div className="tlp-doc"><FileEdit size={19}/></div><div><span>{row.className} · {row.subjectName} · {new Date(row.plannedDate).toLocaleDateString("en-GH")}</span><h3>{row.title}</h3><p>{row.topic || row.learningOutcomes || row.content.slice(0, 180)}</p>{row.reviewNote ? <div className="tlp-review"><b>{row.status === "changes_requested" ? "Leadership requested changes" : "Review note"}</b><span>{row.reviewNote}</span>{row.reviewerName ? <small>{row.reviewerName}</small> : null}</div> : null}</div><aside><span className={`tlp-status ${row.status}`}>{row.status.replaceAll("_", " ")}</span>{["draft","changes_requested"].includes(row.status) ? <button onClick={() => edit(row)}>Continue editing</button> : null}<button onClick={() => duplicate(row)}><Copy size={14}/>Use as new plan</button>{row.status === "approved" ? <><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="After teaching, add a reflection…"/><button disabled={busy || reflection.trim().length < 10} onClick={() => void transition(row, "completed")}>Mark taught</button></> : null}{row.status === "completed" ? <button disabled={busy} onClick={() => void transition(row, "archived")}>Archive</button> : null}</aside></article>) : <div className="tlp-empty"><BookOpenCheck size={34}/><strong>No learning plans in this view.</strong><span>Create a new Ghana-aligned plan or change the pipeline filter.</span></div>}</div>
      </section>
    </> : <section className="tlp-builder">
      <header className="tlp-builder-head"><div><span>{form.id ? "EDIT LEARNING PLAN" : "NEW LEARNING PLAN"}</span><h2>{form.title || "Untitled learning plan"}</h2><p>{selectedAssignment ? `${selectedAssignment.class.level ? `${selectedAssignment.class.level} · ` : ""}${selectedAssignment.class.name} · ${selectedAssignment.subject.name}` : "Choose your teaching context"} · {activeTerm?.name || "No active term"}</p></div><button onClick={() => setEditing(false)}><ArrowLeft size={15}/>Back to my plans</button></header>
      <div className="tlp-steps">{[[1,"Context"],[2,"Curriculum"],[3,"Learning design"],[4,"Rich notes"],[5,"Review"]].map(([number,label]) => <button key={String(number)} className={step === number ? "active" : step > Number(number) ? "done" : ""} onClick={() => go(Number(number))}><span>{step > Number(number) ? <Check size={14}/> : number}</span>{label}</button>)}</div>

      {step === 1 ? <div className="tlp-panel"><SectionTitle number="1" label="TEACHING CONTEXT" title="Set the week and class once"/><div className="tlp-grid four"><label>Class & subject<select value={`${form.classId}:${form.subjectId}`} onChange={(event) => { const chosen = assignments.find((item) => `${item.classId}:${item.subjectId}` === event.target.value); if (chosen) setForm({ ...empty(chosen), title: form.title, plannedDate: form.plannedDate, weekNumber: form.weekNumber }); }}>{assignments.map((item) => <option key={`${item.classId}:${item.subjectId}`} value={`${item.classId}:${item.subjectId}`}>{item.class.level ? `${item.class.level} · ` : ""}{item.class.name} · {item.subject.name}</option>)}</select></label><label>Week<input type="number" min={1} max={60} value={form.weekNumber} onChange={(event) => setForm({ ...form, weekNumber: Number(event.target.value) })}/></label><label>Teaching date<input type="date" value={form.plannedDate} onChange={(event) => setForm({ ...form, plannedDate: event.target.value })}/></label><label>Week ending<input type="date" value={form.ghana.weekEnding} onChange={(event) => patchGhana({ weekEnding: event.target.value })}/></label><label>Duration (minutes)<input type="number" min={1} value={form.ghana.durationMinutes || ""} onChange={(event) => patchGhana({ durationMinutes: Number(event.target.value) || null })}/></label><label>Class size<input type="number" min={1} value={form.ghana.classSize || ""} onChange={(event) => patchGhana({ classSize: Number(event.target.value) || null })}/></label><label className="span-2">Plan title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Exploring equivalent fractions with visual models"/></label></div><div className="tlp-template"><span><Layers3 size={17}/><b>Ghana planning template</b></span><button className={form.ghana.template === "basic_nacca" ? "active" : ""} onClick={() => patchGhana({ template: "basic_nacca" })}>Basic / JHS · NaCCA lesson notes</button><button className={form.ghana.template === "shs_learning_planner" ? "active" : ""} onClick={() => patchGhana({ template: "shs_learning_planner" })}>SHS · Weekly Learning Planner</button></div><Next onClick={() => go(2)} label="Next: curriculum alignment"/></div> : null}

      {step === 2 ? <div className="tlp-panel"><SectionTitle number="2" label="CURRICULUM ALIGNMENT" title="Start from the curriculum, not from formatting" description="Copy the curriculum wording and codes accurately so the whole plan traces back to the intended standard."/><div className="tlp-grid two"><label>Strand *<textarea rows={3} value={form.ghana.strand} onChange={(event) => patchGhana({ strand: event.target.value })} placeholder="Curriculum Strand"/></label><label>Sub-strand *<textarea rows={3} value={form.ghana.subStrand} onChange={(event) => patchGhana({ subStrand: event.target.value })} placeholder="Curriculum Sub-strand"/></label><label>Content Standard *<textarea rows={4} value={form.ghana.contentStandard} onChange={(event) => patchGhana({ contentStandard: event.target.value })} placeholder="Copy the Content Standard and code"/></label><label>Learning Indicator(s) *<textarea rows={4} value={form.ghana.learningIndicators} onChange={(event) => patchGhana({ learningIndicators: event.target.value })} placeholder="Indicator code(s) and wording"/></label><label>Learning Outcome(s)<textarea rows={4} value={form.learningOutcomes} onChange={(event) => setForm({ ...form, learningOutcomes: event.target.value })} placeholder="Observable outcomes learners should demonstrate"/></label><label>Performance Indicator(s)<textarea rows={4} value={form.ghana.performanceIndicators} onChange={(event) => patchGhana({ performanceIndicators: event.target.value })} placeholder="How will successful performance look?"/></label><label>Topic<input value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })}/></label><label>Sub-topic<input value={form.subTopic} onChange={(event) => setForm({ ...form, subTopic: event.target.value })}/></label><label className="span-2">Reference<textarea rows={3} value={form.ghana.reference} onChange={(event) => patchGhana({ reference: event.target.value })} placeholder="NaCCA curriculum / Teacher Manual, page(s), textbook or approved reference"/></label></div><div className="tlp-nav"><button onClick={() => go(1)}><ArrowLeft size={15}/>Back</button><button className="tlp-primary" onClick={() => go(3)}>Next: learning design<ArrowRight size={15}/></button></div></div> : null}

      {step === 3 ? <div className="tlp-panel"><SectionTitle number="3" label="LEARNING DESIGN" title={form.ghana.template === "shs_learning_planner" ? "Build the new SHS Weekly Learning Planner" : "Build the NaCCA lesson phases"} description={form.ghana.template === "shs_learning_planner" ? "Essential questions, pedagogy, differentiation, cross-cutting skills, teacher activity, learner activity and DoK assessment live together here." : "Keep Starter, Main learning/assessment and Plenary/Reflection clear while still capturing competencies and differentiation."}/>
        <div className="tlp-grid two">{form.ghana.template === "shs_learning_planner" ? <><label>Essential Question(s) *<textarea rows={4} value={form.ghana.essentialQuestions} onChange={(event) => patchGhana({ essentialQuestions: event.target.value })} placeholder="Open questions that frame the learning"/></label><label>Pedagogical Strategies *<textarea rows={4} value={form.ghana.pedagogicalStrategies} onChange={(event) => patchGhana({ pedagogicalStrategies: event.target.value })} placeholder="e.g. collaborative learning, enquiry, talk for learning, project-based learning"/></label><label>Relevance / real-life connection<textarea rows={3} value={form.ghana.relevance} onChange={(event) => patchGhana({ relevance: event.target.value })}/></label></> : null}<label>Teaching & Learning Resources (TLRs) *<textarea rows={4} value={form.ghana.teachingLearningResources} onChange={(event) => patchGhana({ teachingLearningResources: event.target.value })} placeholder="Physical, locally available and digital resources"/></label><label>Prior knowledge<textarea rows={3} value={form.priorKnowledge} onChange={(event) => setForm({ ...form, priorKnowledge: event.target.value })}/></label><label>Keywords<textarea rows={3} value={form.ghana.keywords} onChange={(event) => patchGhana({ keywords: event.target.value })}/></label><label>Core / 21st Century Competencies<textarea rows={4} value={form.ghana.coreCompetencies} onChange={(event) => patchGhana({ coreCompetencies: event.target.value })} placeholder="Critical thinking, collaboration, communication, creativity, digital literacy…"/></label><label>Shared Ghanaian Values<textarea rows={4} value={form.ghana.sharedGhanaianValues} onChange={(event) => patchGhana({ sharedGhanaianValues: event.target.value })}/></label><label>GESI / inclusive participation<textarea rows={4} value={form.ghana.gesi} onChange={(event) => patchGhana({ gesi: event.target.value })} placeholder="How all learners, including different needs and genders, participate equitably"/></label><label>Social & Emotional Learning<textarea rows={4} value={form.ghana.sel} onChange={(event) => patchGhana({ sel: event.target.value })}/></label><label>ICT / digital integration<textarea rows={4} value={form.ghana.ictIntegration} onChange={(event) => patchGhana({ ictIntegration: event.target.value })} placeholder="Digital resources or tools that meaningfully support learning"/></label></div>
        <div className="tlp-phase"><header><span>PHASE 1</span><h3>Starter · preparing learners for learning</h3></header><div><label>Teacher activity<textarea rows={5} value={form.ghana.starterTeacherActivity} onChange={(event) => patchGhana({ starterTeacherActivity: event.target.value })}/></label><label>Learner activity<textarea rows={5} value={form.ghana.starterLearnerActivity} onChange={(event) => patchGhana({ starterLearnerActivity: event.target.value })}/></label></div></div>
        <div className="tlp-phase"><header><span>PHASE 2</span><h3>Main learning · concepts, skills, competencies & assessment</h3></header><div><label>Teacher activity<textarea rows={8} value={form.ghana.mainTeacherActivity} onChange={(event) => patchGhana({ mainTeacherActivity: event.target.value })}/></label><label>Learner activity<textarea rows={8} value={form.ghana.mainLearnerActivity} onChange={(event) => patchGhana({ mainLearnerActivity: event.target.value })}/></label></div></div>
        <div className="tlp-diff"><header><span>DIFFERENTIATION</span><h3>Plan for the learners in front of you</h3></header><div><label>Approaching proficiency<textarea rows={4} value={form.ghana.differentiationApproaching} onChange={(event) => patchGhana({ differentiationApproaching: event.target.value })}/></label><label>Proficient<textarea rows={4} value={form.ghana.differentiationProficient} onChange={(event) => patchGhana({ differentiationProficient: event.target.value })}/></label><label>Highly proficient<textarea rows={4} value={form.ghana.differentiationHighlyProficient} onChange={(event) => patchGhana({ differentiationHighlyProficient: event.target.value })}/></label></div></div>
        <div className="tlp-grid two"><label>Assessment / evidence of learning<textarea rows={5} value={form.assessment} onChange={(event) => setForm({ ...form, assessment: event.target.value })} placeholder="What evidence will show the indicator has been achieved?"/></label><label>Depth of Knowledge (DoK) alignment<textarea rows={5} value={form.ghana.depthOfKnowledge} onChange={(event) => patchGhana({ depthOfKnowledge: event.target.value })} placeholder="State the DoK level(s) and assessment task(s)"/></label><label>Lesson closure / plenary *<textarea rows={5} value={form.ghana.lessonClosure} onChange={(event) => patchGhana({ lessonClosure: event.target.value })} placeholder="Return to the essential question/indicator and confirm learning"/></label><label>Homework / extension<textarea rows={5} value={form.homework} onChange={(event) => setForm({ ...form, homework: event.target.value })}/></label><label className="span-2">Reflection & remarks<textarea rows={4} value={form.ghana.reflectionRemarks} onChange={(event) => patchGhana({ reflectionRemarks: event.target.value })} placeholder="Complete after teaching or add anticipated reflection prompts"/></label></div>
        <div className="tlp-nav"><button onClick={() => go(2)}><ArrowLeft size={15}/>Back</button><button className="tlp-primary" onClick={() => go(4)}>Next: rich lesson document<ArrowRight size={15}/></button></div>
      </div> : null}

      {step === 4 ? <div className="tlp-panel"><SectionTitle number="4" label="RICH TEACHING DOCUMENT" title="Add the detail you would normally build in Word" description="Use structured headings, paragraphs, bullet and numbered lists, quotations, callouts, images and tables. The content stays safe and editable instead of pasting uncontrolled HTML."/><TeacherDocumentEditor value={form.blocks} onChange={(blocks) => setForm({ ...form, blocks })}/><div className="tlp-nav"><button onClick={() => go(3)}><ArrowLeft size={15}/>Back</button><button className="tlp-primary" onClick={() => go(5)}>Review learning plan<ArrowRight size={15}/></button></div></div> : null}

      {step === 5 ? <div className="tlp-panel"><SectionTitle number="5" label="REVIEW & SUBMIT" title="Read it like the reviewer will" description="The term is already controlled by the school. Verify the curriculum alignment, learner activities, differentiation and assessment before submission."/><div className="tlp-review-grid"><article><span>Class & subject</span><strong>{selectedAssignment?.class.name || "—"}</strong><small>{selectedAssignment?.subject.name || "—"}</small></article><article><span>Week & date</span><strong>Week {form.weekNumber}</strong><small>{new Date(`${form.plannedDate}T00:00:00`).toLocaleDateString("en-GH")}</small></article><article><span>Template</span><strong>{form.ghana.template === "shs_learning_planner" ? "SHS Weekly Learning Planner" : "Basic / JHS NaCCA"}</strong><small>{activeTerm?.name || "No active term"}</small></article><article><span>Curriculum</span><strong>{form.ghana.strand || "Strand missing"}</strong><small>{form.ghana.learningIndicators || "Indicators missing"}</small></article></div><div className="tlp-paper"><header><span>{selectedAssignment?.subject.name || "SUBJECT"} · WEEK {form.weekNumber}</span><h3>{form.title}</h3><p>{form.ghana.strand} → {form.ghana.subStrand}</p></header><section><b>Content Standard</b><p>{form.ghana.contentStandard || "—"}</p><b>Learning Indicator(s)</b><p>{form.ghana.learningIndicators || "—"}</p>{form.ghana.template === "shs_learning_planner" ? <><b>Essential Question(s)</b><p>{form.ghana.essentialQuestions || "—"}</p></> : null}<b>Starter</b><p>{form.ghana.starterTeacherActivity || form.ghana.starterLearnerActivity || "—"}</p><b>Main learning</b><p>{form.ghana.mainTeacherActivity || form.ghana.mainLearnerActivity || "—"}</p><b>Assessment / DoK</b><p>{form.assessment || form.ghana.depthOfKnowledge || "—"}</p><b>Closure</b><p>{form.ghana.lessonClosure || "—"}</p></section></div><div className="tlp-submit"><button onClick={() => go(4)}><ArrowLeft size={15}/>Edit document</button><div><button disabled={busy} onClick={() => void save("draft")}><Save size={16}/>{busy ? "Saving…" : "Save draft"}</button><button className="tlp-primary" disabled={busy || !activeTerm} onClick={() => void save("submitted")}><Send size={16}/>{busy ? "Submitting…" : "Submit for verification"}</button></div></div></div> : null}
    </section>}
  </main>;
}

function SectionTitle({ number, label, title, description }: { number: string; label: string; title: string; description?: string }) {
  return <div className="tlp-section-title"><span>{number} · {label}</span><h3>{title}</h3>{description ? <p>{description}</p> : null}</div>;
}
function Next({ onClick, label }: { onClick: () => void; label: string }) {
  return <div className="tlp-nav one"><button className="tlp-primary" onClick={onClick}>{label}<ArrowRight size={15}/></button></div>;
}
