"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CopyCheck,
  FilePlus2,
  GraduationCap,
  Plus,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { parseMarkSheetPaste, type MarkStatus } from "@/lib/mark-sheet-input";

type Assignment = { classId: string; subjectId: string; class: { id: string; name: string; level: string | null }; subject: { id: string; name: string } };
type Term = { id: string; name: string; startDate: string; endDate: string; isLocked: boolean; lifecycle?: { state: string; daysUntilEnd: number } };
type Contexts = { assignments: Assignment[]; activeTermId: string | null; activeTerm: Term | null; timezone: string };
type Student = { id: string; name: string; admissionNo: string };
type Score = { id: string; studentId: string; value: number | string; status: MarkStatus; enteredAt: string };
type Work = { id: string; assessmentId: string | null; title: string; kind: string; workDate: string; weekNumber: number; workNumber: number; maxScore: number | string; markingMode: string; status: string; dueAt: string | null; attemptLimit: number; attemptScorePolicy: "highest" | "latest" };
type Assessment = { id: string; name: string; type: string; maxScore: number | string; weight: number | string; scores: Score[] };
type Roster = { students: Student[]; works: Work[]; assessments: Assessment[] };
type QuestionType = "multiple_choice" | "multiple_select" | "true_false" | "short_answer" | "fill_blank" | "numeric" | "ordering" | "long_answer";
type Question = { id: string; type: QuestionType; prompt: string; points: number; options: string[]; answers: string[] };
type WorkDraft = { kind: "Classwork" | "Homework" | "Exercise" | "Participation" | "Quiz" | "Exam"; title: string; instructions: string; workDate: string; weekNumber: number; workNumber: number; maxScore: number; markingMode: "auto" | "manual" | "review"; attemptLimit: number; attemptScorePolicy: "highest" | "latest"; opensAt: string; dueAt: string };

const questionTypes: Array<{ type: QuestionType; label: string; detail: string }> = [
  { type: "multiple_choice", label: "Multiple choice", detail: "One correct option" },
  { type: "multiple_select", label: "Checkboxes", detail: "Several correct options" },
  { type: "true_false", label: "True / false", detail: "Fast objective item" },
  { type: "short_answer", label: "Short answer", detail: "Accepted answers" },
  { type: "fill_blank", label: "Fill in the blank", detail: "Missing word or phrase" },
  { type: "numeric", label: "Number", detail: "Numeric response" },
  { type: "ordering", label: "Ordering", detail: "Arrange items correctly" },
  { type: "long_answer", label: "Long answer", detail: "Teacher-reviewed response" },
];

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
const defaultQuestion = (type: QuestionType = "multiple_choice"): Question => ({
  id: uid(),
  type,
  prompt: "",
  points: 1,
  options: type === "true_false" ? ["True", "False"] : ["Option A", "Option B", "Option C", "Option D"],
  answers: [],
});
const initialWork = (): WorkDraft => ({ kind: "Homework", title: "", instructions: "", workDate: today(), weekNumber: 1, workNumber: 1, maxScore: 10, markingMode: "auto", attemptLimit: 1, attemptScorePolicy: "highest", opensAt: "", dueAt: "" });

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || "Request failed.");
  return body;
}

function requiresOptions(type: QuestionType) { return ["multiple_choice", "multiple_select", "ordering"].includes(type); }
function objectiveNeedsAnswer(type: QuestionType) { return type !== "long_answer"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(value)); }

