"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BatteryCharging, Compass, LocateFixed, LogOut, Map, MapPin, Navigation, ScanLine, Shield } from "lucide-react";
import { geoQuestCompassReward, geoQuestDistance, geoQuestRouteWeatherRelief, geoQuestScanRecovery, geoQuestStormDamage, geoQuestTravelCost, geoQuestWeatherDurationMs, type GeoPoint, type GeoQuestRoute } from "@/lib/geoquest-mission";
import "./geoquest.css";

type GeoScene = { x?: number; y?: number; boardTitle?: string; cue?: string; meterLabels?: string[] };
type GeoQuestion = { id: string; prompt: string; options: string[]; scene?: GeoScene };
type GeoPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type GeoRound = { id: string; difficulty: number; answers: string[]; questions: GeoQuestion[]; learningPlan?: GeoPlan | null };
type Props = { learnerName: string; round: GeoRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };

const ROUTES: Array<{ key: string; route: GeoQuestRoute; title: string; note: string }> = [
  { key: "Q", route: "road", title: "Survey road", note: "Balanced travel cost and weather exposure." },
  { key: "W", route: "trail", title: "Field trail", note: "Lower energy cost, moderate weather relief." },
  { key: "E", route: "drone", title: "Atlas drone", note: "Higher energy cost, strongest weather relief." },
];
const ACCRA: GeoPoint = { x: 68, y: 84 };

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}
function pointFrom(question?: GeoQuestion): GeoPoint | null {
  return typeof question?.scene?.x === "number" && typeof question?.scene?.y === "number" ? { x: question.scene.x, y: question.scene.y } : null;
}

