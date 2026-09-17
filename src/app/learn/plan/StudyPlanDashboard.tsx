"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Coffee, ShieldCheck, Sparkles, Target } from "lucide-react";
import { useEffect, useState } from "react";
import {
  LEARNER_PROGRESS_STORAGE_KEY,
  normalizeLearnerProgress,
  type LearnerProgress,
} from "../learner-progress";
import { buildStudyPlan, type StudyTaskKind } from "../study-plan";
import styles from "./plan.module.css";

const taskLabels: Record<StudyTaskKind, string> = {
  repair: "Repair",
  strengthen: "Strengthen",
  evidence: "Gather evidence",
  review: "Spaced review",
  baseline: "Baseline",
  recovery: "Recovery",
};

function taskClass(kind: StudyTaskKind) {
  if (kind === "repair") return styles.repair;
  if (kind === "strengthen") return styles.strengthen;
  if (kind === "evidence") return styles.evidence;
  if (kind === "review") return styles.review;
  if (kind === "recovery") return styles.recovery;
  return styles.baseline;
}

export function StudyPlanDashboard() {
  const [progress, setProgress] = useState<LearnerProgress | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEARNER_PROGRESS_STORAGE_KEY);
      setProgress(normalizeLearnerProgress(raw ? JSON.parse(raw) : null));
    } catch {
      setProgress(normalizeLearnerProgress(null));
    } finally {
      setReady(true);
    }
  }, []);

  const plan = progress ? buildStudyPlan(progress) : null;
  const activeDays = plan?.days.filter((item) => item.totalQuestions > 0).length ?? 0;
  const recoveryDays = plan?.days.filter((item) => item.task.kind === "recovery").length ?? 0;

  return (
    <main className={styles.page}>
      <div className={styles.auroraOne} aria-hidden="true" />
      <div className={styles.auroraTwo} aria-hidden="true" />

      <header className={styles.topbar}>
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={16} /> Learn home</Link>
        <Link href="/learn" className={styles.wordmark} aria-label="SukuuNova Learn home">
          <span>S</span><div><strong>SukuuNova Learn</strong><small>Learn. Practice. Master.</small></div>
        </Link>
        <span className={styles.localBadge}><ShieldCheck size={14} /> Local learner evidence</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><Sparkles size={14} /> EVIDENCE-DRIVEN WEEK</span>
          <h1>A smarter week, built around <em>what your evidence says.</em></h1>
          <p>Seven days of focused practice, spaced revisits and recovery. SukuuNova uses saved mastery evidence instead of guessing what you need.</p>
          <div className={styles.heroActions}>
            <Link href="/learn/repair" className={styles.primaryButton}><Target size={16} /> Fix my weaknesses <ArrowRight size={15} /></Link>
            <Link href="/learn/progress" className={styles.secondaryButton}>Open mastery dashboard</Link>
          </div>
        </div>

        <aside className={styles.guardrailCard}>
          <div className={styles.guardrailIcon}><ShieldCheck size={21} /></div>
          <span>TRUST GUARDRAIL</span>
          <strong>Recommendation, not prediction.</strong>
          <p>This plan is generated from your local practice evidence. It is not an official grade forecast, school judgement or exam guarantee.</p>
        </aside>
      </section>

      {!ready || !plan ? (
        <section className={styles.loadingCard}><Sparkles size={18} /> Building your evidence-aware week…</section>
      ) : (
        <>
          <section className={styles.summaryGrid} aria-label="Study plan summary">
            <article><span>Plan mode</span><strong>{plan.kind}</strong><small>{plan.headline}</small></article>
            <article><span>Practice load</span><strong>{plan.totalQuestions}</strong><small>questions across the week</small></article>
            <article><span>Active days</span><strong>{activeDays}/7</strong><small>with {recoveryDays} recovery {recoveryDays === 1 ? "day" : "days"}</small></article>
            <article><span>Daily ceiling</span><strong>{plan.maxDailyQuestions}</strong><small>questions maximum per day</small></article>
          </section>

          <section className={styles.planIntro}>
            <div>
              <span>YOUR CURRENT PLAN</span>
              <h2>{plan.headline}</h2>
            </div>
            <p>{plan.reason}</p>
          </section>

          <section className={styles.weekGrid} aria-label="Seven-day study plan">
            {plan.days.map((item) => (
              <article key={item.day} className={`${styles.dayCard} ${taskClass(item.task.kind)}`}>
                <div className={styles.dayTop}>
                  <div className={styles.dayNumber}><span>DAY</span><strong>{item.day}</strong></div>
                  <span className={styles.taskBadge}>{taskLabels[item.task.kind]}</span>
                </div>
                <span className={styles.dayLabel}>{item.label}</span>
                <h3>{item.task.topic}</h3>
                <p className={styles.subject}>{item.task.subject}</p>
                <p className={styles.reason}>{item.task.reason}</p>
                <div className={styles.dayFooter}>
                  <span className={styles.load}>{item.totalQuestions ? `${item.totalQuestions} questions` : "No required questions"}</span>
                  <Link href={item.task.href}>{item.task.actionLabel} <ArrowRight size={13} /></Link>
                </div>
              </article>
            ))}
          </section>

          <section className={styles.rhythmStrip}>
            <Coffee size={19} />
            <div><strong>Consistency without pressure.</strong><p>Recovery days are intentional. If life interrupts the plan, continue from the next useful session rather than trying to “pay back” missed work.</p></div>
            <CalendarDays size={20} />
          </section>
        </>
      )}
    </main>
  );
}