export default function TeacherAssessmentStudioV4() {
  const [contexts, setContexts] = useState<Contexts>({ assignments: [], activeTermId: null, activeTerm: null, timezone: "Africa/Accra" });
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, MarkStatus>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [bulkScore, setBulkScore] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderStep, setBuilderStep] = useState(1);
  const [work, setWork] = useState<WorkDraft>(initialWork());
  const [questions, setQuestions] = useState<Question[]>([defaultQuestion()]);

  const classes = useMemo(() => Array.from(new Map(contexts.assignments.map((item) => [item.classId, item.class])).values()), [contexts.assignments]);
  const subjects = useMemo(() => contexts.assignments.filter((item) => item.classId === classId), [contexts.assignments, classId]);
  const selectedWork = roster?.works.find((item) => item.id === selectedWorkId) ?? null;
  const selectedAssessment = roster?.assessments.find((item) => item.id === selectedWork?.assessmentId) ?? null;
  const totalAllocated = questions.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
  const dirtyCount = Object.values(dirty).filter(Boolean).length;
  const filteredStudents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = roster?.students ?? [];
    return needle ? rows.filter((student) => `${student.name} ${student.admissionNo}`.toLowerCase().includes(needle)) : rows;
  }, [query, roster]);

  async function loadContexts() {
    const data = await request("/api/school/teacher-academic-workspace") as Contexts;
    setContexts(data);
    const first = data.assignments[0];
    setClassId((current) => current || first?.classId || "");
    setSubjectId((current) => current || first?.subjectId || "");
  }

  async function loadRoster(nextClass = classId, nextSubject = subjectId) {
    if (!nextClass || !nextSubject || !contexts.activeTermId) { setRoster(null); return; }
    const data = await request(`/api/school/teacher-academic-workspace?classId=${encodeURIComponent(nextClass)}&subjectId=${encodeURIComponent(nextSubject)}&termId=${encodeURIComponent(contexts.activeTermId)}`) as Roster;
    setRoster(data);
    setSelectedWorkId((current) => data.works.some((item) => item.id === current) ? current : data.works[0]?.id || "");
  }

  useEffect(() => { void loadContexts().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load teaching scope.")); }, []);
  useEffect(() => { if (classId && subjectId && contexts.activeTermId) void loadRoster().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load class work.")); }, [classId, subjectId, contexts.activeTermId]);
  useEffect(() => {
    const scores = roster?.assessments.find((item) => item.id === roster?.works.find((workItem) => workItem.id === selectedWorkId)?.assessmentId)?.scores ?? [];
    setMarks(Object.fromEntries(scores.map((score) => [score.studentId, String(score.value)])));
    setStatuses(Object.fromEntries(scores.map((score) => [score.studentId, score.status])));
    setDirty({});
    setSelectedStudents([]);
  }, [roster, selectedWorkId]);

  function chooseClass(value: string) {
    if (dirtyCount && !window.confirm("Discard unsaved mark changes?")) return;
    setClassId(value);
    const next = contexts.assignments.find((item) => item.classId === value);
    setSubjectId(next?.subjectId || "");
    setDirty({});
  }

  function openBuilder() {
    setWork((current) => ({ ...initialWork(), workNumber: current.workNumber }));
    setQuestions([defaultQuestion()]);
    setBuilderStep(1);
    setBuilderOpen(true);
    setError("");
  }

  function addQuestion(type: QuestionType) { setQuestions((current) => [...current, defaultQuestion(type)]); }
  function patchQuestion(id: string, patch: Partial<Question>) { setQuestions((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function changeQuestionType(id: string, type: QuestionType) {
    setQuestions((current) => current.map((item) => item.id === id ? { ...defaultQuestion(type), id, prompt: item.prompt, points: item.points } : item));
  }
  function removeQuestion(id: string) { setQuestions((current) => current.length === 1 ? current : current.filter((item) => item.id !== id)); }
  function setOption(question: Question, index: number, value: string) {
    const old = question.options[index];
    const options = question.options.map((item, position) => position === index ? value : item);
    const answers = question.answers.map((item) => item === old ? value : item);
    patchQuestion(question.id, { options, answers });
  }
  function toggleAnswer(question: Question, option: string) {
    if (question.type === "multiple_choice" || question.type === "true_false") patchQuestion(question.id, { answers: [option] });
    else patchQuestion(question.id, { answers: question.answers.includes(option) ? question.answers.filter((item) => item !== option) : [...question.answers, option] });
  }
  function equalizeMarks() {
    const total = Number(work.maxScore) || 0;
    const base = Math.floor((total / questions.length) * 100) / 100;
    let used = 0;
    setQuestions((current) => current.map((item, index) => {
      const points = index === current.length - 1 ? Math.round((total - used) * 100) / 100 : base;
      used += points;
      return { ...item, points };
    }));
  }

  function validateBuilder() {
    if (!classId || !subjectId) return "Choose a class and subject first.";
    if (!work.title.trim()) return "Give the work a clear title.";
    if (!work.workDate) return "Choose the assessment date.";
    if (!questions.length) return "Add at least one question.";
    if (questions.some((item) => !item.prompt.trim())) return "Every question needs wording.";
    if (questions.some((item) => requiresOptions(item.type) && item.options.filter((option) => option.trim()).length < 2)) return "Choice and ordering questions need at least two options.";
    if (questions.some((item) => objectiveNeedsAnswer(item.type) && item.type !== "ordering" && item.answers.length === 0)) return "Set the accepted/correct answer for every automatically marked question.";
    if (questions.some((item) => item.type === "ordering" && item.options.some((option) => !option.trim()))) return "Ordering items cannot contain empty steps.";
    if (Math.abs(totalAllocated - Number(work.maxScore)) > 0.001) return `Question marks total ${totalAllocated}, but the work is out of ${work.maxScore}.`;
    if (work.opensAt && work.dueAt && new Date(work.opensAt).getTime() >= new Date(work.dueAt).getTime()) return "Closing time must be later than opening time.";
    return "";
  }

  async function saveWork() {
    if (!contexts.activeTermId) return;
    const invalid = validateBuilder();
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await request("/api/school/teacher-academic-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "createWork",
          termId: contexts.activeTermId,
          classId,
          subjectId,
          ...work,
          opensAt: work.opensAt ? new Date(work.opensAt).toISOString() : null,
          dueAt: work.dueAt ? new Date(work.dueAt).toISOString() : null,
          questionList: questions.map((question) => ({
            type: question.type,
            prompt: question.prompt.trim(),
            points: Number(question.points),
            options: requiresOptions(question.type) ? question.options.map((item) => item.trim()).filter(Boolean) : undefined,
            acceptedAnswers: question.type === "ordering" ? question.options.map((item) => item.trim()).filter(Boolean) : question.answers.map((item) => item.trim()).filter(Boolean),
          })),
        }),
      });
      setNotice(`${work.kind} saved as a draft. Review it in the work library and publish when ready.`);
      setWork((current) => ({ ...initialWork(), workNumber: current.workNumber + 1 }));
      setQuestions([defaultQuestion()]);
      setBuilderOpen(false);
      await loadRoster();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save work."); }
    finally { setBusy(false); }
  }

  async function publishWork() {
    if (!selectedWorkId) return;
    setBusy(true); setError("");
    try {
      await request("/api/school/teacher-academic-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publishWork", workId: selectedWorkId }) });
      setNotice("Work published. Learners can use it inside the configured opening and closing window.");
      await loadRoster();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish work."); }
    finally { setBusy(false); }
  }

  function mark(studentId: string, value: string, status: MarkStatus = statuses[studentId] || "present") {
    setMarks((current) => ({ ...current, [studentId]: value }));
    setStatuses((current) => ({ ...current, [studentId]: status }));
    setDirty((current) => ({ ...current, [studentId]: true }));
  }
  function toggleStudent(id: string) { setSelectedStudents((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function applyBulk() {
    const value = Number(bulkScore);
    const max = Number(selectedWork?.maxScore || 0);
    if (!selectedStudents.length) { setError("Select learners first."); return; }
    if (!Number.isFinite(value) || value < 0 || value > max) { setError(`Enter a score between 0 and ${max}.`); return; }
    selectedStudents.forEach((id) => mark(id, String(value), "present"));
    setNotice(`${value}/${max} applied to ${selectedStudents.length} selected learner${selectedStudents.length === 1 ? "" : "s"}. Review and save.`);
  }
  function pasteMarks(text: string, start: number) {
    try {
      const changes = parseMarkSheetPaste(text, start, roster?.students.length ?? 0, Number(selectedWork?.maxScore || 0));
      for (const change of changes) {
        const student = roster?.students[change.row];
        if (student) mark(student.id, change.value, change.status);
      }
      setNotice(`${changes.length} pasted mark${changes.length === 1 ? "" : "s"} ready to review.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not paste marks."); }
  }
  async function saveMarks() {
    if (!selectedWorkId || !roster) return;
    setBusy(true); setError("");
    try {
      const existing = new Map((selectedAssessment?.scores ?? []).map((score) => [score.studentId, score]));
      const payload = roster.students.filter((student) => dirty[student.id] && (marks[student.id] ?? "").trim() !== "").map((student) => {
        const before = existing.get(student.id);
        return { studentId: student.id, value: Number(marks[student.id]), status: statuses[student.id] || "present", expected: before ? { id: before.id, value: Number(before.value), status: before.status, enteredAt: before.enteredAt } : null };
      });
      if (!payload.length) throw new Error("Change at least one mark before saving.");
      const result = await request("/api/school/teacher-academic-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveMarks", workId: selectedWorkId, marks: payload }) });
      setNotice(`${result.result.saved} mark${result.result.saved === 1 ? "" : "s"} saved to the gradebook.`);
      setDirty({});
      await loadRoster();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save marks."); }
    finally { setBusy(false); }
  }

  return <div className="tav4-page">
    <section className="tav4-command">
      <div><span>TEACHER · ASSESSMENT WORKSPACE</span><h1>Plan the work, build the questions, publish, then mark from one place.</h1><p>The school owns the academic term. Your job is simpler: choose your class and subject, then create the exact work learners should complete.</p></div>
      <div className="tav4-command-actions"><button className="tav4-primary" type="button" onClick={openBuilder} disabled={!contexts.activeTermId || !contexts.assignments.length}><Plus size={17}/>Add work</button><Link href="/teacher/lessons"><BookOpenCheck size={16}/>Lesson planner</Link></div>
    </section>

    {error ? <div className="tav4-alert bad" role="alert">{error}</div> : null}
    {notice ? <div className="tav4-alert good" role="status"><CheckCircle2 size={16}/>{notice}</div> : null}

    <section className="tav4-context">
      <div className="tav4-field"><span>Class</span><select value={classId} onChange={(event) => chooseClass(event.target.value)}>{classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></div>
      <div className="tav4-field"><span>Subject</span><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{subjects.map((item) => <option key={item.subjectId} value={item.subjectId}>{item.subject.name}</option>)}</select></div>
      <article><Clock3 size={18}/><div><span>Current school term</span><strong>{contexts.activeTerm?.name || "No active term"}</strong><small>Teacher cannot switch the school term</small></div></article>
      <article><UsersRound size={18}/><div><span>Learners in scope</span><strong>{roster?.students.length ?? 0}</strong><small>From your assigned class</small></div></article>
    </section>

    <section className="tav4-library">
      <header><div><span>WORK LIBRARY</span><h2>Everything you have set for this class</h2><p>Draft it, publish it, review submissions and keep its marks connected to the gradebook.</p></div><button type="button" className="tav4-primary" onClick={openBuilder}><FilePlus2 size={16}/>Add work</button></header>
      <div className="tav4-work-grid">{(roster?.works ?? []).length ? (roster?.works ?? []).map((item) => <button type="button" key={item.id} className={item.id === selectedWorkId ? "tav4-work-card active" : "tav4-work-card"} onClick={() => setSelectedWorkId(item.id)}><div><span>{item.kind} · Week {item.weekNumber} · Work {item.workNumber}</span><h3>{item.title}</h3><p>{formatDate(item.workDate)} · {Number(item.maxScore)} marks · {item.attemptLimit} attempt{item.attemptLimit === 1 ? "" : "s"}</p></div><b className={`tav4-status ${item.status}`}>{item.status}</b></button>) : <div className="tav4-empty"><GraduationCap size={32}/><strong>No work created for this class and subject yet.</strong><span>Use Add work to open the guided form builder.</span></div>}</div>
    </section>

    <section className="tav4-markbook" id="marks">
      <header><div><span>FAST MARKBOOK</span><h2>Enter, paste or bulk-apply scores</h2><p>Select an existing work above. You can update previous scores without retyping the whole class.</p></div>{selectedWork?.status === "draft" ? <button className="tav4-primary" type="button" disabled={busy} onClick={() => void publishWork()}><Send size={15}/>Publish work</button> : selectedWork?.status === "published" ? <Link href={`/teacher/studio/review?workId=${encodeURIComponent(selectedWork.id)}`}>Review submissions →</Link> : null}</header>
      {selectedWork ? <>
        <div className="tav4-mark-tools"><div><CopyCheck size={17}/><strong>Same score for selected learners</strong></div><input value={bulkScore} onChange={(event) => setBulkScore(event.target.value)} inputMode="decimal" placeholder={`0–${Number(selectedWork.maxScore)}`}/><button type="button" onClick={applyBulk} disabled={!selectedStudents.length}>Apply to {selectedStudents.length || "selected"}</button><button type="button" onClick={() => setSelectedStudents((roster?.students ?? []).map((student) => student.id))}>Select all</button><button type="button" onClick={() => setSelectedStudents([])}>Clear</button></div>
        <div className="tav4-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner or admission number"/><span>{filteredStudents.length} shown</span></div>
        <div className="tav4-mark-table"><table><thead><tr><th></th><th>Learner</th><th>Score / {Number(selectedWork.maxScore)}</th><th>Status</th></tr></thead><tbody>{filteredStudents.map((student) => {
          const originalIndex = roster?.students.findIndex((item) => item.id === student.id) ?? 0;
          return <tr key={student.id} className={selectedStudents.includes(student.id) ? "selected" : ""}><td><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={() => toggleStudent(student.id)}/></td><td><strong>{student.name}</strong><small>{student.admissionNo}</small></td><td><input value={marks[student.id] ?? ""} inputMode="decimal" onPaste={(event) => { const text = event.clipboardData.getData("text"); if (text.includes("\n")) { event.preventDefault(); pasteMarks(text, originalIndex); } }} onChange={(event) => mark(student.id, event.target.value)}/></td><td><select value={statuses[student.id] || "present"} onChange={(event) => mark(student.id, event.target.value === "present" ? marks[student.id] ?? "" : "0", event.target.value as MarkStatus)}><option value="present">Scored</option><option value="absent">Absent</option><option value="excused">Excused</option></select></td></tr>;
        })}</tbody></table></div>
        <div className="tav4-savebar"><span>{dirtyCount ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}` : "Markbook is up to date."}</span><button type="button" className="tav4-primary" disabled={busy || !dirtyCount} onClick={() => void saveMarks()}><Save size={15}/>{busy ? "Saving…" : "Save marks"}</button></div>
      </> : <div className="tav4-empty"><Check size={30}/><strong>Choose a work above to open its markbook.</strong></div>}
    </section>

    {builderOpen ? <div className="tav4-modal-backdrop" role="presentation">
      <section className="tav4-builder" role="dialog" aria-modal="true" aria-labelledby="tav4-builder-title">
        <header><div><span>ADD WORK</span><h2 id="tav4-builder-title">Create {work.kind.toLowerCase()}</h2><p>Step {builderStep} of 3 · {builderStep === 1 ? "Set the work" : builderStep === 2 ? "Build the questions" : "Choose delivery rules"}</p></div><button type="button" className="tav4-icon" onClick={() => setBuilderOpen(false)} aria-label="Close builder"><X size={18}/></button></header>
        <nav className="tav4-steps" aria-label="Work builder steps"><button type="button" className={builderStep === 1 ? "active" : ""} onClick={() => setBuilderStep(1)}><b>1</b><span>Work details</span></button><button type="button" className={builderStep === 2 ? "active" : ""} onClick={() => setBuilderStep(2)}><b>2</b><span>Questions</span></button><button type="button" className={builderStep === 3 ? "active" : ""} onClick={() => setBuilderStep(3)}><b>3</b><span>Delivery</span></button></nav>

        <div className="tav4-builder-body">
          {builderStep === 1 ? <div className="tav4-form-grid">
            <label><span>Type of work</span><select value={work.kind} onChange={(event) => setWork({ ...work, kind: event.target.value as WorkDraft["kind"] })}>{["Homework", "Classwork", "Exercise", "Participation", "Quiz", "Exam"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Week</span><input type="number" min={1} max={60} value={work.weekNumber} onChange={(event) => setWork({ ...work, weekNumber: Number(event.target.value) })}/></label>
            <label><span>Work number</span><input type="number" min={1} max={50} value={work.workNumber} onChange={(event) => setWork({ ...work, workNumber: Number(event.target.value) })}/></label>
            <label><span>Date</span><input type="date" value={work.workDate} onChange={(event) => setWork({ ...work, workDate: event.target.value })}/></label>
            <label><span>Total marks</span><input type="number" min={1} value={work.maxScore} onChange={(event) => setWork({ ...work, maxScore: Number(event.target.value) })}/></label>
            <label className="wide"><span>Title</span><input value={work.title} onChange={(event) => setWork({ ...work, title: event.target.value })} placeholder="e.g. Week 4 Fractions Quiz · Work 2"/></label>
            <label className="wide"><span>Instructions for learners</span><textarea rows={5} value={work.instructions} onChange={(event) => setWork({ ...work, instructions: event.target.value })} placeholder="Explain what to do, what to submit and any rules learners must follow."/></label>
            <div className="tav4-readonly"><Clock3 size={17}/><div><span>Academic term</span><strong>{contexts.activeTerm?.name || "No active term"}</strong><small>Automatically controlled by the school calendar</small></div></div>
          </div> : null}

          {builderStep === 2 ? <div className="tav4-question-builder">
            <aside className="tav4-question-palette"><span>ADD QUESTION</span>{questionTypes.map((item) => <button type="button" key={item.type} onClick={() => addQuestion(item.type)}><Plus size={14}/><div><strong>{item.label}</strong><small>{item.detail}</small></div></button>)}</aside>
            <div className="tav4-question-stage"><div className="tav4-question-summary"><div><Sparkles size={16}/><span><strong>{questions.length} question{questions.length === 1 ? "" : "s"}</strong>{totalAllocated}/{work.maxScore} marks allocated</span></div><button type="button" onClick={equalizeMarks}>Distribute marks equally</button></div>
              {questions.map((question, index) => <article className="tav4-question-card" key={question.id}>
                <div className="tav4-question-number"><b>{index + 1}</b><button type="button" onClick={() => removeQuestion(question.id)} disabled={questions.length === 1} aria-label="Delete question"><Trash2 size={14}/></button></div>
                <div className="tav4-question-content"><div className="tav4-question-top"><label><span>Question type</span><select value={question.type} onChange={(event) => changeQuestionType(question.id, event.target.value as QuestionType)}>{questionTypes.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label><label><span>Marks</span><input type="number" min={0.25} step={0.25} value={question.points} onChange={(event) => patchQuestion(question.id, { points: Number(event.target.value) })}/></label></div>
                  <label><span>Question</span><textarea rows={3} value={question.prompt} onChange={(event) => patchQuestion(question.id, { prompt: event.target.value })} placeholder="Write the question exactly as the learner should see it."/></label>
                  {question.type === "multiple_choice" || question.type === "multiple_select" ? <div className="tav4-option-list"><span>{question.type === "multiple_choice" ? "Choose the correct answer" : "Tick every correct answer"}</span>{question.options.map((option, optionIndex) => <div className="tav4-option-row" key={`${question.id}_${optionIndex}`}><button type="button" className={question.answers.includes(option) ? "correct" : ""} onClick={() => toggleAnswer(question, option)} aria-label="Toggle correct answer"><Check size={14}/></button><input value={option} onChange={(event) => setOption(question, optionIndex, event.target.value)}/><button type="button" onClick={() => patchQuestion(question.id, { options: question.options.filter((_, position) => position !== optionIndex), answers: question.answers.filter((item) => item !== option) })} disabled={question.options.length <= 2}><X size={13}/></button></div>)}<button type="button" className="tav4-add-option" onClick={() => patchQuestion(question.id, { options: [...question.options, `Option ${String.fromCharCode(65 + question.options.length)}`] })}><Plus size={13}/>Add option</button></div> : null}
                  {question.type === "true_false" ? <div className="tav4-binary">{["True", "False"].map((option) => <button type="button" key={option} className={question.answers[0] === option ? "active" : ""} onClick={() => patchQuestion(question.id, { answers: [option] })}><CheckCircle2 size={16}/>{option}</button>)}</div> : null}
                  {question.type === "ordering" ? <div className="tav4-order-list"><span>Put the items below in the correct order</span>{question.options.map((option, optionIndex) => <div key={`${question.id}_order_${optionIndex}`}><b>{optionIndex + 1}</b><input value={option} onChange={(event) => setOption(question, optionIndex, event.target.value)}/></div>)}<button type="button" className="tav4-add-option" onClick={() => patchQuestion(question.id, { options: [...question.options, "New step"] })}><Plus size={13}/>Add step</button></div> : null}
                  {["short_answer", "fill_blank", "numeric"].includes(question.type) ? <label><span>Accepted answer{question.answers.length > 1 ? "s" : ""}</span><input value={question.answers.join(" | ")} onChange={(event) => patchQuestion(question.id, { answers: event.target.value.split("|").map((item) => item.trim()).filter(Boolean) })} placeholder="Separate alternatives with |"/><small>Example: Accra | accra</small></label> : null}
                  {question.type === "long_answer" ? <label><span>Key ideas / marking guide</span><textarea rows={3} value={question.answers.join("\n")} onChange={(event) => patchQuestion(question.id, { answers: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} placeholder="One key idea or keyword per line. The system can suggest a score; the teacher remains in control."/></label> : null}
                </div>
              </article>)}
            </div>
          </div> : null}

          {builderStep === 3 ? <div className="tav4-delivery-grid">
            <label><span>Marking</span><select value={work.markingMode} onChange={(event) => setWork({ ...work, markingMode: event.target.value as WorkDraft["markingMode"] })}><option value="auto">Auto-mark objective answers</option><option value="review">Auto-mark + teacher review</option><option value="manual">Teacher marks everything</option></select></label>
            <label><span>Attempts allowed</span><input type="number" min={1} max={10} value={work.attemptLimit} onChange={(event) => setWork({ ...work, attemptLimit: Number(event.target.value) })}/></label>
            <label><span>Gradebook attempt</span><select value={work.attemptScorePolicy} onChange={(event) => setWork({ ...work, attemptScorePolicy: event.target.value as WorkDraft["attemptScorePolicy"] })}><option value="highest">Highest graded attempt</option><option value="latest">Latest graded attempt</option></select></label>
            <label><span>Opens at</span><input type="datetime-local" value={work.opensAt} onChange={(event) => setWork({ ...work, opensAt: event.target.value })}/></label>
            <label><span>Closes at</span><input type="datetime-local" value={work.dueAt} onChange={(event) => setWork({ ...work, dueAt: event.target.value })}/></label>
            <article className="tav4-delivery-summary"><CheckCircle2 size={20}/><div><strong>Ready for draft</strong><span>{questions.length} questions · {totalAllocated}/{work.maxScore} marks · {work.attemptLimit} attempt{work.attemptLimit === 1 ? "" : "s"}</span><small>Saving creates a draft first. Nothing reaches learners until you publish it.</small></div></article>
          </div> : null}
        </div>

        <footer><button type="button" onClick={() => builderStep === 1 ? setBuilderOpen(false) : setBuilderStep(builderStep - 1)}><ChevronLeft size={15}/>{builderStep === 1 ? "Cancel" : "Back"}</button><div>{builderStep < 3 ? <button className="tav4-primary" type="button" onClick={() => setBuilderStep(builderStep + 1)}>Continue<ChevronRight size={15}/></button> : <button className="tav4-primary" type="button" disabled={busy} onClick={() => void saveWork()}><Save size={15}/>{busy ? "Saving…" : "Save work draft"}</button>}</div></footer>
      </section>
    </div> : null}
  </div>;
}
