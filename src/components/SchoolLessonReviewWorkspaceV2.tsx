"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";

type Review = {
  id: string;
  lessonPlanId: string;
  reviewerName: string;
  decision: string;
  reasonCode: string | null;
  note: string | null;
  createdAt: string;
};

type Planner = {
  template?: "basic_nacca" | "shs_learning_planner";
  weekEnding?: string;
  durationMinutes?: number | null;
  classSize?: number | null;
  strand?: string;
  subStrand?: string;
  contentStandard?: string;
  learningIndicators?: string;
  performanceIndicators?: string;
  essentialQuestions?: string;
  pedagogicalStrategies?: string;
  teachingLearningResources?: string;
  relevance?: string;
  differentiationApproaching?: string;
  differentiationProficient?: string;
  differentiationHighlyProficient?: string;
  keywords?: string;
  coreCompetencies?: string;
  sharedGhanaianValues?: string;
  gesi?: string;
  sel?: string;
  ictIntegration?: string;
  starterTeacherActivity?: string;
  starterLearnerActivity?: string;
  mainTeacherActivity?: string;
  mainLearnerActivity?: string;
  depthOfKnowledge?: string;
  lessonClosure?: string;
  reflectionRemarks?: string;
  reference?: string;
};

type DocBlock = {
  id?: string;
  type?: string;
  text?: string;
  url?: string;
  caption?: string;
  rows?: string[][];
};

