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
import { useMemo, useState } from "react";
import {
  FOUNDRY_REVIEW_SUMMARY,
  filterFoundryRows,
  type FoundryFamily,
  type QueueStatus,
} from "../foundry-review";
import styles from "./foundry.module.css";

type FamilyFilter = "all" | FoundryFamily;
type StatusFilter = "all" | QueueStatus;

const FAMILY_FILTERS: Array<{ id: FamilyFilter; label: string }> = [
  { id: "all", label: "All formats" },
  { id: "standard", label: "Standard" },
  { id: "rich", label: "Rich interactions" },
];

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All states" },
  { id: "publishable", label: "Publishable" },
  { id: "held", label: "Held" },
];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function FoundryConsole() {
  const [family, setFamily] = useState<FamilyFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [subject, setSubject] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => filterFoundryRows({ family, status, subject, query }),
    [family, status, subject, query],
  );

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={16} /> Learn home</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Question Foundry QA</small></div></div>
        <div className={styles.readOnly}><ShieldCheck size={14} /> Read-only review snapshot</div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><Sparkles size={14} /> CONTENT QUALITY BEFORE SCALE</span>
          <h1>See what is safe to publish <em>before learners ever see it.</em></h1>
          <p>This console combines the standard question pack and rich-interaction pack into one review queue. It exposes provenance, confidence, Question DNA, required verification checks and validator findings without adding content-editing risk yet.</p>
        </div>
        <div className={styles.summaryGrid}>
          <article><Database size={18} /><strong>{FOUNDRY_REVIEW_SUMMARY.total}</strong><span>reviewed items</span></article>
          <article><CheckCircle2 size={18} /><strong>{FOUNDRY_REVIEW_SUMMARY.publishable}</strong><span>publishable</span></article>
          <article><AlertTriangle size={18} /><strong>{FOUNDRY_REVIEW_SUMMARY.held}</strong><span>held</span></article>
          <article><CircleGauge size={18} /><strong>{percent(FOUNDRY_REVIEW_SUMMARY.averageConfidence)}</strong><span>avg confidence</span></article>
        </div>
      </section>

      <section className={styles.console}>
        <div className={styles.consoleHeader}>
          <div>
            <span>REVIEW QUEUE</span>
            <h2>Question Foundry quality surface</h2>
            <p>{FOUNDRY_REVIEW_SUMMARY.standard} standard questions · {FOUNDRY_REVIEW_SUMMARY.rich} rich interactions · {FOUNDRY_REVIEW_SUMMARY.errors} validator errors</p>
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
            <label>Queue state</label>
            <div className={styles.pills}>
              {STATUS_FILTERS.map((item) => (
                <button type="button" key={item.id} className={status === item.id ? styles.pillActive : styles.pill} onClick={() => setStatus(item.id)}>{item.label}</button>
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
          {rows.map((row) => (
            <article key={row.id} className={styles.reviewCard}>
              <div className={styles.cardTop}>
                <div className={styles.identity}>
                  <span className={row.status === "publishable" ? styles.statusGood : styles.statusHeld}>{row.status}</span>
                  <span className={styles.family}>{row.family}</span>
                  <span>{row.format}</span>
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
                  <div><span>Review</span><strong>{row.reviewer}</strong><small>{row.reviewStatus}{row.reviewedAt ? ` · ${new Date(row.reviewedAt).toLocaleDateString("en-GB")}` : ""}</small></div>
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
            </article>
          ))}

          {rows.length === 0 && (
            <div className={styles.emptyState}>
              <Search size={22} />
              <strong>No review items match these filters.</strong>
              <span>Change the family, state, subject or search text.</span>
            </div>
          )}
        </div>
      </section>

      <section className={styles.guardrail}>
        <ShieldCheck size={21} />
        <div><strong>Foundry guardrail</strong><p>This milestone is intentionally read-only. It proves the review queue and quality signals before any reviewer action is allowed to mutate content or publish to learners.</p></div>
      </section>
    </main>
  );
}
