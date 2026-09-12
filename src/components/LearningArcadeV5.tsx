"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, CheckCircle2, RefreshCw, Sparkles, Star, Trophy } from "lucide-react";
import NovaRunner from "./NovaRunner";
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
import ChronicleVault from "./ChronicleVault";
import CircuitForge from "./CircuitForge";
import SolarNavigatorMissionControl from "./SolarNavigatorMissionControl";
import ArcadeGameLogo from "./ArcadeGameLogo";
import ArcadeV5LaunchPortal from "./ArcadeV5LaunchPortal";
import ArcadeV5GameShell from "./ArcadeV5GameShell";
import { playArcadeSound, unlockArcadeAudio } from "@/lib/arcade-audio";
import { ARCADE_V5_IDENTITIES, arcadeGameRewardCount, arcadeV5Identity, type ArcadeProgressionMode, type ArcadeV5GameKey } from "@/lib/arcade-v5-design";
import "./nova-learning-arcade.css";
import "./arcade-v5.css";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";
type LiveGame = ArcadeV5GameKey;
type Child = { id: string; name: string; classId: string | null; class: { name: string; level: string | null } | null };
type LegacyProgress = { game: string; rounds: number; xp: number; level: number; accuracy: number | null; badges: string[] };
type GameProgress = { game: string; rounds: number; v5Rounds: number; progressionMode: ArcadeProgressionMode; modeLabel: string; selectableNodes: boolean; nodeCount: number; highestCompletedNode: number | null; clearedThroughNode: number | null; unlockedNode: number | null; xp: number; stars: number; rewardCount: number; accuracy: number | null };
type Overview = { children: Child[]; selected: Child | null; progress: LegacyProgress[]; gameProgress: GameProgress[]; streak: number; recent: Array<{ id: string; game: string; correct: number; stars: number; difficulty: number; xp: number; score: number; roundLength: number }>; recommendedAgeBand: AgeBand | null; allowedAgeBands: AgeBand[] };
type QuestionScene = Record<string, unknown>;
type Question = { id: string; kind?: string; prompt: string; options: string[]; answer?: string; explanation?: string; correct?: boolean; scene?: QuestionScene };
type LearningPlan = { version: 1; targetDifficulty: number; masteryPercent: number | null; supportMode: "guided" | "supported" | "independent" | "challenge"; missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch"; speedScale: number; hazardDensity: number; hintStrength: 0 | 1 | 2; bossGate: boolean; worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel" };
type SessionRemix = { version: 1; seedId: string; mutationKey: string; progressionMode: ArcadeProgressionMode; progressionNode: number | null; worldState: string; missionFrame: string; pressureProfile: string; objectiveModifier: string; encounterPattern: string; bonusCondition: string; varietyFloor: number };
type Round = { id: string; studentId: string; game: string; difficulty: number; status: string; answers: string[]; correct: number | null; xp: number; stars: number; ageBand: AgeBand | null; roundLength: number; score: number | null; questions: Question[]; learningPlan?: LearningPlan | null; progressionMode?: ArcadeProgressionMode; progressionNode?: number | null; progressionNodeName?: string | null; sessionRemix?: SessionRemix | null; selectedLevel?: number | null; levelName?: string | null };
type Leaderboard = { rows: Array<{ rank: number; studentId: string; displayName: string; bestScore: number; totalXp: number; rounds: number }> };
type GameInfo = { minAgeRank: number; lockedLabel: string; description: string; tags: readonly string[] };

