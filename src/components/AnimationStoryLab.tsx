"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Accessibility, ArrowLeft, BookOpen, Captions, ChevronLeft, ChevronRight, CircleHelp, Clapperboard, Film, LogOut, Music, Play, RotateCcw, Save, Settings2, Sparkles, Volume2, VolumeX, WandSparkles } from "lucide-react";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings, startArcadeMusic, stopArcadeMusic, unlockArcadeAudio } from "@/lib/arcade-audio";
import { storyLabFreeFrameNext, storyLabNextOption, storyLabProductionStage, storyLabSparkReward } from "@/lib/animation-story-lab";
import type { StoryLabBackdrop, StoryLabScene } from "@/lib/animation-story-lab-content";
import "./animation-story-lab.css";

type StoryQuestion = { id: string; prompt: string; options: string[]; scene?: Partial<StoryLabScene> };
type StoryPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  hintStrength: 0 | 1 | 2;
};
type StoryRound = { id: string; difficulty: number; answers: string[]; questions: StoryQuestion[]; learningPlan?: StoryPlan | null };
type Props = { learnerName: string; round: StoryRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type Screen = "opening" | "mission" | "create" | "preview" | "help" | "settings";
type FreeFrame = { backdrop: StoryLabBackdrop; character: string; action: string; dialogue: string };
type FreeStory = { title: string; frames: FreeFrame[] };

const GAME = "sentence-scramble";
const STORY_KEY = "sukuunova.animation-story-lab.free-story.v1";
const BACKDROPS: Array<{ id: StoryLabBackdrop; label: string }> = [
  { id:"school", label:"School courtyard" },
  { id:"market", label:"Busy market" },
  { id:"forest", label:"Forest trail" },
  { id:"space", label:"Space station" },
  { id:"festival", label:"Festival ground" },
  { id:"studio", label:"Animation studio" },
];
const CHARACTERS = ["Nova", "Ama", "Kojo", "Esi", "Kofi", "Mansa"];
const ACTIONS = ["walks into the scene", "finds a clue", "helps a friend", "looks around carefully", "makes a plan", "celebrates the result"];

function blankStory(): FreeStory {
  return {
    title: "My Nova Story",
    frames: [
      { backdrop:"school", character:"Ama", action:"walks into the scene", dialogue:"I have an idea!" },
      { backdrop:"school", character:"Kojo", action:"finds a clue", dialogue:"Look what I found." },
      { backdrop:"festival", character:"Ama", action:"celebrates the result", dialogue:"We did it together!" },
    ],
  };
}

function savedStory() {
  const fallback = blankStory();
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORY_KEY) ?? "null") as FreeStory | null;
    if (!parsed || typeof parsed.title !== "string" || !Array.isArray(parsed.frames) || parsed.frames.length !== 3) return fallback;
    const validFrames = parsed.frames.every((frame) => BACKDROPS.some((item) => item.id === frame.backdrop) && typeof frame.character === "string" && typeof frame.action === "string" && typeof frame.dialogue === "string");
    return validFrames ? parsed : fallback;
  } catch { return fallback; }
}

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

function Stage({ backdrop, character, action, dialogue, compact = false }: FreeFrame & { compact?: boolean }) {
  return <div className={`story-stage ${compact ? "compact" : ""}`} data-backdrop={backdrop}>
    <div className="story-stage-sky"/><div className="story-stage-ground"/>
    <div className="story-prop one"/><div className="story-prop two"/>
    <div className="story-character"><span>{character.trim()?.[0]?.toUpperCase() || "N"}</span><i/><b>{character}</b></div>
    <div className="story-action">{action}</div>
    {dialogue.trim() ? <div className="story-bubble">{dialogue}</div> : null}
  </div>;
}

