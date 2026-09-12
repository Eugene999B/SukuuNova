"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Accessibility, ArrowLeft, BookOpen, Check, CircleHelp, LogOut, Music, Palette, Play, RotateCcw, Save, Scissors, Settings2, Shirt, Sparkles, Volume2, VolumeX, WandSparkles } from "lucide-react";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings, startArcadeMusic, stopArcadeMusic, unlockArcadeAudio } from "@/lib/arcade-audio";
import { freeStyleItemsForLayer, initialFreeStyleLook, nextWardrobeIndex, studioCollectionStage, studioSparkReward, STYLE_STUDIO_FREE_WARDROBE, type FreeStyleItem, type StudioLayer } from "@/lib/style-studio-ghana";
import type { StyleStudioPiece, StyleStudioScene } from "@/lib/style-studio-ghana-content";
import "./style-studio-ghana.css";

type StudioQuestion = { id: string; prompt: string; options: string[]; scene?: Partial<StyleStudioScene> };
type StudioPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  hintStrength: 0 | 1 | 2;
};
type StudioRound = { id: string; difficulty: number; answers: string[]; questions: StudioQuestion[]; learningPlan?: StudioPlan | null };
type Props = { learnerName: string; round: StudioRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type Screen = "opening" | "mission" | "free" | "help" | "settings" | "runway";

const LOOK_KEY = "sukuunova.style-studio.look.v1";
const layers: StudioLayer[] = ["top", "bottom", "wrap", "accessory"];

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

function savedFreeLook() {
  const fallback = initialFreeStyleLook();
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOOK_KEY) ?? "{}") as Record<string, unknown>;
    for (const layer of layers) {
      const value = parsed[layer];
      if (typeof value !== "string" || !STYLE_STUDIO_FREE_WARDROBE.some((item) => item.layer === layer && item.id === value)) return fallback;
    }
    return parsed as Record<StudioLayer, string>;
  } catch { return fallback; }
}

function visualPiece(item: FreeStyleItem | StyleStudioPiece | undefined, fallback: string) {
  return item ? { label:item.label, swatch:item.swatch, pattern:item.pattern } : { label:fallback, swatch:"night" as const, pattern:"solid" as const };
}

function Mannequin({ learnerName, top, bottom, wrap, accessory, moving = false }: { learnerName: string; top?: FreeStyleItem | StyleStudioPiece; bottom?: FreeStyleItem | StyleStudioPiece; wrap?: FreeStyleItem | StyleStudioPiece; accessory?: FreeStyleItem | StyleStudioPiece; moving?: boolean }) {
  const topLook = visualPiece(top, "Studio top");
  const bottomLook = visualPiece(bottom, "Studio bottom");
  const wrapLook = visualPiece(wrap, "No wrap");
  const accessoryLook = visualPiece(accessory, "No accessory");
  return <div className={`style-model ${moving ? "runway-moving" : ""}`} aria-label={`${learnerName}'s current studio look`}>
    <div className="style-model-glow"/>
    <div className="style-model-head"><span>{learnerName.trim()?.[0]?.toUpperCase() || "S"}</span><i data-swatch={accessoryLook.swatch} data-pattern={accessoryLook.pattern}/></div>
    <div className="style-model-body">
      <div className="style-model-top" data-swatch={topLook.swatch} data-pattern={topLook.pattern}/>
      <div className="style-model-wrap" data-swatch={wrapLook.swatch} data-pattern={wrapLook.pattern}/>
      <div className="style-model-bottom" data-swatch={bottomLook.swatch} data-pattern={bottomLook.pattern}/>
    </div>
    <div className="style-model-legs"><i/><i/></div>
    <div className="style-model-shadow"/>
  </div>;
}