const AGE_LABELS: Record<AgeBand, string> = { age_4_5: "Age 4–5", age_6_8: "Age 6–8", age_9_11: "Age 9–11", age_12_14: "Age 12–14", age_15_18: "Age 15–18" };
const AGE_RANK: Record<AgeBand, number> = { age_4_5: 0, age_6_8: 1, age_9_11: 2, age_12_14: 3, age_15_18: 4 };
const GAMES = Object.keys(ARCADE_V5_IDENTITIES) as LiveGame[];
const INFO: Record<LiveGame, GameInfo> = {
  math: { minAgeRank:1, lockedLabel:"AGE 6+", description:"High-speed adaptive mathematics across a changing sci-fi causeway.", tags:["Mathematics","Endless runner","Adaptive"] },
  "keyboard-ninja": { minAgeRank:1, lockedLabel:"AGE 6+", description:"Precision typing races that learn weak keys, accuracy and pace.", tags:["ICT","Typing","Tournament"] },
  "force-motion-lab": { minAgeRank:2, lockedLabel:"AGE 9+", description:"Defend a research station using force, motion and systems reasoning.", tags:["Science","Physics","Survival"] },
  "circuit-logic": { minAgeRank:2, lockedLabel:"AGE 9+", description:"Restore a school microgrid through circuit engineering and fault diagnosis.", tags:["Science","Electricity","Contracts"] },
  word: { minAgeRank:1, lockedLabel:"AGE 6+", description:"Recover vocabulary and grammar runes across a fantasy kingdom.", tags:["English","Vocabulary","Adventure"] },
  "comprehension-quest": { minAgeRank:2, lockedLabel:"AGE 9+", description:"Explore stories and reports through evidence, inference and source reasoning.", tags:["English","Reading","Expedition"] },
  "coding-sequence": { minAgeRank:2, lockedLabel:"AGE 9+", description:"Run a robot factory with algorithms, loops, conditions and debugging.", tags:["Computing","Algorithms","Factory jobs"] },
  "ghana-map-master": { minAgeRank:2, lockedLabel:"AGE 9+", description:"Travel a living Ghana atlas through regions, capitals and field routes.", tags:["Social Studies","Ghana","Expedition"] },
  "money-math-market": { minAgeRank:1, lockedLabel:"AGE 6+", description:"Operate a Ghana-currency market through change, budgets, profit and trade-offs.", tags:["Mathematics","Financial literacy","Simulation"] },
  "cyber-safety": { minAgeRank:2, lockedLabel:"AGE 9+", description:"Defend a school network through privacy, identity and cyber-safety decisions.", tags:["ICT","Cyber safety","Campaign"] },
  "environment-guardian": { minAgeRank:1, lockedLabel:"AGE 6+", description:"Restore Ghanaian districts through water, waste, energy and resilience systems.", tags:["Environment","Climate","Campaign"] },
  "body-explorer": { minAgeRank:1, lockedLabel:"AGE 6+", description:"Explore organs and coordinated human systems through fictional biology cases.", tags:["Science","Biology","Case adventure"] },
  "history-timeline": { minAgeRank:2, lockedLabel:"AGE 9+", description:"Repair a historical archive through chronology, sources and causal evidence.", tags:["History","Evidence","Investigation"] },
  "culture-heritage": { minAgeRank:1, lockedLabel:"AGE 6+", description:"Create looks freely or solve untimed design briefs about textiles, patterns, function, repair and Ghanaian weaving heritage.", tags:["Creative Arts","Textiles","Design studio"] },
  "space-explorer": { minAgeRank:1, lockedLabel:"AGE 6+", description:"Command Solar System missions by reading astronomy telemetry, managing navigation resources and plotting evidence-based spacecraft routes.", tags:["Science","Astronomy","Mission control"] },
};

async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(body) } : { cache:"no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? "Could not connect to the Learning Arcade.");
  return data;
}
function theme(game: LiveGame) {
  const identity = arcadeV5Identity(game);
  return { "--tile-accent":identity.accent, "--tile-accent-2":identity.accent2, "--tile-glow":identity.glow, "--tile-canvas":identity.canvas, "--tile-surface":identity.surface } as CSSProperties;
}