function MissionStage({ scene }: { scene?: Partial<StoryLabScene> }) {
  const backdrop = scene?.backdrop ?? "studio";
  const cast = scene?.cast?.length ? scene.cast : ["Nova"];
  return <div className="story-mission-stage" data-backdrop={backdrop}>
    <div className="story-stage-sky"/><div className="story-stage-ground"/>
    <div className="story-cast">{cast.slice(0, 3).map((name, index) => <div key={`${name}-${index}`} className="story-character" style={{ "--cast-index":index } as React.CSSProperties}><span>{name.trim()?.[0]?.toUpperCase() || "N"}</span><i/><b>{name}</b></div>)}</div>
    <div className="story-beat-strip">{scene?.beatStrip?.slice(0, 3).map((beat, index) => <div key={`${beat}-${index}`}><b>{index + 1}</b><span>{beat}</span></div>)}</div>
  </div>;
}

export default function AnimationStoryLab({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const [screen, setScreen] = useState<Screen>("opening");
  const [checkpoint, setCheckpoint] = useState(initialCheckpoint(round.answers, round.questions.length));
  const [selected, setSelected] = useState(0);
  const [hint, setHint] = useState(false);
  const [revisions, setRevisions] = useState(0);
  const [sparks, setSparks] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [freeStory, setFreeStory] = useState<FreeStory>(savedStory);
  const [activeFrame, setActiveFrame] = useState(0);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [playingPreview, setPlayingPreview] = useState(false);
  const [audio, setAudio] = useState(arcadeAudioSettings);
  const [message, setMessage] = useState("Welcome to Animation Story Lab. Direct a mission or make your own three-frame story.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const question = round.questions[checkpoint];
  const scene = question?.scene;
  const plan = round.learningPlan;
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const productionStage = storyLabProductionStage(checkpoint, round.questions.length);
  const frame = freeStory.frames[activeFrame] ?? freeStory.frames[0];
  const preview = freeStory.frames[previewFrame] ?? freeStory.frames[0];
  const backdropLabel = useMemo(() => BACKDROPS.find((item) => item.id === frame.backdrop)?.label ?? "Scene", [frame.backdrop]);

  useEffect(() => () => stopArcadeMusic(), []);

  useEffect(() => {
    if (!playingPreview || screen !== "preview") return;
    const delay = audio.reducedMotion ? 2400 : 1650;
    const timer = window.setInterval(() => setPreviewFrame((current) => storyLabFreeFrameNext(current, freeStory.frames.length)), delay);
    return () => window.clearInterval(timer);
  }, [playingPreview, screen, audio.reducedMotion, freeStory.frames.length]);

  useEffect(() => {
    if (checkpoint >= round.questions.length && screen === "mission" && !completedRef.current) {
      completedRef.current = true;
      setMessage("Production wrapped. Sending the sealed director decisions for secure review.");
      window.setTimeout(() => completeRef.current([...answersRef.current]), 650);
    }
  }, [checkpoint, round.questions.length, screen]);

  useEffect(() => {
    if (screen !== "mission") return;
    const keydown = (event: KeyboardEvent) => {
      if (!question || pulse) return;
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < question.options.length) {
          setSelected(index);
          setRevisions((value) => value + 1);
          playArcadeSound("select", GAME);
        }
      } else if (event.key === "ArrowRight") {
        setSelected((value) => storyLabNextOption(value, 1, question.options.length));
        setRevisions((value) => value + 1);
      } else if (event.key === "ArrowLeft") {
        setSelected((value) => storyLabNextOption(value, -1, question.options.length));
        setRevisions((value) => value + 1);
      } else if (event.key.toLowerCase() === "h") {
        setHint((value) => !value);
      } else if (event.key === "Enter") {
        event.preventDefault();
        commitMission();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const enter = (next: Screen) => {
    unlockArcadeAudio();
    startArcadeMusic(GAME);
    playArcadeSound(next === "mission" || next === "create" ? "launch" : "select", GAME);
    setPlayingPreview(false);
    setScreen(next);
  };

  const updateAudio = (patch: Parameters<typeof setArcadeAudioSettings>[0]) => {
    unlockArcadeAudio();
    const next = setArcadeAudioSettings(patch);
    setAudio(next);
    if (next.music) startArcadeMusic(GAME);
  };

  const chooseMissionOption = (index: number) => {
    if (!question || pulse) return;
    setSelected(index);
    setRevisions((value) => value + 1);
    playArcadeSound("select", GAME);
  };

  const commitMission = () => {
    if (!question || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const reward = storyLabSparkReward(round.difficulty, revisions);
    setSparks((value) => value + reward);
    setPulse(true);
    setHint(false);
    playArcadeSound("reward", GAME);
    setMessage(`Director decision sealed. +${reward} Frame Sparks — grading stays hidden until the production ends.`);
    window.setTimeout(() => {
      setPulse(false);
      setSelected(0);
      setRevisions(0);
      setCheckpoint((value) => value + 1);
    }, 760);
  };

  const updateFrame = (patch: Partial<FreeFrame>) => {
    setFreeStory((story) => ({
      ...story,
      frames: story.frames.map((item, index) => index === activeFrame ? { ...item, ...patch } : item),
    }));
    playArcadeSound("select", GAME);
  };

  const saveFreeStory = () => {
    try { window.localStorage.setItem(STORY_KEY, JSON.stringify(freeStory)); } catch { /* local storage can be unavailable */ }
    playArcadeSound("success", GAME);
    setMessage("Your free story was saved on this device. Free Create is never correctness-graded.");
  };

  const resetFreeStory = () => {
    setFreeStory(blankStory());
    setActiveFrame(0);
    setPreviewFrame(0);
    playArcadeSound("select", GAME);
  };

  if (screen === "opening") return <section className="story-lab opening" aria-label={`Animation Story Lab for ${learnerName}`}>
    <header className="story-top"><div><Clapperboard size={20}/><span>ANIMATION STORY LAB</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <main className="story-opening-layout">
      <section className="story-opening-copy"><span className="story-kicker">WRITE · DIRECT · ANIMATE</span><h1>Make the story move.</h1><p>Build scenes, direct characters and preview your own mini animation. Director Missions teach story craft without ever grading your personal imagination.</p><div className="story-opening-menu">
        <button type="button" className="primary" onClick={() => enter("mission")}><Film size={20}/><span><strong>Director Missions</strong><small>Story craft through scene decisions</small></span></button>
        <button type="button" onClick={() => enter("create")}><Clapperboard size={20}/><span><strong>Free Create</strong><small>No grades · make your own three-frame story</small></span></button>
        <button type="button" onClick={() => enter("help")}><CircleHelp size={20}/><span><strong>How to Play</strong><small>Storyboard guide and controls</small></span></button>
        <button type="button" onClick={() => enter("settings")}><Settings2 size={20}/><span><strong>Settings</strong><small>Music, sound and accessibility</small></span></button>
      </div></section>
      <section className="story-opening-stage"><div className="story-projector"/><Stage {...freeStory.frames[0]} /><div className="story-film-strip"><i/><i/><i/><i/><i/></div><span>YOUR STORY · YOUR CUT</span></section>
    </main>
  </section>;

  if (screen === "help") return <section className="story-lab panel"><header className="story-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Main menu</button><strong>STORY LAB GUIDE</strong></header><main className="story-guide"><BookOpen size={38}/><span className="story-kicker">HOW TO PLAY</span><h1>Create freely. Learn the craft.</h1><div className="story-guide-grid"><article><b>1</b><h3>Free Create</h3><p>Choose settings, characters and actions, write short dialogue and preview a three-frame story. Nothing in Free Create is graded.</p></article><article><b>2</b><h3>Director Missions</h3><p>Read the scene brief and choose the edit, shot, line or sequence that best meets the objective storytelling constraint.</p></article><article><b>3</b><h3>Revise like a creator</h3><p>Hints teach a strategy without revealing the answer. Replays remix scene craft so you practise ideas, not memorised cards.</p></article></div><p className="story-controls">Mission controls: 1–4 or ← → choose · H director hint · Enter lock cut. Touch and mouse work everywhere.</p><button type="button" className="story-action primary" onClick={() => enter("mission")}><Play size={17}/>Start directing</button></main></section>;

  if (screen === "settings") return <section className="story-lab panel"><header className="story-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Main menu</button><strong>STORY LAB SETTINGS</strong></header><main className="story-settings"><Settings2 size={38}/><span className="story-kicker">YOUR COMFORT</span><h1>Set the studio your way.</h1><label><span><Music size={18}/><b>Music</b></span><input type="checkbox" checked={audio.music} onChange={(event) => updateAudio({ music:event.target.checked })}/></label><label><span><Volume2 size={18}/><b>Sound effects</b></span><input type="checkbox" checked={audio.soundEffects} onChange={(event) => updateAudio({ soundEffects:event.target.checked })}/></label><label><span><Accessibility size={18}/><b>Reduced motion</b></span><input type="checkbox" checked={audio.reducedMotion} onChange={(event) => updateAudio({ reducedMotion:event.target.checked })}/></label><label><span><Sparkles size={18}/><b>Higher contrast</b></span><input type="checkbox" checked={audio.highContrast} onChange={(event) => updateAudio({ highContrast:event.target.checked })}/></label><button type="button" className="story-action" onClick={() => { unlockArcadeAudio(); playArcadeSound("success", GAME); }}>{audio.soundEffects ? <Volume2 size={16}/> : <VolumeX size={16}/>}Test studio sound</button></main></section>;

  if (screen === "create") return <section className="story-lab create" aria-label="Animation Story Lab Free Create"><header className="story-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Main menu</button><div><Clapperboard size={18}/><strong>FREE CREATE</strong><span>No grades · no timer</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header><main className="story-create-layout">
    <section className="story-editor"><div className="story-editor-title"><span className="story-kicker">STORYBOARD</span><input aria-label="Story title" maxLength={50} value={freeStory.title} onChange={(event) => setFreeStory((story) => ({ ...story, title:event.target.value }))}/><p>Frame {activeFrame + 1} of {freeStory.frames.length} · {backdropLabel}</p></div><div className="story-frame-tabs">{freeStory.frames.map((item, index) => <button key={index} type="button" className={index === activeFrame ? "active" : ""} onClick={() => setActiveFrame(index)}><b>{index + 1}</b><span>{item.character}</span></button>)}</div><label>Backdrop<select value={frame.backdrop} onChange={(event) => updateFrame({ backdrop:event.target.value as StoryLabBackdrop })}>{BACKDROPS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Character<select value={frame.character} onChange={(event) => updateFrame({ character:event.target.value })}>{CHARACTERS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label>Action<select value={frame.action} onChange={(event) => updateFrame({ action:event.target.value })}>{ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}</select></label><label><span><Captions size={15}/>Dialogue</span><input maxLength={90} value={frame.dialogue} onChange={(event) => updateFrame({ dialogue:event.target.value })} placeholder="Write what your character says…"/></label><div className="story-editor-actions"><button type="button" onClick={() => setActiveFrame((current) => storyLabNextOption(current, -1, freeStory.frames.length))}><ChevronLeft size={16}/>Previous frame</button><button type="button" onClick={() => setActiveFrame((current) => storyLabFreeFrameNext(current, freeStory.frames.length))}>Next frame<ChevronRight size={16}/></button><button type="button" onClick={saveFreeStory}><Save size={16}/>Save story</button><button type="button" onClick={resetFreeStory}><RotateCcw size={16}/>Reset</button></div></section>
    <section className="story-live-preview"><span className="story-kicker">LIVE FRAME</span><h2>{freeStory.title || "Untitled story"}</h2><Stage {...frame}/><button type="button" className="story-action primary" onClick={() => { setPreviewFrame(0); setPlayingPreview(false); setScreen("preview"); playArcadeSound("launch", GAME); }}><Play size={17}/>Preview animation</button><p>{message}</p></section>
  </main></section>;

  if (screen === "preview") return <section className="story-lab preview"><header className="story-top"><button type="button" onClick={() => { setPlayingPreview(false); setScreen("create"); }}><ArrowLeft size={16}/>Back to editor</button><div><Film size={18}/><strong>PREVIEW CUT</strong><span>Frame {previewFrame + 1} / {freeStory.frames.length}</span></div><button type="button" onClick={saveFreeStory}><Save size={15}/>Save</button></header><main className="story-preview-room"><div className="story-preview-screen"><span className="story-kicker">{freeStory.title || "Untitled story"}</span><Stage {...preview}/></div><div className="story-preview-controls"><button type="button" onClick={() => setPreviewFrame((current) => storyLabNextOption(current, -1, freeStory.frames.length))}><ChevronLeft size={16}/>Previous</button><button type="button" className="primary" onClick={() => setPlayingPreview((value) => !value)}>{playingPreview ? <Film size={16}/> : <Play size={16}/>} {playingPreview ? "Pause autoplay" : "Play all frames"}</button><button type="button" onClick={() => setPreviewFrame((current) => storyLabFreeFrameNext(current, freeStory.frames.length))}>Next<ChevronRight size={16}/></button></div><p>Free Create previews are yours to experiment with. No score, ranking or correctness grade is attached to them.</p></main></section>;

  if (!question) return <section className="story-lab panel"><main className="story-guide"><Sparkles size={38}/><h1>Production complete.</h1><p>Your director decisions are being wrapped for review.</p></main></section>;

  return <section className={`story-lab mission ${pulse ? "pulse" : ""}`} aria-label="Animation Story Lab Director Mission"><header className="story-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Main menu</button><div><Clapperboard size={18}/><strong>DIRECTOR MISSIONS</strong><span>{productionStage.replace("-", " ")} · {progress}%</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header><main className="story-mission-layout">
    <section className="story-scene-panel"><div className="story-scene-heading"><span className="story-kicker">{scene?.storyMission?.toUpperCase() ?? "STORY CRAFT"} · {scene?.storyboardId ?? `SCENE ${checkpoint + 1}`}</span><h1>{scene?.sceneTitle ?? "Director scene"}</h1><p>{scene?.directorBrief ?? "Study the scene and make the strongest story-craft decision."}</p></div><MissionStage scene={scene}/><div className="story-constraint"><WandSparkles size={17}/><div><b>Director constraint</b><span>{scene?.constraint ?? "Keep the story clear, purposeful and easy to follow."}</span></div></div></section>
    <section className="story-director-desk"><div className="story-scorebar"><span>FRAME SPARKS <b>{sparks}</b></span><span>SCENE <b>{Math.min(checkpoint + 1, round.questions.length)}/{round.questions.length}</b></span><span>SUPPORT <b>{plan?.supportMode ?? "adaptive"}</b></span></div><div className="story-prompt"><span className="story-kicker">MAKE THE CUT</span><h2>{question.prompt}</h2>{hint ? <div className="story-hint"><CircleHelp size={17}/><span>{scene?.cue ?? "Think about what the audience needs to understand from this moment."}</span></div> : null}</div><div className="story-options">{question.options.map((option, index) => <button key={`${option}-${index}`} type="button" className={selected === index ? "selected" : ""} onClick={() => chooseMissionOption(index)}><b>{index + 1}</b><span>{option}</span></button>)}</div><div className="story-director-actions"><button type="button" onClick={() => { setHint((value) => !value); playArcadeSound("scan", GAME); }}><CircleHelp size={16}/>{hint ? "Hide director hint" : "Director hint"}</button><button type="button" className="primary" onClick={commitMission} disabled={pulse}><Clapperboard size={16}/>{pulse ? "Sealing cut…" : "Lock this cut"}</button></div><p className="story-message">{message}</p></section>
  </main></section>;
}
