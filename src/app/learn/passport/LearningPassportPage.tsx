"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Download, FileJson, LockKeyhole, ShieldCheck, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import { CONFIDENCE_STORAGE_KEY } from "../confidence-intelligence";
import {
  CONFIDENCE_COMPLETION_STORAGE_KEY,
  CONFIDENCE_RUN_STORAGE_KEY,
} from "../confidence-run";
import { DAILY_HISTORY_STORAGE_KEY, localDateKey } from "../daily-challenge";
import { DAILY_RUN_STORAGE_KEY } from "../daily-run";
import {
  createLearningPassport,
  learningPassportSummary,
  normalizeLearningPassport,
  type LearningPassport,
} from "../learning-passport";
import { LEARNER_PROGRESS_STORAGE_KEY } from "../learner-progress";
import styles from "./passport.module.css";

function readJson(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function LearningPassportPage() {
  const [loaded, setLoaded] = useState(false);
  const [passport, setPassport] = useState<LearningPassport | null>(null);
  const [candidate, setCandidate] = useState<LearningPassport | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const next = createLearningPassport({
      progress: readJson(LEARNER_PROGRESS_STORAGE_KEY),
      dailyHistory: readJson(DAILY_HISTORY_STORAGE_KEY),
      confidence: readJson(CONFIDENCE_STORAGE_KEY),
      confidenceCompletions: readJson(CONFIDENCE_COMPLETION_STORAGE_KEY),
    });
    setPassport(next);
    setLoaded(true);
  }, []);

  const summary = passport ? learningPassportSummary(passport) : null;
  const candidateSummary = candidate ? learningPassportSummary(candidate) : null;

  function downloadPassport() {
    if (!passport) return;
    const refreshed = createLearningPassport({
      progress: readJson(LEARNER_PROGRESS_STORAGE_KEY),
      dailyHistory: readJson(DAILY_HISTORY_STORAGE_KEY),
      confidence: readJson(CONFIDENCE_STORAGE_KEY),
      confidenceCompletions: readJson(CONFIDENCE_COMPLETION_STORAGE_KEY),
    });
    const blob = new Blob([JSON.stringify(refreshed, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sukuunova-learning-passport-${localDateKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setPassport(refreshed);
    setMessage("Learning Passport exported. Keep the file private if you consider your learning history personal.");
  }

  async function chooseImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const normalized = normalizeLearningPassport(parsed);
      if (!normalized) {
        setCandidate(null);
        setMessage("That file is not a supported SukuuNova Learning Passport v1.");
        return;
      }
      setCandidate(normalized);
      setMessage("Passport validated. Review the summary before replacing this device's learning evidence.");
    } catch {
      setCandidate(null);
      setMessage("The selected file could not be read as valid JSON.");
    }
  }

  function applyImport() {
    if (!candidate) return;
    if (!window.confirm("Replace SukuuNova Learn progress on this device with the validated Learning Passport?")) return;
    try {
      window.localStorage.setItem(LEARNER_PROGRESS_STORAGE_KEY, JSON.stringify(candidate.progress));
      window.localStorage.setItem(DAILY_HISTORY_STORAGE_KEY, JSON.stringify(candidate.dailyHistory));
      window.localStorage.setItem(CONFIDENCE_STORAGE_KEY, JSON.stringify(candidate.confidence));
      window.localStorage.setItem(CONFIDENCE_COMPLETION_STORAGE_KEY, JSON.stringify(candidate.confidenceCompletions));
      window.localStorage.removeItem(DAILY_RUN_STORAGE_KEY);
      window.localStorage.removeItem(CONFIDENCE_RUN_STORAGE_KEY);
      setPassport(candidate);
      setCandidate(null);
      setMessage("Learning evidence restored on this device. Active unfinished runs were cleared so restored evidence cannot conflict with stale session state.");
    } catch {
      setMessage("This browser blocked local storage, so the passport was not applied.");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn/progress" className={styles.backLink}><ArrowLeft size={16} /> Progress</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Learning Passport</small></div></div>
        <span className={styles.localBadge}><LockKeyhole size={14} /> No account required</span>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}><FileJson size={14} /> PORTABLE LOCAL LEARNING DATA</span>
          <h1>Your progress should be <em>yours to carry.</em></h1>
          <p>Export your device-local SukuuNova learning evidence as a versioned JSON passport, then restore it in another browser without creating an account.</p>
        </div>
        <aside className={styles.privacyCard}>
          <ShieldCheck size={22} />
          <strong>Private by default.</strong>
          <p>Export and import happen in your browser. SukuuNova does not need to upload this passport to a server for this workflow.</p>
        </aside>
      </section>

      {!loaded || !summary ? (
        <section className={styles.loading}>Reading device-local learning evidence…</section>
      ) : (
        <>
          <section className={styles.metrics}>
            <article><span>Answers</span><strong>{summary.answers}</strong><small>{summary.correct} correct</small></article>
            <article><span>Sessions</span><strong>{summary.sessions}</strong><small>{summary.masteryTopics} topics with evidence</small></article>
            <article><span>Daily challenges</span><strong>{summary.dailyCompletions}</strong><small>completed days saved</small></article>
            <article><span>Confidence evidence</span><strong>{summary.confidenceAttempts}</strong><small>{summary.confidenceCheckDays} completed checks</small></article>
          </section>

          <section className={styles.actionGrid}>
            <article className={styles.actionCard}>
              <div className={styles.actionIcon}><Download size={22} /></div>
              <span>EXPORT</span>
              <h2>Download a Learning Passport</h2>
              <p>Create a normalized v1 backup of progress, daily completion history and confidence evidence currently saved in this browser.</p>
              <button type="button" onClick={downloadPassport}>Download JSON passport <Download size={16} /></button>
            </article>

            <article className={styles.actionCard}>
              <div className={styles.actionIcon}><Upload size={22} /></div>
              <span>RESTORE</span>
              <h2>Import a Learning Passport</h2>
              <p>SukuuNova validates the file format and normalizes its counts before you can replace this device&apos;s learning evidence.</p>
              <label className={styles.fileButton}>Choose passport file <Upload size={16} /><input type="file" accept="application/json,.json" onChange={chooseImport} /></label>
            </article>
          </section>

          {candidate && candidateSummary ? (
            <section className={styles.previewCard}>
              <div>
                <span>VALIDATED IMPORT PREVIEW</span>
                <h2>{candidateSummary.answers} answers · {candidateSummary.sessions} sessions · {candidateSummary.masteryTopics} topics</h2>
                <p>Exported {new Date(candidate.exportedAt).toLocaleString()}. Applying this passport replaces the current device-local learning evidence; it does not merge potentially duplicate counts.</p>
              </div>
              <button type="button" onClick={applyImport}>Replace local evidence <ArrowRight size={16} /></button>
            </section>
          ) : null}

          {message ? <div className={styles.message}>{message}</div> : null}

          <section className={styles.warningStrip}>
            <LockKeyhole size={18} />
            <p><strong>The exported JSON is not encrypted.</strong> Anyone who receives the file can read the learning evidence inside it. Store or share it according to your own privacy needs.</p>
          </section>
        </>
      )}
    </main>
  );
}
