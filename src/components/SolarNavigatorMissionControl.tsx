"use client";

import { useEffect, useRef, useState } from "react";
import { Accessibility, ArrowLeft, CircleHelp, Crosshair, Fuel, Gauge, LogOut, Music, Navigation, Play, Radio, Rocket, Satellite, ScanLine, Settings2, Sparkles, Volume2, VolumeX } from "lucide-react";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings, startArcadeMusic, stopArcadeMusic, unlockArcadeAudio } from "@/lib/arcade-audio";
import { solarDriftDamage, solarFlightWindowMs, solarFuelReward, solarOrbitChain, solarScanRecovery, solarScanTokens } from "@/lib/solar-navigator";
import type { SolarNavigatorScene } from "@/lib/solar-navigator-content";
import "./solar-navigator.css";

type SpaceQuestion = { id: string; prompt: string; options: string[]; scene?: Partial<SolarNavigatorScene> };
type LearningPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
};
type SpaceRound = { id: string; difficulty: number; answers: string[]; questions: SpaceQuestion[]; learningPlan?: LearningPlan | null };
type Props = { learnerName: string; round: SpaceRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type Screen = "opening" | "mission" | "help" | "settings";

function firstCheckpoint(answers: string[], length: number) {
  const index = answers.findIndex((answer) => !answer.trim());
  return index < 0 ? length : index;
}

export default function SolarNavigatorMissionControl({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const plan = round.learningPlan;
  const supportMode = plan?.supportMode ?? "independent";
  const [screen, setScreen] = useState<Screen>("opening");
  const [checkpoint, setCheckpoint] = useState(firstCheckpoint(round.answers, round.questions.length));
  const [selected, setSelected] = useState(0);
  const [revisions, setRevisions] = useState(0);
  const [fuel, setFuel] = useState(100);
  const [navIntegrity, setNavIntegrity] = useState(100);
  const [orbitChain, setOrbitChain] = useState(0);
  const [scanTokens, setScanTokens] = useState(() => solarScanTokens(round.difficulty, supportMode));
  const [scanVisible, setScanVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("Mission Control is standing by.");
  const [audio, setAudio] = useState(arcadeAudioSettings);
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const question = round.questions[checkpoint];
  const scene = question?.scene;
  const flightWindow = solarFlightWindowMs(round.difficulty, plan?.speedScale ?? 1, supportMode);
  const pressure = Math.max(0, Math.min(1, elapsed / Math.max(1, flightWindow)));
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const finalMission = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);

  useEffect(() => () => stopArcadeMusic(), []);

  useEffect(() => {
    if (screen !== "mission" || !question) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1000);
      setNavIntegrity((value) => Math.max(25, value - solarDriftDamage(pressure, plan?.hazardDensity ?? 1, scene?.fuelRisk ?? 1) * .12));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, question?.id, pressure, plan?.hazardDensity, scene?.fuelRisk]);

  useEffect(() => {
    if (checkpoint >= round.questions.length && screen === "mission" && !completedRef.current) {
      completedRef.current = true;
      setMessage("Flight plan complete. Sending sealed navigation decisions for secure mission review.");
      window.setTimeout(() => completeRef.current([...answersRef.current]), 650);
    }
  }, [checkpoint, round.questions.length, screen]);

  useEffect(() => {
    if (screen !== "mission") return;
    const keydown = (event: KeyboardEvent) => {
      if (!question || completedRef.current) return;
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < question.options.length) choose(index);
      } else if (event.key.toLowerCase() === "s") scan();
      else if (event.key === "Enter") { event.preventDefault(); commit(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const enterMission = () => {
    unlockArcadeAudio();
    startArcadeMusic("space-explorer");
    playArcadeSound("launch", "space-explorer");
    setScreen("mission");
  };

  const updateAudio = (patch: Parameters<typeof setArcadeAudioSettings>[0]) => {
    unlockArcadeAudio();
    const next = setArcadeAudioSettings(patch);
    setAudio(next);
    if (next.music) startArcadeMusic("space-explorer");
  };

  const choose = (index: number) => {
    if (!question) return;
    setSelected(index);
    setRevisions((value) => value + 1);
    playArcadeSound("select", "space-explorer");
  };

  const scan = () => {
    if (!question || scanTokens <= 0) return;
    setScanTokens((value) => Math.max(0, value - 1));
    setScanVisible(true);
    const recovered = solarScanRecovery(pressure, plan?.hintStrength ?? 0);
    setElapsed((value) => Math.max(0, value - Math.round(flightWindow * recovered)));
    setNavIntegrity((value) => Math.min(100, value + 4 + (plan?.hintStrength ?? 0) * 2));
    setMessage("Star Scan complete. Telemetry clue unlocked; the graded route remains your decision.");
    playArcadeSound("scan", "space-explorer");
  };

  const commit = () => {
    if (!question || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const reward = solarFuelReward(round.difficulty, revisions, scene?.fuelRisk ?? 1);
    const burn = Math.max(2, (scene?.fuelRisk ?? 1) + Math.round(pressure * 4));
    setFuel((value) => Math.max(12, Math.min(100, value - burn + Math.floor(reward / 2))));
    setOrbitChain((value) => solarOrbitChain(value, revisions));
    setNavIntegrity((value) => Math.min(100, value + reward));
    setMessage(`Course locked for secure review. +${reward} navigation stability — correctness stays sealed until mission debrief.`);
    playArcadeSound("reward", "space-explorer");
    window.setTimeout(() => {
      setCheckpoint((value) => value + 1);
      setSelected(0);
      setRevisions(0);
      setElapsed(0);
      setScanVisible(false);
    }, 700);
  };

  if (screen === "opening") return <section className="solar-nav opening" aria-label={`Solar Navigator Mission Control for ${learnerName}`}>
    <div className="solar-stars" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
    <header className="solar-top"><div><Satellite size={19}/><span>SOLAR NAVIGATOR</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <main className="solar-opening-grid">
      <div className="solar-opening-copy"><span className="solar-kicker">HELIOS MISSION CONTROL</span><h1>Plot the route.<br/>Read the sky.</h1><p>Command astronomy missions across planets, moons and deep space. Read telemetry, plan the safest scientific route and learn how the Solar System really moves.</p><div className="solar-opening-actions"><button type="button" className="primary" onClick={enterMission}><Rocket size={20}/><span><strong>Launch Mission</strong><small>Continue at checkpoint {Math.min(checkpoint + 1, round.questions.length)}</small></span></button><button type="button" onClick={() => setScreen("help")}><CircleHelp size={19}/><span><strong>Flight Manual</strong><small>Mission rules and controls</small></span></button><button type="button" onClick={() => setScreen("settings")}><Settings2 size={19}/><span><strong>Settings</strong><small>Audio and accessibility</small></span></button></div></div>
      <div className="solar-system-art" aria-hidden="true"><div className="solar-sun"/><div className="orbit o1"><i/></div><div className="orbit o2"><i/></div><div className="orbit o3"><i/></div><div className="orbit o4"><i/></div><Rocket className="solar-ship" size={34}/><span>MISSION {Math.min(checkpoint + 1, round.questions.length)} / {round.questions.length}</span></div>
    </main>
  </section>;

  if (screen === "help") return <section className="solar-nav panel"><header className="solar-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Mission menu</button><strong>FLIGHT MANUAL</strong></header><main className="solar-guide"><Navigation size={40}/><span className="solar-kicker">HOW TO FLY</span><h1>Evidence first. Course second.</h1><div className="solar-guide-grid"><article><b>1</b><h3>Read telemetry</h3><p>Study the target, sector, mission objective and scientific flight rule.</p></article><article><b>2</b><h3>Use Star Scan</h3><p>Spend a scan token for an evidence clue. It never reveals which option is graded correct.</p></article><article><b>3</b><h3>Lock the course</h3><p>Choose a route and commit it. Mission Control seals the answer for server-side review.</p></article></div><p className="solar-controls">Controls: 1–4 choose · S Star Scan · Enter lock course · touch and mouse supported.</p><button type="button" className="solar-action primary" onClick={enterMission}><Play size={17}/>Launch mission</button></main></section>;

  if (screen === "settings") return <section className="solar-nav panel"><header className="solar-top"><button type="button" onClick={() => setScreen("opening")}><ArrowLeft size={16}/>Mission menu</button><strong>MISSION SETTINGS</strong></header><main className="solar-settings"><Settings2 size={40}/><span className="solar-kicker">FLIGHT COMFORT</span><h1>Configure your console.</h1><label><span><Music size={18}/><b>Music</b></span><input type="checkbox" checked={audio.music} onChange={(event) => updateAudio({ music:event.target.checked })}/></label><label><span><Volume2 size={18}/><b>Sound effects</b></span><input type="checkbox" checked={audio.soundEffects} onChange={(event) => updateAudio({ soundEffects:event.target.checked })}/></label><label><span><Accessibility size={18}/><b>Reduced motion</b></span><input type="checkbox" checked={audio.reducedMotion} onChange={(event) => updateAudio({ reducedMotion:event.target.checked })}/></label><label><span><Sparkles size={18}/><b>Higher contrast</b></span><input type="checkbox" checked={audio.highContrast} onChange={(event) => updateAudio({ highContrast:event.target.checked })}/></label><button type="button" className="solar-action" onClick={() => { unlockArcadeAudio(); playArcadeSound("success", "space-explorer"); }}>{audio.soundEffects ? <Volume2 size={16}/> : <VolumeX size={16}/>}Test mission audio</button></main></section>;

  if (!question) return <section className="solar-nav mission"><div className="solar-complete"><Rocket size={46}/><h1>Mission plan transmitted.</h1><p>Secure debrief is preparing your result.</p></div></section>;

  return <section className={`solar-nav mission ${finalMission ? "summit" : ""}`} aria-label="Solar Navigator mission">
    <header className="solar-top"><div><Satellite size={18}/><strong>SOLAR NAVIGATOR</strong><span>{finalMission ? "SOLAR SYSTEM COMMAND" : scene?.sector ?? "Mission sector"}</span></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <div className="solar-progress"><span style={{ width:`${progress}%` }}/></div>
    <main className="solar-console">
      <aside className="solar-telemetry"><div className="solar-target"><div className="solar-target-ring"><Crosshair size={30}/></div><small>TARGET BODY</small><strong>{scene?.targetBody ?? "Deep space"}</strong><span>{scene?.navCode ?? "HEL-NAV"}</span></div><div className="solar-meters"><article><Fuel size={16}/><span>Fuel</span><strong>{Math.round(fuel)}%</strong></article><article><Gauge size={16}/><span>Nav integrity</span><strong>{Math.round(navIntegrity)}%</strong></article><article><Radio size={16}/><span>Comms</span><strong>{scene?.commsStatus ?? "Nominal"}</strong></article></div><div className="solar-flight-data"><small>MISSION OBJECTIVE</small><p>{scene?.missionObjective}</p><small>FLIGHT RULE</small><p>{scene?.flightRule}</p><small>TELEMETRY</small>{scene?.telemetry?.map((item) => <span key={item}>• {item}</span>)}</div></aside>
      <section className="solar-decision"><div className="solar-decision-head"><span className="solar-kicker">{finalMission ? "FINAL COMMAND" : `NAV CHECKPOINT ${checkpoint + 1}`}</span><div><span>Orbit chain <b>{orbitChain}</b></span><span>Window <b>{Math.max(0, Math.round((1-pressure)*100))}%</b></span></div></div><h1>{question.prompt}</h1><div className="solar-options">{question.options.map((option, index) => <button type="button" className={selected === index ? "selected" : ""} onClick={() => choose(index)} key={option}><b>{index + 1}</b><span>{option}</span></button>)}</div>{scanVisible ? <div className="solar-scan-result"><ScanLine size={17}/><span><strong>STAR SCAN:</strong> {scene?.cue ?? "Review the mission telemetry and target class."}</span></div> : null}<div className="solar-command-row"><button type="button" className="scan" onClick={scan} disabled={scanTokens <= 0}><ScanLine size={17}/>Star Scan · {scanTokens}</button><button type="button" className="primary" onClick={commit}><Navigation size={17}/>Lock Course</button></div><p className="solar-message">{message}</p></section>
    </main>
  </section>;
}
