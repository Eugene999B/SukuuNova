"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenCheck, Compass, FileJson, Grid3X3, ShieldCheck, Sparkles, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  EMPTY_LEARNER_PROGRESS,
  LEARNER_PROGRESS_STORAGE_KEY,
  normalizeLearnerProgress,
  type LearnerProgress,
} from "../learner-progress";
import { buildMasteryMap, type MasteryMapStatus } from "../mastery-map";
import styles from "./map.module.css";

const statusCopy: Record<MasteryMapStatus, string> = {
  unseen: "Unseen",
  evidence: "Needs evidence",
  repair: "Repair",
  developing: "Developing",
  secure: "Secure",
};

function statusClass(status: MasteryMapStatus) {
  if (status === "repair") return styles.repair;
  if (status === "developing") return styles.developing;
  if (status === "secure") return styles.secure;
  if (status === "evidence") return styles.evidence;
  return styles.unseen;
}

export function MasteryMapDashboard() {
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_LEARNER_PROGRESS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEARNER_PROGRESS_STORAGE_KEY);
      setProgress(raw ? normalizeLearnerProgress(JSON.parse(raw)) : EMPTY_LEARNER_PROGRESS);
    } catch {
      setProgress(EMPTY_LEARNER_PROGRESS);
    } finally {
      setLoaded(true);
    }
  }, []);

  const map = useMemo(() => buildMasteryMap(progress), [progress]);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn/progress" className={styles.backLink}><ArrowLeft size={16} /> Progress</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Starter mastery map</small></div></div>
        <span className={styles.localBadge}><ShieldCheck size={14} /> Evidence, not guesswork</span>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}><Grid3X3 size={14} /> WHOLE-MAP VISIBILITY</span>
          <h1>Mastery includes knowing <em>what you have not practised yet.</em></h1>
          <p>This starter map keeps all 20 launch topics visible. Unseen is not weak, one or two answers are not mastery, and strong performance in a few topics is not treated as full coverage.</p>
          <div className={styles.heroActions}>
            <Link href="/learn/explore" className={styles.primaryButton}><Compass size={16} /> Explore a topic <ArrowRight size={15} /></Link>
            <Link href="/learn/repair" className={styles.secondaryButton}><Target size={16} /> Fix my weaknesses</Link>
            <Link href="/learn/passport" className={styles.secondaryButton}><FileJson size={16} /> Backup my progress</Link>
          </div>
        </div>
        <aside className={styles.scopeCard}>
          <Sparkles size={21} />
          <strong>Current starter scope</strong>
          <p>This is SukuuNova&apos;s current five-subject Ghana starter taxonomy, not a claim to represent every objective in the full national curriculum.</p>
        </aside>
      </section>

      {!loaded ? (
        <section className={styles.loading}>Building your mastery map…</section>
      ) : (
        <>
          <section className={styles.metrics} aria-label="Mastery coverage summary">
            <article><span>Starter topics</span><strong>{map.totalTopics}</strong><small>across five launch subjects</small></article>
            <article><span>Practised coverage</span><strong>{map.practicedCoveragePercent}%</strong><small>{map.practicedTopics} topics with evidence</small></article>
            <article><span>Still unseen</span><strong>{map.unseenTopics}</strong><small>not labelled weak or secure</small></article>
            <article><span>Reviewed questions</span><strong>{map.reviewedQuestions}</strong><small>in the current standard library</small></article>
          </section>

          <section className={styles.legend} aria-label="Mastery map legend">
            {(["unseen", "evidence", "repair", "developing", "secure"] as MasteryMapStatus[]).map((status) => (
              <span key={status} className={statusClass(status)}><i /> {statusCopy[status]}</span>
            ))}
          </section>

          <section className={styles.subjectList}>
            {map.subjects.map((subject) => (
              <article className={styles.subjectCard} key={subject.id}>
                <div className={styles.subjectHeading}>
                  <div><span>SUBJECT</span><h2>{subject.label}</h2></div>
                  <small>{subject.topics.filter((topic) => topic.status !== "unseen").length}/{subject.topics.length} practised</small>
                </div>
                <div className={styles.topicGrid}>
                  {subject.topics.map((topic) => (
                    <div className={`${styles.topicCard} ${statusClass(topic.status)}`} key={topic.key}>
                      <div className={styles.topicTop}>
                        <span>{statusCopy[topic.status]}</span>
                        <small><BookOpenCheck size={12} /> {topic.reviewedQuestions} reviewed</small>
                      </div>
                      <h3>{topic.topic}</h3>
                      {topic.status === "unseen" ? (
                        <p>No attempts yet. SukuuNova deliberately leaves this unjudged.</p>
                      ) : (
                        <p>{topic.correct}/{topic.answered} correct · {topic.accuracy}% accuracy</p>
                      )}
                      <Link href={topic.status === "repair" || topic.status === "developing" ? "/learn/repair" : "/learn/explore"}>
                        {topic.status === "repair" || topic.status === "developing" ? "Open repair coach" : "Choose practice"} <ArrowRight size={13} />
                      </Link>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className={styles.truthStrip}>
            <ShieldCheck size={18} />
            <p><strong>Coverage honesty:</strong> {map.secureTopics} secure · {map.developingTopics} developing · {map.repairTopics} repair · {map.evidenceTopics} need more evidence · {map.unseenTopics} unseen.</p>
          </section>
        </>
      )}
    </main>
  );
}
