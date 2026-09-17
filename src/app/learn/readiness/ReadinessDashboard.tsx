"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BrainCircuit, CheckCircle2, Gauge, Layers3, ShieldCheck, Sparkles, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CONFIDENCE_STORAGE_KEY,
  EMPTY_CONFIDENCE_RECORD,
  normalizeConfidenceRecord,
  type ConfidenceRecord,
} from "../confidence-intelligence";
import {
  EMPTY_LEARNER_PROGRESS,
  LEARNER_PROGRESS_STORAGE_KEY,
  normalizeLearnerProgress,
  type LearnerProgress,
} from "../learner-progress";
import { buildLearningReadiness } from "../readiness-intelligence";
import styles from "./readiness.module.css";

function stageLabel(stage: ReturnType<typeof buildLearningReadiness>["stage"]) {
  if (stage === "baseline") return "BASELINE";
  if (stage === "breadth") return "BUILD BREADTH";
  if (stage === "depth") return "DEEPEN EVIDENCE";
  if (stage === "confidence") return "CALIBRATE CONFIDENCE";
  return "HARDER PRACTICE READY";
}

export function ReadinessDashboard() {
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_LEARNER_PROGRESS);
  const [confidence, setConfidence] = useState<ConfidenceRecord>(EMPTY_CONFIDENCE_RECORD);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const rawProgress = window.localStorage.getItem(LEARNER_PROGRESS_STORAGE_KEY);
      const rawConfidence = window.localStorage.getItem(CONFIDENCE_STORAGE_KEY);
      setProgress(rawProgress ? normalizeLearnerProgress(JSON.parse(rawProgress)) : EMPTY_LEARNER_PROGRESS);
      setConfidence(rawConfidence ? normalizeConfidenceRecord(JSON.parse(rawConfidence)) : EMPTY_CONFIDENCE_RECORD);
    } catch {
      setProgress(EMPTY_LEARNER_PROGRESS);
      setConfidence(EMPTY_CONFIDENCE_RECORD);
    } finally {
      setLoaded(true);
    }
  }, []);

  const profile = useMemo(() => buildLearningReadiness(progress, confidence), [progress, confidence]);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn/progress" className={styles.backLink}><ArrowLeft size={16} /> Progress</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Learning readiness</small></div></div>
        <span className={styles.localBadge}><ShieldCheck size={14} /> Transparent evidence</span>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}><Gauge size={14} /> LEARNING READINESS PROFILE</span>
          <h1>Know when to go harder—<em>and why.</em></h1>
          <p>SukuuNova separates breadth, repeated evidence, accuracy and confidence calibration instead of hiding them inside a mysterious score.</p>
        </div>
        <aside className={styles.guardrail}>
          <ShieldCheck size={21} />
          <strong>Not an exam prediction.</strong>
          <p>This profile only recommends the next level of SukuuNova practice. It is not a WAEC grade, IELTS band, admission forecast or official result.</p>
        </aside>
      </section>

      {!loaded ? (
        <section className={styles.loading}><BrainCircuit size={22} /> Building your readiness profile…</section>
      ) : (
        <>
          <section className={styles.stageCard}>
            <div className={styles.stageIcon}><Target size={24} /></div>
            <div>
              <span>{stageLabel(profile.stage)}</span>
              <h2>{profile.title}</h2>
              <p>{profile.detail}</p>
            </div>
            <Link href={profile.actionHref}>{profile.actionLabel} <ArrowRight size={16} /></Link>
          </section>

          <section className={styles.dimensionGrid} aria-label="Readiness dimensions">
            {profile.dimensions.map((dimension) => (
              <article key={dimension.id} className={styles.dimensionCard}>
                <div className={styles.dimensionTop}>
                  <span>{dimension.label}</span>
                  <strong>{dimension.value === null ? "—" : `${dimension.value}%`}</strong>
                </div>
                <div className={styles.track} aria-label={dimension.value === null ? `${dimension.label}: more evidence needed` : `${dimension.label}: ${dimension.value}%`}>
                  <span style={{ width: `${dimension.value ?? 0}%` }} />
                </div>
                <small>{dimension.evidence}</small>
                <p>{dimension.detail}</p>
              </article>
            ))}
          </section>

          <section className={styles.rulesCard}>
            <div className={styles.rulesHeading}><Layers3 size={20} /><div><span>VISIBLE READINESS GATES</span><h2>No hidden formula.</h2></div></div>
            <div className={styles.ruleGrid}>
              <article><strong>1</strong><div><span>Baseline</span><p>At least 10 answers across at least 3 starter topics before an overall recommendation.</p></div></article>
              <article><strong>2</strong><div><span>Breadth</span><p>At least 50% of the current 20-topic starter map must have some practice evidence.</p></div></article>
              <article><strong>3</strong><div><span>Depth</span><p>At least 40% of starter topics need three or more attempts, with lifetime accuracy at 60% or higher.</p></div></article>
              <article><strong>4</strong><div><span>Calibration</span><p>At least 4 confidence-check attempts before SukuuNova recommends harder mixed practice.</p></div></article>
            </div>
          </section>

          <section className={styles.factStrip}>
            <Sparkles size={18} />
            <p><strong>Your current evidence:</strong> {profile.answered} answers · {profile.practicedTopics}/{profile.totalTopics} topics practised · {profile.evidenceReadyTopics} topics with repeated evidence · {profile.confidenceAttempts} confidence attempts.</p>
          </section>

          <section className={styles.footerActions}>
            <Link href="/learn/map">Open full mastery map <ArrowRight size={15} /></Link>
            <Link href="/learn/plan">Open 7-day study plan <ArrowRight size={15} /></Link>
            <Link href="/learn/confidence">Confidence check <ArrowRight size={15} /></Link>
          </section>

          <section className={styles.truthStrip}>
            <CheckCircle2 size={18} />
            <p><strong>Evidence over hype:</strong> a learner can have high accuracy and still be told to broaden coverage if too much of the starter map remains unseen.</p>
          </section>
        </>
      )}
    </main>
  );
}
