"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Flame,
  Gauge,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildLearningSession,
  isCorrectAnswer,
  sessionDiagnostics,
  type LearnQuestion,
} from "../learning-engine";
import type { PracticeMode } from "../learn-domain";
import styles from "./practice.module.css";

type ResponseValue = string | string[] | number | boolean;

type LearnerProgress = {
  sessions: number;
  answered: number;
  correct: number;
  streak: number;
  exposures: string[];
  mastery: Record<string, { answered: number; correct: number }>;
};

const EMPTY_PROGRESS: LearnerProgress = {
  sessions: 0,
  answered: 0,
  correct: 0,
  streak: 0,
  exposures: [],
  mastery: {},
};

const PRESETS = [
  {
    id: "algebra",
    label: "Algebra sprint",
    subjectId: "mathematics",
    topicId: "algebra",
    copy: "Equation solving with parameterized values and mixed response formats.",
  },
  {
    id: "science",
    label: "Science essentials",
    subjectId: "science",
    topicId: "living",
    copy: "Start from living-things concepts, then widen only when the verified pack is exhausted.",
  },
  {
    id: "digital-safety",
    label: "Digital safety",
    subjectId: "computing",
    topicId: "digital-safety",
    copy: "Account-security practice with explanation-first feedback.",
  },
  {
    id: "mixed",
    label: "Mixed challenge",
    subjectId: "all",
    topicId: "all",
    copy: "A broad challenge across the current verified starter pack.",
  },
] as const;

const MODES: Array<{ id: PracticeMode; label: string }> = [
  { id: "adaptive", label: "Adaptive order" },
  { id: "random", label: "Smart random" },
  { id: "topic", label: "Topic focus" },
  { id: "timed", label: "Timed rhythm" },
  { id: "weakness", label: "Weak-area repair" },
];

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function masteryKey(question: LearnQuestion) {
  return `${question.subject} · ${question.topic}`;
}

function normalizeProgress(value: unknown): LearnerProgress {
  if (!value || typeof value !== "object") return EMPTY_PROGRESS;
  const record = value as Partial<LearnerProgress>;
  return {
    sessions: typeof record.sessions === "number" ? record.sessions : 0,
    answered: typeof record.answered === "number" ? record.answered : 0,
    correct: typeof record.correct === "number" ? record.correct : 0,
    streak: typeof record.streak === "number" ? record.streak : 0,
    exposures: Array.isArray(record.exposures) ? record.exposures.filter((item): item is string => typeof item === "string") : [],
    mastery: record.mastery && typeof record.mastery === "object" ? record.mastery : {},
  };
}

