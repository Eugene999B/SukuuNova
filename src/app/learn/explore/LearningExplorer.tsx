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
  Search,
  Sparkles,
  Volume2,
  Zap,
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
import { buildLearningSession, isCorrectAnswer, rebalanceAdaptiveSession } from "../learning-engine";
import styles from "./explore.module.css";
import { normalizeLearnerProgress } from "../learner-progress";
import { useLearningSound } from "../LearnShell";
import { hasLearningAnswer, sessionSize } from "../session-controls";
import { UNIVERSITY_INSTITUTION_EXAMPLES } from "../broad-catalog";

type LearnerProgress = {
  sessions: number;
  answered: number;
  correct: number;
  streak: number;
  xp: number;
  exposures: string[];
  mastery: Record<string, { answered: number; correct: number }>;
};

type ResponseValue = string | string[] | number | boolean;

const EMPTY_PROGRESS: LearnerProgress = {
  sessions: 0,
  answered: 0,
  correct: 0,
  streak: 0,
  xp: 0,
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
  const [programQuery, setProgramQuery] = useState("");
  const [showAllPrograms, setShowAllPrograms] = useState(false);

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
  const visiblePrograms = useMemo(() => {
    const query = programQuery.trim().toLowerCase();
    const matches = query
      ? catalog.programs.filter((item) =>
          item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query),
        )
      : catalog.programs;
    return showAllPrograms || query ? matches : matches.slice(0, lane === "university" ? 12 : 10);
  }, [catalog.programs, lane, programQuery, showAllPrograms]);
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
    setProgramQuery("");
    setShowAllPrograms(false);
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
    const nextSubject = level.subjects.find((item) => item.id === nextSubjectId) ?? level.subjects[0];
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
      mastery: progress.mastery,
      streak: progress.streak,
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
    const earnedXp = correct ? 10 + currentQuestion.difficulty * 2 : 0;
    const nextProgress: LearnerProgress = {
      ...progress,
      answered: progress.answered + 1,
      correct: progress.correct + (correct ? 1 : 0),
      streak: correct ? progress.streak + 1 : 0,
      xp: progress.xp + earnedXp,
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
    if (mode === "adaptive") {
      setSession((current) =>
        rebalanceAdaptiveSession(
          current,
          questionIndex,
          correct,
          nextProgress.streak,
          nextProgress.answered * 7_919 + questionIndex,
        ),
      );
    }
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
    playSound("tap");
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
        <div className={styles.wordmark}><span>S</span><div><strong>SukuuNova Learn</strong><small>Play · Learn · Grow</small></div></div>
        <div className={styles.liveBadge}><Volume2 size={13} /><span /> Sound on by default</div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}><Zap size={14} /> YOUR LEARNING PLAYGROUND</span>
          <h1>Pick a path. <em>Make it yours.</em></h1>
          <p>School, SHS pathways, exams, university programmes and career skills live in one place. Build a quick drill or a focused session and get instant feedback.</p>
          <div className={styles.heroPromise}><span>🔊 action sounds</span><span>⚡ instant marking</span><span>🎯 focused sessions</span><span>🏆 local progress</span></div>
        </div>
        <div className={styles.heroStats}>
          <article><Brain size={20} /><strong>{percent(progress.correct, progress.answered)}%</strong><span>accuracy</span></article>
          <article><Flame size={20} /><strong>{progress.streak}</strong><span>answer streak</span></article>
          <article><Trophy size={20} /><strong>{progress.xp}</strong><span>XP earned</span></article>
        </div>
      </section>

      <fieldset className={styles.journey} disabled={session.length > 0 && !isComplete} aria-label="Build your learning session">
        <section className={styles.laneDeck}>
          <div className={styles.deckIntro}><span className={styles.stepLabel}>STEP 1</span><h2>Where are you learning?</h2><p>Switch paths any time. Your progress stays on this browser.</p></div>
          <div className={styles.laneCards}>
            {lanes.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} aria-pressed={lane===item.id} className={lane===item.id?styles.laneCardActive:styles.laneCard} onClick={()=>resetSelectionForLane(item.id)}>
                  <span className={styles.laneIcon}><Icon size={22}/></span>
                  <strong>{item.label}</strong>
                  <small>{item.copy}</small>
                  <ChevronRight size={17}/>
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.pathStudio}>
          <div className={styles.studioHead}>
            <div><span className={styles.stepLabel}>STEP 2</span><h2>{lane==="university"?"Choose your programme":lane==="school"?"Choose your school pathway":lane==="exam"?"Choose your exam":"Choose your skill track"}</h2><p>{program.description}</p></div>
            <div className={styles.pathPreview}><span>{program.label}</span><ChevronRight size={13}/><span>{level.label}</span><ChevronRight size={13}/><span>{subject.label}</span><ChevronRight size={13}/><strong>{topic.label}</strong></div>
          </div>

          {lane==="university"&&<div className={styles.institutionNote}><GraduationCap size={18}/><div><strong>Built to travel across universities</strong><span>Programme maps use common undergraduate course families. Exact course codes and semester order vary by institution.</span></div></div>}
          {lane==="exam"&&<div className={styles.examNotice}><Medal size={18}/><div><strong>Practice, not a fake official mock.</strong><span>Paper-perfect mocks stay separate until structure, timing and marking are validated.</span></div></div>}

          <div className={styles.programSection}>
            <div className={styles.sectionLine}><div><span className={styles.stepLabel}>PROGRAMME / PATHWAY</span><strong>{catalog.programs.length} available paths</strong></div>{catalog.programs.length>8&&<label className={styles.searchBox}><Search size={15}/><input value={programQuery} onChange={e=>setProgramQuery(e.target.value)} placeholder={lane==="university"?"Search medicine, law, engineering…":"Search pathways…"}/></label>}</div>
            <div className={styles.programGrid}>{visiblePrograms.map((item)=><button key={item.id} className={programId===item.id?styles.programCardActive:styles.programCard} onClick={()=>selectProgram(item.id)}><span>{item.label}</span><small>{item.levels.length} level{item.levels.length===1?"":"s"}</small><ChevronRight size={15}/></button>)}</div>
            {!programQuery&&catalog.programs.length>visiblePrograms.length&&<button type="button" className={styles.moreButton} onClick={()=>setShowAllPrograms(true)}>Show all {catalog.programs.length} paths</button>}
          </div>

          <div className={styles.levelSection}>
            <div className={styles.sectionLine}><div><span className={styles.stepLabel}>LEVEL / YEAR</span><strong>{lane==="school"&&program.id.startsWith("shs-")?"Choose your SHS year":lane==="university"?"Choose your university level":"Choose your level"}</strong></div></div>
            <div className={styles.levelTabs}>{program.levels.map(item=><button key={item.id} className={levelId===item.id?styles.levelTabActive:styles.levelTab} onClick={()=>selectLevel(item.id)}>{item.label}</button>)}</div>
          </div>

          <div className={styles.subjectSection}>
            <div className={styles.sectionLine}><div><span className={styles.stepLabel}>SUBJECT / COURSE</span><strong>{level.subjects.length} choices in {level.label}</strong></div><span className={practiceAvailable?styles.readyBadge:styles.mappedBadge}>{practiceAvailable?"Practice ready":"Browse the course map"}</span></div>
            <div className={styles.subjectGrid}>{level.subjects.map(item=>{const ready=subjectIsReady(lane,program.id,level.id,item);return <button key={item.id} className={subjectId===item.id?styles.subjectCardActive:styles.subjectCard} onClick={()=>selectSubject(item.id)}><BookOpen size={17}/><span><strong>{item.label}</strong><small>{ready?"Questions available":"Course map"}</small></span>{ready&&<span className={styles.readyDot}>●</span>}</button>;})}</div>
          </div>

          <div className={styles.topicSection}>
            <div className={styles.sectionLine}><div><span className={styles.stepLabel}>TOPIC</span><strong>Pick one topic or mix the whole subject</strong></div></div>
            <div className={styles.topicGrid}><button aria-pressed={topicId==="all"} className={topicId==="all"?styles.topicActive:styles.topicButton} onClick={()=>{setTopicId("all");setMode("random");setLaunchNotice("");}}><Sparkles size={15}/><span>Mixed topics</span>{topicId==="all"&&<Check size={15}/>}</button>{(showAllTopics?subject.topics:subject.topics.slice(0,10)).map(item=>{const ready=topicIsReady(lane,program.id,level.id,subject,item.id);return <button key={item.id} aria-pressed={topicId===item.id} className={topicId===item.id?styles.topicActive:styles.topicButton} onClick={()=>{setTopicId(item.id);setLaunchNotice("");}}><BookOpen size={15}/><span>{item.label}</span>{ready?<Check size={15}/>:<span className={styles.mapDot}>○</span>}</button>;})}</div>
            {subject.topics.length>10&&<button type="button" className={styles.moreButton} onClick={()=>setShowAllTopics(v=>!v)}>{showAllTopics?"Show fewer topics":`Show all ${subject.topics.length} topics`}</button>}
          </div>

          <div className={styles.sessionComposer}>
            <div>
              <span className={styles.stepLabel}>STEP 3 · BUILD THE SESSION</span>
              <div className={styles.modeGrid}>{availableModes.map(item=><button key={item.id} className={mode===item.id?styles.modeActive:styles.modeButton} onClick={()=>setMode(item.id)}><span className={styles.modeDot}/><span><strong>{item.label}</strong><small>{item.description}</small></span>{mode===item.id&&<CheckCircle2 size={17}/>}</button>)}</div>
            </div>
            <div className={styles.launchPanel}>
              <div><label>Questions</label><div className={styles.countGroup}>{[5,10,20,30,50].map(value=><button key={value} className={count===value?styles.countActive:styles.countButton} aria-pressed={count===value} onClick={()=>{setCount(value);setRequestedCount(String(value));}}>{value}</button>)}</div><label htmlFor="learn-count">Custom 1–100</label><input id="learn-count" type="number" min="1" max="100" value={requestedCount} onChange={e=>{setRequestedCount(e.target.value);setCount(sessionSize(Number(e.target.value)));}} onBlur={()=>setRequestedCount(String(count))}/></div>
              <button className={styles.launch} disabled={!practiceAvailable} onClick={launchSession}><Zap size={19}/>{practiceAvailable?(lane==="exam"?"Start practice":"Let's go!"):"Practice is being built"}<ArrowRight size={18}/></button>
              <p>{practiceAvailable?"Your questions stay inside this exact path. Different sessions favour fresh questions.":"You can browse this full course map now. Question coverage for this exact selection is still being built."}</p>
            </div>
          </div>

          {lane==="university"&&<div className={styles.institutionStrip}><span>Examples of universities this programme-first structure can serve:</span><div>{UNIVERSITY_INSTITUTION_EXAMPLES.slice(0,8).map(item=><b key={item}>{item}</b>)}</div></div>}
        </section>
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
      <div className={styles.questionSignals}>
        <span className={styles.formatTag}>{question.kind.replace("single", "single choice").replace("multi", "multi-select")}</span>
        {question.challenge && <span className={styles.challengeTag}>{question.challenge}</span>}
        {question.mission && <span className={styles.missionTag}><Zap size={12}/>{question.mission}</span>}
      </div>
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

      {!submitted ? <div className={styles.answerFooter}><span><Brain size={15} /> Skill: {question.skill}</span><button disabled={!hasLearningAnswer(question.kind,response)} onClick={submit}>Check answer <ArrowRight size={16} /></button></div> : <div role="status" className={correct ? styles.correctFeedback : styles.wrongFeedback}><div className={styles.feedbackSymbol}>{correct ? <CheckCircle2 size={22} /> : <XCircle size={22} />}</div><div><strong>{correct ? `Yes! +${10 + question.difficulty * 2} XP` : "Almost — learn it and go again."}</strong><p>{question.explanation}</p>{question.hint && !correct && <span>Hint for the next variant: {question.hint}</span>}</div><button onClick={next}>{index + 1 === total ? "View results" : "Next question"} <ArrowRight size={16} /></button></div>}
    </div>
  );
}
