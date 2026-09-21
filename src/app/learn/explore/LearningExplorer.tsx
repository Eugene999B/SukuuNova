"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Layers3,
  Medal,
  RotateCcw,
  School,
  Search,
  Sparkles,
  Zap,
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
import { EMPTY_LEARNER_PROGRESS, normalizeLearnerProgress, type ConfidenceLevel, type LearnerProgress } from "../learner-progress";
import { useLearningSound } from "../LearnShell";
import { hasLearningAnswer } from "../session-controls";

type ResponseValue = string | string[] | number | boolean;

type LearnEntry = "basic" | "shs" | "exam" | "university" | "skills";

const entries: Array<{ id: LearnEntry; label: string; copy: string; icon: typeof School }> = [
  { id: "basic", label: "Basic School", copy: "KG · Primary · JHS", icon: School },
  { id: "shs", label: "SHS", copy: "Choose your programme", icon: BookOpen },
  { id: "exam", label: "Exam Centre", copy: "BECE · WASSCE · IELTS", icon: Medal },
  { id: "university", label: "University", copy: "Degree programmes", icon: GraduationCap },
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
  const [lane, setLane] = useState<LearnLane>("school");
  const catalog = useMemo(() => catalogFor(lane), [lane]);
  const [programId, setProgramId] = useState(catalog.programs[0].id);
  const [levelId, setLevelId] = useState(catalog.programs[0].levels[0].id);
  const [subjectId, setSubjectId] = useState(catalog.programs[0].levels[0].subjects[0].id);
  const [topicId, setTopicId] = useState(catalog.programs[0].levels[0].subjects[0].topics[0].id);
  const [mode, setMode] = useState<PracticeMode>("adaptive");
  const [count, setCount] = useState(10);
  const [progress, setProgress] = useState<LearnerProgress>(EMPTY_LEARNER_PROGRESS);
  const [session, setSession] = useState<LearnQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [response, setResponse] = useState<ResponseValue>("");
  const [submitted, setSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [launchNotice, setLaunchNotice] = useState("");
  const [programQuery, setProgramQuery] = useState("");
  const [showAllPrograms, setShowAllPrograms] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [entryChoice, setEntryChoice] = useState<LearnEntry | null>(null);

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
    const programPool = lane === "school" && entryChoice === "shs"
      ? catalog.programs.filter((item) => item.id.startsWith("shs-"))
      : catalog.programs;
    const query = programQuery.trim().toLowerCase();
    const matches = query
      ? programPool.filter((item) =>
          item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query),
        )
      : programPool;
    return showAllPrograms || query ? matches : matches.slice(0, 8);
  }, [catalog.programs, entryChoice, lane, programQuery, showAllPrograms]);
  const availableModes = lane === "exam" ? modes.filter((item) => item.id !== "adaptive") : modes;
  const currentQuestion = session[questionIndex];
  const sessionInProgress = session.length > 0 && questionIndex < session.length;
  const sessionFocused = session.length > 0;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("sukuunova-learn-progress-v1");
      if (stored) setProgress(normalizeLearnerProgress(JSON.parse(stored)));
    } catch {
      setProgress(EMPTY_LEARNER_PROGRESS);
    }
  }, []);

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
    const params = new URLSearchParams(window.location.search);
    const entry = params.get("entry");
    if (entry && ["basic","shs","exam","university","skills"].includes(entry)) {
      selectEntry(entry as LearnEntry);
      return;
    }
    const choice = params.get("lane");
    if (choice === "school") {
      setEntryChoice(null);
      setFlowStep(0);
      return;
    }
    if (choice && ["exam","university","skills"].includes(choice)) resetSelectionForLane(choice as LearnLane);
  }, []);

  function persist(next: LearnerProgress) {
    setProgress(next);
    try {
      window.localStorage.setItem("sukuunova-learn-progress-v1", JSON.stringify(next));
    } catch {
      // Local progress is a convenience layer; practice must still work if storage is blocked.
    }
  }

  function selectEntry(nextEntry: LearnEntry) {
    if (nextEntry === "basic" || nextEntry === "shs") {
      const nextCatalog = catalogFor("school");
      const nextProgram = nextEntry === "basic"
        ? nextCatalog.programs.find((item) => item.id === "ghana") ?? nextCatalog.programs[0]
        : nextCatalog.programs.find((item) => item.id.startsWith("shs-")) ?? nextCatalog.programs[0];
      const nextLevel = nextProgram.levels[0];
      const nextSubject = firstReadySubject("school", nextProgram.id, nextLevel);
      setEntryChoice(nextEntry);
      setLane("school");
      setProgramId(nextProgram.id);
      setLevelId(nextLevel.id);
      setSubjectId(nextSubject.id);
      setTopicId(firstReadyTopic("school", nextProgram.id, nextLevel.id, nextSubject).id);
      setMode("adaptive");
      setSession([]);
      setLaunchNotice("");
      setProgramQuery("");
      setShowAllPrograms(false);
      setFlowStep(nextEntry === "basic" ? 2 : 1);
      return;
    }

    setEntryChoice(nextEntry);
    resetSelectionForLane(nextEntry);
  }

  function resetSelectionForLane(nextLane: LearnLane) {
    const nextCatalog = catalogFor(nextLane);
    const nextProgram = nextCatalog.programs[0];
    const nextLevel = nextProgram.levels[0];
    const nextSubject = firstReadySubject(nextLane, nextProgram.id, nextLevel);
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
    if (nextLane !== "school") setEntryChoice(nextLane as Exclude<LearnEntry, "basic" | "shs">);
    setFlowStep(1);
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
    setFlowStep(2);
  }

  function selectLevel(nextLevelId: string) {
    const nextLevel = program.levels.find((item) => item.id === nextLevelId) ?? program.levels[0];
    const nextSubject = firstReadySubject(lane, program.id, nextLevel);
    setLevelId(nextLevel.id);
    setSubjectId(nextSubject.id);
    setTopicId(firstReadyTopic(lane, program.id, nextLevel.id, nextSubject).id);
    setLaunchNotice("");
    setFlowStep(3);
  }

  function selectSubject(nextSubjectId: string) {
    const nextSubject = level.subjects.find((item) => item.id === nextSubjectId) ?? level.subjects[0];
    setSubjectId(nextSubject.id);
    setTopicId(firstReadyTopic(lane, program.id, level.id, nextSubject).id);
    setLaunchNotice("");
    setFlowStep(4);
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
    setConfidence(null);
    setSessionCorrect(0);
    setConfidence(null);
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
    const nextConfidence = confidence
      ? {
          ...progress.confidence,
          [confidence]: {
            answered: progress.confidence[confidence].answered + 1,
            correct: progress.confidence[confidence].correct + (correct ? 1 : 0),
          },
        }
      : progress.confidence;
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
      confidence: nextConfidence,
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
          confidence ?? undefined,
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

  const isComplete = session.length > 0 && questionIndex >= session.length;
  const displayedStep = entryChoice === "basic" && flowStep >= 2 ? flowStep : flowStep + 1;
  const displayedTotal = entryChoice === "basic" ? 5 : 6;

  return (
    <main className={`${styles.page} ${sessionFocused ? styles.sessionFocused : styles.setupFocused}`} data-session-active={sessionInProgress ? "true" : "false"}>
      <header className={styles.topbar}>
        <Link href="/learn" className={styles.backLink}><ArrowLeft size={17} /> Exit</Link>
        <strong className={styles.compactBrand}>SukuuNova Learn</strong>
        <span className={styles.stepCounter}>{sessionFocused ? "Practice" : `${displayedStep}/${displayedTotal}`}</span>
      </header>

      <fieldset className={styles.journey} disabled={session.length > 0 && !isComplete} aria-label="Build your learning session">
        <div className={styles.flowTrack} aria-label={`Step ${displayedStep} of ${displayedTotal}`}>
          <span style={{ width: `${(displayedStep / displayedTotal) * 100}%` }} />
        </div>

        {flowStep===0&&<section className={styles.flowStage}>
          <div className={styles.stageTop}>
            <div>
              <span className={styles.stepLabel}>START</span>
              <h2>Where do you want to learn?</h2>
              <p>Choose one. The next screen replaces this one.</p>
            </div>
          </div>
          <div className={styles.laneCards}>
            {entries.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={styles.laneCard} onClick={()=>selectEntry(item.id)}>
                  <span className={styles.laneIcon}><Icon size={24}/></span>
                  <span className={styles.choiceCopy}><strong>{item.label}</strong><small>{item.copy}</small></span>
                  <ChevronRight size={19}/>
                </button>
              );
            })}
          </div>
        </section>}

        {flowStep===1&&<section className={styles.flowStage}>
          <div className={styles.stageTop}>
            <button type="button" className={styles.backStep} onClick={()=>setFlowStep(0)}><ArrowLeft size={17}/> Back</button>
            <div>
              <span className={styles.stepLabel}>CHOOSE ONE</span>
              <h2>{lane==="university"?"Your programme":entryChoice==="shs"?"Your SHS programme":lane==="school"?"Your school pathway":lane==="exam"?"Your exam":"Your skill track"}</h2>
            </div>
          </div>

          {(lane==="university"||entryChoice==="shs")&&<label className={styles.searchBox}>
            <Search size={18}/>
            <input value={programQuery} onChange={e=>setProgramQuery(e.target.value)} placeholder={lane==="university"?"Search programmes…":"Search…"} />
          </label>}

          <div className={styles.programGrid}>
            {visiblePrograms.map((item)=><button key={item.id} className={styles.programCard} onClick={()=>selectProgram(item.id)}>
              <span>{item.label}</span><ChevronRight size={17}/>
            </button>)}
          </div>

          {!programQuery&&!showAllPrograms&&((entryChoice==="shs"&&catalog.programs.filter(item=>item.id.startsWith("shs-")).length>visiblePrograms.length)||(entryChoice!=="shs"&&catalog.programs.length>visiblePrograms.length))&&<button type="button" className={styles.moreButton} onClick={()=>setShowAllPrograms(true)}>Show all</button>}
        </section>}

        {flowStep===2&&<section className={styles.flowStage}>
          <div className={styles.stageTop}>
            <button type="button" className={styles.backStep} onClick={()=>setFlowStep(entryChoice==="basic"?0:1)}><ArrowLeft size={17}/> Back</button>
            <div>
              <span className={styles.stepLabel}>CHOOSE ONE</span>
              <h2>{lane==="school"&&program.id.startsWith("shs-")?"Your SHS year":lane==="university"?"Your level":"Your class / level"}</h2>
              <p className={styles.selectionSummary}>{program.label}</p>
            </div>
          </div>
          <div className={styles.levelTabs}>{program.levels.map(item=><button key={item.id} className={styles.levelTab} onClick={()=>selectLevel(item.id)}>{item.label}<ChevronRight size={16}/></button>)}</div>
        </section>}

        {flowStep===3&&<section className={styles.flowStage}>
          <div className={styles.stageTop}>
            <button type="button" className={styles.backStep} onClick={()=>setFlowStep(2)}><ArrowLeft size={17}/> Back</button>
            <div>
              <span className={styles.stepLabel}>CHOOSE ONE</span>
              <h2>{lane==="university"?"Your course":"Your subject"}</h2>
              <p className={styles.selectionSummary}>{program.label} · {level.label}</p>
            </div>
          </div>
          <div className={styles.subjectGrid}>{level.subjects.map(item=>{
            const ready=subjectIsReady(lane,program.id,level.id,item);
            return <button key={item.id} className={styles.subjectCard} onClick={()=>selectSubject(item.id)}>
              <BookOpen size={19}/>
              <span><strong>{item.label}</strong><small>{ready?"Practice ready":"Practice"}</small></span>
              <ChevronRight size={16}/>
            </button>;
          })}</div>
        </section>}

        {flowStep===4&&<section className={styles.flowStage}>
          <div className={styles.stageTop}>
            <button type="button" className={styles.backStep} onClick={()=>setFlowStep(3)}><ArrowLeft size={17}/> Back</button>
            <div>
              <span className={styles.stepLabel}>CHOOSE ONE</span>
              <h2>Your topic</h2>
              <p className={styles.selectionSummary}>{subject.label}</p>
            </div>
          </div>
          <div className={styles.topicGrid}>
            <button className={styles.topicButton} disabled={!subjectIsReady(lane,program.id,level.id,subject)} onClick={()=>{setTopicId("all");setMode("random");setLaunchNotice("");setFlowStep(5);}}>
              <Sparkles size={17}/><span>Mixed topics</span><ChevronRight size={16}/>
            </button>
            {subject.topics.map(item=>{
              const ready=topicIsReady(lane,program.id,level.id,subject,item.id);
              return <button key={item.id} className={styles.topicButton} onClick={()=>{setTopicId(item.id);setLaunchNotice("");setFlowStep(5);}}>
                <BookOpen size={17}/><span>{item.label}</span>{ready?<ChevronRight size={16}/>:<ChevronRight size={16}/>}
              </button>;
            })}
          </div>
        </section>}

        {flowStep===5&&<section className={styles.flowStage}>
          <div className={styles.stageTop}>
            <button type="button" className={styles.backStep} onClick={()=>setFlowStep(4)}><ArrowLeft size={17}/> Back</button>
            <div>
              <span className={styles.stepLabel}>READY</span>
              <h2>Start your session</h2>
              <p className={styles.selectionSummary}>{subject.label} · {topic.label}</p>
            </div>
          </div>

          <div className={styles.sessionComposer}>
            <div>
              <span className={styles.miniLabel}>Mode</span>
              <div className={styles.modeGrid}>{availableModes.map(item=><button key={item.id} className={mode===item.id?styles.modeActive:styles.modeButton} onClick={()=>setMode(item.id)}>
                <span className={styles.modeDot}/><strong>{item.label}</strong>{mode===item.id&&<Check size={18}/>}
              </button>)}</div>
            </div>

            <div className={styles.launchPanel}>
              <span className={styles.miniLabel}>Questions</span>
              <div className={styles.countGroup}>{[5,10,20,30,50,100].map(value=><button key={value} className={count===value?styles.countActive:styles.countButton} aria-pressed={count===value} onClick={()=>setCount(value)}>{value}</button>)}</div>
              <button className={styles.launch} disabled={!practiceAvailable} onClick={launchSession}><Zap size={21}/>{practiceAvailable?"Start":"Not ready yet"}<ArrowRight size={20}/></button>
              {launchNotice&&<p role="status" className={styles.engineNote}>{launchNotice}</p>}
            </div>
          </div>
        </section>}
      </fieldset>

      {session.length>0&&<section id="session-player" className={styles.playerSection}>
        {session.length>0&&!isComplete&&<div className={styles.sessionTools} data-testid="session-tools"><div><strong>{subject.label}</strong><span>{topic.label}</span><small>{questionIndex + 1}/{session.length}</small></div><button type="button" onClick={()=>{if(!window.confirm("End this session and return to setup?"))return;setSession([]);setLaunchNotice("");setFlowStep(5);answerLock.current=false;}}>Exit session</button></div>}
        {launchNotice&&session.length>0&&<p role="status" className={styles.engineNote}>{launchNotice}</p>}

        {isComplete ? (
          <div className={styles.completeCard}>
            <div className={styles.completeTop}>
              <div>
                <span className={styles.kicker}>SESSION COMPLETE</span>
                <h3>{sessionCorrect} of {session.length} correct</h3>
                <p>Review another set or change your learning path.</p>
              </div>
            </div>
            <div className={styles.completeActions}><button onClick={launchSession}><RotateCcw size={16} /> Practise again</button><button onClick={() => { setSession([]); setFlowStep(0); }}>Change learning path</button></div>
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
            confidence={confidence}
            setConfidence={setConfidence}
            submit={submitAnswer}
            next={nextQuestion}
          />
        ) : null}
      </section>}
    </main>
  );
}

