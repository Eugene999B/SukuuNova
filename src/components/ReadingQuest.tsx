"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Compass, Eye, LogOut, Map, Search, Sparkles, Zap } from "lucide-react";
import { readingQuestFocusRecovery, readingQuestFogDurationMs, readingQuestLanternReward, readingQuestRouteForChoice, readingQuestRouteLabel, readingQuestTrailDamage } from "@/lib/reading-quest-mission";
import "./reading-quest.css";

type ReadingScene = { cue?: string; meterLabels?: string[] };
type ReadingQuestion = { id: string; prompt: string; options: string[]; scene?: ReadingScene };
type ReadingPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type ReadingRound = {
  id: string;
  difficulty: number;
  answers: string[];
  questions: ReadingQuestion[];
  learningPlan?: ReadingPlan | null;
};
type Props = {
  learnerName: string;
  round: ReadingRound;
  onComplete: (answers: string[]) => void;
  onExit: (answers: string[]) => void;
};

const ROUTE_BUTTONS = [
  { key: "Q", label: "River trail", note: "Follow tracks beside the water." },
  { key: "W", label: "Market archive", note: "Search notices, records and voices." },
  { key: "E", label: "Hill lookout", note: "Climb for the wider context." },
] as const;

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

export default function ReadingQuest({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const resolveRef = useRef<() => void>(() => undefined);
  const startedRef = useRef(Date.now());
  const [checkpoint, setCheckpoint] = useState(() => initialCheckpoint(round.answers, round.questions.length));
  const [selected, setSelected] = useState(0);
  const [routeChoice, setRouteChoice] = useState<number | null>(null);
  const [fog, setFog] = useState(0);
  const [trailHealth, setTrailHealth] = useState(100);
  const [lanterns, setLanterns] = useState(2);
  const [lensActive, setLensActive] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("Choose a route, read the evidence and decide what the text supports.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const duration = useMemo(() => readingQuestFogDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"), [round.difficulty, plan?.speedScale, plan?.supportMode]);
  const chosenRoute = routeChoice === null ? null : readingQuestRouteForChoice(checkpoint, routeChoice);
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const focusCue = question?.scene?.meterLabels?.join(" · ") || "Evidence · inference · careful reading";

  useEffect(() => {
    startedRef.current = Date.now();
    setFog(0);
    setSelected(0);
    setRouteChoice(null);
    setLensActive(false);
    if (checkpoint < round.questions.length) setMessage(boss ? "Final mystery ahead. Choose your last route carefully." : "Pick a route before resolving this chapter.");
  }, [checkpoint, boss, round.questions.length]);

  useEffect(() => {
    if (checkpoint >= round.questions.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => completeRef.current([...answersRef.current]), 420);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      setFog(Math.min(100, (elapsed / duration) * 100));
    }, 100);
    return () => window.clearInterval(timer);
  }, [checkpoint, duration, round.questions.length]);

  const focusLantern = () => {
    if (lanterns < 1 || pulse || !question) return;
    setLanterns((value) => Math.max(0, value - 1));
    setFog((value) => readingQuestFocusRecovery(value));
    setLensActive(true);
    setMessage(`Reading lens active: ${focusCue}. It guides strategy but never reveals the answer.`);
  };

  const resolveChapter = () => {
    if (!question || routeChoice === null || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    const damage = readingQuestTrailDamage(fog, plan?.hazardDensity ?? 0.9, boss);
    const reward = readingQuestLanternReward(fog);
    answersRef.current[checkpoint] = answer;
    setTrailHealth((value) => Math.max(25, value - damage));
    setLanterns((value) => Math.min(7, value + reward));
    setPulse(true);
    setMessage(`${readingQuestRouteLabel(readingQuestRouteForChoice(checkpoint, routeChoice))} explored. Evidence sealed for review.`);
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 520);
  };
  resolveRef.current = resolveChapter;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const routeKey = event.key.toLowerCase();
      if (routeKey === "q" || routeKey === "w" || routeKey === "e") {
        setRouteChoice(routeKey === "q" ? 0 : routeKey === "w" ? 1 : 2);
      } else if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (round.questions[checkpoint]?.options.length ?? 0)) setSelected(index);
      } else if (event.key.toLowerCase() === "l") {
        focusLantern();
      } else if (event.key === "Enter") {
        event.preventDefault();
        resolveRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  return <section className="reading-quest-shell" aria-label={`Reading Quest for ${learnerName}`}>
    <header className="reading-quest-bar">
      <div className="reading-quest-brand"><span><Compass size={22}/></span><div><strong>READING QUEST</strong><small>{plan?.supportMode ?? "adaptive"} expedition · evidence before answers</small></div></div>
      <button type="button" className="reading-quest-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="reading-quest-hud">
      <div><Map size={16}/><strong>{trailHealth}%</strong><span>trail integrity</span></div>
      <div><Sparkles size={16}/><strong>{lanterns}</strong><span>focus lanterns</span></div>
      <div><Eye size={16}/><strong>{Math.round(fog)}%</strong><span>story fog</span></div>
      <div><BookOpen size={16}/><strong>{checkpoint}/{round.questions.length}</strong><span>chapters read</span></div>
    </div>

    <div className={`reading-quest-stage ${pulse ? "pulse" : ""}`}>
      <div className="reading-quest-map" aria-label="Choose an exploration route">
        <div className="reading-quest-map-line" aria-hidden="true"/>
        {ROUTE_BUTTONS.map((route, index) => <button type="button" key={route.key} className={routeChoice === index ? "active" : ""} onClick={() => setRouteChoice(index)} disabled={pulse || !question}><b>{route.key}</b><strong>{route.label}</strong><small>{route.note}</small></button>)}
      </div>

      {question ? <div className="reading-quest-console">
        <div className="reading-quest-console-head"><div><span>{boss ? "FINAL CHAPTER" : `CHAPTER ${checkpoint + 1} / ${round.questions.length}`}</span><strong>{chosenRoute ? readingQuestRouteLabel(chosenRoute) : "Choose a route to continue the expedition"}</strong></div><Search size={22}/></div>
        <article className="reading-quest-passage"><BookOpen size={18}/><p>{question.scene?.cue ?? "Read the passage carefully before choosing the evidence-supported conclusion."}</p></article>
        {lensActive ? <div className="reading-quest-lens"><Eye size={15}/><span>Reading focus: {focusCue}</span></div> : null}
        <h2>{question.prompt}</h2>
        <div className="reading-quest-evidence">{question.options.slice(0, 4).map((option, index) => <button type="button" className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} key={`${index}-${option}`} disabled={pulse}><b>{index + 1}</b><span>{option}</span></button>)}</div>
        <div className="reading-quest-actions"><button type="button" className="reading-quest-resolve" onClick={resolveChapter} disabled={pulse || routeChoice === null}><Search size={17}/>{routeChoice === null ? "Choose a route first" : pulse ? "Recording evidence…" : "Resolve chapter"}</button><button type="button" className="reading-quest-lantern" onClick={focusLantern} disabled={lanterns < 1 || pulse}><Zap size={16}/>Focus lantern · 1</button></div>
        <div className="reading-quest-status"><span>{message}</span><small>Q/W/E route · 1–4 evidence · L lantern · Enter resolve</small></div>
      </div> : <div className="reading-quest-console reading-quest-finished"><Compass size={40}/><strong>EXPEDITION COMPLETE</strong><span>Uploading the evidence trail for secure reading review…</span></div>}

      <div className="reading-quest-fog"><span>Story fog</span><i><b style={{ width: `${fog}%` }}/></i><strong>{Math.round(fog)}%</strong></div>
    </div>

    <footer className="reading-quest-footer"><span>Expedition progress {progress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Reading profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span></footer>
  </section>;
}
