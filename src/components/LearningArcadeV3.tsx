"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gamepad2, Medal, Play, RefreshCw, Rocket, Sparkles, Trophy, X, Zap } from "lucide-react";
import NovaRunner from "./NovaRunner";
import NumberBloomGarden from "./NumberBloomGarden";
import TurboType, { type TurboTypeTelemetry } from "./TurboType";
import AstroLabDefender from "./AstroLabDefender";
import WordKingdom from "./WordKingdom";
import ReadingQuest from "./ReadingQuest";
import CodeBotsFactory from "./CodeBotsFactory";
import GeoQuest from "./GeoQuest";
import CediCityMarket from "./CediCityMarket";
import SignalShield from "./SignalShield";
import EcoGridGhana from "./EcoGridGhana";
import BioQuestHumanSystems from "./BioQuestHumanSystems";
import StyleStudioGhana from "./StyleStudioGhana";
import SolarNavigatorMissionControl from "./SolarNavigatorMissionControl";
import ArcadeProgressionHub from "./ArcadeProgressionHub";
import ArcadeGameLogo from "./ArcadeGameLogo";
import "./nova-learning-arcade.css";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";
type LiveGame = "number-pop" | "math" | "keyboard-ninja" | "force-motion-lab" | "word" | "comprehension-quest" | "coding-sequence" | "ghana-map-master" | "money-math-market" | "cyber-safety" | "environment-guardian" | "body-explorer" | "culture-heritage" | "space-explorer";
type Child = { id: string; name: string; classId: string | null; class: { name: string; level: string | null } | null };
type Progress = { game: string; rounds: number; xp: number; level: number; accuracy: number | null; badges: string[] };
type Overview = {
  children: Child[];
  selected: Child | null;
  progress: Progress[];
  streak: number;
  recent: Array<{ id: string; game: string; correct: number; stars: number; difficulty: number; xp: number; score: number; roundLength: number }>;
  recommendedAgeBand: AgeBand | null;
  allowedAgeBands: AgeBand[];
};
type StudioPiece = {
  id: string;
  label: string;
  slot: "fabric" | "top" | "bottom" | "wrap" | "accessory" | "outer";
  pattern: "kente" | "stripe" | "check" | "solid" | "repeat" | "mirror" | "rework" | "weather";
  swatch: "sun" | "forest" | "sky" | "berry" | "earth" | "night" | "coral" | "mint";
};
type QuestionScene = {
  cue?: string;
  meterLabels?: string[];
  x?: number;
  y?: number;
  boardTitle?: string;
  bloomChallenge?: "count" | "match" | "compare" | "make" | "next";
  gardenPatch?: string;
  objectKind?: "flower" | "seed" | "ladybird" | "butterfly" | "raindrop";
  targetNumber?: number;
  shownCount?: number;
  leftCount?: number;
  rightCount?: number;
  startCount?: number;
  sequenceStart?: number;
  visualInstruction?: string;
  customer?: string;
  avatar?: string;
  basket?: string[];
  wallet?: number;
  mission?: "change" | "basket" | "discount" | "saving" | "budget" | "profit" | "percentage" | "tradeoff";
  priceTags?: string[];
  incidentType?: "phishing" | "link" | "password" | "privacy" | "wifi" | "update" | "recovery" | "imposter";
  source?: string;
  channel?: string;
  asset?: string;
  signalTags?: string[];
  threatLevel?: 1 | 2 | 3 | 4 | 5;
  packetId?: string;
  ecoMission?: "waste" | "water" | "sanitation" | "energy" | "habitat" | "climate" | "transport" | "ewaste" | "circularity";
  zone?: string;
  event?: string;
  resource?: string;
  ecoSignals?: string[];
  riskLevel?: 1 | 2 | 3 | 4 | 5;
  forecast?: string;
  projectId?: string;
  bodySystem?: "circulatory" | "respiratory" | "digestive" | "nervous" | "skeletal" | "muscular" | "immune" | "excretory" | "endocrine" | "coordination";
  organ?: string;
  caseTitle?: string;
  vitalFocus?: string;
  scanSignals?: string[];
  strainLevel?: 1 | 2 | 3 | 4 | 5;
  bay?: string;
  caseId?: string;
  studioMission?: "weaving" | "heritage" | "pattern" | "function" | "repair" | "materials";
  client?: string;
  brief?: string;
  constraint?: string;
  runwayTheme?: string;
  wardrobe?: StudioPiece[];
  heritageNote?: string;
  studioId?: string;
  spaceMission?: "planet" | "orbit" | "moon" | "rotation" | "scale" | "navigation" | "communication" | "small-bodies";
  sector?: string;
  targetBody?: string;
  missionObjective?: string;
  flightRule?: string;
  telemetry?: string[];
  fuelRisk?: 1 | 2 | 3 | 4 | 5;
  commsStatus?: string;
  navCode?: string;
};
type Question = { id: string; kind?: string; prompt: string; options: string[]; answer?: string; explanation?: string; correct?: boolean; scene?: QuestionScene };
type LearningPlan = {
  version: 1;
  targetDifficulty: number;
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type Round = {
  id: string;
  studentId: string;
  game: string;
  difficulty: number;
  status: string;
  answers: string[];
  correct: number | null;
  xp: number;
  stars: number;
  ageBand: AgeBand | null;
  roundLength: number;
  score: number | null;
  questions: Question[];
  learningPlan?: LearningPlan | null;
};
type Leaderboard = { rows: Array<{ rank: number; studentId: string; displayName: string; bestScore: number; totalXp: number; rounds: number }> };

type GameCard = {
  game: LiveGame;
  className: string;
  title: string;
  description: string;
  tags: string[];
  eligible: boolean;
  lockedLabel: string;
  progress?: Progress;
  playLabel: string;
  continueLabel: string;
  primary?: boolean;
};

const ageLabels: Record<AgeBand, string> = {
  age_4_5: "Age 4–5", age_6_8: "Age 6–8", age_9_11: "Age 9–11", age_12_14: "Age 12–14", age_15_18: "Age 15–18",
};
const gameLabels: Record<LiveGame, string> = {
  "number-pop": "Number Bloom",
  math: "Nova Runner",
  "keyboard-ninja": "TurboType",
  "force-motion-lab": "AstroLab Defender",
  word: "Word Kingdom",
  "comprehension-quest": "Reading Quest",
  "coding-sequence": "CodeBots Logic Factory",
  "ghana-map-master": "GeoQuest Ghana Expedition",
  "money-math-market": "Cedi City Market",
  "cyber-safety": "Signal Shield",
  "environment-guardian": "EcoGrid Ghana",
  "body-explorer": "BioQuest: Human Systems",
  "culture-heritage": "Style Studio Ghana",
  "space-explorer": "Solar Navigator: Mission Control",
};

function displayAnswer(value?: string) {
  if (!value) return "—";
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed.join(" → ");
  } catch {}
  return value;
}