export default function GeoQuest({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const chartRef = useRef<() => void>(() => undefined);
  const scanRef = useRef<() => void>(() => undefined);
  const startedRef = useRef(Date.now());
  const firstCheckpoint = initialCheckpoint(round.answers, round.questions.length);
  const [checkpoint, setCheckpoint] = useState(firstCheckpoint);
  const [selected, setSelected] = useState(0);
  const [routeChoice, setRouteChoice] = useState<number | null>(null);
  const [weather, setWeather] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const [energy, setEnergy] = useState(78);
  const [compassCharges, setCompassCharges] = useState(2);
  const [scanActive, setScanActive] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [explorer, setExplorer] = useState<GeoPoint>(() => pointFrom(round.questions[Math.max(0, firstCheckpoint - 1)]) ?? ACCRA);
  const [message, setMessage] = useState("Choose a route, study the beacon position and chart the correct atlas label.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const target = pointFrom(question) ?? explorer;
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const duration = useMemo(() => geoQuestWeatherDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"), [round.difficulty, plan?.speedScale, plan?.supportMode]);
  const selectedRoute = routeChoice === null ? null : ROUTES[routeChoice];
  const distance = geoQuestDistance(explorer, target);
  const cost = selectedRoute ? geoQuestTravelCost(distance, selectedRoute.route, round.difficulty) : 0;
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const visited = round.questions.slice(0, checkpoint).map(pointFrom).filter((point): point is GeoPoint => Boolean(point));
  const trailPoints = [...visited, explorer].map((point) => `${point.x},${point.y}`).join(" ");
  const focusCue = question?.scene?.meterLabels?.join(" · ") || "position · region · capital";

  useEffect(() => {
    startedRef.current = Date.now();
    setWeather(0);
    setSelected(0);
    setRouteChoice(null);
    setScanActive(false);
    if (checkpoint < round.questions.length) setMessage(boss ? "Atlas Vault beacon detected. Complete the final survey leg." : "New beacon detected. Choose your travel route and identify it.");
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
      if (elapsed >= duration) {
        const damage = geoQuestStormDamage(100, plan?.hazardDensity ?? 0.9, boss);
        setIntegrity((value) => Math.max(25, value - damage));
        startedRef.current = Date.now() - Math.round(duration * 0.45);
        setWeather(45);
        setMessage(`Storm front crossed the expedition. Atlas shield absorbed ${damage}% pressure.`);
      } else setWeather(Math.min(100, (elapsed / duration) * 100));
    }, 110);
    return () => window.clearInterval(timer);
  }, [boss, checkpoint, duration, plan?.hazardDensity, round.questions.length]);

  const compassScan = () => {
    if (!question || compassCharges < 1 || pulse) return;
    setCompassCharges((value) => Math.max(0, value - 1));
    setWeather((current) => {
      const next = geoQuestScanRecovery(current, plan?.hintStrength ?? 0);
      startedRef.current = Date.now() - Math.round((next / 100) * duration);
      return next;
    });
    setScanActive(true);
    setMessage(`Compass scan: ${focusCue}. The scan guides map-reading strategy but never reveals the label.`);
  };
  scanRef.current = compassScan;

  const chartBeacon = () => {
    if (!question || !selectedRoute || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const reward = geoQuestCompassReward(weather);
    const relief = geoQuestRouteWeatherRelief(selectedRoute.route);
    setEnergy((value) => Math.max(15, Math.min(100, value - cost + Math.round(relief / 3))));
    setCompassCharges((value) => Math.min(6, value + reward));
    setPulse(true);
    setMessage(`${selectedRoute.title} charted ${Math.round(distance)} atlas units. Beacon label sealed for secure review.`);
    window.setTimeout(() => {
      setExplorer(target);
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 560);
  };
  chartRef.current = chartBeacon;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "q" || key === "w" || key === "e") setRouteChoice(key === "q" ? 0 : key === "w" ? 1 : 2);
      else if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (question?.options.length ?? 0)) setSelected(index);
      } else if (key === "c") scanRef.current();
      else if (event.key === "Enter") { event.preventDefault(); chartRef.current(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  return <section className="geoquest-shell" aria-label={`GeoQuest Ghana Expedition for ${learnerName}`}>
    <header className="geoquest-bar">
      <div className="geoquest-brand"><span><Compass size={23}/></span><div><strong>GEOQUEST · GHANA EXPEDITION</strong><small>{plan?.supportMode ?? "adaptive"} survey · geography is the game board</small></div></div>
      <button type="button" className="geoquest-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="geoquest-hud">
      <div><Shield size={16}/><strong>{integrity}%</strong><span>atlas shield</span></div>
      <div><BatteryCharging size={16}/><strong>{energy}%</strong><span>expedition energy</span></div>
      <div><Navigation size={16}/><strong>{compassCharges}</strong><span>compass scans</span></div>
      <div><Map size={16}/><strong>{checkpoint}/{round.questions.length}</strong><span>beacons mapped</span></div>
    </div>

    <div className={`geoquest-stage ${pulse ? "pulse" : ""}`}>
      <div className="geoquest-map-wrap">
        <div className="geoquest-map-title"><LocateFixed size={16}/><span>{boss ? "ATLAS VAULT · FINAL BEACON" : question?.scene?.boardTitle ?? "Ghana Expedition Atlas"}</span></div>
        <div className="geoquest-map">
          <svg viewBox="0 0 100 100" role="img" aria-label="Schematic Ghana expedition map">
            <path className="geoquest-country" d="M34 5 L61 6 L71 16 L70 27 L78 36 L75 49 L83 61 L80 75 L70 88 L55 95 L39 92 L27 86 L18 76 L19 63 L13 50 L19 38 L18 27 L27 18 Z"/>
            <path className="geoquest-water" d="M66 35 C72 42 67 48 72 54 C76 59 70 64 73 70"/>
            {trailPoints ? <polyline className="geoquest-trail" points={trailPoints}/> : null}
            {visited.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} className="geoquest-visited" cx={point.x} cy={point.y} r="1.5"/>)}
          </svg>
          {question ? <div className="geoquest-beacon" style={{ left: `${target.x}%`, top: `${target.y}%` }} aria-label="Unknown atlas beacon"><MapPin size={23}/><i/></div> : null}
          <div className="geoquest-explorer" style={{ left: `${explorer.x}%`, top: `${explorer.y}%` }} aria-label="Explorer position"><Navigation size={18}/></div>
          <span className="geoquest-border north">BURKINA FASO</span><span className="geoquest-border west">CÔTE D’IVOIRE</span><span className="geoquest-border east">TOGO</span><span className="geoquest-border south">GULF OF GUINEA</span>
        </div>
      </div>

      {question ? <div className="geoquest-console">
        <div className="geoquest-console-head"><div><span>{boss ? "ATLAS VAULT" : `SURVEY LEG ${checkpoint + 1} / ${round.questions.length}`}</span><strong>{question.scene?.cue ?? "Use position, direction and geography knowledge to identify the beacon."}</strong></div><MapPin size={22}/></div>
        <h2>{question.prompt}</h2>
        <div className="geoquest-routes">{ROUTES.map((route, index) => <button type="button" key={route.route} className={routeChoice === index ? "selected" : ""} onClick={() => setRouteChoice(index)} disabled={pulse}><b>{route.key}</b><span><strong>{route.title}</strong><small>{route.note}</small></span></button>)}</div>
        <div className="geoquest-labels">{question.options.slice(0, 4).map((option, index) => <button type="button" key={`${index}-${option}`} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} disabled={pulse}><b>{index + 1}</b><span>{option}</span></button>)}</div>
        {scanActive ? <div className="geoquest-scan"><ScanLine size={15}/><span>Compass focus: {focusCue}</span></div> : null}
        <div className="geoquest-actions"><button type="button" className="geoquest-chart" onClick={chartBeacon} disabled={pulse || routeChoice === null}><Navigation size={16}/>{routeChoice === null ? "Choose a travel route" : pulse ? "Charting…" : `Chart beacon · ${cost} energy`}</button><button type="button" className="geoquest-compass" onClick={compassScan} disabled={compassCharges < 1 || pulse}><Compass size={16}/>Compass scan · 1</button></div>
        <div className="geoquest-status" aria-live="polite"><span>{message}</span><small>Q/W/E route · 1–4 label · C scan · Enter chart</small></div>
      </div> : <div className="geoquest-console geoquest-finished"><Map size={42}/><strong>ATLAS EXPEDITION COMPLETE</strong><span>Uploading your mapped beacons for secure geography review…</span></div>}

      <div className="geoquest-weather"><span>Weather front</span><i><b style={{ width: `${weather}%` }}/></i><strong>{Math.round(weather)}%</strong></div>
    </div>

    <footer className="geoquest-footer"><span>Atlas progress {progress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Geography profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span></footer>
  </section>;
}
