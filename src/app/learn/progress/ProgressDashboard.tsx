"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Compass,
  Flame,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildProgressSnapshot,
  EMPTY_LEARNER_PROGRESS,
  LEARNER_PROGRESS_STORAGE_KEY,
  normalizeLearnerProgress,
  type LearnerProgress,
  type MasteryBand,
} from "../learner-progress";
import styles from "./progress.module.css";

const bandCopy: Record<MasteryBand, { label: string; detail: string }> = {
  repair: { label: "Repair next", detail: "Enough evidence shows this topic needs targeted practice." },
  developing: { label: "Developing", detail: "Understanding is growing, but it is not secure yet." },
  secure: { label: "Secure", detail: "Current evidence shows consistently strong performance." },
  evidence: { label: "Needs more evidence", detail: "Practice this topic more before SukuuNova judges mastery." },
};

function bandClass(band: MasteryBand) {
  if (band === "repair") return styles.repair;
  if (band === "developing") return styles.developing;
  if (band === "secure") return styles.secure;
  return styles.evidence;
}

export function ProgressDashboard() {
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_LEARNER_PROGRESS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LEARNER_PROGRESS_STORAGE_KEY);
      setProgress(stored ? normalizeLearnerProgress(JSON.parse(stored)) : EMPTY_LEARNER_PROGRESS);
    } catch {
      setProgress(EMPTY_LEARNER_PROGRESS);
    } finally {
      setLoaded(true);
    }
  }, []);

  const snapshot = useMemo(() => buildProgressSnapshot(progress), [progress]);
  const hasEvidence = progress.answered > 0 || progress.sessions > 0;

  function resetLocalProgress() {
    if (!window.confirm("Reset your local SukuuNova Learn practice history on this device?")) return;
    window.localStorage.removeItem(LEARNER_PROGRESS_STORAGE_KEY);
    setProgress(EMPTY_LEARNER_PROGRESS);
  }

  const priorityMessage = snapshot.priority
    ? `${snapshot.priority.subject} · ${snapshot.priority.topic}`
    : "Complete a practice session to unlock a recommendation.";

  return (
    <main className={styles.page}>
      <div className={styles.auroraOne} />
      <div className={styles.auroraTwo} />

      <header className={styles.topbar}>
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={16} /> Learn home</Link>
        <div className={styles.wordmark}>
          <span>S</span>
          <div><strong>SukuuNova Learn</strong><small>Progress intelligence</small></div>
        </div>
        <div className={styles.localBadge}><ShieldCheck size={14} /> Device-local</div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><Sparkles size={14} /> PROGRESS & MASTERY</span>
          <h1>See what you know. <em>Know what to practise next.</em></h1>
          <p>
            SukuuNova turns your practice history into evidence you can use: accuracy, topic confidence,
            repair priorities and the next area worth your attention.
          </p>
          <div className={styles.heroActions}>
            <Link href="/learn/practice" className={styles.primaryButton}>Start intelligent practice <ArrowRight size={17} /></Link>
            <Link href="/learn/explore" className={styles.secondaryButton}>Explore a subject <Compass size={17} /></Link>
          </div>
        </div>

        <aside className={styles.priorityCard}>
          <div className={styles.priorityIcon}><Target size={22} /></div>
          <span>BEST NEXT MOVE</span>
          <strong>{loaded ? priorityMessage : "Reading your local learning evidence..."}</strong>
          <p>{snapshot.priority ? bandCopy[snapshot.priority.band].detail : "Your recommendation updates from your own practice evidence."}</p>
          {snapshot.priority ? <div className={`${styles.priorityBand} ${bandClass(snapshot.priority.band)}`}>{bandCopy[snapshot.priority.band].label}</div> : null}
        </aside>
      </section>

      {!loaded ? (
        <section className={styles.loadingCard}><BrainCircuit size={24} /><strong>Building your mastery view...</strong></section>
      ) : !hasEvidence ? (
        <section className={styles.emptyState}>
          <div className={styles.emptyIcon}><BarChart3 size={30} /></div>
          <span>YOUR DASHBOARD STARTS WITH PRACTICE</span>
          <h2>No learning evidence yet.</h2>
          <p>Answer a few questions and SukuuNova will begin separating strong evidence, developing topics, repair priorities and areas that still need more attempts.</p>
          <Link href="/learn/practice" className={styles.primaryButton}>Build my first signal <ArrowRight size={17} /></Link>
        </section>
      ) : (
        <>
          <section className={styles.metrics} aria-label="Learning metrics">
            <article><div className={styles.metricIcon}><TrendingUp size={18} /></div><span>Lifetime accuracy</span><strong>{snapshot.lifetimeAccuracy}%</strong><small>{progress.correct} correct of {progress.answered}</small></article>
            <article><div className={styles.metricIcon}><BookOpenCheck size={18} /></div><span>Completed sessions</span><strong>{progress.sessions}</strong><small>Saved on this device</small></article>
            <article><div className={styles.metricIcon}><Flame size={18} /></div><span>Answer streak</span><strong>{progress.streak}</strong><small>Consecutive correct answers</small></article>
            <article><div className={styles.metricIcon}><BrainCircuit size={18} /></div><span>Unique exposures</span><strong>{snapshot.uniqueExposureCount}</strong><small>Recent concepts remembered</small></article>
          </section>

          <section className={styles.bandGrid}>
            <article className={`${styles.bandCard} ${styles.repair}`}><span>Repair next</span><strong>{snapshot.repair.length}</strong><p>Topics with at least three attempts and accuracy below 60%.</p></article>
            <article className={`${styles.bandCard} ${styles.developing}`}><span>Developing</span><strong>{snapshot.developing.length}</strong><p>Evidence is improving, with accuracy from 60% to 79%.</p></article>
            <article className={`${styles.bandCard} ${styles.secure}`}><span>Secure</span><strong>{snapshot.secure.length}</strong><p>At least three attempts with 80% or stronger accuracy.</p></article>
            <article className={`${styles.bandCard} ${styles.evidence}`}><span>Needs more evidence</span><strong>{snapshot.evidence.length}</strong><p>Fewer than three attempts, so SukuuNova deliberately avoids judging mastery.</p></article>
          </section>

          <section className={styles.topicSection}>
            <div className={styles.sectionHeading}>
              <div><span>MASTERY MAP</span><h2>Every topic with learning evidence</h2></div>
              <Link href="/learn/practice">Keep practising <ArrowRight size={15} /></Link>
            </div>
            {snapshot.topics.length ? (
              <div className={styles.topicList}>
                {snapshot.topics.map((topic) => (
                  <article className={styles.topicRow} key={topic.key}>
                    <div className={`${styles.statusDot} ${bandClass(topic.band)}`} />
                    <div className={styles.topicIdentity}>
                      <small>{topic.subject}</small>
                      <strong>{topic.topic}</strong>
                      <span>{bandCopy[topic.band].label} · {topic.correct}/{topic.answered} correct</span>
                    </div>
                    <div className={styles.barTrack} aria-label={`${topic.accuracy}% accuracy`}>
                      <span style={{ width: `${topic.accuracy}%` }} />
                    </div>
                    <strong className={styles.topicAccuracy}>{topic.accuracy}%</strong>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.noTopics}>Your question history exists, but topic evidence has not been recorded yet.</div>
            )}
          </section>
        </>
      )}

      <section className={styles.trustStrip}>
        <CheckCircle2 size={18} />
        <p><strong>No fake mastery:</strong> SukuuNova separates low evidence from proven weakness and never treats this local dashboard as an official exam grade prediction.</p>
      </section>

      {loaded && hasEvidence ? (
        <div className={styles.resetRow}>
          <button type="button" onClick={resetLocalProgress}><RefreshCcw size={15} /> Reset local progress</button>
        </div>
      ) : null}
    </main>
  );
}