export function PracticeEngine() {
  const [presetId, setPresetId] = useState<(typeof PRESETS)[number]["id"]>("algebra");
  const [mode, setMode] = useState<PracticeMode>("adaptive");
  const [count, setCount] = useState(20);
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_PROGRESS);
  const [session, setSession] = useState<LearnQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [response, setResponse] = useState<ResponseValue>("");
  const [submitted, setSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);

  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0];
  const currentQuestion = session[questionIndex];
  const complete = session.length > 0 && questionIndex >= session.length;
  const diagnostics = useMemo(() => sessionDiagnostics(session, progress.exposures), [session, progress.exposures]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("sukuunova-learn-progress-v1");
      if (stored) setProgress(normalizeProgress(JSON.parse(stored)));
    } catch {
      setProgress(EMPTY_PROGRESS);
    }
  }, []);

  function persist(next: LearnerProgress) {
    setProgress(next);
    try {
      window.localStorage.setItem("sukuunova-learn-progress-v1", JSON.stringify(next));
    } catch {
      // Practice remains available even when browser storage is blocked.
    }
  }

  function launch() {
    const next = buildLearningSession({
      lane: "school",
      programId: "ghana",
      levelId: "jhs-3",
      subjectId: preset.subjectId,
      topicId: preset.topicId,
      mode,
      count,
      seen: progress.exposures,
    });
    setSession(next);
    setQuestionIndex(0);
    setResponse("");
    setSubmitted(false);
    setLastCorrect(false);
    setSessionCorrect(0);
    window.setTimeout(() => document.getElementById("practice-player")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  function toggleMulti(optionId: string) {
    if (submitted) return;
    const current = Array.isArray(response) ? response : [];
    setResponse(current.includes(optionId) ? current.filter((item) => item !== optionId) : [...current, optionId]);
  }

  function submit() {
    if (!currentQuestion || submitted) return;
    if (currentQuestion.kind === "multi" && (!Array.isArray(response) || response.length === 0)) return;
    if (["fill", "numeric", "short"].includes(currentQuestion.kind) && String(response).trim() === "") return;

    const correct = isCorrectAnswer(currentQuestion, response);
    const key = masteryKey(currentQuestion);
    const previous = progress.mastery[key] ?? { answered: 0, correct: 0 };
    const exposures = [currentQuestion.exposureKey, ...progress.exposures.filter((item) => item !== currentQuestion.exposureKey)].slice(0, 300);
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

  function next() {
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

  function reset() {
    setSession([]);
    setQuestionIndex(0);
    setResponse("");
    setSubmitted(false);
    setSessionCorrect(0);
  }

  function renderResponse() {
    if (!currentQuestion) return null;

    if (currentQuestion.kind === "single") {
      return (
        <div className={styles.optionGrid}>
          {currentQuestion.options?.map((option) => (
            <button
              type="button"
              key={option.id}
              className={response === option.id ? styles.optionActive : styles.option}
              onClick={() => !submitted && setResponse(option.id)}
            >
              <span>{option.label}</span>
              {response === option.id && <Check size={17} />}
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
            <button
              type="button"
              key={option.id}
              className={selected.includes(option.id) ? styles.optionActive : styles.option}
              onClick={() => toggleMulti(option.id)}
            >
              <span>{option.label}</span>
              {selected.includes(option.id) && <Check size={17} />}
            </button>
          ))}
        </div>
      );
    }

    if (currentQuestion.kind === "boolean") {
      return (
        <div className={styles.booleanGrid}>
          {[true, false].map((value) => (
            <button
              type="button"
              key={String(value)}
              className={response === value ? styles.optionActive : styles.option}
              onClick={() => !submitted && setResponse(value)}
            >
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
        onChange={(event) => setResponse(event.target.value)}
        disabled={submitted}
        placeholder={currentQuestion.kind === "numeric" ? "Enter your number" : "Type your answer"}
      />
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={16} /> Learn home</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Practice Engine</small></div></div>
        <Link href="/learn/explore" className={styles.explorerLink}>Explorer <ArrowRight size={15} /></Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><ShieldCheck size={14} /> EXPOSURE-AWARE PRACTICE</span>
          <h1>Practice without wasting attempts on <em>accidental repeats.</em></h1>
          <p>The hardened session engine keeps concept exposure unique inside a session, prefers unseen material, scores six answer formats, and writes results into the same local mastery record used by the Explorer.</p>
        </div>
        <div className={styles.stats}>
          <article><Brain size={19} /><strong>{percent(progress.correct, progress.answered)}%</strong><span>lifetime accuracy</span></article>
          <article><Flame size={19} /><strong>{progress.streak}</strong><span>current streak</span></article>
          <article><Trophy size={19} /><strong>{progress.sessions}</strong><span>sessions finished</span></article>
        </div>
      </section>

      <section className={styles.builder}>
        <div className={styles.sectionHeading}><span>01</span><div><h2>Choose a practice pack</h2><p>These are original starter packs while SukuuNova’s verified content library expands.</p></div></div>
        <div className={styles.presetGrid}>
          {PRESETS.map((item) => (
            <button type="button" key={item.id} className={presetId === item.id ? styles.presetActive : styles.preset} onClick={() => setPresetId(item.id)}>
              <span className={styles.presetMark}>{presetId === item.id ? <CheckCircle2 size={17} /> : <Target size={17} />}</span>
              <strong>{item.label}</strong>
              <small>{item.copy}</small>
            </button>
          ))}
        </div>

        <div className={styles.controls}>
          <div>
            <label>Practice intelligence</label>
            <div className={styles.modeRow}>{MODES.map((item) => <button type="button" key={item.id} className={mode === item.id ? styles.pillActive : styles.pill} onClick={() => setMode(item.id)}>{item.label}</button>)}</div>
          </div>
          <div>
            <label>Session size</label>
            <div className={styles.modeRow}>{[10, 20, 30, 50, 75, 100].map((value) => <button type="button" key={value} className={count === value ? styles.pillActive : styles.pill} onClick={() => setCount(value)}>{value}</button>)}</div>
          </div>
        </div>

        <button type="button" className={styles.launch} onClick={launch}><Sparkles size={18} /> Build exposure-aware session <ArrowRight size={18} /></button>
      </section>

      {session.length > 0 && !complete && currentQuestion && (
        <section id="practice-player" className={styles.player}>
          <div className={styles.playerTop}>
            <div><span>QUESTION {questionIndex + 1} OF {session.length}</span><strong>{currentQuestion.subject} · {currentQuestion.topic}</strong></div>
            <div className={styles.engineSignals}><span><Gauge size={14} /> difficulty {currentQuestion.difficulty}/5</span><span>{currentQuestion.kind}</span></div>
          </div>
          <div className={styles.progressTrack}><span style={{ width: `${((questionIndex + 1) / session.length) * 100}%` }} /></div>

          <div className={styles.questionCard}>
            <div className={styles.skillTag}><Target size={14} /> {currentQuestion.skill}</div>
            <h2>{currentQuestion.prompt}</h2>
            {renderResponse()}

            {!submitted ? (
              <button type="button" className={styles.submit} onClick={submit}>Check answer <ArrowRight size={17} /></button>
            ) : (
              <div className={lastCorrect ? styles.feedbackGood : styles.feedbackBad}>
                <div className={styles.feedbackTitle}>{lastCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}<strong>{lastCorrect ? "Correct" : "Not yet"}</strong></div>
                <p>{currentQuestion.explanation}</p>
                {currentQuestion.hint && !lastCorrect && <small>Repair hint: {currentQuestion.hint}</small>}
                <button type="button" onClick={next}>{questionIndex === session.length - 1 ? "See results" : "Next question"} <ArrowRight size={16} /></button>
              </div>
            )}
          </div>
        </section>
      )}

      {complete && (
        <section className={styles.results}>
          <div className={styles.resultIcon}><Trophy size={28} /></div>
          <span>SESSION COMPLETE</span>
          <h2>{percent(sessionCorrect, session.length)}% accuracy</h2>
          <p>{sessionCorrect} correct from {session.length} questions. Every exposure key in this session was unique.</p>
          <div className={styles.resultMetrics}>
            <article><strong>{diagnostics.uniqueExposureCount}</strong><span>unique exposures</span></article>
            <article><strong>{diagnostics.freshCount}</strong><span>fresh concepts</span></article>
            <article><strong>{diagnostics.formats.length}</strong><span>answer formats</span></article>
          </div>
          <div className={styles.resultActions}>
            <button type="button" onClick={launch}><RotateCcw size={16} /> Build another</button>
            <button type="button" onClick={reset}>Change setup</button>
          </div>
        </section>
      )}
    </main>
  );
}