export default function StyleStudioGhana({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const firstCheckpoint = initialCheckpoint(round.answers, round.questions.length);
  const [screen, setScreen] = useState<Screen>("opening");
  const [checkpoint, setCheckpoint] = useState(firstCheckpoint);
  const [selected, setSelected] = useState(0);
  const [hint, setHint] = useState(false);
  const [revisions, setRevisions] = useState(0);
  const [sparks, setSparks] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [freeLayer, setFreeLayer] = useState<StudioLayer>("top");
  const [freeLook, setFreeLook] = useState<Record<StudioLayer, string>>(savedFreeLook);
  const [audio, setAudio] = useState(arcadeAudioSettings);
  const [message, setMessage] = useState("Welcome to the studio. Create freely or open a design brief.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const question = round.questions[checkpoint];
  const scene = question?.scene;
  const wardrobe = scene?.wardrobe ?? [];
  const selectedLabel = question?.options[selected];
  const selectedPiece = wardrobe.find((item) => item.label === selectedLabel);
  const plan = round.learningPlan;
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const freeItems = useMemo(() => freeStyleItemsForLayer(freeLayer), [freeLayer]);
  const freePieces = useMemo(() => Object.fromEntries(layers.map((layer) => [layer, STYLE_STUDIO_FREE_WARDROBE.find((item) => item.id === freeLook[layer])])) as Record<StudioLayer, FreeStyleItem | undefined>, [freeLook]);

  useEffect(() => () => stopArcadeMusic(), []);

  useEffect(() => {
    if (checkpoint >= round.questions.length && screen === "mission" && !completedRef.current) {
      completedRef.current = true;
      setMessage("Collection complete. Sending the sealed design briefs for secure review.");
      window.setTimeout(() => completeRef.current([...answersRef.current]), 650);
    }
  }, [checkpoint, round.questions.length, screen]);

  useEffect(() => {
    if (screen !== "mission") return;
    const keydown = (event: KeyboardEvent) => {
      if (!question || pulse) return;
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < question.options.length) { setSelected(index); setRevisions((value) => value + 1); playArcadeSound("select", "culture-heritage"); }
      } else if (event.key === "ArrowRight") {
        setSelected((value) => nextWardrobeIndex(value, 1, question.options.length));
        setRevisions((value) => value + 1);
      } else if (event.key === "ArrowLeft") {
        setSelected((value) => nextWardrobeIndex(value, -1, question.options.length));
        setRevisions((value) => value + 1);
      } else if (event.key.toLowerCase() === "h") setHint((value) => !value);
      else if (event.key === "Enter") { event.preventDefault(); commitMission(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const enter = (next: Screen) => {
    unlockArcadeAudio();
    startArcadeMusic("culture-heritage");
    playArcadeSound(next === "mission" || next === "free" ? "launch" : "select", "culture-heritage");
    setScreen(next);
  };

  const updateAudio = (patch: Parameters<typeof setArcadeAudioSettings>[0]) => {
    unlockArcadeAudio();
    const next = setArcadeAudioSettings(patch);
    setAudio(next);
    if (next.music) startArcadeMusic("culture-heritage");
  };

  const chooseMissionPiece = (index: number) => {
    if (!question || pulse) return;
    setSelected(index);
    setRevisions((value) => value + 1);
    playArcadeSound("select", "culture-heritage");
  };

  const commitMission = () => {
    if (!question || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const reward = studioSparkReward(round.difficulty, revisions);
    setSparks((value) => value + reward);
    setPulse(true);
    setHint(false);
    playArcadeSound("reward", "culture-heritage");
    setMessage(`Look sealed for secure review. +${reward} Studio Sparks — your design choice is saved without revealing the grade.`);
    window.setTimeout(() => {
      setPulse(false);
      setSelected(0);
      setRevisions(0);
      setCheckpoint((value) => value + 1);
    }, 820);
  };

  const chooseFreeItem = (item: FreeStyleItem) => {
    setFreeLook((look) => ({ ...look, [item.layer]:item.id }));
    playArcadeSound("select", "culture-heritage");
  };

  const saveLook = () => {
    try { window.localStorage.setItem(LOOK_KEY, JSON.stringify(freeLook)); } catch { /* local storage can be unavailable */ }
    playArcadeSound("success", "culture-heritage");
    setMessage("Free Style look saved on this device. Creative mode is never correctness-graded.");
  };

  const resetLook = () => {
    setFreeLook(initialFreeStyleLook());
    playArcadeSound("select", "culture-heritage");
  };

  const missionPreview: Record<StudioLayer, StyleStudioPiece | undefined> = {
    top: selectedPiece?.slot === "top" || selectedPiece?.slot === "fabric" ? selectedPiece : undefined,
    bottom: selectedPiece?.slot === "bottom" ? selectedPiece : undefined,
    wrap: selectedPiece?.slot === "wrap" || selectedPiece?.slot === "outer" ? selectedPiece : undefined,
    accessory: selectedPiece?.slot === "accessory" ? selectedPiece : undefined,
  };

  if (screen === "opening") return <section className="style-studio opening" aria-label={`Style Studio Ghana for ${learnerName}`}>
    <div className="style-curtain left"/><div className="style-curtain right"/>
    <header className="style-studio-top"><div><Sparkles size={20}/><span>STYLE STUDIO GHANA</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <main className="style-opening-stage">
      <div className="style-opening-copy"><span className="style-kicker">DRESS · DESIGN · DISCOVER</span><h1>Your studio.<br/>Your ideas.</h1><p>Mix looks freely or solve real design briefs about textiles, patterns, function, repair and Ghanaian weaving heritage. Taste is never marked wrong.</p><div className="style-opening-menu">
        <button type="button" className="primary" onClick={() => enter("mission")}><Play size={20}/><span><strong>Design Missions</strong><small>Learn through client briefs</small></span></button>
        <button type="button" onClick={() => enter("free")}><Palette size={20}/><span><strong>Free Style</strong><small>No grades · create your own look</small></span></button>
        <button type="button" onClick={() => enter("help")}><CircleHelp size={20}/><span><strong>How to Play</strong><small>Studio guide and controls</small></span></button>
        <button type="button" onClick={() => enter("settings")}><Settings2 size={20}/><span><strong>Settings</strong><small>Music, sound and accessibility</small></span></button>
      </div></div>
      <div className="style-opening-runway"><div className="style-spotlight"/><Mannequin learnerName={learnerName} top={freePieces.top} bottom={freePieces.bottom} wrap={freePieces.wrap} accessory={freePieces.accessory} moving/><span>NEW COLLECTION</span></div>
    </main>
  </section>;

  if (screen === "help") return <section className="style-studio panel"><header className="style-studio-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Main menu</button><strong>STUDIO GUIDE</strong></header><main className="style-guide"><BookOpen size={38}/><span className="style-kicker">HOW TO PLAY</span><h1>Create first. Learn by designing.</h1><div className="style-guide-grid"><article><b>1</b><h3>Free Style</h3><p>Dress the model however you like. There is no correct look and no taste score.</p></article><article><b>2</b><h3>Design Missions</h3><p>Read a real brief, try wardrobe choices on the model and commit when the design satisfies the objective constraint.</p></article><article><b>3</b><h3>Learn the craft</h3><p>Mission feedback teaches weaving, pattern, function, repair, material care and respectful cultural sourcing.</p></article></div><p className="style-controls">Mission controls: 1–4 or ← → choose · H hint · Enter commit. Touch and mouse work everywhere.</p><button type="button" className="style-action primary" onClick={() => enter("mission")}><Play size={17}/>Open first brief</button></main></section>;

  if (screen === "settings") return <section className="style-studio panel"><header className="style-studio-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Main menu</button><strong>STUDIO SETTINGS</strong></header><main className="style-settings"><Settings2 size={38}/><span className="style-kicker">YOUR COMFORT</span><h1>Make the studio feel right.</h1><label><span><Music size={18}/><b>Music</b></span><input type="checkbox" checked={audio.music} onChange={(event) => updateAudio({ music:event.target.checked })}/></label><label><span><Volume2 size={18}/><b>Sound effects</b></span><input type="checkbox" checked={audio.soundEffects} onChange={(event) => updateAudio({ soundEffects:event.target.checked })}/></label><label><span><Accessibility size={18}/><b>Reduced motion</b></span><input type="checkbox" checked={audio.reducedMotion} onChange={(event) => updateAudio({ reducedMotion:event.target.checked })}/></label><label><span><Sparkles size={18}/><b>Higher contrast</b></span><input type="checkbox" checked={audio.highContrast} onChange={(event) => updateAudio({ highContrast:event.target.checked })}/></label><button type="button" className="style-action" onClick={() => { unlockArcadeAudio(); playArcadeSound("success", "culture-heritage"); }}>{audio.soundEffects ? <Volume2 size={16}/> : <VolumeX size={16}/>}Test studio sound</button></main></section>;

  if (screen === "free" || screen === "runway") return <section className={`style-studio free ${screen === "runway" ? "showing" : ""}`} aria-label="Style Studio Ghana Free Style">
    <header className="style-studio-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Main menu</button><div><Palette size={18}/><strong>FREE STYLE</strong><span>No grades · no timer</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <main className="style-free-layout"><section className="style-runway"><div className="style-runway-lights"><i/><i/><i/><i/><i/></div><span className="style-kicker">{screen === "runway" ? "RUNWAY REVEAL" : "FITTING ROOM"}</span><Mannequin learnerName={learnerName} top={freePieces.top} bottom={freePieces.bottom} wrap={freePieces.wrap} accessory={freePieces.accessory} moving={screen === "runway"}/><div className="style-look-caption"><strong>{learnerName}'s look</strong><span>{layers.map((layer) => freePieces[layer]?.label).filter(Boolean).join(" · ")}</span></div></section><section className="style-wardrobe"><div className="style-wardrobe-head"><div><Scissors size={20}/><span>WARDROBE WALL</span><h2>Mix. Match. Change your mind.</h2></div><button type="button" onClick={resetLook}><RotateCcw size={15}/>Reset</button></div><div className="style-layer-tabs">{layers.map((layer) => <button type="button" key={layer} className={freeLayer === layer ? "active" : ""} onClick={() => setFreeLayer(layer)}>{layer}</button>)}</div><div className="style-free-rack">{freeItems.map((item) => <button type="button" key={item.id} className={freeLook[item.layer] === item.id ? "selected" : ""} onClick={() => chooseFreeItem(item)}><i data-swatch={item.swatch} data-pattern={item.pattern}/><span>{item.label}</span>{freeLook[item.layer] === item.id ? <Check size={15}/> : null}</button>)}</div><div className="style-free-actions"><button type="button" className="style-action primary" onClick={() => { saveLook(); setScreen("runway"); }}><WandSparkles size={17}/>Runway reveal</button><button type="button" className="style-action" onClick={saveLook}><Save size={16}/>Save look</button><button type="button" className="style-action" onClick={() => enter("mission")}><Play size={16}/>Design Missions</button></div><p>{message}</p></section></main>
  </section>;

  return <section className="style-studio mission" aria-label={`Style Studio Ghana design missions for ${learnerName}`}>
    <header className="style-studio-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Menu</button><div><Shirt size={18}/><strong>STYLE STUDIO GHANA</strong><span>{studioCollectionStage(checkpoint, round.questions.length)}</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    {question ? <main className={`style-mission-layout ${pulse ? "runway-pulse" : ""}`}>
      <section className="style-brief-board"><span className="style-kicker">DESIGN BRIEF {checkpoint + 1}/{round.questions.length}</span><div className="style-client"><small>CLIENT</small><strong>{scene?.client ?? "Studio Client"}</strong><em>{scene?.studioId}</em></div><h1>{scene?.brief ?? question.prompt}</h1><p>{question.prompt}</p><div className="style-constraint"><Scissors size={17}/><div><small>OBJECTIVE CONSTRAINT</small><strong>{scene?.constraint ?? "Study the brief before choosing."}</strong></div></div><button type="button" className="style-hint" onClick={() => setHint((value) => !value)}><CircleHelp size={16}/>{hint ? "Hide studio clue" : "Ask the stylist"}</button>{hint ? <div className="style-hint-note">{scene?.cue ?? "Read the objective constraint and compare every wardrobe choice."}</div> : null}<div className="style-mission-meta"><span>{scene?.studioMission ?? "design"}</span><span>{scene?.runwayTheme ?? "Studio runway"}</span><span>{plan?.supportMode ?? "adaptive"} support</span></div></section>
      <section className="style-mission-runway"><div className="style-spotlight"/><span>{pulse ? "LOOK SEALED" : "FITTING PREVIEW"}</span><Mannequin learnerName={learnerName} top={missionPreview.top} bottom={missionPreview.bottom} wrap={missionPreview.wrap} accessory={missionPreview.accessory} moving={pulse}/><div className="style-sparks"><Sparkles size={15}/><strong>{sparks}</strong><span>Studio Sparks</span></div></section>
      <section className="style-mission-rack"><div className="style-rack-title"><Palette size={18}/><div><span>WARDROBE OPTIONS</span><strong>Try pieces on the model before committing.</strong></div></div><div className="style-piece-rail">{question.options.slice(0, 4).map((option, index) => { const item = wardrobe.find((candidate) => candidate.label === option); return <button type="button" key={`${index}-${option}`} className={selected === index ? "selected" : ""} onClick={() => chooseMissionPiece(index)} disabled={pulse}><b>{index + 1}</b><i data-swatch={item?.swatch ?? "night"} data-pattern={item?.pattern ?? "solid"}/><span>{option}</span></button>; })}</div><button type="button" className="style-commit" onClick={commitMission} disabled={pulse}><WandSparkles size={18}/>{pulse ? "Sending look down the runway…" : "Commit this look"}</button><div className="style-status" aria-live="polite"><span>{message}</span><small>1–4 / ← → choose · H clue · Enter commit · no countdown</small></div></section>
    </main> : <main className="style-complete"><Sparkles size={48}/><h1>Collection complete.</h1><p>Every design brief is sealed. Secure grading is checking only the objective learning constraints—not personal style.</p></main>}
    <footer className="style-progress"><span>Collection {progress}%</span><i><b style={{ width:`${progress}%` }}/></i><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Design profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span></footer>
  </section>;
}
