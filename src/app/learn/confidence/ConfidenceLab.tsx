"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Gauge,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  CONFIDENCE_STORAGE_KEY,
  EMPTY_CONFIDENCE_RECORD,
  confidenceCalibrationPercent,
  confidencePriorityTopics,
  evaluateConfidence,
  normalizeConfidenceRecord,
  recordConfidenceAttempt,
  type ConfidenceEvaluation,
  type ConfidenceLevel,
  type ConfidenceRecord,
} from "../confidence-intelligence";
import {
  CONFIDENCE_COMPLETION_STORAGE_KEY,
  CONFIDENCE_RUN_STORAGE_KEY,
  emptyConfidenceRun,
  normalizeConfidenceCompletions,
  normalizeConfidenceRun,
  recordConfidenceCompletion,
  type ConfidenceResponseValue,
  type ConfidenceRunState,
} from "../confidence-run";
import { buildConfidenceSession, CONFIDENCE_CHECK_SIZE } from "../confidence-session";
import { localDateKey } from "../daily-challenge";
import {
  EMPTY_LEARNER_PROGRESS,
  LEARNER_PROGRESS_STORAGE_KEY,
  normalizeLearnerProgress,
  type LearnerProgress,
} from "../learner-progress";
import { isCorrectAnswer, type LearnQuestion } from "../learning-engine";
import styles from "./confidence.module.css";

const confidenceOptions: Array<{ id: ConfidenceLevel; label: string; copy: string }> = [
  { id: "unsure", label: "Unsure", copy: "I may be guessing" },
  { id: "somewhat", label: "Somewhat sure", copy: "I think this is right" },
  { id: "sure", label: "Very sure", copy: "I expect this to be right" },
];

function masteryKey(question: LearnQuestion) {
  return `${question.subject} · ${question.topic}`;
}

function hasResponse(question: LearnQuestion, response: ConfidenceResponseValue) {
  if (question.kind === "multi") return Array.isArray(response) && response.length > 0;
  if (question.kind === "boolean") return typeof response === "boolean";
  return String(response).trim().length > 0;
}

