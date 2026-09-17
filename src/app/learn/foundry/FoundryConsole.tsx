"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleGauge,
  Database,
  FileCheck2,
  Filter,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  FOUNDRY_REVIEW_ROWS,
  FOUNDRY_REVIEW_SUMMARY,
  filterFoundryRows,
  type FoundryFamily,
  type QueueStatus,
} from "../foundry-review";
import {
  clearLocalReviewDecision,
  filterFoundryRowsByLocalDecision,
  normalizeLocalReviewMap,
  setLocalReviewDecision,
  summarizeLocalReviews,
  type LocalDecisionFilter,
  type LocalReviewDecision,
  type LocalReviewMap,
} from "../foundry-review-actions";
import styles from "./foundry.module.css";

type FamilyFilter = "all" | FoundryFamily;
type StatusFilter = "all" | QueueStatus;

const STORAGE_KEY = "sukuunova-foundry-local-review-v1";

const FAMILY_FILTERS: Array<{ id: FamilyFilter; label: string }> = [
  { id: "all", label: "All formats" },
  { id: "standard", label: "Standard" },
  { id: "rich", label: "Rich interactions" },
];

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All states" },
  { id: "publishable", label: "Publishable" },
  { id: "held", label: "Validator held" },
];

const DECISION_FILTERS: Array<{ id: LocalDecisionFilter; label: string }> = [
  { id: "all", label: "All decisions" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "held", label: "Held locally" },
];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function decisionTime(value: string) {
  if (!value) return "Not timestamped";
  try {
    return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "Not timestamped";
  }
}

