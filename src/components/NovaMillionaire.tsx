"use client";

import { useEffect, useRef, useState } from "react";
import { Accessibility, ArrowLeft, CheckCircle2, ChevronRight, CircleHelp, Crown, Eye, Lightbulb, LockKeyhole, LogOut, Music, Play, Settings2, Sparkles, Trophy, Volume2, VolumeX, XCircle } from "lucide-react";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings, startArcadeMusic, stopArcadeMusic, unlockArcadeAudio } from "@/lib/arcade-audio";
import { millionaireLifelineTokens, millionaireReasoningCategory, millionaireReasoningCue, millionaireStageLabel, type MillionaireSupportMode } from "@/lib/nova-millionaire";
import "./nova-millionaire.css";
import "./nova-millionaire-portal.css";

type SceneMode = "pattern-wall" | "case-file" | "code-vault" | "analogy-bridge" | "evidence-desk" | "rule-gate" | "order-track" | "logic-switch";
type MillionaireScene = { mode?: SceneMode; title?: string; instruction?: string; clues?: string[]; chips?: string[]; intensity?: "warmup" | "rising" | "spotlight" | "crown" };
type MillionaireQuestion = { id: string; kind?: string; prompt: string; options: string[]; scene?: MillionaireScene };
type MillionairePlan = { supportMode: MillionaireSupportMode; hintStrength: 0 | 1 | 2 };
type MillionaireRound = { id: string; difficulty: number; answers: string[]; questions: MillionaireQuestion[]; learningPlan?: MillionairePlan | null };
type Props = { learnerName: string; round: MillionaireRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type Screen = "opening" | "show" | "help" | "settings";
type LockResult = { correct: boolean; explanation: string; roundComplete: boolean; lockedCount: number; total: number; final?: { correct: number; xp: number; stars: number; score: number } | null };

function firstUnanswered(answers: string[], length: number) {
  const index = answers.findIndex((answer) => !answer.trim());
  return index < 0 ? length : index;
}
function sceneName(scene?: MillionaireScene) { return scene?.title || "Reasoning Spotlight"; }
function hostLine(step: number, total: number, reveal: LockResult | null) {
  if (reveal?.correct) return step + 1 === total ? "That was crown-level thinking. One final move: reveal the result." : "Correct. The stage is yours—take the next spotlight.";
  if (reveal) return "That one fought back. Read the judge's reasoning, learn the rule, and keep climbing.";
  if (step === 0) return "Welcome to the Nova stage. This is not a speed test—outthink the puzzle.";
  if (step + 1 >= total) return "Crown spotlight. Check every clue before you lock.";
  return "New scene, new kind of reasoning. Work the evidence before touching the lock.";
}

function SceneBoard({ question }: { question: MillionaireQuestion }) {
  const scene = question.scene;
  const mode = scene?.mode || "case-file";
  const clues = scene?.clues ?? [];
  const chips = scene?.chips ?? [];
  return <div className={`millionaire-scene-board mode-${mode}`}>
    <div className="millionaire-scene-title"><span>{sceneName(scene)}</span><small>{scene?.instruction || "Read the scene, find the rule, then choose."}</small></div>
    {clues.length ? <div className="millionaire-scene-clues">{clues.map((clue, index) => <div key={`${clue}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{clue}</span></div>)}</div> : null}
    {chips.length ? <div className="millionaire-scene-chips">{chips.map((chip, index) => <span key={`${chip}-${index}`}>{chip}</span>)}</div> : null}
    {!clues.length && !chips.length ? <div className="millionaire-scene-orbit" aria-hidden="true"><i/><i/><i/><Crown size={34}/></div> : null}
  </div>;
}

export default function NovaMillionaire({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const supportMode = round.learningPlan?.supportMode ?? "independent";
  const [screen, setScreen] = useState<Screen>("opening");
  const [step, setStep] = useState(firstUnanswered(round.answers, round.questions.length));
  const [selected, setSelected] = useState(-1);
  const [locking, setLocking] = useState(false);
  const [lifelines, setLifelines] = useState(() => millionaireLifelineTokens(round.difficulty, supportMode));
  const [clue, setClue] = useState<string | null>(null);
  const [reveal, setReveal] = useState<LockResult | null>(null);
  const [message, setMessage] = useState("The stage is ready.");
  const [audio, setAudio] = useState(arcadeAudioSettings);
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const question = round.questions[step];
  const total = round.questions.length;
  const stage = millionaireStageLabel(step, total);
  const locked = Math.min(step, total);
  const progress = Math.round((locked / Math.max(1, total)) * 100);

  useEffect(() => () => stopArcadeMusic(), []);
  useEffect(() => {
    if (screen !== "show") return;
    const onKey = (event: KeyboardEvent) => {
      if (!question || locking) return;
      if (reveal && event.key === "Enter") { event.preventDefault(); advance(); return; }
      if (reveal) return;
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < question.options.length) choose(index);
      } else if (event.key === "Enter") {
        event.preventDefault();
        void lockAnswer();
      } else if (event.key.toLowerCase() === "l") openNovaLens();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const enterShow = () => {
    startArcadeMusic("logic");
    unlockArcadeAudio();
    playArcadeSound("launch", "logic");
    setScreen("show");
  };
  const updateAudio = (patch: Parameters<typeof setArcadeAudioSettings>[0]) => {
    const next = setArcadeAudioSettings(patch);
    setAudio(next);
    if (next.music) startArcadeMusic("logic");
    unlockArcadeAudio();
  };
  const choose = (index: number) => {
    if (!question || locking || reveal) return;
    setSelected(index);
    setMessage("Choice armed. Re-read the clues, then lock when you mean it.");
    playArcadeSound("select", "logic");
  };
  const openNovaLens = () => {
    if (!question || locking || reveal || clue || lifelines <= 0) return;
    setLifelines((value) => Math.max(0, value - 1));
    setClue(`${millionaireReasoningCategory(question)} · ${millionaireReasoningCue(question)}`);
    setMessage("Nova Lens gives a strategy, never the answer.");
    playArcadeSound("scan", "logic");
  };
  const lockAnswer = async () => {
    if (!question || selected < 0 || locking || reveal) return;
    const answer = question.options[selected];
    if (!answer) return;
    setLocking(true);
    setMessage("LOCKING… The secure judge is checking your reasoning.");
    playArcadeSound("scan", "logic");
    try {
      const response = await fetch("/api/guardian/arcade/nova-lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId: round.id, questionIndex: step, answer }),
      });
      const result = await response.json() as LockResult & { message?: string; error?: string };
      if (!response.ok) throw new Error(result.message || result.error || "The secure judge could not lock that answer.");
      answersRef.current[step] = answer;
      setReveal(result);
      setMessage(result.correct ? "CORRECT · Spotlight secured." : "NOT QUITE · Learn the rule, then keep climbing.");
      playArcadeSound(result.correct ? "success" : "error", "logic");
      if (result.correct && (step + 1 === total || (step + 1) % 3 === 0)) window.setTimeout(() => playArcadeSound("unlock", "logic"), 150);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The secure judge could not lock that answer.");
    } finally {
      setLocking(false);
    }
  };
  const advance = () => {
    if (!reveal) return;
    if (reveal.roundComplete || step + 1 >= total) {
      completeRef.current([...answersRef.current]);
      return;
    }
    setStep((value) => value + 1);
    setSelected(-1);
    setClue(null);
    setReveal(null);
    setMessage("New spotlight. Different reasoning rule.");
    playArcadeSound("open", "logic");
  };

  if (screen === "opening") return <section className="nova-millionaire opening" aria-label={`Nova Millionaire for ${learnerName}`}>
    <header className="millionaire-top"><div><Crown size={18}/><strong>NOVA MILLIONAIRE</strong><span>Live Reasoning Show</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <main className="millionaire-opening">
      <div className="millionaire-opening-copy"><span className="millionaire-kicker">8 PUZZLE TYPES · LIVE JUDGING · NO TIMER</span><h1>Own the<br/>spotlight.</h1><p>Every spotlight changes the kind of thinking: deduction cases, code vaults, evidence desks, rule gates, ordering puzzles, analogies, logic switches and occasional patterns. Think first. Lock once. Learn immediately.</p><div className="millionaire-menu"><button type="button" className="primary" onClick={enterShow}><Play size={21}/><span><strong>Enter Live Show</strong><small>Continue at spotlight {Math.min(step + 1, total)}</small></span></button><button type="button" onClick={() => setScreen("help")}><CircleHelp size={21}/><span><strong>Show Rules</strong><small>Understand locks, scenes and Nova Lens</small></span></button><button type="button" onClick={() => setScreen("settings")}><Settings2 size={21}/><span><strong>Audio & Comfort</strong><small>Music, effects, volume and motion</small></span></button><button type="button" onClick={() => { unlockArcadeAudio(); playArcadeSound("success", "logic"); }}><Trophy size={21}/><span><strong>Test Stage Audio</strong><small>Hear the stage stinger now</small></span></button></div></div>
      <div className="millionaire-hero" aria-hidden="true"><div className="millionaire-beam left"/><div className="millionaire-beam right"/><div className="millionaire-audience"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="millionaire-chair"><Crown size={60}/><span>NOVA<br/>SPOTLIGHT</span></div><div className="millionaire-stage-dots">{Array.from({ length:10 }, (_, index) => <i key={index}/>)}</div><strong>NO WAGERING · JUST MASTERY</strong></div>
    </main>
  </section>;

  if (screen === "help") return <section className="nova-millionaire panel"><header className="millionaire-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Menu</button><strong>SHOW RULES</strong></header><main className="millionaire-guide"><Crown size={48}/><span className="millionaire-kicker">THIS IS A REASONING SHOW</span><h1>Different scene. Different thinking.</h1><div className="millionaire-guide-grid"><article><b>1</b><h3>Read the scene</h3><p>The visual board changes with the puzzle: evidence, codes, ordering, conditions, deduction or patterns.</p></article><article><b>2</b><h3>Use Nova Lens</h3><p>A limited strategy lifeline helps you decide how to reason without removing choices or revealing the answer.</p></article><article><b>3</b><h3>Lock once</h3><p>The server judges immediately. Once locked, that answer cannot be switched after seeing the result.</p></article></div><button type="button" className="millionaire-action primary" onClick={enterShow}><Play size={18}/>Enter the Show</button></main></section>;

  if (screen === "settings") return <section className="nova-millionaire panel"><header className="millionaire-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Menu</button><strong>STAGE SETTINGS</strong></header><main className="millionaire-settings"><Settings2 size={44}/><span className="millionaire-kicker">AUDIO & COMFORT</span><h1>Make the stage feel right.</h1><label><span><Music size={18}/><b>Music</b></span><input type="checkbox" checked={audio.music} onChange={(event) => updateAudio({ music:event.target.checked })}/></label><label className="range"><span><Music size={18}/><b>Music volume</b></span><input aria-label="Music volume" type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => updateAudio({ musicVolume:Number(event.target.value) })}/></label><label><span><Volume2 size={18}/><b>Sound effects</b></span><input type="checkbox" checked={audio.soundEffects} onChange={(event) => updateAudio({ soundEffects:event.target.checked })}/></label><label className="range"><span><Volume2 size={18}/><b>Effects volume</b></span><input aria-label="Sound effects volume" type="range" min="0" max="1" step="0.05" value={audio.soundEffectsVolume} onChange={(event) => updateAudio({ soundEffectsVolume:Number(event.target.value) })}/></label><label><span><Accessibility size={18}/><b>Reduced motion</b></span><input type="checkbox" checked={audio.reducedMotion} onChange={(event) => updateAudio({ reducedMotion:event.target.checked })}/></label><label><span><Sparkles size={18}/><b>Higher contrast</b></span><input type="checkbox" checked={audio.highContrast} onChange={(event) => updateAudio({ highContrast:event.target.checked })}/></label><button type="button" className="millionaire-action" onClick={() => { unlockArcadeAudio(); playArcadeSound("success", "logic"); }}>{audio.soundEffects ? <Volume2 size={16}/> : <VolumeX size={16}/>}Test stage audio</button></main></section>;

  if (!question) return <section className="nova-millionaire show"><div className="millionaire-finished"><Crown size={58}/><h1>Nova Crown reached.</h1><p>Your secure result is ready.</p><button type="button" className="millionaire-action primary" onClick={() => completeRef.current([...answersRef.current])}>Reveal result <ChevronRight size={17}/></button></div></section>;

  return <section className={`nova-millionaire show intensity-${question.scene?.intensity || "warmup"} ${locking ? "locking" : ""} ${reveal ? "revealed" : ""}`} aria-label="Nova Millionaire live reasoning show">
    <header className="millionaire-top"><div><Crown size={17}/><strong>NOVA MILLIONAIRE</strong><span>{stage}</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <div className="millionaire-progress" aria-label={`${progress}% complete`}><span style={{ width:`${progress}%` }}/></div>
    <main className="millionaire-arena">
      <aside className="millionaire-ladder"><span className="millionaire-kicker">SPOTLIGHT LADDER</span><ol>{round.questions.map((item, index) => <li key={item.id} className={`${index === step ? "current" : ""} ${index < step ? "cleared" : ""}`}><b>{index + 1}</b><span>{millionaireStageLabel(index, total)}</span>{index < step ? <Sparkles size={13}/> : null}</li>)}</ol><div className="millionaire-lifeline-count"><Lightbulb size={17}/><strong>{lifelines}</strong><span>Nova Lens{lifelines === 1 ? "" : "es"}</span></div></aside>
      <section className="millionaire-stage">
        <div className="millionaire-host"><div className="millionaire-host-avatar"><Crown size={22}/></div><div><small>NOVA HOST</small><p>{hostLine(step, total, reveal)}</p></div><span>{step + 1}/{total}</span></div>
        <div className="millionaire-stage-heading"><span className="millionaire-kicker">{sceneName(question.scene).toUpperCase()}</span><small>UNTIMED · SERVER LOCK</small></div>
        <SceneBoard question={question}/>
        <div className="millionaire-question"><Eye size={19}/><h1>{question.prompt}</h1></div>
        <div className="millionaire-options">{question.options.map((option, index) => {
          const chosen = selected === index;
          const resultClass = reveal && chosen ? (reveal.correct ? "correct" : "wrong") : "";
          return <button type="button" key={`${question.id}-${index}`} className={`${chosen ? "selected" : ""} ${resultClass}`} onClick={() => choose(index)} disabled={locking || Boolean(reveal)}><b>{String.fromCharCode(65 + index)}</b><span>{option}</span>{reveal && chosen ? (reveal.correct ? <CheckCircle2 size={18}/> : <XCircle size={18}/>) : null}</button>;
        })}</div>
        {clue && !reveal ? <div className="millionaire-clue"><Lightbulb size={18}/><div><strong>NOVA LENS</strong><p>{clue}</p></div></div> : null}
        {reveal ? <div className={`millionaire-reveal ${reveal.correct ? "correct" : "wrong"}`} aria-live="polite"><div>{reveal.correct ? <CheckCircle2 size={28}/> : <XCircle size={28}/>}<strong>{reveal.correct ? "SPOTLIGHT SECURED" : "RULE LEARNED"}</strong></div><p>{reveal.explanation}</p></div> : null}
        <div className="millionaire-actions">{!reveal ? <><button type="button" onClick={openNovaLens} disabled={locking || Boolean(clue) || lifelines <= 0}><Lightbulb size={17}/>Nova Lens <small>L</small></button><button type="button" className="primary" onClick={() => void lockAnswer()} disabled={locking || selected < 0}><LockKeyhole size={17}/>{locking ? "Judging…" : "Lock answer"} <small>Enter</small></button></> : <button type="button" className="primary next" onClick={advance}>{reveal.roundComplete || step + 1 >= total ? "Reveal final result" : "Next spotlight"}<ChevronRight size={18}/></button>}</div>
        <p className="millionaire-message" aria-live="polite">{message}</p>
      </section>
    </main>
  </section>;
}