export function ConfidenceLab() {
  const [loaded, setLoaded] = useState(false);
  const [dateKey, setDateKey] = useState("");
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_LEARNER_PROGRESS);
  const [record, setRecord] = useState<ConfidenceRecord>(EMPTY_CONFIDENCE_RECORD);
  const [completions, setCompletions] = useState<string[]>([]);
  const [session, setSession] = useState<LearnQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [response, setResponse] = useState<ConfidenceResponseValue>("");
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [evaluation, setEvaluation] = useState<ConfidenceEvaluation | null>(null);
  const [completedToday, setCompletedToday] = useState(false);

  useEffect(() => {
    const today = localDateKey();
    const nextSession = buildConfidenceSession(today);
    let nextProgress = EMPTY_LEARNER_PROGRESS;
    let nextRecord = EMPTY_CONFIDENCE_RECORD;
    let nextCompletions: string[] = [];

    try {
      const raw = window.localStorage.getItem(LEARNER_PROGRESS_STORAGE_KEY);
      if (raw) nextProgress = normalizeLearnerProgress(JSON.parse(raw));
    } catch {
      nextProgress = EMPTY_LEARNER_PROGRESS;
    }

    try {
      const raw = window.localStorage.getItem(CONFIDENCE_STORAGE_KEY);
      if (raw) nextRecord = normalizeConfidenceRecord(JSON.parse(raw));
    } catch {
      nextRecord = EMPTY_CONFIDENCE_RECORD;
    }

    try {
      const raw = window.localStorage.getItem(CONFIDENCE_COMPLETION_STORAGE_KEY);
      if (raw) nextCompletions = normalizeConfidenceCompletions(JSON.parse(raw));
    } catch {
      nextCompletions = [];
    }

    const alreadyComplete = nextCompletions.includes(today);
    setDateKey(today);
    setProgress(nextProgress);
    setRecord(nextRecord);
    setCompletions(nextCompletions);
    setSession(nextSession);
    setCompletedToday(alreadyComplete);

    if (alreadyComplete) {
      window.localStorage.removeItem(CONFIDENCE_RUN_STORAGE_KEY);
    } else {
      let run = emptyConfidenceRun(today);
      try {
        const raw = window.localStorage.getItem(CONFIDENCE_RUN_STORAGE_KEY);
        if (raw) run = normalizeConfidenceRun(JSON.parse(raw), today, nextSession.length);
      } catch {
        run = emptyConfidenceRun(today);
      }
      setQuestionIndex(run.questionIndex);
      setScore(run.score);
      setSubmitted(run.submitted);
      setLastCorrect(run.lastCorrect);
      setResponse(run.response);
      setConfidence(run.confidence);
      if (run.submitted && run.confidence) setEvaluation(evaluateConfidence(run.lastCorrect, run.confidence));
    }

    setLoaded(true);
  }, []);

  const currentQuestion = session[questionIndex];
  const priorityTopics = confidencePriorityTopics(record).slice(0, 3);
  const calibration = confidenceCalibrationPercent(record);

  function persistProgress(next: LearnerProgress) {
    setProgress(next);
    try {
      window.localStorage.setItem(LEARNER_PROGRESS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Confidence practice remains available when storage is blocked.
    }
  }

  function persistRecord(next: ConfidenceRecord) {
    setRecord(next);
    try {
      window.localStorage.setItem(CONFIDENCE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Confidence evidence is optional and device-local.
    }
  }

  function persistRun(next: ConfidenceRunState) {
    try {
      window.localStorage.setItem(CONFIDENCE_RUN_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Resume is a resilience feature, never a blocker.
    }
  }

  function persistCompletions(next: string[]) {
    setCompletions(next);
    try {
      window.localStorage.setItem(CONFIDENCE_COMPLETION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Completion history is optional and local.
    }
  }

  function toggleMulti(optionId: string) {
    if (submitted) return;
    const selected = Array.isArray(response) ? response : [];
    setResponse(selected.includes(optionId) ? selected.filter((item) => item !== optionId) : [...selected, optionId]);
  }

  function submitAnswer() {
    if (!currentQuestion || submitted || !confidence || !hasResponse(currentQuestion, response)) return;
    const correct = isCorrectAnswer(currentQuestion, response);
    const nextEvaluation = evaluateConfidence(correct, confidence);
    const key = masteryKey(currentQuestion);
    const previous = progress.mastery[key] ?? { answered: 0, correct: 0 };
    const exposures = [currentQuestion.exposureKey, ...progress.exposures.filter((item) => item !== currentQuestion.exposureKey)].slice(0, 200);
    const nextProgress: LearnerProgress = {
      ...progress,
      answered: progress.answered + 1,
      correct: progress.correct + (correct ? 1 : 0),
      streak: correct ? progress.streak + 1 : 0,
      exposures,
      mastery: {
        ...progress.mastery,
        [key]: { answered: previous.answered + 1, correct: previous.correct + (correct ? 1 : 0) },
      },
    };
    const nextRecord = recordConfidenceAttempt(record, { topicKey: key, correct, confidence });
    const nextScore = score + (correct ? 1 : 0);

    persistProgress(nextProgress);
    persistRecord(nextRecord);
    setLastCorrect(correct);
    setScore(nextScore);
    setEvaluation(nextEvaluation);
    setSubmitted(true);
    persistRun({ dateKey, questionIndex, score: nextScore, submitted: true, lastCorrect: correct, response, confidence });
  }

  function advance() {
    if (!submitted || !currentQuestion) return;
    if (questionIndex < session.length - 1) {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      setResponse("");
      setConfidence(null);
      setSubmitted(false);
      setLastCorrect(false);
      setEvaluation(null);
      persistRun({ dateKey, questionIndex: nextIndex, score, submitted: false, lastCorrect: false, response: "", confidence: null });
      return;
    }

    const nextCompletions = recordConfidenceCompletion(completions, dateKey);
    persistCompletions(nextCompletions);
    persistProgress({ ...progress, sessions: progress.sessions + 1 });
    window.localStorage.removeItem(CONFIDENCE_RUN_STORAGE_KEY);
    setCompletedToday(true);
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
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={16} /> Learn home</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Confidence intelligence</small></div></div>
        <Link href="/learn/progress" className={styles.progressLink}>My progress <ArrowRight size={15} /></Link>
      </header>

      {!loaded ? (
        <section className={styles.loading}><Sparkles size={20} /> Preparing your confidence check…</section>
      ) : completedToday ? (
        <section className={styles.completeCard}>
          <div className={styles.completeIcon}><Brain size={34} /></div>
          <span>TODAY&apos;S CONFIDENCE CHECK COMPLETE</span>
          <h1>{calibration}%</h1>
          <p>Lifetime confidence calibration: how closely your certainty has matched outcomes so far. This is a learning signal, not an ability score or grade prediction.</p>
          <div className={styles.metricGrid}>
            <article><strong>{record.strong}</strong><span>strong-evidence answers</span></article>
            <article><strong>{record.fragileCorrect}</strong><span>fragile correct answers</span></article>
            <article><strong>{record.possibleMisconceptions}</strong><span>possible misconception signals</span></article>
          </div>
          {priorityTopics.length ? (
            <div className={styles.priorityList}>
              <strong>Worth revisiting</strong>
              {priorityTopics.map((topic) => <span key={topic.key}>{topic.key}</span>)}
            </div>
          ) : null}
          <div className={styles.completeActions}>
            <Link href="/learn/repair" className={styles.primaryButton}>Turn signals into practice <ArrowRight size={16} /></Link>
            <Link href="/learn/plan" className={styles.secondaryButton}>Open my study plan</Link>
          </div>
        </section>
      ) : currentQuestion ? (
        <>
          <section className={styles.hero}>
            <div>
              <span className={styles.kicker}><Gauge size={14} /> {dateKey} · CALIBRATION CHECK</span>
              <h1>Don&apos;t just ask “Was I right?” Ask <em>“Did I really know it?”</em></h1>
              <p>Answer first, report how sure you are, then check. SukuuNova uses the difference between confidence and outcome as another learning signal.</p>
            </div>
            <aside className={styles.guardrailCard}><ShieldCheck size={21} /><strong>Possible signals, not labels.</strong><p>A confident wrong answer may suggest a misconception worth reviewing. It does not diagnose the learner or prove a misconception exists.</p></aside>
          </section>

          <section className={styles.sessionMeta}>
            <div><Target size={16} /><span>{CONFIDENCE_CHECK_SIZE} unique questions</span></div>
            <div><Brain size={16} /><span>confidence before feedback</span></div>
            <div><Gauge size={16} /><span>{score}/{questionIndex + (submitted ? 1 : 0)} correct so far</span></div>
          </section>

          <section className={styles.player}>
            <div className={styles.playerTop}>
              <div><span>QUESTION {questionIndex + 1} OF {session.length}</span><strong>{currentQuestion.subject} · {currentQuestion.topic}</strong></div>
              <small>{currentQuestion.kind} · difficulty {currentQuestion.difficulty}/5</small>
            </div>
            <div className={styles.progressTrack}><span style={{ width: `${((questionIndex + 1) / session.length) * 100}%` }} /></div>
            <div className={styles.questionCard}>
              <div className={styles.skillTag}><Target size={14} /> {currentQuestion.skill}</div>
              <h2>{currentQuestion.prompt}</h2>
              {renderResponse()}

              {!submitted ? (
                <>
                  <div className={styles.confidencePrompt}>
                    <span>BEFORE CHECKING: HOW SURE ARE YOU?</span>
                    <div className={styles.confidenceGrid}>
                      {confidenceOptions.map((option) => (
                        <button type="button" key={option.id} className={confidence === option.id ? styles.confidenceActive : styles.confidenceOption} onClick={() => setConfidence(option.id)}>
                          <strong>{option.label}</strong><small>{option.copy}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="button" className={styles.submitButton} onClick={submitAnswer}>Check answer & confidence <ArrowRight size={17} /></button>
                </>
              ) : evaluation ? (
                <div className={lastCorrect ? styles.feedbackGood : styles.feedbackBad}>
                  <div>{lastCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}<strong>{lastCorrect ? "Answer correct" : "Answer incorrect"}</strong></div>
                  <h3>{evaluation.title}</h3>
                  <p>{evaluation.explanation}</p>
                  <p className={styles.explanation}>{currentQuestion.explanation}</p>
                  <button type="button" onClick={advance}>{questionIndex === session.length - 1 ? "Finish confidence check" : "Next question"} <ArrowRight size={16} /></button>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