function QuestionStimulusView({ stimulus }: { stimulus: NonNullable<LearnQuestion["stimulus"]> }) {
  if (stimulus.kind === "passage") {
    return <article className={styles.passageStimulus} data-testid="question-passage">
      {stimulus.title && <strong>{stimulus.title}</strong>}
      <p>{stimulus.text}</p>
    </article>;
  }

  if (stimulus.kind === "table") {
    return <div className={styles.tableStimulus} data-testid="question-table">
      {stimulus.title && <strong>{stimulus.title}</strong>}
      <div className={styles.tableScroll}>
        <table>
          <thead><tr>{stimulus.columns.map((column)=><th key={column}>{column}</th>)}</tr></thead>
          <tbody>{stimulus.rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((cell,cellIndex)=><td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>;
  }

  const labels=stimulus.labels??{};
  return <figure className={styles.diagramStimulus} data-testid="question-diagram">
    <svg viewBox="0 0 360 220" role="img" aria-label={stimulus.ariaLabel}>
      {stimulus.diagram === "rectangle" && <>
        <rect x="75" y="50" width="210" height="120" rx="4" />
        {labels.top && <text x="180" y="36" textAnchor="middle">{labels.top}</text>}
        {labels.side && <text x="303" y="115" textAnchor="middle">{labels.side}</text>}
        {labels.centre && <text x="180" y="115" textAnchor="middle">{labels.centre}</text>}
      </>}
      {stimulus.diagram === "triangle" && <>
        <polygon points="180,35 65,175 295,175" />
        {labels.top && <text x="180" y="67" textAnchor="middle">{labels.top}</text>}
        {labels.left && <text x="92" y="159" textAnchor="middle">{labels.left}</text>}
        {labels.right && <text x="267" y="159" textAnchor="middle">{labels.right}</text>}
        {labels.leftSide && <text x="105" y="102" textAnchor="middle">{labels.leftSide}</text>}
        {labels.rightSide && <text x="258" y="102" textAnchor="middle">{labels.rightSide}</text>}
        {labels.base && <text x="180" y="201" textAnchor="middle">{labels.base}</text>}
      </>}
      {stimulus.diagram === "angle" && <>
        <line x1="35" y1="160" x2="325" y2="160" />
        <line x1="180" y1="160" x2="105" y2="55" />
        <circle cx="180" cy="160" r="3" />
        {labels.first && <text x="135" y="126" textAnchor="middle">{labels.first}</text>}
        {labels.second && <text x="235" y="143" textAnchor="middle">{labels.second}</text>}
      </>}
      {stimulus.diagram === "coordinate-grid" && <>
        {Array.from({length:9},(_,index)=><line key={`v-${index}`} x1={40+index*35} y1="30" x2={40+index*35} y2="190" className={styles.gridLine}/>)}
        {Array.from({length:7},(_,index)=><line key={`h-${index}`} x1="40" y1={30+index*27} x2="320" y2={30+index*27} className={styles.gridLine}/>)}
        <line x1="40" y1="110" x2="320" y2="110" />
        <line x1="180" y1="30" x2="180" y2="190" />
      </>}
    </svg>
    <figcaption>{stimulus.ariaLabel}</figcaption>
  </figure>;
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
      <div className={styles.questionSignals} data-testid="question-signals">
        <span className={styles.formatTag}>{question.kind.replace("single", "single choice").replace("multi", "multi-select")}</span>
        {question.challenge && <span className={styles.challengeTag} data-testid="question-challenge">{question.challenge}</span>}
        {question.mission && <span className={styles.missionTag} data-testid="question-mission"><Zap size={12}/>{question.mission}</span>}
        {question.provenance && question.provenance.sourceType !== "original" && <span className={styles.sourceTag} data-testid="question-source">
          {question.provenance.sourceType === "official-sample" ? "Official sample" : "Past paper"}
          {question.provenance.year ? ` · ${question.provenance.year}` : ""}
        </span>}
      </div>
      {question.stimulus && <QuestionStimulusView stimulus={question.stimulus} />}
      <h3 id="learn-question" tabIndex={-1}>{question.prompt}</h3>

      {question.kind === "single" && <div className={styles.optionGrid}>{question.options?.map((option, optionIndex) => {
        const selected = response === option.id;
        const correctOption = submitted && option.id === question.answer;
        const wrong = submitted && selected && option.id !== question.answer;
        return <button data-testid="learning-option" key={option.id} disabled={submitted} className={`${styles.optionButton} ${selected ? styles.optionSelected : ""} ${correctOption ? styles.optionCorrect : ""} ${wrong ? styles.optionWrong : ""}`} onClick={() => setResponse(option.id)}><span className={styles.optionChoice}><b className={styles.optionLetter}>{String.fromCharCode(65 + optionIndex)}</b><span className={styles.optionText}>{option.label}</span></span>{correctOption ? <Check size={19} /> : wrong ? <X size={19} /> : <ChevronRight size={17} className={styles.optionArrow} />}</button>;
      })}</div>}

      {question.kind === "multi" && <div className={styles.optionGrid}>{question.options?.map((option, optionIndex) => {
        const selected = selectedMulti.includes(option.id);
        const expected = Array.isArray(question.answer) && question.answer.includes(option.id);
        const correctOption = submitted && expected;
        const wrong = submitted && selected && !expected;
        return <button data-testid="learning-option" key={option.id} disabled={submitted} className={`${styles.optionButton} ${selected ? styles.optionSelected : ""} ${correctOption ? styles.optionCorrect : ""} ${wrong ? styles.optionWrong : ""}`} onClick={() => toggleMulti(option.id)}><span className={styles.optionChoice}><b className={styles.optionLetter}>{String.fromCharCode(65 + optionIndex)}</b><span className={styles.optionText}>{option.label}</span></span>{selected && !submitted ? <CheckCircle2 size={19} /> : correctOption ? <Check size={19} /> : wrong ? <X size={19} /> : <span className={styles.multiCue}>SELECT</span>}</button>;
      })}</div>}

      {question.kind === "boolean" && <div className={styles.booleanRow}>{[true, false].map((value) => <button data-testid="learning-option" key={String(value)} disabled={submitted} className={response === value ? styles.booleanActive : styles.booleanButton} onClick={() => setResponse(value)}>{value ? "True" : "False"}</button>)}</div>}

      {["fill", "short"].includes(question.kind) && <div className={styles.textAnswer}><input aria-label="Your answer" disabled={submitted} value={typeof response === "string" ? response : ""} onChange={(event) => setResponse(event.target.value)} placeholder={question.kind === "short" ? "Type your short answer" : "Fill in the answer"} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} /></div>}

      {question.kind === "numeric" && <div className={styles.textAnswer}><input aria-label="Your answer" disabled={submitted} inputMode="decimal" value={typeof response === "number" || typeof response === "string" ? response : ""} onChange={(event) => setResponse(event.target.value)} placeholder="Enter your numerical answer" onKeyDown={(event) => { if (event.key === "Enter") submit(); }} /></div>}

      {!submitted ? <div className={styles.answerFooter}><span><Brain size={15} /> Skill: {question.skill}</span><button disabled={!hasLearningAnswer(question.kind,response)} onClick={submit}>Check answer <ArrowRight size={16} /></button></div> : <div role="status" className={correct ? styles.correctFeedback : styles.wrongFeedback}><div className={styles.feedbackSymbol}>{correct ? <CheckCircle2 size={22} /> : <XCircle size={22} />}</div><div><strong>{correct ? `Yes! +${10 + question.difficulty * 2} XP` : "Almost — learn it and go again."}</strong><p>{question.explanation}</p>{question.hint && !correct && <span>Hint for the next variant: {question.hint}</span>}</div><button onClick={next}>{index + 1 === total ? "View results" : "Next question"} <ArrowRight size={16} /></button></div>}
    </div>
  );
}
