"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GripVertical,
  Link2,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RELEASED_RICH_INTERACTIONS } from "../rich-starter-pack";
import {
  isRichInteractionCorrect,
  richInteractionLabel,
  type RichLearnerQuestion,
} from "../rich-interactions";
import styles from "./interactions.module.css";

type LearnerProgress = {
  sessions: number;
  answered: number;
  correct: number;
  streak: number;
  exposures: string[];
  mastery: Record<string, { answered: number; correct: number }>;
};

const PROGRESS_KEY = "sukuunova-learn-progress-v1";
const EMPTY_PROGRESS: LearnerProgress = {
  sessions: 0,
  answered: 0,
  correct: 0,
  streak: 0,
  exposures: [],
  mastery: {},
};

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

function masteryKey(question: RichLearnerQuestion) {
  return `${question.subject} · ${question.topic}`;
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function solutionText(question: RichLearnerQuestion) {
  const optionLabel = new Map(question.options.map((option) => [option.id, option.label]));
  if (question.kind === "matching") {
    return question.matchPrompts
      .map((prompt, index) => `${prompt.label} → ${optionLabel.get(question.answer[index]) ?? question.answer[index]}`)
      .join(" · ");
  }
  return question.answer.map((id) => optionLabel.get(id) ?? id).join(" → ");
}

export function InteractionLab() {
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_PROGRESS);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [response, setResponse] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);

  const currentQuestion = RELEASED_RICH_INTERACTIONS[questionIndex];
  const complete = questionIndex >= RELEASED_RICH_INTERACTIONS.length;
  const optionMap = useMemo(
    () => new Map(currentQuestion?.options.map((option) => [option.id, option.label]) ?? []),
    [currentQuestion],
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROGRESS_KEY);
      if (stored) setProgress(normalizeProgress(JSON.parse(stored)));
    } catch {
      setProgress(EMPTY_PROGRESS);
    }
  }, []);

  function persist(next: LearnerProgress) {
    setProgress(next);
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
    } catch {
      // Rich interactions remain usable when browser storage is blocked.
    }
  }

  function chooseMatch(index: number, optionId: string) {
    if (submitted || !currentQuestion || currentQuestion.kind !== "matching") return;
    setResponse((current) => {
      const next = Array.from({ length: currentQuestion.matchPrompts.length }, (_, itemIndex) => current[itemIndex] ?? "");
      next[index] = optionId;
      return next;
    });
  }

  function addOrder(optionId: string) {
    if (submitted || response.includes(optionId)) return;
    setResponse((current) => [...current, optionId]);
  }

  function undoOrder() {
    if (submitted) return;
    setResponse((current) => current.slice(0, -1));
  }

  function clearResponse() {
    if (submitted) return;
    setResponse([]);
  }

  function answerReady() {
    if (!currentQuestion) return false;
    return response.length === currentQuestion.answer.length && response.every(Boolean);
  }

  function submit() {
    if (!currentQuestion || submitted || !answerReady()) return;
    const correct = isRichInteractionCorrect(currentQuestion, response);
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
    if (questionIndex === RELEASED_RICH_INTERACTIONS.length - 1) {
      persist({ ...progress, sessions: progress.sessions + 1 });
      setQuestionIndex(RELEASED_RICH_INTERACTIONS.length);
      return;
    }
    setQuestionIndex((value) => value + 1);
    setResponse([]);
    setSubmitted(false);
    setLastCorrect(false);
  }

  function restart() {
    setQuestionIndex(0);
    setResponse([]);
    setSubmitted(false);
    setLastCorrect(false);
    setSessionCorrect(0);
  }

  function renderMatching(question: Extract<RichLearnerQuestion, { kind: "matching" }>) {
    const selected = new Set(response.filter(Boolean));
    return (
      <div className={styles.matchingGrid}>
        {question.matchPrompts.map((prompt, index) => (
          <div className={styles.matchRow} key={prompt.id}>
            <div className={styles.matchPrompt}><Link2 size={16} /><strong>{prompt.label}</strong></div>
            <ArrowRight size={15} className={styles.matchArrow} />
            <select
              aria-label={`Match ${prompt.label}`}
              value={response[index] ?? ""}
              disabled={submitted}
              onChange={(event) => chooseMatch(index, event.target.value)}
            >
              <option value="">Choose a match</option>
              {question.options.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={selected.has(option.id) && response[index] !== option.id}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    );
  }

  function renderOrdering(question: Extract<RichLearnerQuestion, { kind: "ordering" }>) {
    return (
      <div className={styles.orderingWrap}>
        <div className={styles.sequence} aria-label="Your selected sequence">
          {response.length === 0 ? (
            <span className={styles.sequenceEmpty}>Tap the cards below in the order you think is correct.</span>
          ) : response.map((id, index) => (
            <div className={styles.sequenceItem} key={`${id}-${index}`}>
              <span>{index + 1}</span>
              <strong>{optionMap.get(id) ?? id}</strong>
            </div>
          ))}
        </div>

        <div className={styles.orderBank}>
          {question.options.map((option) => (
            <button
              type="button"
              key={option.id}
              disabled={submitted || response.includes(option.id)}
              onClick={() => addOrder(option.id)}
              className={styles.orderCard}
            >
              <GripVertical size={16} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.orderTools}>
          <button type="button" onClick={undoOrder} disabled={submitted || response.length === 0}><Undo2 size={14} /> Undo last</button>
          <button type="button" onClick={clearResponse} disabled={submitted || response.length === 0}><RotateCcw size={14} /> Reset order</button>
        </div>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={16} /> Learn home</Link>
        <div className={styles.brand}><span>S</span><div><strong>SukuuNova Learn</strong><small>Interaction Lab</small></div></div>
        <Link href="/learn/practice" className={styles.practiceLink}>Practice Engine <ArrowRight size={15} /></Link>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}><Sparkles size={14} /> RICH INTERACTIONS · STARTER LAB</span>
          <h1>Think in relationships and <em>sequences</em>, not only answer boxes.</h1>
          <p>Matching and ordering are the first rich interaction formats in SukuuNova Learn. Every item passes the same answer, ambiguity, curriculum, duplicate and age-review gates before release.</p>
        </div>
        <div className={styles.heroStats}>
          <article><strong>2</strong><span>new formats</span></article>
          <article><strong>{RELEASED_RICH_INTERACTIONS.length}</strong><span>verified starters</span></article>
          <article><strong>{percent(progress.correct, progress.answered)}%</strong><span>lifetime accuracy</span></article>
        </div>
      </section>

      {!complete && currentQuestion && (
        <section className={styles.player}>
          <div className={styles.playerTop}>
            <div>
              <span>INTERACTION {questionIndex + 1} OF {RELEASED_RICH_INTERACTIONS.length}</span>
              <strong>{currentQuestion.subject} · {currentQuestion.topic}</strong>
            </div>
            <div className={styles.kindBadge}>{richInteractionLabel(currentQuestion.kind)} · difficulty {currentQuestion.difficulty}/5</div>
          </div>

          <div className={styles.progressTrack}><span style={{ width: `${((questionIndex + 1) / RELEASED_RICH_INTERACTIONS.length) * 100}%` }} /></div>
          <div className={styles.questionCard}>
            <span className={styles.skill}>{currentQuestion.skill}</span>
            <h2>{currentQuestion.prompt}</h2>
            {currentQuestion.kind === "matching" ? renderMatching(currentQuestion) : renderOrdering(currentQuestion)}

            {!submitted ? (
              <button type="button" className={styles.submit} disabled={!answerReady()} onClick={submit}>Check interaction <ArrowRight size={16} /></button>
            ) : (
              <div className={lastCorrect ? styles.feedbackGood : styles.feedbackBad}>
                <div className={styles.feedbackTitle}>{lastCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}<strong>{lastCorrect ? "Correct" : "Review and repair"}</strong></div>
                <p>{currentQuestion.explanation}</p>
                {!lastCorrect && <div className={styles.solution}><small>Correct structure</small><strong>{solutionText(currentQuestion)}</strong></div>}
                {currentQuestion.hint && !lastCorrect && <small className={styles.hint}>Hint: {currentQuestion.hint}</small>}
                <button type="button" onClick={next}>{questionIndex === RELEASED_RICH_INTERACTIONS.length - 1 ? "See results" : "Next interaction"} <ArrowRight size={15} /></button>
              </div>
            )}
          </div>
        </section>
      )}

      {complete && (
        <section className={styles.results}>
          <div className={styles.trophy}><Trophy size={28} /></div>
          <span>INTERACTION LAB COMPLETE</span>
          <h2>{percent(sessionCorrect, RELEASED_RICH_INTERACTIONS.length)}% accuracy</h2>
          <p>{sessionCorrect} of {RELEASED_RICH_INTERACTIONS.length} rich interactions correct. These attempts have been added to the same local mastery history as Practice Engine sessions.</p>
          <div className={styles.resultActions}>
            <button type="button" onClick={restart}><RotateCcw size={15} /> Run the lab again</button>
            <Link href="/learn/practice">Return to Practice Engine <ArrowRight size={15} /></Link>
          </div>
        </section>
      )}
    </main>
  );
}
