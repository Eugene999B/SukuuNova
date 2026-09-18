"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  EMPTY_LEARNER_PROGRESS,
  LEARNER_PROGRESS_STORAGE_KEY,
  normalizeLearnerProgress,
  percentage,
  type LearnerProgress,
} from "../learner-progress";
import { isCorrectAnswer, type LearnQuestion } from "../learning-engine";
import { buildRepairPlan, buildRepairSession } from "../repair-engine";
import styles from "./repair.module.css";

type ResponseValue = string | string[] | number | boolean;

function masteryKey(question: LearnQuestion) {
  return `${question.subject} · ${question.topic}`;
}

export function RepairCoach() {
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_LEARNER_PROGRESS);
  const [count, setCount] = useState(10);
  const [session, setSession] = useState<LearnQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [response, setResponse] = useState<ResponseValue>("");
  const [submitted, setSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);

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

  const plan = useMemo(() => buildRepairPlan(progress), [progress]);
  const currentQuestion = session[questionIndex];
  const complete = session.length > 0 && questionIndex >= session.length;
  const sessionAccuracy = percentage(sessionCorrect, session.length);

  function persist(next: LearnerProgress) {
    setProgress(next);
    try {
      window.localStorage.setItem(LEARNER_PROGRESS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Repair remains usable when local storage is unavailable.
    }
  }

  function launchRepair() {
    const next = buildRepairSession(progress, count);
    setSession(next);
    setQuestionIndex(0);
    setResponse("");
    setSubmitted(false);
    setLastCorrect(false);
    setSessionCorrect(0);
    window.setTimeout(() => document.getElementById("repair-player")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  function toggleMulti(optionId: string) {
    if (submitted) return;
    const selected = Array.isArray(response) ? response : [];
    setResponse(selected.includes(optionId) ? selected.filter((item) => item !== optionId) : [...selected, optionId]);
  }

  function submitAnswer() {
    if (!currentQuestion || submitted) return;
    if (currentQuestion.kind === "multi" && (!Array.isArray(response) || response.length === 0)) return;
    if (["fill", "numeric", "short"].includes(currentQuestion.kind) && String(response).trim() === "") return;

    const correct = isCorrectAnswer(currentQuestion, response);
    const key = masteryKey(currentQuestion);
    const previous = progress.mastery[key] ?? { answered: 0, correct: 0 };
    const exposures = [currentQuestion.exposureKey, ...progress.exposures.filter((item) => item !== currentQuestion.exposureKey)].slice(0, 200);
    persist({
      ...progress,
      answered: progress.answered + 1,
      correct: progress.correct + (correct ? 1 : 0),
      streak: correct ? progress.streak + 1 : 0,
      exposures,
      mastery: {
        ...progress.mastery,
        [key]: {
          answered: previous.answered + 1,
          correct: previous.correct + (correct ? 1 : 0),
        },
      },
    });
    setLastCorrect(correct);
    setSessionCorrect((value) => value + (correct ? 1 : 0));
    setSubmitted(true);
  }

  function nextQuestion() {
    if (!submitted) return;
    if (questionIndex >= session.length - 1) {
      persist({ ...progress, sessions: progress.sessions + 1 });
      setQuestionIndex(session.length);
      return;
    }
    setQuestionIndex((value) => value + 1);
    setResponse("");
    setSubmitted(false);
    setLastCorrect(false);
  }

  function resetSession() {
    setSession([]);
    setQuestionIndex(0);
    setResponse("");
    setSubmitted(false);
    setLastCorrect(false);
    setSessionCorrect(0);
  }

  function renderResponse() {
    if (!currentQuestion) return null;

    if (currentQuestion.kind === "single") {
      return (
        <div className={styles.optionGrid}>
          {currentQuestion.options?.map((option) => (
            <button type="button" key={option.id} className={response === option.id ? styles.optionActive : styles.option} onClick={() => !submitted && setResponse(option.id)}>
              <span>{option.label}</span>{response === option.id ? <Check size={17} /> : null}
            </button>
          ))}
        </div>
      );
    }

    if (currentQuestion.kind === "multi") {
      const selected = Array.isArray(response) ? response : [];
      return (
        <div className={styles.optionGrid}>
          {currentQuestion.options?.map((option) => (
            <button type="button" key={option.id} className={selected.includes(option.id) ? styles.optionActive : styles.option} onClick={() => toggleMulti(option.id)}>
              <span>{option.label}</span>{selected.includes(option.id) ? <Check size={17} /> : null}
            </button>
          ))}
        </div>
      );
    }

    if (currentQuestion.kind === "boolean") {
      return (
        <div className={styles.booleanGrid}>
          {[true, false].map((value) => (
            <button type="button" key={String(value)} className={response === value ? styles.optionActive : styles.option} onClick={() => !submitted && setResponse(value)}>
              {value ? "True" : "False"}
            </button>
          ))}
        </div>
      );
    }

    return (
      <input
        className={styles.answerInput}
        type={currentQuestion.kind === "numeric" ? "number" : "text"}
        inputMode={currentQuestion.kind === "numeric" ? "decimal" : "text"}
        value={String(response)}
        disabled={submitted}
        onChange={(event) => setResponse(event.target.value)}
        placeholder={currentQuestion.kind === "numeric" ? "Enter your number" : "Type your answer"}
      />
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn/progress" className={styles.backLink}><ArrowLeft size={16} /> Progress</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Repair Coach</small></div></div>
        <Link href="/learn/practice" className={styles.practiceLink}>All practice <ArrowRight size={15} /></Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><Wrench size={14} /> FIX MY WEAKNESSES</span>
          <h1>Don&apos;t just see the gap. <em>Repair it intelligently.</em></h1>
          <p>SukuuNova chooses the next repair target from your own saved evidence, prioritizes proven weakness before uncertainty, and builds an exposure-aware adaptive session around it.</p>
        </div>
        <aside className={styles.planCard}>
          <span>{loaded ? plan.title.toUpperCase() : "READING EVIDENCE"}</span>
          <strong>{loaded ? `${plan.subject} · ${plan.topic}` : "Building your plan..."}</strong>
          <p>{plan.reason}</p>
          <small>{plan.evidence}</small>
        </aside>
      </section>

      <section className={styles.controlPanel}>
        <div className={styles.controlCopy}>
          <div className={styles.controlIcon}><BrainCircuit size={21} /></div>
          <div><span>PERSONALIZED SESSION</span><strong>{plan.kind === "targeted" ? "Target the highest-value learning gap" : "Build enough evidence for future targeting"}</strong></div>
        </div>
        <div className={styles.countRow}>
          {[5, 10, 20, 30].map((value) => <button type="button" key={value} className={count === value ? styles.countActive : styles.countButton} onClick={() => setCount(value)}>{value}</button>)}
        </div>
        <button type="button" className={styles.launchButton} onClick={launchRepair} disabled={!loaded}><Sparkles size={17} /> Build repair session <ArrowRight size={17} /></button>
      </section>

      {plan.alternatives.length > 0 ? (
        <section className={styles.alternatives}>
          <span>UP NEXT AFTER THIS</span>
          <div>{plan.alternatives.map((item) => <article key={item.key}><strong>{item.subject} · {item.topic}</strong><small>{item.accuracy}% across {item.answered} attempts</small></article>)}</div>
        </section>
      ) : null}

      {session.length > 0 && !complete && currentQuestion ? (
        <section id="repair-player" className={styles.player}>
          <div className={styles.playerTop}>
            <div><span>REPAIR {questionIndex + 1} OF {session.length}</span><strong>{currentQuestion.subject} · {currentQuestion.topic}</strong></div>
            <small>difficulty {currentQuestion.difficulty}/5 · {currentQuestion.kind}</small>
          </div>
          <div className={styles.progressTrack}><span style={{ width: `${((questionIndex + 1) / session.length) * 100}%` }} /></div>
          <div className={styles.questionCard}>
            <div className={styles.skillTag}><Target size={14} /> {currentQuestion.skill}</div>
            <h2>{currentQuestion.prompt}</h2>
            {renderResponse()}
            {!submitted ? (
              <button type="button" className={styles.submitButton} onClick={submitAnswer}>Check answer <ArrowRight size={17} /></button>
            ) : (
              <div className={lastCorrect ? styles.feedbackGood : styles.feedbackBad}>
                <div>{lastCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}<strong>{lastCorrect ? "Correct" : "Repair this idea"}</strong></div>
                <p>{currentQuestion.explanation}</p>
                {!lastCorrect && currentQuestion.hint ? <small>Repair hint: {currentQuestion.hint}</small> : null}
                <button type="button" onClick={nextQuestion}>{questionIndex === session.length - 1 ? "See repair result" : "Next repair question"} <ArrowRight size={16} /></button>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {complete ? (
        <section className={styles.resultCard}>
          <div className={styles.resultIcon}><ShieldCheck size={28} /></div>
          <span>REPAIR SESSION COMPLETE</span>
          <h2>{sessionAccuracy}%</h2>
          <p>{sessionCorrect} of {session.length} correct. Your mastery evidence has already been updated, so the next repair plan can change with what you just demonstrated.</p>
          <div className={styles.resultActions}>
            <Link href="/learn/progress" className={styles.primaryLink}>Review mastery <ArrowRight size={16} /></Link>
            <button type="button" onClick={resetSession}><RotateCcw size={15} /> Recalculate plan</button>
          </div>
        </section>
      ) : null}

      <section className={styles.guardrail}><ShieldCheck size={17} /><p><strong>Evidence, not labels:</strong> this coach uses local practice performance to choose a learning target. It is not an official grade, diagnosis or prediction.</p></section>
    </main>
  );
}