type Plan = {
  id: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  classLevel: string | null;
  subjectId: string;
  subjectName: string;
  termId: string | null;
  termName: string | null;
  academicYearName: string | null;
  termLocked: boolean | null;
  title: string;
  plannedDate: string;
  status: string;
  objective: string | null;
  content: string;
  topic: string | null;
  subTopic: string | null;
  curriculumObjective: string | null;
  learningOutcomes: string | null;
  priorKnowledge: string | null;
  materials: string | null;
  introduction: string | null;
  development: string | null;
  differentiatedActivities: string | null;
  assessment: string | null;
  conclusion: string | null;
  homework: string | null;
  reflection: string | null;
  resources: unknown;
  documentContent: unknown;
  reviewNote: string | null;
  reviewerName: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type Data = { rows: Plan[]; reviews: Review[]; me: string };
type CurriculumRow = [label: string, value: string | null];

const reasons = [
  ["curriculum_alignment", "Curriculum alignment"],
  ["learning_outcomes", "Learning outcomes / indicators"],
  ["assessment", "Assessment / DoK"],
  ["differentiation", "Differentiation / inclusion"],
  ["resources", "Teaching & learning resources"],
  ["clarity", "Clarity / lesson sequence"],
  ["timing", "Timing / pacing"],
  ["other", "Other"],
] as const;

async function request(init?: RequestInit) {
  const response = await fetch("/api/school/lesson-review-v2", {
    cache: "no-store",
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Learning-plan request failed.");
  return body;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function when(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";
}

function plannerOf(value: unknown): { planner: Planner | null; blocks: DocBlock[]; weekNumber: number | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { planner: null, blocks: [], weekNumber: null };
  }
  const doc = value as { ghanaPlanner?: unknown; blocks?: unknown; weekNumber?: unknown };
  return {
    planner:
      doc.ghanaPlanner && typeof doc.ghanaPlanner === "object" && !Array.isArray(doc.ghanaPlanner)
        ? (doc.ghanaPlanner as Planner)
        : null,
    blocks: Array.isArray(doc.blocks) ? (doc.blocks as DocBlock[]) : [],
    weekNumber: Number.isFinite(Number(doc.weekNumber)) ? Number(doc.weekNumber) : null,
  };
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default function SchoolLessonReviewWorkspaceV2() {
  const [data, setData] = useState<Data | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("submitted");
  const [query, setQuery] = useState("");
  const [reasonCode, setReasonCode] = useState<(typeof reasons)[number][0]>("curriculum_alignment");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const next = (await request()) as Data;
      setData(next);
      setSelectedId((current) =>
        next.rows.some((row) => row.id === current)
          ? current
          : next.rows.find((row) => row.status === "submitted")?.id || next.rows[0]?.id || "",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load learning plans.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        ["submitted", "changes_requested", "approved", "completed", "draft", "archived"].map((status) => [
          status,
          data?.rows.filter((row) => row.status === status).length || 0,
        ]),
      ),
    [data],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.rows || []).filter(
      (row) =>
        (filter === "all" || row.status === filter) &&
        (!needle ||
          `${row.title} ${row.teacherName} ${row.className} ${row.subjectName} ${row.topic || ""}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [data, filter, query]);

  const selected = data?.rows.find((row) => row.id === selectedId) || rows[0] || null;
  const doc = plannerOf(selected?.documentContent);
  const planReviews = (data?.reviews || []).filter((review) => review.lessonPlanId === selected?.id);

  async function review(decision: "approved" | "changes_requested") {
    if (!selected) return;
    if (decision === "changes_requested" && note.trim().length < 5) {
      setError("Give the teacher a clear revision note before returning the plan.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          decision,
          reasonCode: decision === "changes_requested" ? reasonCode : undefined,
          note: note.trim() || undefined,
        }),
      });
      setNotice(
        decision === "approved"
          ? "Learning plan approved and returned to the teacher as verified."
          : "Learning plan returned to the teacher with your revision guidance.",
      );
      setNote("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="slrv2-page">
      <section className="slrv2-hero">
        <div>
          <span>ACADEMIC LEADERSHIP · VERIFICATION</span>
          <h1>Review the teacher’s learning plan as one complete teaching document.</h1>
          <p>
            Curriculum alignment, Ghana Learning Planner fields, teacher/learner activities, differentiation,
            assessment and rich lesson notes stay together. Approve the plan or return focused revision guidance
            without editing the teacher’s work.
          </p>
        </div>
        <aside>
          <ShieldCheck size={22} />
          <strong>{counts.submitted || 0} awaiting verification</strong>
          <small>Every decision is reviewer-attributed, timestamped and preserved in the audit trail.</small>
        </aside>
      </section>

      {error ? (
        <div className="slrv2-alert bad" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="slrv2-alert good" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      ) : null}

      <section className="slrv2-kpis">
        <article>
          <strong>{data?.rows.length || 0}</strong>
          <span>Total plans</span>
        </article>
        <article>
          <strong>{counts.submitted || 0}</strong>
          <span>Awaiting review</span>
        </article>
        <article>
          <strong>{counts.changes_requested || 0}</strong>
          <span>Returned for changes</span>
        </article>
        <article>
          <strong>{(counts.approved || 0) + (counts.completed || 0)}</strong>
          <span>Approved / taught</span>
        </article>
      </section>

      <section className="slrv2-workspace">
        <aside className="slrv2-list">
          <header>
            <div>
              <span>REVIEW QUEUE</span>
              <h2>Learning plans</h2>
            </div>
            <div className="slrv2-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search teacher, class, subject…"
              />
            </div>
          </header>
          <nav>
            {[
              ["submitted", "Awaiting review"],
              ["changes_requested", "Needs revision"],
              ["approved", "Approved"],
              ["completed", "Taught"],
              ["all", "All plans"],
            ].map(([key, label]) => (
              <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
                {label}
                <b>{key === "all" ? data?.rows.length || 0 : counts[key] || 0}</b>
              </button>
            ))}
          </nav>
          <div className="slrv2-rows">
            {rows.length ? (
              rows.map((row) => (
                <button
                  key={row.id}
                  className={selected?.id === row.id ? "selected" : ""}
                  onClick={() => {
                    setSelectedId(row.id);
                    setNote("");
                    setError("");
                  }}
                >
                  <div>
                    <span>
                      {row.className} · {row.subjectName}
                    </span>
                    <strong>{row.title}</strong>
                    <small>
                      {row.teacherName} · {new Date(row.plannedDate).toLocaleDateString("en-GH")}
                    </small>
                  </div>
                  <aside>
                    <b className={`slrv2-status ${row.status}`}>{statusLabel(row.status)}</b>
                    <ChevronRight size={15} />
                  </aside>
                </button>
              ))
            ) : (
              <div className="slrv2-empty">
                <FileCheck2 size={28} />
                <strong>No plans in this view.</strong>
              </div>
            )}
          </div>
        </aside>

        <article className="slrv2-viewer">
          {selected ? (
            <>
              <header>
                <div>
                  <span>
                    {selected.classLevel ? `${selected.classLevel} · ` : ""}
                    {selected.className} · {selected.subjectName}
                  </span>
                  <h2>{selected.title}</h2>
                  <p>
                    {selected.teacherName} · {selected.termName || "No term"}
                    {selected.academicYearName ? ` · ${selected.academicYearName}` : ""} ·{" "}
                    {new Date(selected.plannedDate).toLocaleDateString("en-GH")}
                  </p>
                </div>
                <div>
                  <b className={`slrv2-status ${selected.status}`}>{statusLabel(selected.status)}</b>
                  {doc.weekNumber ? <small>Week {doc.weekNumber}</small> : null}
                </div>
              </header>

              {doc.planner ? <PlannerReview planner={doc.planner} /> : <LegacyReview plan={selected} />}
              <RichBlocks blocks={doc.blocks} />

              {selected.reviewNote ? (
                <section className="slrv2-last-review">
                  <TriangleAlert size={17} />
                  <div>
                    <b>Latest review note</b>
                    <p>{selected.reviewNote}</p>
                    {selected.reviewerName ? (
                      <small>
                        {selected.reviewerName} · {when(selected.reviewedAt)}
                      </small>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {selected.status === "submitted" ? (
                <section className="slrv2-decision">
                  <header>
                    <span>REVIEW DECISION</span>
                    <h3>Verify or return this plan</h3>
                    <p>
                      Do not rewrite the teacher’s plan here. Approve it, or identify the area that needs revision and
                      explain what should change.
                    </p>
                  </header>
                  <div className="slrv2-review-form">
                    <label>
                      Revision area
                      <select
                        value={reasonCode}
                        onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)}
                      >
                        {reasons.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="wide">
                      Reviewer note
                      <textarea
                        rows={4}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="For approval, an optional note. For changes, give the teacher specific revision guidance."
                      />
                    </label>
                  </div>
                  <div className="slrv2-actions">
                    <button disabled={busy} onClick={() => void review("changes_requested")}>
                      Return for changes
                    </button>
                    <button
                      className="approve"
                      disabled={busy || selected.teacherId === data?.me}
                      onClick={() => void review("approved")}
                    >
                      <UserRoundCheck size={16} />
                      {busy ? "Submitting…" : "Approve learning plan"}
                    </button>
                  </div>
                  {selected.teacherId === data?.me ? <small>You cannot approve your own learning plan.</small> : null}
                </section>
              ) : null}

              {planReviews.length ? (
                <section className="slrv2-history">
                  <header>
                    <span>VERIFICATION HISTORY</span>
                    <h3>Previous decisions</h3>
                  </header>
                  {planReviews.map((review) => (
                    <article key={review.id}>
                      <CheckCircle2 size={15} />
                      <div>
                        <strong>{statusLabel(review.decision)}</strong>
                        <span>
                          {review.reviewerName} · {when(review.createdAt)}
                        </span>
                        {review.note ? <p>{review.note}</p> : null}
                      </div>
                      {review.reasonCode ? <b>{statusLabel(review.reasonCode)}</b> : null}
                    </article>
                  ))}
                </section>
              ) : null}
            </>
          ) : (
            <div className="slrv2-empty large">
              <BookOpenCheck size={34} />
              <strong>Select a learning plan to review.</strong>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

function PlannerReview({ planner }: { planner: Planner }) {
  const shs = planner.template === "shs_learning_planner";
  const curriculumRows: CurriculumRow[] = [
    ["Strand", text(planner.strand)],
    ["Sub-strand", text(planner.subStrand)],
    ["Content Standard", text(planner.contentStandard)],
    ["Learning Indicator(s)", text(planner.learningIndicators)],
    ["Performance Indicator(s)", text(planner.performanceIndicators)],
    ...(shs
      ? ([
          ["Essential Question(s)", text(planner.essentialQuestions)],
          ["Pedagogical Strategies", text(planner.pedagogicalStrategies)],
        ] satisfies CurriculumRow[])
      : []),
    ["Teaching & Learning Resources", text(planner.teachingLearningResources)],
    ["Relevance / real-life connection", text(planner.relevance)],
    ["Core / 21st Century Competencies", text(planner.coreCompetencies)],
    ["Shared Ghanaian Values", text(planner.sharedGhanaianValues)],
    ["GESI", text(planner.gesi)],
    ["Social & Emotional Learning", text(planner.sel)],
    ["ICT / digital integration", text(planner.ictIntegration)],
    ["Keywords", text(planner.keywords)],
    ["Reference", text(planner.reference)],
  ];
  const rows = curriculumRows.filter(([, value]) => Boolean(value));

  return (
    <>
      <section className="slrv2-template">
        <div>
          <GraduationCapIcon />
          <span>GHANA LEARNING PLAN</span>
          <strong>{shs ? "SHS Weekly Learning Planner" : "Basic / JHS NaCCA Lesson Plan"}</strong>
        </div>
        <aside>
          <span>Duration</span>
          <b>{planner.durationMinutes ? `${planner.durationMinutes} min` : "—"}</b>
          <span>Class size</span>
          <b>{planner.classSize || "—"}</b>
          {planner.weekEnding ? (
            <>
              <span>Week ending</span>
              <b>{new Date(`${planner.weekEnding}T00:00:00`).toLocaleDateString("en-GH")}</b>
            </>
          ) : null}
        </aside>
      </section>

      <section className="slrv2-curriculum">
        {rows.map(([label, value]) => (
          <article key={label}>
            <b>{label}</b>
            <p>{value}</p>
          </article>
        ))}
      </section>

      <section className="slrv2-phases">
        <header>
          <span>LEARNING EXPERIENCE</span>
          <h3>Teacher and learner activity</h3>
        </header>
        <div>
          <Activity title="Starter · teacher activity" value={planner.starterTeacherActivity} />
          <Activity title="Starter · learner activity" value={planner.starterLearnerActivity} />
          <Activity title="Main learning · teacher activity" value={planner.mainTeacherActivity} />
          <Activity title="Main learning · learner activity" value={planner.mainLearnerActivity} />
        </div>
      </section>

      <section className="slrv2-diff">
        <header>
          <span>DIFFERENTIATION</span>
          <h3>Planned support by proficiency</h3>
        </header>
        <div>
          <Activity title="Approaching proficiency" value={planner.differentiationApproaching} />
          <Activity title="Proficient" value={planner.differentiationProficient} />
          <Activity title="Highly proficient" value={planner.differentiationHighlyProficient} />
        </div>
      </section>

      <section className="slrv2-curriculum">
        <article>
          <b>Assessment / Depth of Knowledge</b>
          <p>{planner.depthOfKnowledge || "Not specified"}</p>
        </article>
        <article>
          <b>Lesson closure / plenary</b>
          <p>{planner.lessonClosure || "Not specified"}</p>
        </article>
        {planner.reflectionRemarks ? (
          <article>
            <b>Reflection & remarks</b>
            <p>{planner.reflectionRemarks}</p>
          </article>
        ) : null}
      </section>
    </>
  );
}

function LegacyReview({ plan }: { plan: Plan }) {
  const rows = [
    ["Topic", [plan.topic, plan.subTopic].filter(Boolean).join(" · ")],
    ["Curriculum objective", plan.curriculumObjective],
    ["Learning outcomes", plan.learningOutcomes],
    ["Prior knowledge", plan.priorKnowledge],
    ["Teaching & learning materials", plan.materials],
    ["Introduction", plan.introduction],
    ["Development / learner activity", plan.development],
    ["Differentiation", plan.differentiatedActivities],
    ["Assessment", plan.assessment],
    ["Conclusion", plan.conclusion],
    ["Homework / extension", plan.homework],
    ["Lesson notes", plan.content],
  ].filter(([, value]) => text(value));

  return (
    <section className="slrv2-curriculum legacy">
      {rows.map(([label, value]) => (
        <article key={String(label)}>
          <b>{label}</b>
          <p>{value}</p>
        </article>
      ))}
    </section>
  );
}

function Activity({ title, value }: { title: string; value?: string }) {
  return (
    <article>
      <b>{title}</b>
      <p>{value || "Not specified"}</p>
    </article>
  );
}

function RichBlocks({ blocks }: { blocks: DocBlock[] }) {
  if (!blocks.length) return null;

  return (
    <section className="slrv2-document">
      <header>
        <span>RICH TEACHING DOCUMENT</span>
        <h3>Detailed lesson notes</h3>
      </header>
      <div>
        {blocks.map((block, index) => {
          if (block.type === "image" && block.url) {
            return (
              <figure key={block.id || index}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.url} alt={block.caption || "Lesson resource"} />
                {block.caption ? <figcaption>{block.caption}</figcaption> : null}
              </figure>
            );
          }
          if (block.type === "table" && block.rows?.length) {
            return (
              <div className="slrv2-table" key={block.id || index}>
                <table>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          if (!block.text) return null;
          if (block.type === "heading") return <h4 key={block.id || index}>{block.text}</h4>;
          if (block.type === "quote") return <blockquote key={block.id || index}>{block.text}</blockquote>;
          if (block.type === "callout") return <aside key={block.id || index}>{block.text}</aside>;
          if (block.type === "bullet") {
            return (
              <ul key={block.id || index}>
                {block.text
                  .split("\n")
                  .filter(Boolean)
                  .map((item, itemIndex) => (
                    <li key={`${itemIndex}-${item}`}>{item}</li>
                  ))}
              </ul>
            );
          }
          if (block.type === "numbered") {
            return (
              <ol key={block.id || index}>
                {block.text
                  .split("\n")
                  .filter(Boolean)
                  .map((item, itemIndex) => (
                    <li key={`${itemIndex}-${item}`}>{item}</li>
                  ))}
              </ol>
            );
          }
          return <p key={block.id || index}>{block.text}</p>;
        })}
      </div>
    </section>
  );
}

function GraduationCapIcon() {
  return (
    <span className="slrv2-grad">
      <BookOpenCheck size={19} />
    </span>
  );
}
