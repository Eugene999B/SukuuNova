"use client";

import { useEffect, useRef, useState } from "react";
import { Accessibility, ArrowLeft, CircleHelp, Crown, Eye, Lightbulb, LockKeyhole, LogOut, Music, Play, Settings2, Sparkles, Trophy, Volume2, VolumeX } from "lucide-react";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings, startArcadeMusic, stopArcadeMusic, unlockArcadeAudio } from "@/lib/arcade-audio";
import { millionaireCheckpointReached, millionaireLifelineTokens, millionaireReasoningCategory, millionaireReasoningCue, millionaireStageLabel, type MillionaireSupportMode } from "@/lib/nova-millionaire";
import "./nova-millionaire.css";

type MillionaireQuestion = { id: string; kind?: string; prompt: string; options: string[] };
type MillionairePlan = { supportMode: MillionaireSupportMode; hintStrength: 0 | 1 | 2 };
type MillionaireRound = { id: string; difficulty: number; answers: string[]; questions: MillionaireQuestion[]; learningPlan?: MillionairePlan | null };
type Props = { learnerName: string; round: MillionaireRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type Screen = "opening" | "show" | "help" | "settings";

function firstUnanswered(answers: string[], length: number) {
  const index = answers.findIndex((answer) => !answer.trim());
  return index < 0 ? length : index;
}

export default function NovaMillionaire({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const supportMode = round.learningPlan?.supportMode ?? "independent";
  const [screen, setScreen] = useState<Screen>("opening");
  const [step, setStep] = useState(firstUnanswered(round.answers, round.questions.length));
  const [selected, setSelected] = useState(-1);
  const [locking, setLocking] = useState(false);
  const [lifelines, setLifelines] = useState(() => millionaireLifelineTokens(round.difficulty, supportMode));
  const [clue, setClue] = useState<string | null>(null);
  const [message, setMessage] = useState("The spotlight is ready when you are.");
  const [audio, setAudio] = useState(arcadeAudioSettings);
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const question = round.questions[step];
  const total = round.questions.length;
  const stage = millionaireStageLabel(step, total);
  const progress = Math.round((Math.min(step, total) / Math.max(1, total)) * 100);

  useEffect(() => () => stopArcadeMusic(), []);

  useEffect(() => {
    if (screen === "show" && step >= total && !completedRef.current) {
      completedRef.current = true;
      setMessage("Show complete. The secure judge is checking every locked answer now.");
      window.setTimeout(() => completeRef.current([...answersRef.current]), 650);
    }
  }, [screen, step, total]);

  useEffect(() => {
    if (screen !== "show") return;
    const onKey = (event: KeyboardEvent) => {
      if (!question || locking) return;
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < question.options.length) choose(index);
      } else if (event.key === "Enter") {
        event.preventDefault();
        lockAnswer();
      } else if (event.key.toLowerCase() === "l") {
        useLifeline();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const enterShow = () => {
    unlockArcadeAudio();
    startArcadeMusic("logic");
    playArcadeSound("launch", "logic");
    setScreen("show");
  };

  const updateAudio = (patch: Parameters<typeof setArcadeAudioSettings>[0]) => {
    unlockArcadeAudio();
    const next = setArcadeAudioSettings(patch);
    setAudio(next);
    if (next.music) startArcadeMusic("logic");
  };

  const choose = (index: number) => {
    if (!question || locking) return;
    setSelected(index);
    setMessage("Choice selected. Take your time, then lock it when your reasoning is ready.");
    playArcadeSound("select", "logic");
  };

  const useLifeline = () => {
    if (!question || locking || clue || lifelines <= 0) return;
    setLifelines((value) => Math.max(0, value - 1));
    setClue(`${millionaireReasoningCategory(question)} · ${millionaireReasoningCue(question)}`);
    setMessage("Nova Lens opened an answer-neutral reasoning clue. It never reveals which option is correct.");
    playArcadeSound("scan", "logic");
  };

  const lockAnswer = () => {
    if (!question || selected < 0 || locking || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[step] = answer;
    const checkpoint = millionaireCheckpointReached(step, total);
    setLocking(true);
    setMessage(checkpoint ? "Answer locked. Checkpoint lights secured—earned progress is never taken away." : "Answer locked. The result stays hidden until the show ends.");
    playArcadeSound(checkpoint ? "unlock" : "reward", "logic");
    window.setTimeout(() => {
      setStep((value) => value + 1);
      setSelected(-1);
      setClue(null);
      setLocking(false);
    }, 720);
  };

  if (screen === "opening") return <section className="nova-millionaire opening" aria-label={`Nova Millionaire for ${learnerName}`}>
    <header className="millionaire-top"><div><Crown size={18}/><strong>NOVA MILLIONAIRE</strong><span>Knowledge Ladder</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <main className="millionaire-opening">
      <div className="millionaire-opening-copy"><span className="millionaire-kicker">THINK · CHOOSE · LOCK</span><h1>Take the<br/>spotlight.</h1><p>Climb an untimed reasoning show through patterns, sequences and deduction. No wagering. No answer countdown. Earned progress is never taken away.</p><div className="millionaire-menu"><button type="button" className="primary" onClick={enterShow}><Play size={21}/><span><strong>Play Show</strong><small>Continue at spotlight {Math.min(step + 1, total)}</small></span></button><button type="button" onClick={() => setScreen("help")}><CircleHelp size={21}/><span><strong>How to Play</strong><small>Learn the ladder and Nova Lens</small></span></button><button type="button" onClick={() => setScreen("settings")}><Settings2 size={21}/><span><strong>Settings</strong><small>Sound and comfort</small></span></button><button type="button" onClick={() => { unlockArcadeAudio(); playArcadeSound("success", "logic"); }}><Trophy size={21}/><span><strong>Test Stage Sound</strong><small>Unlock browser audio</small></span></button></div></div>
      <div className="millionaire-hero" aria-hidden="true"><div className="millionaire-beam left"/><div className="millionaire-beam right"/><div className="millionaire-chair"><Crown size={60}/><span>KNOWLEDGE<br/>LADDER</span></div><div className="millionaire-stage-dots">{Array.from({ length:10 }, (_, index) => <i key={index}/>)}</div><strong>NO CASH · JUST MASTERY</strong></div>
    </main>
  </section>;

  if (screen === "help") return <section className="nova-millionaire panel"><header className="millionaire-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Menu</button><strong>SHOW GUIDE</strong></header><main className="millionaire-guide"><Crown size={48}/><span className="millionaire-kicker">HOW TO PLAY</span><h1>Reason before you lock.</h1><div className="millionaire-guide-grid"><article><b>1</b><h3>Study</h3><p>Read the puzzle and compare all four choices. The show never rushes your thinking.</p></article><article><b>2</b><h3>Use Nova Lens</h3><p>A limited lifeline reframes the reasoning strategy without removing choices or revealing the answer.</p></article><article><b>3</b><h3>Lock</h3><p>Choose A–D and lock your answer. Secure grading happens only after the show finishes.</p></article></div><button type="button" className="millionaire-action primary" onClick={enterShow}><Play size={18}/>Enter the Show</button></main></section>;

  if (screen === "settings") return <section className="nova-millionaire panel"><header className="millionaire-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Menu</button><strong>STAGE SETTINGS</strong></header><main className="millionaire-settings"><Settings2 size={44}/><span className="millionaire-kicker">MAKE IT COMFORTABLE</span><h1>Your spotlight, your way.</h1><label><span><Music size={18}/><b>Music</b></span><input type="checkbox" checked={audio.music} onChange={(event) => updateAudio({ music:event.target.checked })}/></label><label><span><Volume2 size={18}/><b>Sound effects</b></span><input type="checkbox" checked={audio.soundEffects} onChange={(event) => updateAudio({ soundEffects:event.target.checked })}/></label><label><span><Accessibility size={18}/><b>Reduced motion</b></span><input type="checkbox" checked={audio.reducedMotion} onChange={(event) => updateAudio({ reducedMotion:event.target.checked })}/></label><label><span><Sparkles size={18}/><b>Higher contrast</b></span><input type="checkbox" checked={audio.highContrast} onChange={(event) => updateAudio({ highContrast:event.target.checked })}/></label><button type="button" className="millionaire-action" onClick={() => { unlockArcadeAudio(); playArcadeSound("success", "logic"); }}>{audio.soundEffects ? <Volume2 size={16}/> : <VolumeX size={16}/>}Test sound</button></main></section>;

  if (!question) return <section className="nova-millionaire show"><div className="millionaire-finished"><Crown size={58}/><h1>You reached the Nova Crown.</h1><p>The secure judge is preparing your stars and XP.</p></div></section>;

  return <section className={`nova-millionaire show ${locking ? "locking" : ""}`} aria-label="Nova Millionaire knowledge show">
    <header className="millionaire-top"><div><Crown size={17}/><strong>NOVA MILLIONAIRE</strong><span>{stage}</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <div className="millionaire-progress" aria-label={`${progress}% complete`}><span style={{ width:`${progress}%` }}/></div>
    <main className="millionaire-play">
      <aside className="millionaire-ladder"><span className="millionaire-kicker">KNOWLEDGE LADDER</span><ol>{round.questions.map((_, index) => <li key={index} className={`${index === step ? "current" : ""} ${index < step ? "cleared" : ""}`}><b>{index + 1}</b><span>{millionaireStageLabel(index, total)}</span>{index < step ? <Sparkles size={13}/> : null}</li>)}</ol><div className="millionaire-lifeline-count"><Lightbulb size={17}/><strong>{lifelines}</strong><span>Nova Lens{lifelines === 1 ? "" : "es"} left</span></div></aside>
      <section className="millionaire-stage">
        <div className="millionaire-stage-heading"><span className="millionaire-kicker">SPOTLIGHT {step + 1} OF {total}</span><small>UNTIMED · SERVER-GRADED</small></div>
        <div className="millionaire-question"><Eye size={19}/><h1>{question.prompt}</h1></div>
        <div className="millionaire-options">{question.options.map((option, index) => <button type="button" key={`${question.id}-${index}`} className={selected === index ? "selected" : ""} onClick={() => choose(index)} disabled={locking}><b>{String.fromCharCode(65 + index)}</b><span>{option}</span></button>)}</div>
        {clue ? <div className="millionaire-clue"><Lightbulb size={18}/><div><strong>NOVA LENS</strong><p>{clue}</p></div></div> : null}
        <div className="millionaire-actions"><button type="button" onClick={useLifeline} disabled={locking || Boolean(clue) || lifelines <= 0}><Lightbulb size={17}/>Nova Lens <small>L</small></button><button type="button" className="primary" onClick={lockAnswer} disabled={locking || selected < 0}><LockKeyhole size={17}/>{locking ? "Locked" : "Lock answer"} <small>Enter</small></button></div>
        <p className="millionaire-message" aria-live="polite">{message}</p>
      </section>
    </main>
  </section>;
}
