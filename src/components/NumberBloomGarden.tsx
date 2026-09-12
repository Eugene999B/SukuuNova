"use client";

import { useEffect, useRef, useState } from "react";
import { Accessibility, ArrowLeft, CircleHelp, Leaf, Lightbulb, LogOut, Music, Play, RotateCcw, Settings2, Sparkles, Volume2, VolumeX } from "lucide-react";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings, startArcadeMusic, stopArcadeMusic, unlockArcadeAudio } from "@/lib/arcade-audio";
import { numberBloomFreeGrowNext, numberBloomGrowthStage, numberBloomHintTokens, numberBloomPetalReward } from "@/lib/number-bloom";
import type { NumberBloomObject, NumberBloomScene } from "@/lib/number-bloom-content";
import "./number-bloom.css";

type BloomQuestion = { id: string; prompt: string; options: string[]; scene?: Partial<NumberBloomScene> };
type BloomPlan = { supportMode: "guided" | "supported" | "independent" | "challenge"; hintStrength: 0 | 1 | 2 };
type BloomRound = { id: string; difficulty: number; answers: string[]; questions: BloomQuestion[]; learningPlan?: BloomPlan | null };
type Props = { learnerName: string; round: BloomRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type Screen = "opening" | "garden" | "free" | "help" | "settings";

const SYMBOLS: Record<NumberBloomObject, string> = { flower:"🌼", seed:"🌱", ladybird:"🐞", butterfly:"🦋", raindrop:"💧" };

function firstPatch(answers: string[], length: number) {
  const index = answers.findIndex((answer) => !answer.trim());
  return index < 0 ? length : index;
}

function Objects({ count, kind = "flower", compact = false }: { count: number; kind?: NumberBloomObject; compact?: boolean }) {
  const safe = Math.max(0, Math.min(10, Math.trunc(count)));
  return <span className={`bloom-objects ${compact ? "compact" : ""}`} aria-label={`${safe} ${kind}${safe === 1 ? "" : "s"}`}>{Array.from({ length:safe }, (_, index) => <i key={index} aria-hidden="true">{SYMBOLS[kind]}</i>)}</span>;
}

function GardenFlower({ open }: { open: boolean }) {
  return <span className={`bloom-flower ${open ? "open" : ""}`} aria-hidden="true"><i/><b/><em/><small/></span>;
}

export default function NumberBloomGarden({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const supportMode = round.learningPlan?.supportMode ?? "independent";
  const [screen, setScreen] = useState<Screen>("opening");
  const [patch, setPatch] = useState(firstPatch(round.answers, round.questions.length));
  const [selected, setSelected] = useState(-1);
  const [revisions, setRevisions] = useState(0);
  const [petals, setPetals] = useState(0);
  const [hintTokens, setHintTokens] = useState(() => numberBloomHintTokens(round.difficulty, supportMode));
  const [hintVisible, setHintVisible] = useState(false);
  const [freeCount, setFreeCount] = useState(0);
  const [growing, setGrowing] = useState(false);
  const [message, setMessage] = useState("The garden is ready when you are.");
  const [audio, setAudio] = useState(arcadeAudioSettings);
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const question = round.questions[patch];
  const scene = question?.scene;
  const progress = Math.round((Math.min(patch, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const growth = numberBloomGrowthStage(patch, round.questions.length);

  useEffect(() => () => stopArcadeMusic(), []);

  useEffect(() => {
    if (patch >= round.questions.length && screen === "garden" && !completedRef.current) {
      completedRef.current = true;
      setMessage("Your garden journey is planted. Checking the number choices safely now.");
      window.setTimeout(() => completeRef.current([...answersRef.current]), 600);
    }
  }, [patch, round.questions.length, screen]);

  useEffect(() => {
    if (screen !== "garden") return;
    const onKey = (event: KeyboardEvent) => {
      if (!question || growing) return;
      if (event.key >= "1" && event.key <= "4") {
        const next = Number(event.key) - 1;
        if (next < question.options.length) choose(next);
      } else if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key.toLowerCase() === "h") showHint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const enter = (next: Screen) => {
    unlockArcadeAudio();
    startArcadeMusic("number-pop");
    playArcadeSound(next === "garden" || next === "free" ? "launch" : "select", "number-pop");
    setScreen(next);
  };

  const updateAudio = (patchSettings: Parameters<typeof setArcadeAudioSettings>[0]) => {
    unlockArcadeAudio();
    const next = setArcadeAudioSettings(patchSettings);
    setAudio(next);
    if (next.music) startArcadeMusic("number-pop");
  };

  const choose = (index: number) => {
    if (!question || growing) return;
    setSelected(index);
    setRevisions((value) => value + 1);
    playArcadeSound("select", "number-pop");
  };

  const showHint = () => {
    if (!question || hintTokens <= 0 || hintVisible) return;
    setHintTokens((value) => Math.max(0, value - 1));
    setHintVisible(true);
    setMessage("A garden clue is open. It shows a counting strategy, not the answer.");
    playArcadeSound("scan", "number-pop");
  };

  const commit = () => {
    if (!question || selected < 0 || growing || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[patch] = answer;
    const reward = numberBloomPetalReward(round.difficulty, revisions);
    setPetals((value) => value + reward);
    setGrowing(true);
    setMessage(`Choice planted! +${reward} petals. The garden keeps the grade hidden until the journey ends.`);
    playArcadeSound("reward", "number-pop");
    window.setTimeout(() => {
      setPatch((value) => value + 1);
      setSelected(-1);
      setRevisions(0);
      setHintVisible(false);
      setGrowing(false);
    }, 760);
  };

  const growFree = () => {
    const next = numberBloomFreeGrowNext(freeCount);
    setFreeCount(next);
    playArcadeSound(next === 0 ? "open" : "reward", "number-pop");
  };

  const optionVisual = (option: string) => {
    const challenge = scene?.bloomChallenge;
    const numeric = Number(option);
    if (challenge === "compare") {
      if (option === "same") return <><span className="bloom-equals">=</span><small>same</small></>;
      const count = option === "left" ? scene?.leftCount ?? 0 : scene?.rightCount ?? 0;
      return <><Objects count={count} kind={scene?.objectKind} compact/><small>{option === "left" ? "this garden" : "that garden"}</small></>;
    }
    if ((challenge === "match" || challenge === "make") && Number.isFinite(numeric)) return <><Objects count={numeric} kind={scene?.objectKind} compact/><strong>{numeric}</strong></>;
    return <strong className="bloom-number">{option}</strong>;
  };

  const challengeVisual = () => {
    const kind = scene?.objectKind ?? "flower";
    if (scene?.bloomChallenge === "count") return <Objects count={scene.shownCount ?? 0} kind={kind}/>;
    if (scene?.bloomChallenge === "match") return <strong className="bloom-target-number">{scene.targetNumber}</strong>;
    if (scene?.bloomChallenge === "compare") return <div className="bloom-compare"><div><Objects count={scene.leftCount ?? 0} kind={kind}/></div><span>?</span><div><Objects count={scene.rightCount ?? 0} kind={kind}/></div></div>;
    if (scene?.bloomChallenge === "make") return <div className="bloom-make"><Objects count={scene.startCount ?? 0} kind={kind}/><span>→</span><strong>{scene.targetNumber}</strong></div>;
    if (scene?.bloomChallenge === "next") return <div className="bloom-steps"><span>{scene.sequenceStart}</span><span>→</span><strong>?</strong></div>;
    return <Leaf size={54}/>;
  };

  if (screen === "opening") return <section className="number-bloom opening" aria-label={`Number Bloom for ${learnerName}`}>
    <header className="bloom-top"><div><Leaf size={19}/><span>NUMBER BLOOM</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <main className="bloom-opening">
      <div className="bloom-opening-copy"><span className="bloom-kicker">COUNT · GROW · DISCOVER</span><h1>Grow a garden<br/>with numbers.</h1><p>Touch, count and make little number patterns at your own pace. No race. No answer countdown.</p><div className="bloom-menu"><button type="button" className="primary" onClick={() => enter("garden")}><Play size={21}/><span><strong>Play Garden</strong><small>Continue at patch {Math.min(patch + 1, round.questions.length)}</small></span></button><button type="button" onClick={() => enter("free")}><Sparkles size={21}/><span><strong>Free Grow</strong><small>Make 1 to 10 with no grades</small></span></button><button type="button" onClick={() => enter("help")}><CircleHelp size={21}/><span><strong>How to Play</strong><small>Simple picture guide</small></span></button><button type="button" onClick={() => setScreen("settings")}><Settings2 size={21}/><span><strong>Settings</strong><small>Sound and comfort</small></span></button></div></div>
      <div className="bloom-hero-garden" aria-hidden="true">{Array.from({ length:5 }, (_, index) => <GardenFlower key={index} open={index < growth}/>)}<div className="bloom-sun"><Sparkles size={28}/></div><span>{petals} PETALS</span></div>
    </main>
  </section>;

  if (screen === "help") return <section className="number-bloom panel"><header className="bloom-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Menu</button><strong>PICTURE GUIDE</strong></header><main className="bloom-guide"><Leaf size={46}/><span className="bloom-kicker">HOW TO PLAY</span><h1>Look. Count. Grow.</h1><div className="bloom-guide-grid"><article><b>1</b><h3>Look</h3><p>See the big number, flowers, seeds or little garden groups.</p></article><article><b>2</b><h3>Count</h3><p>Touch or point to each object once. Take all the time you need.</p></article><article><b>3</b><h3>Grow</h3><p>Tap your choice, then tap Grow. A clue can show a counting strategy.</p></article></div><button type="button" className="bloom-action primary" onClick={() => enter("garden")}><Play size={18}/>Play Garden</button></main></section>;

  if (screen === "settings") return <section className="number-bloom panel"><header className="bloom-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Menu</button><strong>GARDEN SETTINGS</strong></header><main className="bloom-settings"><Settings2 size={44}/><span className="bloom-kicker">MAKE IT COMFY</span><h1>Your garden, your way.</h1><label><span><Music size={18}/><b>Music</b></span><input type="checkbox" checked={audio.music} onChange={(event) => updateAudio({ music:event.target.checked })}/></label><label><span><Volume2 size={18}/><b>Sound effects</b></span><input type="checkbox" checked={audio.soundEffects} onChange={(event) => updateAudio({ soundEffects:event.target.checked })}/></label><label><span><Accessibility size={18}/><b>Reduced motion</b></span><input type="checkbox" checked={audio.reducedMotion} onChange={(event) => updateAudio({ reducedMotion:event.target.checked })}/></label><label><span><Sparkles size={18}/><b>Higher contrast</b></span><input type="checkbox" checked={audio.highContrast} onChange={(event) => updateAudio({ highContrast:event.target.checked })}/></label><button type="button" className="bloom-action" onClick={() => { unlockArcadeAudio(); playArcadeSound("success", "number-pop"); }}>{audio.soundEffects ? <Volume2 size={16}/> : <VolumeX size={16}/>}Test sound</button></main></section>;

  if (screen === "free") return <section className="number-bloom free"><header className="bloom-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Menu</button><div><Sparkles size={18}/><strong>FREE GROW</strong><span>No grades</span></div></header><main className="bloom-free"><span className="bloom-kicker">TAP THE SOIL</span><h1>{freeCount}</h1><p>Grow and count from 1 to 10. After 10, the garden starts fresh.</p><button type="button" className="bloom-free-plot" onClick={growFree} aria-label="Grow one more flower"><Objects count={freeCount} kind="flower"/>{freeCount === 0 ? <span>Tap to grow 🌱</span> : null}</button><button type="button" className="bloom-action" onClick={() => { setFreeCount(0); playArcadeSound("open", "number-pop"); }}><RotateCcw size={17}/>Start again</button></main></section>;

  if (!question) return <section className="number-bloom garden"><div className="bloom-finished"><Sparkles size={50}/><h1>Your number garden is blooming!</h1><p>Secure review is preparing your stars.</p></div></section>;

  return <section className={`number-bloom garden ${growing ? "growing" : ""}`} aria-label="Number Bloom garden journey">
    <header className="bloom-top"><div><Leaf size={18}/><strong>NUMBER BLOOM</strong><span>{scene?.gardenPatch ?? "Garden patch"}</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <div className="bloom-progress"><span style={{ width:`${progress}%` }}/></div>
    <main className="bloom-play">
      <aside className="bloom-growth"><span className="bloom-kicker">YOUR GARDEN</span><div className="bloom-growth-row">{Array.from({ length:5 }, (_, index) => <GardenFlower key={index} open={index < growth || growing && index === growth}/>)}</div><strong>{petals} petals</strong><small>Patch {patch + 1} of {round.questions.length}</small></aside>
      <section className="bloom-challenge"><span className="bloom-kicker">{scene?.gardenPatch ?? `PATCH ${patch + 1}`}</span><h1>{question.prompt}</h1><p className="bloom-visual-instruction">{scene?.visualInstruction}</p><div className="bloom-stage">{challengeVisual()}</div><div className="bloom-choices">{question.options.map((option, index) => <button type="button" className={selected === index ? "selected" : ""} onClick={() => choose(index)} key={`${option}-${index}`} aria-pressed={selected === index}><span>{optionVisual(option)}</span><b>{index + 1}</b></button>)}</div>{hintVisible ? <div className="bloom-hint"><Lightbulb size={19}/><span>{scene?.cue ?? "Point to each object once as you count."}</span></div> : null}<div className="bloom-actions"><button type="button" onClick={showHint} disabled={hintTokens <= 0 || hintVisible}><Lightbulb size={18}/>Clue · {hintTokens}</button><button type="button" className="primary" onClick={commit} disabled={selected < 0 || growing}><Leaf size={18}/>Grow!</button></div><p className="bloom-message">{message}</p></section>
    </main>
  </section>;
}
