"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flame,
  GraduationCap,
  Layers3,
  Medal,
  RotateCcw,
  School,
  Sparkles,
  Target,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  catalogFor,
  type CatalogLevel,
  type CatalogSubject,
  type LearnLane,
  type LearnQuestion,
  type PracticeMode,
} from "../learn-domain";
import { learningCapabilityForSelection } from "../learning-capabilities";
import { buildLearningSession, isCorrectAnswer } from "../learning-engine";
import styles from "./explore.module.css";
import { normalizeLearnerProgress } from "../learner-progress";
import { useLearningSound } from "../LearnShell";
import { hasLearningAnswer, sessionSize } from "../session-controls";

type LearnerProgress = {
  sessions: number;
  answered: number;
  correct: number;
  streak: number;
  exposures: string[];
  mastery: Record<string, { answered: number; correct: number }>;
};

type ResponseValue = string | string[] | number | boolean;

const EMPTY_PROGRESS: LearnerProgress = {
  sessions: 0,
  answered: 0,
  correct: 0,
  streak: 0,
  exposures: [],
  mastery: {},
};

const lanes: Array<{ id: LearnLane; label: string; copy: string; icon: typeof School }> = [
  { id: "school", label: "School", copy: "KG to SHS", icon: School },
  { id: "exam", label: "Exam Centre", copy: "BECE, WASSCE, IELTS", icon: Medal },
  { id: "university", label: "University", copy: "Courses and modules", icon: GraduationCap },
  { id: "skills", label: "Skills", copy: "Career and aptitude", icon: Layers3 },
];

const modes: Array<{ id: PracticeMode; label: string; description: string }> = [
  { id: "topic", label: "Topic focus", description: "Take your time with your chosen topic." },
  { id: "adaptive", label: "Build confidence", description: "Begin with easier questions, then increase the challenge." },
  { id: "random", label: "Shuffle", description: "Shuffle questions within your chosen topic or mixed set." },
  { id: "timed", label: "Against the clock", description: "Track elapsed time while you practise at your own pace." },
];

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function masteryKey(question: LearnQuestion) {
  return `${question.subject} · ${question.topic}`;
}

function capabilityConfig(
  lane: LearnLane,
  programId: string,
  levelId: string,
  subjectId: string,
  topicId: string,
) {
  return { lane, programId, levelId, subjectId, topicId, mode: "topic" as const, count: 10 };
}

function subjectIsReady(lane: LearnLane, programId: string, levelId: string, subject: CatalogSubject) {
  return learningCapabilityForSelection(capabilityConfig(lane, programId, levelId, subject.id, "all")).ready;
}

function topicIsReady(lane: LearnLane, programId: string, levelId: string, subject: CatalogSubject, topicId: string) {
  return learningCapabilityForSelection(capabilityConfig(lane, programId, levelId, subject.id, topicId)).ready;
}

function firstReadySubject(lane: LearnLane, programId: string, level: CatalogLevel) {
  return level.subjects.find((subject) => subjectIsReady(lane, programId, level.id, subject)) ?? level.subjects[0];
}

function firstReadyTopic(lane: LearnLane, programId: string, levelId: string, subject: CatalogSubject) {
  return subject.topics.find((topic) => topicIsReady(lane, programId, levelId, subject, topic.id)) ?? subject.topics[0];
}

