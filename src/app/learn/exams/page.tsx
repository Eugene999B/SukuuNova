import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenCheck, CalendarCheck2, Clock3, ExternalLink, GraduationCap, ShieldCheck, Sparkles, Target } from "lucide-react";
import { EXAM_BLUEPRINTS, GHANA_CCP_REFERENCE, practiceReadySubjects } from "../exam-blueprints";
import styles from "./exams.module.css";

export const metadata: Metadata = {
  title: "Exam Centre | SukuuNova Learn",
  description: "Versioned exam preparation blueprints for BECE and WASSCE, grounded in current official Ghana references.",
};

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} hr${hours === 1 ? "" : "s"}`;
  return `${hours} hr ${rest} min`;
}

export default function ExamCentrePage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn" className={styles.back}><ArrowLeft size={16} /> Learn home</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Exam Centre</small></div></div>
        <Link href="/learn/practice" className={styles.practice}>Open practice <ArrowRight size={15} /></Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><ShieldCheck size={15} /> VERSIONED EXAM INTELLIGENCE</span>
          <h1>Prepare for the exam that <em>actually exists.</em></h1>
          <p>SukuuNova keeps exam blueprints tied to a year, authority and source. That lets practice evolve when an exam changes without pretending yesterday&apos;s structure is permanent.</p>
          <div className={styles.heroActions}>
            <Link href="/learn/practice" className={styles.primary}>Start intelligent practice <Sparkles size={17} /></Link>
            <Link href="/learn/explore" className={styles.secondary}>Explore learning paths <Target size={17} /></Link>
          </div>
        </div>
        <div className={styles.referenceCard}>
          <span><GraduationCap size={18} /> CURRICULUM REFERENCE</span>
          <strong>{GHANA_CCP_REFERENCE.label}</strong>
          <p>{GHANA_CCP_REFERENCE.scope} curriculum reference for the Ghana school lane.</p>
          <a href={GHANA_CCP_REFERENCE.sourceUrl} target="_blank" rel="noreferrer">Open NaCCA source <ExternalLink size={13} /></a>
          <small>Verified {GHANA_CCP_REFERENCE.lastVerified}</small>
        </div>
      </section>

      <section className={styles.blueprints} aria-label="Exam blueprints">
        {EXAM_BLUEPRINTS.map((blueprint) => {
          const ready = practiceReadySubjects(blueprint);
          return (
            <article className={styles.blueprint} key={blueprint.id}>
              <div className={styles.blueprintHeader}>
                <div>
                  <span className={styles.version}><CalendarCheck2 size={14} /> {blueprint.referenceYear} SNAPSHOT</span>
                  <h2>{blueprint.label}</h2>
                  <p>{blueprint.authority}</p>
                </div>
                <div className={styles.coverage}><strong>{ready.length}</strong><span>topic-practice subjects</span></div>
              </div>

              <p className={styles.note}>{blueprint.note}</p>

              <div className={styles.subjectGrid}>
                {blueprint.subjects.map((subject) => (
                  <section className={subject.practiceReady ? styles.subjectReady : styles.subjectPlanned} key={subject.id}>
                    <div className={styles.subjectTitle}>
                      <BookOpenCheck size={16} />
                      <strong>{subject.label}</strong>
                      <span>{subject.practiceReady ? "Foundation topic practice" : "Coverage mapped · practice pending"}</span>
                    </div>
                    {subject.papers?.length ? (
                      <div className={styles.paperList}>
                        {subject.papers.map((paper) => (
                          <div key={paper.id}>
                            <span>{paper.label}</span>
                            {paper.durationMinutes ? <small><Clock3 size={12} /> {duration(paper.durationMinutes)}</small> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.subjectCopy}>{subject.practiceReady ? "Reviewed foundation questions are available for topic practice. This is not presented as a full paper mock." : "The exam area is mapped, but trusted paper-specific practice is not exposed until its content and marking are validated."}</p>
                    )}
                  </section>
                ))}
              </div>

              <footer className={styles.sourceRow}>
                <div><ShieldCheck size={14} /><span>Last verified {blueprint.lastVerified}</span></div>
                <a href={blueprint.sourceUrl} target="_blank" rel="noreferrer">{blueprint.sourceLabel} <ExternalLink size={13} /></a>
              </footer>
            </article>
          );
        })}
      </section>

      <section className={styles.guardrail}>
        <div><ShieldCheck size={22} /><span>EXAM SAFETY</span></div>
        <h2>Practice intelligence, not fake certainty.</h2>
        <p>SukuuNova can report practice accuracy, pace and areas to revisit. It does not present those signals as an official WAEC grade prediction, and no full BECE or WASSCE mock is exposed until paper-specific structure, timing, question types and marking have been validated.</p>
      </section>
    </main>
  );
}