export function FoundryConsole() {
  const [family, setFamily] = useState<FamilyFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [decisionFilter, setDecisionFilter] = useState<LocalDecisionFilter>("all");
  const [subject, setSubject] = useState("all");
  const [query, setQuery] = useState("");
  const [decisions, setDecisions] = useState<LocalReviewMap>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const normalized = normalizeLocalReviewMap(JSON.parse(raw), FOUNDRY_REVIEW_ROWS.map((row) => row.id));
      setDecisions(normalized);
      setDraftNotes(Object.fromEntries(Object.entries(normalized).map(([id, record]) => [id, record.note])));
    } catch {
      setDecisions({});
      setDraftNotes({});
    }
  }, []);

  const localSummary = useMemo(
    () => summarizeLocalReviews(FOUNDRY_REVIEW_ROWS, decisions),
    [decisions],
  );

  const baseRows = useMemo(
    () => filterFoundryRows({ family, status, subject, query }),
    [family, status, subject, query],
  );

  const rows = useMemo(
    () => filterFoundryRowsByLocalDecision(baseRows, decisions, decisionFilter),
    [baseRows, decisions, decisionFilter],
  );

  function persist(next: LocalReviewMap) {
    setDecisions(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Local reviewer actions remain optional if browser storage is unavailable.
    }
  }

  function decide(id: string, decision: LocalReviewDecision) {
    const next = setLocalReviewDecision(
      decisions,
      id,
      decision,
      draftNotes[id] ?? decisions[id]?.note ?? "",
      new Date().toISOString(),
    );
    persist(next);
  }

  function clearDecision(id: string) {
    persist(clearLocalReviewDecision(decisions, id));
    setDraftNotes((current) => ({ ...current, [id]: "" }));
  }

  function saveExistingNote(id: string) {
    const existing = decisions[id];
    if (!existing) return;
    const draft = draftNotes[id] ?? "";
    if (draft.trim() === existing.note) return;
    persist(setLocalReviewDecision(decisions, id, existing.decision, draft, new Date().toISOString()));
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={16} /> Learn home</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Question Foundry QA</small></div></div>
        <div className={styles.readOnly}><ShieldCheck size={14} /> Local QA · browser only</div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><Sparkles size={14} /> CONTENT QUALITY BEFORE SCALE</span>
          <h1>Review what is safe to stage <em>without publishing by accident.</em></h1>
          <p>The Foundry separates machine-enforced publishability from human QA decisions. Approvals, holds and reviewer notes in this milestone stay on this browser only; they do not alter content, APIs, the school database or what learners can see.</p>
        </div>
        <div className={styles.summaryGrid}>
          <article><Database size={18} /><strong>{FOUNDRY_REVIEW_SUMMARY.total}</strong><span>reviewed items</span></article>
          <article><CheckCircle2 size={18} /><strong>{FOUNDRY_REVIEW_SUMMARY.publishable}</strong><span>validator publishable</span></article>
          <article><FileCheck2 size={18} /><strong>{localSummary.approved}</strong><span>locally approved</span></article>
          <article><AlertTriangle size={18} /><strong>{localSummary.held}</strong><span>locally held</span></article>
        </div>
      </section>

      <section className={styles.console}>
        <div className={styles.consoleHeader}>
          <div>
            <span>REVIEW QUEUE</span>
            <h2>Question Foundry quality surface</h2>
            <p>{FOUNDRY_REVIEW_SUMMARY.standard} standard · {FOUNDRY_REVIEW_SUMMARY.rich} rich · {FOUNDRY_REVIEW_SUMMARY.errors} validator errors · {localSummary.pending} local decisions pending</p>
          </div>
          <div className={styles.queueCount}><FileCheck2 size={17} /><strong>{rows.length}</strong><span>visible</span></div>
        </div>

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label><Filter size={13} /> Content family</label>
            <div className={styles.pills}>
              {FAMILY_FILTERS.map((item) => (
                <button type="button" key={item.id} className={family === item.id ? styles.pillActive : styles.pill} onClick={() => setFamily(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label>Validator state</label>
            <div className={styles.pills}>
              {STATUS_FILTERS.map((item) => (
                <button type="button" key={item.id} className={status === item.id ? styles.pillActive : styles.pill} onClick={() => setStatus(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label>Local review</label>
            <div className={styles.pills}>
              {DECISION_FILTERS.map((item) => (
                <button type="button" key={item.id} className={decisionFilter === item.id ? styles.pillActive : styles.pill} onClick={() => setDecisionFilter(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>

          <div className={styles.selectGroup}>
            <label htmlFor="foundry-subject">Subject</label>
            <select id="foundry-subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
              <option value="all">All subjects</option>
              {FOUNDRY_REVIEW_SUMMARY.subjects.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className={styles.searchBox}>
            <label htmlFor="foundry-search">Search queue</label>
            <div><Search size={15} /><input id="foundry-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID, topic, format, objective…" /></div>
          </div>
        </div>

        <div className={styles.queue}>
          {rows.map((row) => {
            const localDecision = decisions[row.id];
            return (
              <article key={row.id} className={styles.reviewCard}>
                <div className={styles.cardTop}>
                  <div className={styles.identity}>
                    <span className={row.status === "publishable" ? styles.statusGood : styles.statusHeld}>{row.status}</span>
                    <span className={styles.family}>{row.family}</span>
                    <span>{row.format}</span>
                    {localDecision && (
                      <span className={localDecision.decision === "approved" ? styles.decisionApproved : styles.decisionHeld}>
                        local {localDecision.decision}
                      </span>
                    )}
                  </div>
                  <div className={styles.confidence}><CircleGauge size={14} /><strong>{percent(row.confidence)}</strong></div>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.mainCopy}>
                    <small>{row.subject} · {row.topic} · difficulty {row.difficulty}/5</small>
                    <h3>{row.prompt}</h3>
                    <p>{row.objective}</p>
                    <div className={styles.metaLine}><code>{row.id}</code><span>v{row.version}</span><span>{row.framework} · {row.frameworkVersion}</span></div>
                  </div>

                  <div className={styles.reviewMeta}>
                    <div><span>Source</span><strong>{row.sourceName}</strong><small>{row.sourceKind}{row.sourceLicense ? ` · ${row.sourceLicense}` : ""}</small></div>
                    <div><span>Content review</span><strong>{row.reviewer}</strong><small>{row.reviewStatus}{row.reviewedAt ? ` · ${new Date(row.reviewedAt).toLocaleDateString("en-GB")}` : ""}</small></div>
                  </div>
                </div>

                <div className={styles.checks}>
                  {row.checks.map((check) => <span key={check}><CheckCircle2 size={12} /> {check.replaceAll("-", " ")}</span>)}
                </div>

                {(row.errors > 0 || row.warnings > 0) && (
                  <div className={styles.issues}>
                    <AlertTriangle size={14} />
                    <strong>{row.errors} errors · {row.warnings} warnings</strong>
                    <span>{row.issueCodes.join(", ")}</span>
                  </div>
                )}

                <div className={styles.localReview}>
                  <div className={styles.localReviewHeader}>
                    <div>
                      <span>LOCAL QA DECISION</span>
                      <strong>{localDecision ? (localDecision.decision === "approved" ? "Approved for staging" : "Held for revision") : "Pending reviewer decision"}</strong>
                      <small>{localDecision ? decisionTime(localDecision.updatedAt) : "No local action recorded yet"}</small>
                    </div>
                    <span className={styles.browserOnly}>Browser only</span>
                  </div>

                  <label htmlFor={`foundry-note-${row.id}`}>Reviewer note</label>
                  <textarea
                    id={`foundry-note-${row.id}`}
                    value={draftNotes[row.id] ?? localDecision?.note ?? ""}
                    onChange={(event) => setDraftNotes((current) => ({ ...current, [row.id]: event.target.value }))}
                    onBlur={() => saveExistingNote(row.id)}
                    maxLength={500}
                    placeholder="Add a short reason, wording concern or verification note…"
                  />

                  <div className={styles.reviewButtons}>
                    <button type="button" className={styles.approveButton} disabled={row.status !== "publishable"} onClick={() => decide(row.id, "approved")}>Approve for staging</button>
                    <button type="button" className={styles.holdButton} onClick={() => decide(row.id, "held")}>Hold for revision</button>
                    {localDecision && <button type="button" className={styles.clearButton} onClick={() => clearDecision(row.id)}>Clear local decision</button>}
                  </div>
                </div>
              </article>
            );
          })}

          {rows.length === 0 && (
            <div className={styles.emptyState}>
              <Search size={22} />
              <strong>No review items match these filters.</strong>
              <span>Change the family, validator state, local decision, subject or search text.</span>
            </div>
          )}
        </div>
      </section>

      <section className={styles.guardrail}>
        <ShieldCheck size={21} />
        <div><strong>Foundry guardrail</strong><p>Local QA decisions are intentionally separate from validator publishability. Approve for staging does not publish, edit, release or sync a question; it records a browser-only reviewer decision while server-side content mutation remains disabled.</p></div>
      </section>
    </main>
  );
}