export default function LearningArcadeV5() {
  const [data,setData]=useState<Overview|null>(null),[round,setRound]=useState<Round|null>(null),[result,setResult]=useState<Round|null>(null),[portalGame,setPortalGame]=useState<LiveGame|null>(null),[selectedNode,setSelectedNode]=useState(1),[playedNode,setPlayedNode]=useState<number|null>(null),[ageBand,setAgeBand]=useState<AgeBand|"">(""),[leaderboard,setLeaderboard]=useState<Leaderboard|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const request=useRef(0),operation=useRef(false);
  const refresh=async(studentId="")=>{const version=++request.current;setLoading(true);setError("");try{const next=await api(`/api/guardian/arcade?studentId=${encodeURIComponent(studentId)}`) as Overview;if(version!==request.current)return;setData(next);setAgeBand(next.recommendedAgeBand??next.allowedAgeBands[0]??"");}catch(reason){if(version===request.current)setError(reason instanceof Error?reason.message:"Could not load Learning Arcade.");}finally{if(version===request.current)setLoading(false);}};
  useEffect(()=>{void refresh();return()=>{request.current+=1;};},[]);
  const run=async(action:()=>Promise<void>)=>{if(operation.current)return;operation.current=true;setBusy(true);setError("");try{await action();}catch(reason){setError(reason instanceof Error?reason.message:"The Arcade action could not be completed.");}finally{operation.current=false;setBusy(false);}};
  const progressFor=(game:LiveGame):GameProgress=>{const identity=arcadeV5Identity(game);return data?.gameProgress?.find((item)=>item.game===game)??{game,rounds:0,v5Rounds:0,progressionMode:identity.progression.mode,modeLabel:identity.progression.modeLabel,selectableNodes:identity.progression.selectableNodes,nodeCount:identity.progression.nodes.length,highestCompletedNode:null,clearedThroughNode:null,unlockedNode:identity.progression.selectableNodes?1:null,xp:0,stars:0,rewardCount:0,accuracy:null};};
  const currentAgeRank=ageBand?AGE_RANK[ageBand]:-1;
  const eligible=(game:LiveGame)=>currentAgeRank>=INFO[game].minAgeRank;
  const totalGameXp=useMemo(()=>GAMES.reduce((sum,game)=>sum+(data?.gameProgress?.find((item)=>item.game===game)?.xp??0),0),[data?.gameProgress]);

  const openPortal=(game:LiveGame)=>{if(!eligible(game))return;const progress=progressFor(game);setSelectedNode(progress.unlockedNode??1);setPortalGame(game);setLeaderboard(null);playArcadeSound("open",game);};
  const loadLeaderboard=(game:LiveGame)=>run(async()=>{if(!data?.selected||!ageBand)return;const params=new URLSearchParams({view:"leaderboard",studentId:data.selected.id,game,scope:"standard",period:"weekly",ageBand});setLeaderboard(await api(`/api/guardian/arcade?${params.toString()}`) as Leaderboard);});
  const startGame=(game:LiveGame,node?:number)=>run(async()=>{if(!data?.selected||!ageBand)return;unlockArcadeAudio();setPlayedNode(node??null);const next=await api("/api/guardian/arcade",{action:"start",studentId:data.selected.id,game,ageBand,roundLength:5,...(node?{node}: {})}) as Round;setRound(next);setResult(null);setPlayedNode(next.progressionNode??node??null);playArcadeSound("launch",game);});
  const finishRound=(answers:string[],typingTelemetry?:TurboTypeTelemetry)=>run(async()=>{if(!round)return;const game=round.game as LiveGame;const completed=await api("/api/guardian/arcade",{action:"save",roundId:round.id,answers,finish:true,...(typingTelemetry?{typingTelemetry}:{})}) as Round;setRound(null);setResult({...completed,progressionMode:round.progressionMode,progressionNode:round.progressionNode,progressionNodeName:round.progressionNodeName,sessionRemix:round.sessionRemix});setPortalGame(game);playArcadeSound(completed.stars===3?"unlock":"success",game);window.setTimeout(()=>playArcadeSound("reward",game),220);await refresh(completed.studentId);});
  const exitRound=(answers:string[],typingTelemetry?:TurboTypeTelemetry)=>run(async()=>{if(!round)return;const game=round.game as LiveGame;await api("/api/guardian/arcade",{action:"save",roundId:round.id,answers,finish:false,...(typingTelemetry?{typingTelemetry}:{})});const studentId=round.studentId;setRound(null);setPortalGame(game);await refresh(studentId);});

  if(round&&data?.selected){
    const game=round.game as LiveGame,identity=arcadeV5Identity(game),progression=identity.progression,node=round.progressionNode??playedNode,nodeName=round.progressionNodeName??(node?progression.nodes[node-1]:null);
    const sessionLabel=node&&nodeName?`${progression.unitLabel[0].toUpperCase()}${progression.unitLabel.slice(1)} ${node} · ${nodeName}`:progression.modeLabel;
    const sessionDetail=round.sessionRemix?`${round.sessionRemix.worldState} · ${round.sessionRemix.missionFrame} · ${round.sessionRemix.pressureProfile}`:"Adaptive session";
    const common={learnerName:data.selected.name,round,onComplete:(answers:string[])=>void finishRound(answers),onExit:(answers:string[])=>void exitRound(answers)};
    let gameView;
    switch(game){
      case "keyboard-ninja":gameView=<TurboType learnerName={data.selected.name} round={round} onComplete={(answers,telemetry)=>void finishRound(answers,telemetry)} onExit={(answers,telemetry)=>void exitRound(answers,telemetry)}/>;break;
      case "force-motion-lab":gameView=<AstroLabDefender {...common}/>;break;
      case "circuit-logic":gameView=<CircuitForge {...common}/>;break;
      case "word":gameView=<WordKingdom {...common}/>;break;
      case "comprehension-quest":gameView=<ReadingQuest {...common}/>;break;
      case "coding-sequence":gameView=<CodeBotsFactory {...common}/>;break;
      case "ghana-map-master":gameView=<GeoQuest {...common}/>;break;
      case "money-math-market":gameView=<CediCityMarket {...common}/>;break;
      case "cyber-safety":gameView=<SignalShield {...common}/>;break;
      case "environment-guardian":gameView=<EcoGridGhana {...common}/>;break;
      case "body-explorer":gameView=<BioQuestHumanSystems {...common}/>;break;
      case "history-timeline":gameView=<ChronicleVault {...common}/>;break;
      case "culture-heritage":gameView=<StyleStudioGhana {...common}/>;break;
      case "space-explorer":gameView=<SolarNavigatorMissionControl {...common}/>;break;
      default:gameView=<NovaRunner {...common}/>;break;
    }
    return <ArcadeV5GameShell game={game} sessionLabel={sessionLabel} sessionDetail={sessionDetail}>{gameView}{busy?<div className="nova-arcade-message">Saving game progress…</div>:null}{error?<div className="nova-arcade-alert" role="alert">{error}</div>:null}</ArcadeV5GameShell>;
  }

  if(result){
    const game=result.game as LiveGame,identity=arcadeV5Identity(game),progression=identity.progression,progress=progressFor(game),reward=arcadeGameRewardCount(result.xp,result.stars),node=result.progressionNode??playedNode,nodeName=result.progressionNodeName??(node?progression.nodes[node-1]:null);
    const style={"--v5-accent":identity.accent,"--v5-accent-2":identity.accent2,"--v5-glow":identity.glow,"--v5-canvas":identity.canvas,"--v5-surface":identity.surface} as CSSProperties;
    const completionLabel=node?`${progression.unitLabel.toUpperCase()} ${node} COMPLETE`:`${progression.modeLabel} COMPLETE`;
    const resultTitle=result.stars===3?"Master performance!":result.stars===2?"Strong performance!":node?`${progression.unitLabel[0].toUpperCase()}${progression.unitLabel.slice(1)} cleared!`:`${progression.unitLabel[0].toUpperCase()}${progression.unitLabel.slice(1)} complete!`;
    return <div className="v5-result" style={style}><section className="v5-result-card"><div className="v5-result-hero"><ArcadeGameLogo game={game} size="hero"/><span className="v5-kicker">{completionLabel} · {identity.name.toUpperCase()}</span><h1>{resultTitle}</h1><p>{result.correct}/{result.roundLength} checkpoints correct. Replaying creates a fresh mission variation while the Adaptive Director responds to this performance.</p>{result.sessionRemix?<p><strong>Session DNA:</strong> {result.sessionRemix.worldState} · {result.sessionRemix.missionFrame} · {result.sessionRemix.encounterPattern}</p>:null}<div className="v5-result-rewards"><div><strong>{result.stars}/3</strong><span>Stars</span></div><div><strong>+{result.xp}</strong><span>Game XP</span></div><div><strong>+{reward}</strong><span>{identity.rewardName}</span></div><div><strong>{progression.selectableNodes?`${progress.unlockedNode??1}/${progress.nodeCount}`:progress.rounds}</strong><span>{progression.selectableNodes?`${progression.unitPlural} unlocked`:`${progression.unitPlural} played`}</span></div></div></div><div className="v5-result-actions"><button type="button" onClick={()=>{setResult(null);void startGame(game,node??undefined);}} disabled={busy}><RefreshCw size={15}/>{node?`Remix ${progression.unitLabel} ${node}`:progression.startLabel}</button><button type="button" onClick={()=>{setResult(null);setPortalGame(game);setSelectedNode(progress.unlockedNode??1);}}><Trophy size={15}/>{progression.modeLabel} hub</button></div></section></div>;
  }

  if(portalGame&&data?.selected){const progress=progressFor(portalGame);return <ArcadeV5LaunchPortal game={portalGame} progress={progress} selectedNode={selectedNode} playerId={data.selected.id} leaderboard={leaderboard} leaderboardBusy={busy} onSelectNode={setSelectedNode} onLaunch={(node)=>void startGame(portalGame,node)} onBack={()=>{setPortalGame(null);setLeaderboard(null);}} onRefreshLeaderboard={()=>void loadLeaderboard(portalGame)}/>;}

  return <main className="v5-arcade">
    <div className="v5-arcade-top"><div><span className="v5-kicker"><Sparkles size={12}/> SUKUUNOVA ARCADE V5</span><h1>Choose a world. Never expect one script.</h1><p>Every flagship has its own genre, progression, rewards and ranking. Some are endless. Some are adventures, simulations, campaigns, expeditions, survival games, tournaments, contracts or navigation missions.</p></div><div className="v5-arcade-player"><b>{data?.selected?.name?.trim()?.[0]?.toUpperCase()??"N"}</b><div><span>PLAYER</span><strong>{data?.selected?.name??(loading?"Loading…":"Choose learner")}</strong><small>{totalGameXp} XP across all worlds · {data?.streak??0} day streak</small></div></div></div>
    {error?<div className="nova-arcade-alert" role="alert">{error}</div>:null}
    <div className="v5-arcade-toolbar"><div><strong>Game worlds</strong><p>Progression, rewards and rankings stay game-specific. Session content keeps adapting and remixing.</p></div><div>{data?.children?.length?<select aria-label="Learner" value={data.selected?.id??""} onChange={(event)=>void refresh(event.target.value)} disabled={busy||loading}>{data.children.map((child)=><option key={child.id} value={child.id}>{child.name} · {child.class?.name??"No class"}</option>)}</select>:null}{data?.allowedAgeBands?.length?<select aria-label="Learning band" value={ageBand} onChange={(event)=>setAgeBand(event.target.value as AgeBand)}>{data.allowedAgeBands.map((age)=><option key={age} value={age}>{AGE_LABELS[age]}</option>)}</select>:null}</div></div>
    <div className="v5-arcade-grid">{GAMES.map((game)=>{const identity=arcadeV5Identity(game),progression=identity.progression,progress=progressFor(game),allowed=eligible(game);return <button type="button" className="v5-game-tile" key={game} style={theme(game)} onClick={()=>openPortal(game)} disabled={!allowed}><div className="v5-game-tile-top"><ArcadeGameLogo game={game}/><span className="v5-live-pill">{allowed?progression.modeLabel:INFO[game].lockedLabel}</span></div><span>{identity.world}</span><h2>{identity.name}</h2><p>{INFO[game].description}</p><div className="v5-game-tile-stats"><div><b>{progression.selectableNodes?`${progress.unlockedNode??1}/${progress.nodeCount}`:progress.rounds}</b><small>{progression.selectableNodes?`${progression.unitPlural} open`:progression.unitPlural}</small></div><div><b>{progress.rewardCount}</b><small>{identity.rewardName}</small></div><div><b>{progress.accuracy===null?"—":`${progress.accuracy}%`}</b><small>accuracy</small></div></div><div className="v5-game-tile-footer"><strong>{INFO[game].tags.join(" · ")}</strong><span>{allowed?<>Open world <ArrowRight size={13}/></>:<>Locked</>}</span></div></button>;})}</div>
    <section className="nova-arcade-panel"><div className="nova-arcade-panel-head"><div><h3>Designed for deep learning engagement</h3><p>Clear goals, learner choice, mastery, procedural variety, immediate feedback and game-specific progression—without casino-style rewards or punitive dark patterns.</p></div><CheckCircle2 size={22}/></div><div className="nova-game-tags"><span><Star size={12}/> per-game rewards</span><span>genre-specific progression</span><span>1.2M+ session DNA combinations</span><span>fullscreen + focus mode</span><span>music + action SFX</span><span>mobile + desktop</span><span>adaptive challenge</span><span>server-side grading</span></div></section>
  </main>;
}