export function LearningExplorer() {
  const playSound=useLearningSound();
  const answerLock=useRef(false);
  const [requestedCount,setRequestedCount]=useState("10");
  const [showAllTopics,setShowAllTopics]=useState(false);
  const [lane, setLane] = useState<LearnLane>("school");
  const catalog = useMemo(() => catalogFor(lane), [lane]);
  const [programId, setProgramId] = useState(catalog.programs[0].id);
  const [levelId, setLevelId] = useState(catalog.programs[0].levels[0].id);
  const [subjectId, setSubjectId] = useState(catalog.programs[0].levels[0].subjects[0].id);
  const [topicId, setTopicId] = useState(catalog.programs[0].levels[0].subjects[0].topics[0].id);
  const [mode, setMode] = useState<PracticeMode>("adaptive");
  const [count, setCount] = useState(10);
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_PROGRESS);
  const [session, setSession] = useState<LearnQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [response, setResponse] = useState<ResponseValue>("");
  const [submitted, setSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [launchNotice, setLaunchNotice] = useState("");

  const program = catalog.programs.find((item) => item.id === programId) ?? catalog.programs[0];
  const level = program.levels.find((item) => item.id === levelId) ?? program.levels[0];
  const subject = level.subjects.find((item) => item.id === subjectId) ?? firstReadySubject(lane, program.id, level);
  const topic = topicId === "all" ? { id:"all", label:"Mixed topics" } : subject.topics.find((item) => item.id === topicId) ?? firstReadyTopic(lane, program.id, level.id, subject);
  const capability = useMemo(() => learningCapabilityForSelection({
    lane,
    programId,
    levelId,
    subjectId,
    topicId,
    mode,
    count,
  }), [lane, programId, levelId, subjectId, topicId, mode, count]);
  const practiceAvailable = capability.ready;
  const availableModes = lane === "exam" ? modes.filter((item) => item.id !== "adaptive") : modes;
  const currentQuestion = session[questionIndex];
  const sessionInProgress = session.length > 0 && questionIndex < session.length;
  const sessionFocused = session.length > 0;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("sukuunova-learn-progress-v1");
      if (stored) setProgress(normalizeLearnerProgress(JSON.parse(stored)));
    } catch {
      setProgress(EMPTY_PROGRESS);
    }
  }, []);

  useEffect(() => {
    if (!sessionStartedAt || !session.length) return;
    const update = () => setSessionSeconds(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [sessionStartedAt, session.length]);

  useEffect(() => {
    if (!sessionInProgress) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [sessionInProgress]);

  useEffect(() => {
    const choice = new URLSearchParams(window.location.search).get("lane");
    if (choice && ["school","exam","university","skills"].includes(choice)) resetSelectionForLane(choice as LearnLane);
  }, []);

  function persist(next: LearnerProgress) {
    setProgress(next);
    try {
      window.localStorage.setItem("sukuunova-learn-progress-v1", JSON.stringify(next));
    } catch {
      // Local progress is a convenience layer; practice must still work if storage is blocked.
    }
  }

  function resetSelectionForLane(nextLane: LearnLane) {
    const nextCatalog = catalogFor(nextLane);
    const nextProgram = nextCatalog.programs[0];
    const nextLevel = nextProgram.levels[0];
    const nextSubject = firstReadySubject(nextLane, nextProgram.id, nextLevel);
    setShowAllTopics(false);
    setLane(nextLane);
    setProgramId(nextProgram.id);
    setLevelId(nextLevel.id);
    setSubjectId(nextSubject.id);
    setTopicId(firstReadyTopic(nextLane, nextProgram.id, nextLevel.id, nextSubject).id);
    setMode(nextLane === "exam" ? "timed" : "adaptive");
    setSession([]);
    setLaunchNotice("");
  }

  function selectProgram(nextProgramId: string) {
    const nextProgram = catalog.programs.find((item) => item.id === nextProgramId) ?? catalog.programs[0];
    const nextLevel = nextProgram.levels[0];
    const nextSubject = firstReadySubject(lane, nextProgram.id, nextLevel);
    setProgramId(nextProgram.id);
    setLevelId(nextLevel.id);
    setSubjectId(nextSubject.id);
    setTopicId(firstReadyTopic(lane, nextProgram.id, nextLevel.id, nextSubject).id);
    setLaunchNotice("");
  }

  function selectLevel(nextLevelId: string) {
    const nextLevel = program.levels.find((item) => item.id === nextLevelId) ?? program.levels[0];
    const nextSubject = firstReadySubject(lane, program.id, nextLevel);
    setLevelId(nextLevel.id);
    setSubjectId(nextSubject.id);
    setTopicId(firstReadyTopic(lane, program.id, nextLevel.id, nextSubject).id);
    setLaunchNotice("");
  }

  function selectSubject(nextSubjectId: string) {
    const nextSubject = level.subjects.find((item) => item.id === nextSubjectId) ?? firstReadySubject(lane, program.id, level);
    if (!subjectIsReady(lane, program.id, level.id, nextSubject)) return;
    setSubjectId(nextSubject.id);
    setTopicId(firstReadyTopic(lane, program.id, level.id, nextSubject).id);
    setLaunchNotice("");
  }

  function launchSession() {
    if (!practiceAvailable) {
      setSession([]);
      setLaunchNotice("Practice is not published for this exact selection yet. Choose an available subject or topic.");
      return;
    }
    playSound("start");
    answerLock.current=false;
    const nextSession = buildLearningSession({
      lane,
      programId,
      levelId,
      subjectId,
      topicId,
      mode,
      count,
      seen: progress.exposures,
    });
    setSession(nextSession);
    setLaunchNotice(nextSession.length ? (nextSession.length < count ? `This topic has ${nextSession.length} different questions available for this session. Your score uses that total.` : "") : "This selection does not have enough distinct questions for a useful session yet. Choose another available topic.");
    setQuestionIndex(0);
    setResponse("");
    setSubmitted(false);
    setLastCorrect(false);
    setSessionCorrect(0);
    setSessionStartedAt(Date.now());
    setSessionSeconds(0);
    window.setTimeout(() => document.getElementById("session-player")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function submitAnswer() {
    if (!currentQuestion || submitted) return;
    if (answerLock.current || !hasLearningAnswer(currentQuestion.kind,response)) return;
    answerLock.current=true;

    const correct = isCorrectAnswer(currentQuestion, response);
    playSound(correct ? "correct" : "retry");
    const key = masteryKey(currentQuestion);
    const previousMastery = progress.mastery[key] ?? { answered: 0, correct: 0 };
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
          answered: previousMastery.answered + 1,
          correct: previousMastery.correct + (correct ? 1 : 0),
        },
      },
    };
    persist(nextProgress);
    setLastCorrect(correct);
    setSessionCorrect((value) => value + (correct ? 1 : 0));
    setSubmitted(true);
  }

  function nextQuestion() {
    if (!submitted || !answerLock.current) return;
    answerLock.current=false;
    if (questionIndex >= session.length - 1) {
      const next = { ...progress, sessions: progress.sessions + 1 };
      persist(next);
      setQuestionIndex(session.length);
      setSessionStartedAt(null);
      playSound("complete");
      return;
    }
    setQuestionIndex((value) => value + 1);
    setResponse("");
    setSubmitted(false);
    setLastCorrect(false);
  }

  function toggleMulti(optionId: string) {
    if (submitted) return;
    const current = Array.isArray(response) ? response : [];
    setResponse(current.includes(optionId) ? current.filter((item) => item !== optionId) : [...current, optionId]);
  }

  const weakest = useMemo(() => {
    return Object.entries(progress.mastery)
      .filter(([, value]) => value.answered > 0)
      .map(([key, value]) => ({ key, score: percent(value.correct, value.answered), answered: value.answered }))
      .sort((a, b) => a.score - b.score)[0];
  }, [progress.mastery]);

  const isComplete = session.length > 0 && questionIndex >= session.length;
  const sessionAccuracy = percent(sessionCorrect, session.length);

  return (
    <main className={`${styles.page} ${sessionFocused ? styles.sessionFocused : ""}`} data-session-active={sessionInProgress ? "true" : "false"}>
      <header className={styles.topbar}>
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={16} /> Learn home</Link>
        <div className={styles.wordmark}><span>S</span><div><strong>SukuuNova Learn</strong><small>Explorer</small></div></div>
        <div className={styles.liveBadge}><span /> Local mastery active</div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}><Sparkles size={14} /> LEARNING EXPLORER</span>
          <h1>What will you <em>learn today?</em></h1>
          <p>Choose your class, course or exam. Pick a subject, focus on one topic or mix them, and decide how many questions you want.</p>
        </div>
        <div className={styles.heroStats}>
          <article><Brain size={20} /><strong>{percent(progress.correct, progress.answered)}%</strong><span>lifetime accuracy</span></article>
          <article><Flame size={20} /><strong>{progress.streak}</strong><span>current answer streak</span></article>
          <article><Trophy size={20} /><strong>{progress.sessions}</strong><span>sessions completed</span></article>
        </div>
      </section>

      <fieldset className={styles.workspace} disabled={session.length > 0 && !isComplete} aria-label="Practice setup">
        <aside className={styles.laneRail}>
          <span className={styles.stepLabel}>01 · PURPOSE</span>
          {lanes.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} aria-pressed={lane===item.id} className={lane === item.id ? styles.laneActive : styles.laneButton} onClick={() => resetSelectionForLane(item.id)}>
                <span className={styles.laneIcon}><Icon size={18} /></span>
                <span><strong>{item.label}</strong><small>{item.copy}</small></span>
                <ChevronRight size={16} />
              </button>
            );
          })}
          <div className={styles.railInsight}>
            <Target size={17} />
            <div><small>WEAKEST SIGNAL</small><strong>{weakest?.key ?? "Complete practice to build your map"}</strong>{weakest && <span>{weakest.score}% across {weakest.answered} answer{weakest.answered === 1 ? "" : "s"}</span>}</div>
          </div>
        </aside>

        <div className={styles.builder}>
          <div className={styles.builderHeader}>
            <div><span className={styles.stepLabel}>02 · PATH</span><h2>{catalog.label}</h2><p>{program.description}</p></div>
            <div className={styles.pathPreview}><span>{program.label}</span><ChevronRight size={13} /><span>{level.label}</span><ChevronRight size={13} /><span>{subject.label}</span><ChevronRight size={13} /><strong>{topic.label}</strong></div>
          </div>

          {lane === "exam" && <div className={styles.examNotice}><Medal size={18} /><div><strong>Topic practice only — not a full mock.</strong><span>Full-paper mocks stay unavailable until paper structure, timing, question types and marking are validated for that exam.</span></div></div>}

          <div className={styles.selectorBlock}>
            <label>{lane==="exam"?"Choose your exam":lane==="university"?"Choose your course":"Choose your programme"}</label>
            <div className={styles.choiceChips}>{catalog.programs.map((item) => <button key={item.id} className={programId === item.id ? styles.chipActive : styles.chip} onClick={() => selectProgram(item.id)}>{item.label}</button>)}</div>
          </div>

          <div className={styles.twoColumns}>
            <div className={styles.selectorBlock}>
              <label htmlFor="learn-level">{lane==="school"?"Your class":lane==="university"?"Your level":lane==="exam"?"Exam level / format":"Skill level"}</label>
              <select id="learn-level" value={levelId} onChange={(event) => selectLevel(event.target.value)}>{program.levels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            </div>
            <div className={styles.selectorBlock}>
              <label htmlFor="learn-subject">Subject / section</label>
              <select id="learn-subject" value={subjectId} onChange={(event) => selectSubject(event.target.value)}>{level.subjects.map((item) => { const ready = subjectIsReady(lane, program.id, level.id, item); return <option key={item.id} value={item.id} disabled={!ready}>{item.label}{ready ? "" : " — No practice yet"}</option>; })}</select>
            </div>
          </div>

          <div className={styles.selectorBlock}>
            <label>One topic or a mix?</label>
            <div className={styles.topicGrid}><button aria-pressed={topicId==="all"} className={topicId==="all"?styles.topicActive:styles.topicButton} onClick={()=>{setTopicId("all");setMode("random");}}><Sparkles size={15}/><span>Mixed topics</span>{topicId==="all"&&<Check size={15}/>}</button>{(showAllTopics?subject.topics:subject.topics.slice(0,8)).map((item) => { const ready = topicIsReady(lane, program.id, level.id, subject, item.id); return <button key={item.id} disabled={!ready} aria-pressed={topicId===item.id} className={topicId === item.id ? styles.topicActive : styles.topicButton} onClick={() => { setTopicId(item.id); setLaunchNotice(""); }}><BookOpen size={15} /><span>{item.label}{ready ? "" : " · No practice yet"}</span>{topicId === item.id && ready && <Check size={15} />}</button>; })}</div>
          </div>

          {subject.topics.length>8&&<button type="button" className={styles.chip} onClick={()=>setShowAllTopics(v=>!v)}>{showAllTopics?"Show fewer topics":"Show all topics"}</button>}
          <div className={styles.divider} />

          <div className={styles.selectorBlock}>
            <label>Your practice style</label>
            <div className={styles.modeGrid}>{availableModes.map((item) => <button key={item.id} className={mode === item.id ? styles.modeActive : styles.modeButton} onClick={() => setMode(item.id)}><span className={styles.modeDot} /><span><strong>{item.label}</strong><small>{item.description}</small></span>{mode === item.id && <CheckCircle2 size={17} />}</button>)}</div>
          </div>

          <div className={styles.sessionFooter}>
            <div><label>Questions</label><div className={styles.countGroup}>{[5, 10, 20, 30, 50].map((value) => <button key={value} className={count === value ? styles.countActive : styles.countButton} aria-pressed={count===value} onClick={() => {setCount(value);setRequestedCount(String(value));}}>{value}</button>)}</div><label htmlFor="learn-count">Or choose 1–100</label><input id="learn-count" type="number" min="1" max="100" value={requestedCount} onChange={e=>{setRequestedCount(e.target.value);setCount(sessionSize(Number(e.target.value)));}} onBlur={()=>setRequestedCount(String(count))}/></div>
            <button className={styles.launch} disabled={!practiceAvailable} onClick={launchSession}><Sparkles size={18} /> {practiceAvailable ? (lane === "exam" ? "Start topic practice" : "Start practice") : "No practice yet"} <ArrowRight size={18} /></button>
          </div>
          <p className={styles.engineNote}>{practiceAvailable ? "Questions stay within your selection. If fewer different questions are available, we will show the actual session size." : "Practice hasn't been published for this selection yet. Try another topic or subject."}</p>
        </div>
      </fieldset>

      <section id="session-player" className={styles.playerSection}>
        <div className={styles.sectionTitle}><div><span className={styles.stepLabel}>03 · PRACTICE</span><h2>Time to practise</h2></div><p>Choose an answer, check the explanation, and keep going.</p></div>

        {session.length>0&&!isComplete&&<div className={styles.sessionTools}><div><strong>Focused session</strong><span>{program.label} · {level.label} · {subject.label} · {topic.label}</span><small>{Math.floor(sessionSeconds/60)}m {sessionSeconds%60}s elapsed · {session.length} questions</small></div><button type="button" onClick={()=>{if(!window.confirm("End this session and return to setup? Your answered questions stay in local progress."))return;setSession([]);setSessionStartedAt(null);setLaunchNotice("");answerLock.current=false;}}>Exit session</button></div>}
        {launchNotice&&session.length>0&&<p role="status" className={styles.engineNote}>{launchNotice}</p>}
        {!session.length ? (
          <div className={styles.playerEmpty}><Brain size={36} /><h3>{launchNotice ? "Coverage is still expanding here." : "Your intelligent session appears here."}</h3><p>{launchNotice || "Choose your learning path above, then build a session."}</p></div>
        ) : isComplete ? (
          <div className={styles.completeCard}>
            <div className={styles.completeTop}>
              <div><span className={styles.kicker}>SESSION COMPLETE</span><h3>{sessionAccuracy >= 80 ? "Strong result in this session." : sessionAccuracy >= 60 ? "Good work — review the missed ideas next." : "This session found useful areas to revisit."}</h3><p>This result describes only the questions you just answered. Your local practice history is saved on this browser; it is not an official grade or mastery certification.</p></div>
              <div className={styles.scoreRing}><strong>{sessionAccuracy}%</strong><span>{sessionCorrect}/{session.length}</span></div>
            </div>
            <div className={styles.completeStats}><article><BarChart3 size={18} /><span>Session accuracy</span><strong>{sessionAccuracy}%</strong></article><article><Clock3 size={18} /><span>Time</span><strong>{Math.floor(sessionSeconds / 60)}m {sessionSeconds % 60}s</strong></article><article><Brain size={18} /><span>Lifetime answered</span><strong>{progress.answered}</strong></article></div>
            <div className={styles.completeActions}><button onClick={launchSession}><RotateCcw size={16} /> Practise again</button><button onClick={() => { setSession([]); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Change learning path</button></div>
          </div>
        ) : currentQuestion ? (
          <QuestionPlayer
            question={currentQuestion}
            index={questionIndex}
            total={session.length}
            response={response}
            setResponse={setResponse}
            toggleMulti={toggleMulti}
            submitted={submitted}
            correct={lastCorrect}
            submit={submitAnswer}
            next={nextQuestion}
          />
        ) : null}
      </section>

      <section className={styles.masterySection}>
        <div className={styles.sectionTitle}><div><span className={styles.stepLabel}>04 · PRACTICE MAP</span><h2>Your learning picture builds with evidence.</h2></div><p>Your progress stays on this browser. A few answers are only an early signal; clearing browser data removes them and they do not sync between devices.</p></div>
        <div className={styles.masteryGrid}>
          {Object.entries(progress.mastery).length ? Object.entries(progress.mastery).sort(([, a], [, b]) => b.answered - a.answered).slice(0, 8).map(([key, value]) => {
            const score = percent(value.correct, value.answered);
            return <article key={key}><div><strong>{key}</strong><span>{value.answered} answered</span></div><div className={styles.masteryBar}><span style={{ width: `${score}%` }} /></div><b>{score}%</b></article>;
          }) : <div className={styles.noMastery}><Target size={28} /><strong>No mastery signals yet.</strong><span>Finish a few questions and this map will build itself.</span></div>}
        </div>
      </section>
    </main>
  );
}

function QuestionPlayer({
  question,
  index,
  total,
  response,
  setResponse,
  toggleMulti,
  submitted,
  correct,
  submit,
  next,
}: {
  question: LearnQuestion;
  index: number;
  total: number;
  response: ResponseValue;
  setResponse: (value: ResponseValue) => void;
  toggleMulti: (optionId: string) => void;
  submitted: boolean;
  correct: boolean;
  submit: () => void;
  next: () => void;
}) {
  useEffect(()=>{document.getElementById("learn-question")?.focus({preventScroll:true});},[index]);
  const selectedMulti = Array.isArray(response) ? response : [];

  return (
    <div className={styles.playerCard} data-testid="learning-question">
      <div className={styles.playerMeta}>
        <div><span>Question {index + 1} / {total}</span><strong>{question.subject} · {question.topic}</strong></div>
        <div className={styles.difficulty}>Difficulty {question.difficulty}/5</div>
      </div>
      <div className={styles.playerProgress}><span style={{ width: `${percent(index + (submitted ? 1 : 0), total)}%` }} /></div>
      <div className={styles.formatTag}>{question.kind.replace("single", "single choice").replace("multi", "multi-select")}</div>
      <h3 id="learn-question" tabIndex={-1}>{question.prompt}</h3>

      {question.kind === "single" && <div className={styles.optionGrid}>{question.options?.map((option) => {
        const selected = response === option.id;
        const correctOption = submitted && option.id === question.answer;
        const wrong = submitted && selected && option.id !== question.answer;
        return <button data-testid="learning-option" key={option.id} disabled={submitted} className={`${styles.optionButton} ${selected ? styles.optionSelected : ""} ${correctOption ? styles.optionCorrect : ""} ${wrong ? styles.optionWrong : ""}`} onClick={() => setResponse(option.id)}><span>{option.label}</span>{correctOption ? <Check size={17} /> : wrong ? <X size={17} /> : null}</button>;
      })}</div>}

      {question.kind === "multi" && <div className={styles.optionGrid}>{question.options?.map((option) => {
        const selected = selectedMulti.includes(option.id);
        const expected = Array.isArray(question.answer) && question.answer.includes(option.id);
        const correctOption = submitted && expected;
        const wrong = submitted && selected && !expected;
        return <button data-testid="learning-option" key={option.id} disabled={submitted} className={`${styles.optionButton} ${selected ? styles.optionSelected : ""} ${correctOption ? styles.optionCorrect : ""} ${wrong ? styles.optionWrong : ""}`} onClick={() => toggleMulti(option.id)}><span>{option.label}</span>{selected && !submitted ? <CheckCircle2 size={17} /> : correctOption ? <Check size={17} /> : wrong ? <X size={17} /> : null}</button>;
      })}</div>}

      {question.kind === "boolean" && <div className={styles.booleanRow}>{[true, false].map((value) => <button data-testid="learning-option" key={String(value)} disabled={submitted} className={response === value ? styles.booleanActive : styles.booleanButton} onClick={() => setResponse(value)}>{value ? "True" : "False"}</button>)}</div>}

      {["fill", "short"].includes(question.kind) && <div className={styles.textAnswer}><input aria-label="Your answer" disabled={submitted} value={typeof response === "string" ? response : ""} onChange={(event) => setResponse(event.target.value)} placeholder={question.kind === "short" ? "Type your short answer" : "Fill in the answer"} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} /></div>}

      {question.kind === "numeric" && <div className={styles.textAnswer}><input aria-label="Your answer" disabled={submitted} inputMode="decimal" value={typeof response === "number" || typeof response === "string" ? response : ""} onChange={(event) => setResponse(event.target.value)} placeholder="Enter your numerical answer" onKeyDown={(event) => { if (event.key === "Enter") submit(); }} /></div>}

      {!submitted ? <div className={styles.answerFooter}><span><Brain size={15} /> Skill: {question.skill}</span><button disabled={!hasLearningAnswer(question.kind,response)} onClick={submit}>Check answer <ArrowRight size={16} /></button></div> : <div role="status" className={correct ? styles.correctFeedback : styles.wrongFeedback}><div className={styles.feedbackSymbol}>{correct ? <CheckCircle2 size={22} /> : <XCircle size={22} />}</div><div><strong>{correct ? "Correct." : "Not quite."}</strong><p>{question.explanation}</p>{question.hint && !correct && <span>Hint for the next variant: {question.hint}</span>}</div><button onClick={next}>{index + 1 === total ? "View results" : "Next question"} <ArrowRight size={16} /></button></div>}
    </div>
  );
}
