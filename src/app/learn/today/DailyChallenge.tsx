"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Flame,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildDailyChallenge,
  DAILY_CHALLENGE_SIZE,
  DAILY_HISTORY_STORAGE_KEY,
  dailyStudyStreak,
  localDateKey,
  normalizeDailyHistory,
  recordDailyCompletion,
  type DailyCompletion,
} from "../daily-challenge";
import {
  DAILY_RUN_STORAGE_KEY,
  emptyDailyRun,
  normalizeDailyRun,
  type DailyResponseValue,
  type DailyRunState,
} from "../daily-run";
import {
  EMPTY_LEARNER_PROGRESS,
  LEARNER_PROGRESS_STORAGE_KEY,
  normalizeLearnerProgress,
  percentage,
  type LearnerProgress,
} from "../learner-progress";
import { isCorrectAnswer, type LearnQuestion } from "../learning-engine";
import styles from "./today.module.css";

function masteryKey(question: LearnQuestion) {
  return `${question.subject} · ${question.topic}`;
}

export function DailyChallenge() {
  const [loaded, setLoaded] = useState(false);
  const [dateKey, setDateKey] = useState("");
  const [history, setHistory] = useState<DailyCompletion[]>([]);
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_LEARNER_PROGRESS);
  const [session, setSession] = useState<LearnQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [response, setResponse] = useState<DailyResponseValue>("");
  const [submitted, setSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState<DailyCompletion | null>(null);

  useEffect(() => {
    const today = localDateKey();
    let nextProgress = EMPTY_LEARNER_PROGRESS;
    let nextHistory: DailyCompletion[] = [];

    try {
      const rawProgress = window.localStorage.getItem(LEARNER_PROGRESS_STORAGE_KEY);
      if (rawProgress) nextProgress = normalizeLearnerProgress(JSON.parse(rawProgress));
    } catch {
      nextProgress = EMPTY_LEARNER_PROGRESS;
    }

    try {
      const rawHistory = window.localStorage.getItem(DAILY_HISTORY_STORAGE_KEY);
      if (rawHistory) nextHistory = normalizeDailyHistory(JSON.parse(rawHistory));
    } catch {
      nextHistory = [];
    }

    const existing = nextHistory.find((item) => item.dateKey === today) ?? null;
    setDateKey(today);
    setProgress(nextProgress);
    setHistory(nextHistory);
    setCompleted(existing);

    if (existing) {
      window.localStorage.removeItem(DAILY_RUN_STORAGE_KEY);
    } else {
      const nextSession = buildDailyChallenge(today, nextProgress.exposures);
      setSession(nextSession);
      let run = emptyDailyRun(today);
      try {
        const rawRun = window.localStorage.getItem(DAILY_RUN_STORAGE_KEY);
        if (rawRun) run = normalizeDailyRun(JSON.parse(rawRun), today, nextSession.length);
      } catch {
        run = emptyDailyRun(today);
      }
      setQuestionIndex(run.questionIndex);
      setScore(run.score);
      setSubmitted(run.submitted);
      setLastCorrect(run.lastCorrect);
      setResponse(run.response);
    }

    setLoaded(true);
  }, []);

  const currentQuestion = session[questionIndex];
  const rhythm = dateKey ? dailyStudyStreak(history, dateKey) : 0;
  const currentAccuracy = percentage(score, Math.max(questionIndex + (submitted ? 1 : 0), 0));
  const subjects = useMemo(() => Array.from(new Set(session.map((question) => question.subject))), [session]);

  function persistProgress(next: LearnerProgress) {
    setProgress(next);
    try {
      window.localStorage.setItem(LEARNER_PROGRESS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The daily challenge remains playable when storage is unavailable.
    }
  }

  function persistHistory(next: DailyCompletion[]) {
    setHistory(next);
    try {
      window.localStorage.setItem(DAILY_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Completion history is optional and device-local.
    }
  }

  function persistRun(next: DailyRunState) {
    try {
      window.localStorage.setItem(DAILY_RUN_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Resume is a resilience feature; failure must never block practice.
    }
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
    const nextScore = score + (correct ? 1 : 0);
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
        [key]: {
          answered: previous.answered + 1,
          correct: previous.correct + (correct ? 1 : 0),
        },
      },
    };

    persistProgress(nextProgress);
    setLastCorrect(correct);
    setScore(nextScore);
    setSubmitted(true);
    persistRun({ dateKey, questionIndex, score: nextScore, submitted: true, lastCorrect: correct, response });
  }

  function advance() {
    if (!submitted || !currentQuestion) return;
    if (questionIndex < session.length - 1) {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      setResponse("");
      setSubmitted(false);
      setLastCorrect(false);
      persistRun({ dateKey, questionIndex: nextIndex, score, submitted: false, lastCorrect: false, response: "" });
      return;
    }

    const completion: DailyCompletion = {
      dateKey,
      score,
      total: session.length,
      completedAt: new Date().toISOString(),
    };
    const nextHistory = recordDailyCompletion(history, completion);
    persistHistory(nextHistory);
    persistProgress({ ...progress, sessions: progress.sessions + 1 });
    window.localStorage.removeItem(DAILY_RUN_STORAGE_KEY);
    setCompleted(completion);
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
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Today&apos;s 10</small></div></div>
        <Link href="/learn/progress" className={styles.progressLink}>My progress <ArrowRight size={15} /></Link>
      </header>

      {!loaded ? (
        <section className={styles.loading}><Sparkles size={22} /><strong>Building today&apos;s challenge...</strong></section>
      ) : completed ? (
        <section className={styles.completeCard}>
          <div className={styles.trophy}><Trophy size={34} /></div>
          <span>DAILY CHALLENGE COMPLETE</span>
          <h1>{completed.score}/{completed.total}</h1>
          <p>You finished Today&apos;s 10. Your answers are already part of your local mastery evidence.</p>
          <div className={styles.completeStats}>
            <article><strong>{percentage(completed.score, completed.total)}%</strong><span>today&apos;s accuracy</span></article>
            <article><strong>{dailyStudyStreak(history, dateKey)}</strong><span>day study rhythm</span></article>
            <article><strong>{progress.answered}</strong><span>lifetime answers</span></article>
          </div>
          <div className={styles.completeActions}>
            <Link href="/learn/progress" className={styles.primaryButton}>See what to practise next <ArrowRight size={17} /></Link>
            <Link href="/learn/practice" className={styles.secondaryButton}>Keep learning</Link>
          </div>
          <small className={styles.kindNote}>No replay pressure: tomorrow brings a new set. You can always keep practising elsewhere for free.</small>
        </section>
      ) : (
        <>
          <section className={styles.hero}>
            <div>
              <span className={styles.kicker}><CalendarDays size={14} /> {dateKey} · FREE DAILY PRACTICE</span>
              <h1>Ten focused questions. <em>One useful learning signal.</em></h1>
              <p>Today&apos;s set is fixed for the date, uses unique concept exposures, resumes safely after refresh and feeds the same mastery record as SukuuNova Practice.</p>
            </div>
            <aside className={styles.rhythmCard}>
              <Flame size={22} />
              <strong>{rhythm}</strong>
              <span>day study rhythm</span>
              <small>Missing today does not erase yesterday before the day is over.</small>
            </aside>
          </section>

          <section className={styles.challengeMeta}>
            <div><Target size={16} /><span>{DAILY_CHALLENGE_SIZE} unique questions</span></div>
            <div><Sparkles size={16} /><span>{subjects.length || "Mixed"} subject mix</span></div>
            <div><Trophy size={16} /><span>{currentAccuracy}% session accuracy</span></div>
          </section>

          {currentQuestion ? (
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
                  <button type="button" className={styles.submitButton} onClick={submitAnswer}>Check answer <ArrowRight size={17} /></button>
                ) : (
                  <div className={lastCorrect ? styles.feedbackGood : styles.feedbackBad}>
                    <div>{lastCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}<strong>{lastCorrect ? "Correct" : "Not yet"}</strong></div>
                    <p>{currentQuestion.explanation}</p>
                    {!lastCorrect && currentQuestion.hint ? <small>Repair hint: {currentQuestion.hint}</small> : null}
                    <button type="button" onClick={advance}>{questionIndex === session.length - 1 ? "Finish Today's 10" : "Next question"} <ArrowRight size={16} /></button>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