function completionNoun(game: LiveGame) {
  if (game === "number-pop") return "Garden journey";
  if (game === "keyboard-ninja") return "Race";
  if (game === "force-motion-lab") return "Defence mission";
  if (game === "word") return "Quest";
  if (game === "comprehension-quest") return "Expedition";
  if (game === "coding-sequence") return "Factory run";
  if (game === "ghana-map-master") return "Survey";
  if (game === "money-math-market") return "Market shift";
  if (game === "cyber-safety") return "CyberOps shift";
  if (game === "environment-guardian") return "Restoration shift";
  if (game === "body-explorer") return "BioLab shift";
  if (game === "culture-heritage") return "Design collection";
  if (game === "space-explorer") return "Navigation mission";
  return "Mission";
}

async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? "Could not connect to the Learning Arcade.");
  return data;
}

export default function LearningArcadeV3() {
  const [data, setData] = useState<Overview | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [result, setResult] = useState<Round | null>(null);
  const [ageBand, setAgeBand] = useState<AgeBand | "">("");
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [leaderboardGame, setLeaderboardGame] = useState<LiveGame>("math");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const operation = useRef(false);

  const refresh = async (studentId = "") => {
    const version = ++request.current;
    setLoading(true); setError("");
    try {
      const next = await api(`/api/guardian/arcade?studentId=${encodeURIComponent(studentId)}`) as Overview;
      if (version !== request.current) return;
      setData(next);
      setAgeBand(next.recommendedAgeBand ?? next.allowedAgeBands[0] ?? "");
    } catch (loadError) {
      if (version === request.current) setError(loadError instanceof Error ? loadError.message : "Could not load the Learning Arcade.");
    } finally { if (version === request.current) setLoading(false); }
  };

  useEffect(() => { void refresh(); return () => { request.current += 1; }; }, []);

  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The mission could not be updated."); }
    finally { operation.current = false; setBusy(false); }
  };

  const startGame = (game: LiveGame) => run(async () => {
    if (!data?.selected || !ageBand) return;
    const next = await api("/api/guardian/arcade", { action: "start", studentId: data.selected.id, game, ageBand, roundLength: 5 }) as Round;
    setRound(next); setResult(null); setLeaderboard(null);
  });

  const finishRound = (answers: string[], typingTelemetry?: TurboTypeTelemetry) => run(async () => {
    if (!round) return;
    const completed = await api("/api/guardian/arcade", { action: "save", roundId: round.id, answers, finish: true, ...(typingTelemetry ? { typingTelemetry } : {}) }) as Round;
    const completedGame = round.game as LiveGame;
    setRound(null); setResult(completed);
    setMessage(`${completionNoun(completedGame)} complete — ${completed.xp} XP earned.`);
    await refresh(completed.studentId);
  });

  const exitRound = (answers: string[], typingTelemetry?: TurboTypeTelemetry) => run(async () => {
    if (!round) return;
    const currentGame = round.game as LiveGame;
    await api("/api/guardian/arcade", { action: "save", roundId: round.id, answers, finish: false, ...(typingTelemetry ? { typingTelemetry } : {}) });
    const studentId = round.studentId;
    setRound(null);
    setMessage(currentGame === "number-pop"
      ? "Garden saved. Number Bloom will resume at the next patch."
      : currentGame === "keyboard-ninja"
        ? "Race saved. TurboType will resume at your next checkpoint."
        : currentGame === "force-motion-lab"
          ? "Lab secured. AstroLab Defender will resume at the next anomaly."
          : currentGame === "word"
            ? "Quest saved. Word Kingdom will resume at the next rune gate."
            : currentGame === "comprehension-quest"
              ? "Expedition saved. Reading Quest will resume at the next chapter."
              : currentGame === "coding-sequence"
                ? "Factory saved. CodeBots will resume at the next bot build."
                : currentGame === "ghana-map-master"
                  ? "Survey saved. GeoQuest will resume at the next atlas beacon."
                  : currentGame === "money-math-market"
                    ? "Market saved. Cedi City will resume with the next customer."
                    : currentGame === "cyber-safety"
                      ? "CyberOps saved. Signal Shield will resume at the next incident."
                      : currentGame === "environment-guardian"
                        ? "EcoGrid saved. Community restoration will resume at the next project."
                        : currentGame === "body-explorer"
                          ? "BioLab saved. BioQuest will resume at the next human-systems case."
                          : currentGame === "culture-heritage"
                            ? "Style Studio saved. Your collection will resume at the next design brief."
                            : currentGame === "space-explorer"
                              ? "Mission Control saved. Solar Navigator will resume at the next flight checkpoint."
                              : "Mission saved. Nova Runner will resume from your next Knowledge Gate.");
    await refresh(studentId);
  });

  const loadLeaderboard = (game: LiveGame) => run(async () => {
    if (!data?.selected || !ageBand) return;
    const params = new URLSearchParams({ view: "leaderboard", studentId: data.selected.id, game, scope: "standard", period: "weekly", ageBand });
    setLeaderboardGame(game);
    setLeaderboard(await api(`/api/guardian/arcade?${params.toString()}`) as Leaderboard);
  });

  const progressFor = (game: LiveGame) => data?.progress.find((item) => item.game === game);
  const bloomProgress = progressFor("number-pop");
  const runnerProgress = progressFor("math");
  const typingProgress = progressFor("keyboard-ninja");
  const astroProgress = progressFor("force-motion-lab");
  const wordProgress = progressFor("word");
  const readingProgress = progressFor("comprehension-quest");
  const codeBotsProgress = progressFor("coding-sequence");
  const geoProgress = progressFor("ghana-map-master");
  const marketProgress = progressFor("money-math-market");
  const signalProgress = progressFor("cyber-safety");
  const ecoProgress = progressFor("environment-guardian");
  const bioProgress = progressFor("body-explorer");
  const styleProgress = progressFor("culture-heritage");
  const solarProgress = progressFor("space-explorer");
  const totalXp = useMemo(() => data?.progress.reduce((sum, item) => sum + item.xp, 0) ?? 0, [data?.progress]);
  const highestGameLevel = Math.max(bloomProgress?.level ?? 1, runnerProgress?.level ?? 1, typingProgress?.level ?? 1, astroProgress?.level ?? 1, wordProgress?.level ?? 1, readingProgress?.level ?? 1, codeBotsProgress?.level ?? 1, geoProgress?.level ?? 1, marketProgress?.level ?? 1, signalProgress?.level ?? 1, ecoProgress?.level ?? 1, bioProgress?.level ?? 1, styleProgress?.level ?? 1, solarProgress?.level ?? 1);
  const bloomEligible = ageBand === "age_4_5";
  const astroEligible = ageBand === "age_9_11" || ageBand === "age_12_14" || ageBand === "age_15_18";
  const wordEligible = ageBand !== "age_4_5";
  const readingEligible = astroEligible;
  const codeBotsEligible = astroEligible;
  const geoEligible = astroEligible;
  const marketEligible = wordEligible;
  const signalEligible = astroEligible;
  const ecoEligible = wordEligible;
  const bioEligible = wordEligible;
  const styleEligible = wordEligible;
  const solarEligible = wordEligible;

  const cards: GameCard[] = [
    { game:"number-pop", className:"word-card", title:"Number Bloom", description:"Grow a calm picture garden made for ages 4–5. Touch and count flowers, seeds and tiny creatures, match numerals to quantities, compare groups and make numbers without an answer countdown.", tags:["Early numeracy","Age 4–5","Touch-first","Untimed","Free Grow"], eligible:bloomEligible, lockedLabel:"AGE 4–5", progress:bloomProgress, playLabel:"Play Number Bloom", continueLabel:"Continue Number Bloom" },
    { game:"math", className:"primary", title:"Nova Runner", description:"Race through an original sci-fi world. Jump hazards, collect Nova energy and enter Knowledge Gates where mathematics changes with the learner’s level and recent play.", tags:["Mathematics","Adaptive Director","Runner","Keyboard + touch","5–10 min"], eligible:true, lockedLabel:"", progress:runnerProgress, playLabel:"Play Nova Runner", continueLabel:"Continue Nova Runner", primary:true },
    { game:"keyboard-ninja", className:"turbo-card", title:"TurboType", description:"Race by typing exact targets. Every correct character moves your vehicle; accuracy, WPM and troublesome keys shape future practice.", tags:["ICT","Typing","Weak-key training","Adaptive"], eligible:true, lockedLabel:"", progress:typingProgress, playLabel:"Play TurboType", continueLabel:"Continue TurboType" },
    { game:"force-motion-lab", className:"astro-card", title:"AstroLab Defender", description:"Defend a living research station by reading real force-and-motion telemetry, choosing science responses and managing shields, reactor power and navigation.", tags:["Science","NovaCore physics","Systems strategy","Adaptive"], eligible:astroEligible, lockedLabel:"AGE 9+", progress:astroProgress, playLabel:"Play AstroLab", continueLabel:"Continue AstroLab" },
    { game:"word", className:"word-card", title:"Word Kingdom", description:"Protect a fantasy kingdom from the Shadow Scribe. Vocabulary, grammar, opposites, meaning and sentence choices become rune gates while mana and castle defence create a real quest loop.", tags:["English","Vocabulary + grammar","Castle defence","Adaptive"], eligible:wordEligible, lockedLabel:"AGE 6+", progress:wordProgress, playLabel:"Play Word Kingdom", continueLabel:"Continue Word Kingdom" },
    { game:"comprehension-quest", className:"word-card", title:"Reading Quest", description:"Explore branching routes through short stories, reports and real-world texts. Collect evidence and make defensible reading decisions without losing to a reading clock.", tags:["English","Reading comprehension","Evidence + inference","Branching exploration"], eligible:readingEligible, lockedLabel:"AGE 9+", progress:readingProgress, playLabel:"Play Reading Quest", continueLabel:"Continue Reading Quest" },
    { game:"coding-sequence", className:"astro-card", title:"CodeBots Logic Factory", description:"Build executable command racks for robot workers. Sequence algorithms, loops, conditions and debugging without turning coding into a decorated quiz.", tags:["Computing","Algorithms + logic","Robot factory","Adaptive"], eligible:codeBotsEligible, lockedLabel:"AGE 9+", progress:codeBotsProgress, playLabel:"Play CodeBots", continueLabel:"Continue CodeBots" },
    { game:"ghana-map-master", className:"word-card", title:"GeoQuest Ghana Expedition", description:"Travel across a living Ghana atlas, choose field routes, scan unknown beacons and map regions, capitals, borders and major geographic features.", tags:["Social Studies","Ghana geography","Atlas expedition","Adaptive"], eligible:geoEligible, lockedLabel:"AGE 9+", progress:geoProgress, playLabel:"Play GeoQuest", continueLabel:"Continue GeoQuest" },
    { game:"money-math-market", className:"market-card", title:"Cedi City Market", description:"Run a Ghana-currency market. Serve customers, read baskets and receipts, manage stock and grow from change-making into budgets, discounts, profit and percentage decisions.", tags:["Mathematics","Financial literacy","Ghana cedi","Market simulation","Adaptive"], eligible:marketEligible, lockedLabel:"AGE 6+", progress:marketProgress, playLabel:"Play Cedi City Market", continueLabel:"Continue Cedi City" },
    { game:"cyber-safety", className:"signal-card", title:"Signal Shield", description:"Operate a school CyberOps centre. Inspect suspicious signals, protect accounts and privacy, contain incidents and practise defensive digital citizenship.", tags:["ICT","Cyber safety","Digital citizenship","Network defence simulation","Adaptive"], eligible:signalEligible, lockedLabel:"AGE 9+", progress:signalProgress, playLabel:"Play Signal Shield", continueLabel:"Continue Signal Shield" },
    { game:"environment-guardian", className:"word-card", title:"EcoGrid Ghana", description:"Restore a living Ghanaian community by balancing water, waste, energy, habitat and climate resilience through untimed systems-level environmental planning.", tags:["Environmental Studies","Water + waste","Climate resilience","Community strategy","Adaptive"], eligible:ecoEligible, lockedLabel:"AGE 6+", progress:ecoProgress, playLabel:"Play EcoGrid Ghana", continueLabel:"Continue EcoGrid" },
    { game:"body-explorer", className:"astro-card", title:"BioQuest: Human Systems", description:"Enter a virtual anatomy lab and connect organs and body systems through fictional educational cases, clue-only BioScans and whole-body reasoning.", tags:["Science","Human biology","Anatomy + physiology","Systems lab","Adaptive"], eligible:bioEligible, lockedLabel:"AGE 6+", progress:bioProgress, playLabel:"Play BioQuest", continueLabel:"Continue BioQuest" },
    { game:"culture-heritage", className:"word-card", title:"Style Studio Ghana", description:"Open a real dress-up studio with Free Style, fitting-room mix-and-match and animated runway reveals, then solve design briefs about Ghanaian weaving heritage, pattern, function, repair and source respect. Personal style is never marked wrong.", tags:["Creative Arts","Dress + design","Ghana textile heritage","Free Style + missions","Untimed"], eligible:styleEligible, lockedLabel:"AGE 6+", progress:styleProgress, playLabel:"Play Style Studio", continueLabel:"Continue Style Studio" },
    { game:"space-explorer", className:"astro-card", title:"Solar Navigator: Mission Control", description:"Command Solar System missions from a deep-space console. Read planetary telemetry, spend Star Scans, manage fuel and navigation integrity, and lock evidence-based flight plans.", tags:["Science","Astronomy","Planets + moons","Mission control","Adaptive"], eligible:solarEligible, lockedLabel:"AGE 6+", progress:solarProgress, playLabel:"Launch Solar Navigator", continueLabel:"Continue Solar Navigator" },
  ];

  if (round && data?.selected) return <div className="nova-arcade">
    {round.game === "number-pop"
      ? <NumberBloomGarden learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
      : round.game === "keyboard-ninja"
        ? <TurboType learnerName={data.selected.name} round={round} onComplete={(answers, telemetry) => void finishRound(answers, telemetry)} onExit={(answers, telemetry) => void exitRound(answers, telemetry)}/>
        : round.game === "force-motion-lab"
          ? <AstroLabDefender learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
          : round.game === "word"
            ? <WordKingdom learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
            : round.game === "comprehension-quest"
              ? <ReadingQuest learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
              : round.game === "coding-sequence"
                ? <CodeBotsFactory learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
                : round.game === "ghana-map-master"
                  ? <GeoQuest learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
                  : round.game === "money-math-market"
                    ? <CediCityMarket learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
                    : round.game === "cyber-safety"
                      ? <SignalShield learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
                      : round.game === "environment-guardian"
                        ? <EcoGridGhana learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
                        : round.game === "body-explorer"
                          ? <BioQuestHumanSystems learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
                          : round.game === "culture-heritage"
                            ? <StyleStudioGhana learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
                            : round.game === "space-explorer"
                              ? <SolarNavigatorMissionControl learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
                              : <NovaRunner learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>}
    {busy ? <div className="nova-arcade-message">Saving game progress…</div> : null}
    {error ? <div className="nova-arcade-alert" role="alert">{error}</div> : null}
  </div>;

  if (result) {
    const resultGame = result.game as LiveGame;
    const bloomResult = resultGame === "number-pop";
    const typingResult = resultGame === "keyboard-ninja";
    const astroResult = resultGame === "force-motion-lab";
    const wordResult = resultGame === "word";
    const readingResult = resultGame === "comprehension-quest";
    const codeBotsResult = resultGame === "coding-sequence";
    const geoResult = resultGame === "ghana-map-master";
    const marketResult = resultGame === "money-math-market";
    const signalResult = resultGame === "cyber-safety";
    const ecoResult = resultGame === "environment-guardian";
    const bioResult = resultGame === "body-explorer";
    const styleResult = resultGame === "culture-heritage";
    const solarResult = resultGame === "space-explorer";
    const unit = bloomResult ? "garden number choices" : typingResult ? "typing checkpoints" : astroResult ? "science anomalies" : wordResult ? "kingdom runes" : readingResult ? "evidence chapters" : codeBotsResult ? "bot programs" : geoResult ? "atlas beacons" : marketResult ? "customer receipts" : signalResult ? "security incidents" : ecoResult ? "restoration projects" : bioResult ? "human-systems cases" : styleResult ? "objective design briefs" : solarResult ? "navigation checkpoints" : "Knowledge Gates";
    const kicker = bloomResult ? "NUMBER BLOOM · GARDEN COMPLETE" : typingResult ? "TURBOTYPE · RACE COMPLETE" : astroResult ? "ASTROLAB DEFENDER · LAB SECURED" : wordResult ? "WORD KINGDOM · CROWN SECURED" : readingResult ? "READING QUEST · MYSTERY MAPPED" : codeBotsResult ? "CODEBOTS · FACTORY ONLINE" : geoResult ? "GEOQUEST · ATLAS COMPLETE" : marketResult ? "CEDI CITY · MARKET CLOSED" : signalResult ? "SIGNAL SHIELD · NETWORK SECURED" : ecoResult ? "ECOGRID GHANA · COMMUNITY RESTORED" : bioResult ? "BIOQUEST · SYSTEMS STABILISED" : styleResult ? "STYLE STUDIO GHANA · COLLECTION COMPLETE" : solarResult ? "SOLAR NAVIGATOR · COURSE COMPLETE" : "NOVA RUNNER · MISSION COMPLETE";
    const replayLabel = bloomResult ? "garden" : typingResult ? "race" : astroResult ? "defence mission" : wordResult ? "quest" : readingResult ? "expedition" : codeBotsResult ? "factory run" : geoResult ? "survey" : marketResult ? "market shift" : signalResult ? "CyberOps shift" : ecoResult ? "restoration shift" : bioResult ? "BioLab shift" : styleResult ? "design collection" : solarResult ? "navigation mission" : "mission";
    const perfectTitle = bloomResult ? "Beautiful number garden!" : typingResult ? "Perfect precision!" : astroResult ? "Lab fully stabilised!" : wordResult ? "Crown restored!" : readingResult ? "Mystery solved!" : codeBotsResult ? "Factory flawless!" : geoResult ? "Atlas mastered!" : marketResult ? "Market master!" : signalResult ? "Network guardian!" : ecoResult ? "EcoGrid fully restored!" : bioResult ? "Human systems master!" : styleResult ? "Design brief master!" : solarResult ? "Solar System navigator!" : "Legendary run!";
    return <div className="nova-finish">
      <section className="nova-finish-card">
        <div className="nova-finish-top"><div className="nova-finish-mark"><Trophy size={34}/></div><span className="nova-arcade-kicker">{kicker}</span><h1>{result.stars === 3 ? perfectTitle : result.stars === 2 ? "Strong mission!" : "World cleared!"}</h1><p>{styleResult ? `${result.correct ?? 0}/${result.roundLength} objective design briefs cleared. Free Style choices are never graded.` : bloomResult ? `${result.correct ?? 0}/${result.roundLength} number patches solved. Free Grow is never graded.` : `${result.correct ?? 0}/${result.roundLength} ${unit} cleared correctly. The Adaptive Director will use this performance for the next game.`}</p><div className="nova-rewards"><div><strong>{result.stars}/3</strong><span>Stars</span></div><div><strong>+{result.xp}</strong><span>XP</span></div><div><strong>{result.score ?? 0}</strong><span>Score</span></div></div></div>
        <div className="nova-result-list">{result.questions.map((question, index) => <div className={`nova-result ${question.correct ? "good" : "bad"}`} key={question.id}><div className="nova-result-icon">{question.correct ? <Check size={18}/> : <X size={18}/>}</div><div><p>{question.prompt}</p><small>{question.correct ? `Correct — ${displayAnswer(result.answers[index])}` : `You entered ${displayAnswer(result.answers[index])}. Target: ${displayAnswer(question.answer)}. ${question.explanation ?? ""}`}</small></div></div>)}</div>
        <div className="nova-finish-actions"><button type="button" onClick={() => { setResult(null); void startGame(resultGame); }} disabled={busy}><RefreshCw size={16}/> Play another {replayLabel}</button><button type="button" onClick={() => setResult(null)}>Back to Arcade</button></div>
      </section>
    </div>;
  }

  return <div className="nova-arcade">
    <section className="nova-arcade-hero">
      <div className="nova-arcade-hero-copy"><span className="nova-arcade-kicker"><Sparkles size={13}/> SUKUUNOVA LEARNING ARCADE</span><h1>Learn inside the adventure.</h1><p>Real gameplay, adaptive school learning and measurable skill progression now share one Arcade universe.</p></div>
      <div className="nova-arcade-hero-card"><div className="nova-arcade-avatar">{data?.selected?.name?.trim()?.[0]?.toUpperCase() ?? "N"}</div><div><small>PLAYER</small><strong>{data?.selected?.name ?? (loading ? "Loading learner…" : "Choose a learner")}</strong><div className="nova-arcade-stat-grid"><div><b>{highestGameLevel}</b><span>Highest game level</span></div><div><b>{data?.streak ?? 0}</b><span>Day streak</span></div><div><b>{totalXp}</b><span>Total XP</span></div></div></div></div>
    </section>

    {error ? <div className="nova-arcade-alert" role="alert">{error}</div> : null}
    {message ? <div className="nova-arcade-message">{message}</div> : null}

    <div className="nova-arcade-toolbar"><div><h2>Choose your mission</h2><p>Only experiences that meet the new game standard appear as playable.</p></div>{data?.children?.length ? <select className="nova-arcade-select" aria-label="Learner" value={data.selected?.id ?? ""} onChange={(event) => void refresh(event.target.value)} disabled={loading || busy}>{data.children.map((child) => <option key={child.id} value={child.id}>{child.name} · {child.class?.name ?? "No class"}</option>)}</select> : null}</div>

    {data?.selected ? <ArcadeProgressionHub key={data.selected.id} studentId={data.selected.id} playerName={data.selected.name}/> : null}

    <div className="nova-game-grid">
      {cards.map((card) => <article className={`nova-game-card ${card.className}`} key={card.game}>
        {!card.primary ? <span className={`nova-coming ${card.eligible ? "live" : ""}`}>{card.eligible ? "LIVE" : card.lockedLabel}</span> : null}
        <ArcadeGameLogo game={card.game}/><h3>{card.title}</h3><p>{card.description}</p>
        <div className="nova-game-tags">{card.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="nova-game-actions"><button className="nova-play-button" type="button" onClick={() => void startGame(card.game)} disabled={busy || loading || !data?.selected || !ageBand || !card.eligible}><Play size={17} fill="currentColor"/>{card.eligible ? (card.progress?.rounds ? card.continueLabel : card.playLabel) : `Available for ${card.lockedLabel.replace("AGE ", "Age ")}`}</button><button className={card.primary ? "nova-rank-button" : "nova-secondary-button"} type="button" onClick={() => void loadLeaderboard(card.game)} disabled={busy || !data?.selected || !ageBand || !card.eligible}><Medal size={16}/>{card.primary ? "Weekly ranking" : "Ranking"}</button></div>
        {card.primary && data?.allowedAgeBands?.length ? <div className="nova-game-actions"><label htmlFor="nova-age" className="nova-age-label">Learning band</label><select id="nova-age" className="nova-arcade-select" value={ageBand} onChange={(event) => setAgeBand(event.target.value as AgeBand)}>{data.allowedAgeBands.map((age) => <option key={age} value={age}>{ageLabels[age]}</option>)}</select></div> : null}
      </article>)}
    </div>

    {leaderboard ? <section className="nova-arcade-panel"><div className="nova-arcade-panel-head"><div><h3>{gameLabels[leaderboardGame]} · Weekly school-standard ranking</h3><p>Ranking stays inside the learner’s permitted school context.</p></div><Trophy size={22}/></div><div className="nova-leaderboard">{leaderboard.rows.length ? leaderboard.rows.map((row) => <div className="nova-leader-row" key={row.studentId}><b>#{row.rank}</b><strong>{row.displayName}</strong><span>{row.bestScore} best</span><span>{row.totalXp} XP · {row.rounds} runs</span></div>) : <div className="nova-empty">No ranked games yet. Be the first this week.</div>}</div></section> : null}

    <section className="nova-arcade-panel"><div className="nova-arcade-panel-head"><div><h3>Arcade foundation</h3><p>Sixteen flagship experiences now share one adaptive learning director and one authoritative progression universe.</p></div><Gamepad2 size={22}/></div><div className="nova-game-tags"><span><Rocket size={12}/> real-time gameplay</span><span><Zap size={12}/> adaptive learning director</span><span>daily + weekly missions</span><span>achievement cabinet</span><span>early numeracy garden</span><span>NovaCore physics</span><span>typing telemetry</span><span>Ghana geography</span><span>financial literacy</span><span>cyber safety</span><span>environmental strategy</span><span>human biology</span><span>creative design + textile heritage</span><span>astronomy mission control</span><span>save/resume</span><span>school-scoped ranking</span><span>server-side grading</span></div></section>
  </div>;
}
