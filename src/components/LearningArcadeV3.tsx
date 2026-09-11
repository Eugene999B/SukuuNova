"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gamepad2, Medal, Play, RefreshCw, Rocket, Sparkles, Trophy, X, Zap } from "lucide-react";
import NovaRunner from "./NovaRunner";
import TurboType, { type TurboTypeTelemetry } from "./TurboType";
import AstroLabDefender from "./AstroLabDefender";
import ArcadeProgressionHub from "./ArcadeProgressionHub";
import ArcadeGameLogo from "./ArcadeGameLogo";
import "./nova-learning-arcade.css";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";
type LiveGame = "math" | "keyboard-ninja" | "force-motion-lab";
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
type Question = { id: string; kind?: string; prompt: string; options: string[]; answer?: string; explanation?: string; correct?: boolean; scene?: { cue?: string; meterLabels?: string[] } };
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

const ageLabels: Record<AgeBand, string> = {
  age_4_5: "Age 4–5", age_6_8: "Age 6–8", age_9_11: "Age 9–11", age_12_14: "Age 12–14", age_15_18: "Age 15–18",
};
const gameLabels: Record<LiveGame, string> = { math: "Nova Runner", "keyboard-ninja": "TurboType", "force-motion-lab": "AstroLab Defender" };

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
    setMessage(`${completedGame === "keyboard-ninja" ? "Race" : completedGame === "force-motion-lab" ? "Defence mission" : "Mission"} complete — ${completed.xp} XP earned.`);
    await refresh(completed.studentId);
  });

  const exitRound = (answers: string[], typingTelemetry?: TurboTypeTelemetry) => run(async () => {
    if (!round) return;
    const currentGame = round.game;
    await api("/api/guardian/arcade", { action: "save", roundId: round.id, answers, finish: false, ...(typingTelemetry ? { typingTelemetry } : {}) });
    const studentId = round.studentId;
    setRound(null);
    setMessage(currentGame === "keyboard-ninja"
      ? "Race saved. TurboType will resume at your next checkpoint."
      : currentGame === "force-motion-lab"
        ? "Lab secured. AstroLab Defender will resume at the next anomaly."
        : "Mission saved. Nova Runner will resume from your next Knowledge Gate.");
    await refresh(studentId);
  });

  const loadLeaderboard = (game: LiveGame) => run(async () => {
    if (!data?.selected || !ageBand) return;
    const params = new URLSearchParams({ view: "leaderboard", studentId: data.selected.id, game, scope: "standard", period: "weekly", ageBand });
    setLeaderboardGame(game);
    setLeaderboard(await api(`/api/guardian/arcade?${params.toString()}`) as Leaderboard);
  });

  const runnerProgress = useMemo(() => data?.progress.find((item) => item.game === "math"), [data?.progress]);
  const typingProgress = useMemo(() => data?.progress.find((item) => item.game === "keyboard-ninja"), [data?.progress]);
  const astroProgress = useMemo(() => data?.progress.find((item) => item.game === "force-motion-lab"), [data?.progress]);
  const totalXp = useMemo(() => data?.progress.reduce((sum, item) => sum + item.xp, 0) ?? 0, [data?.progress]);
  const highestGameLevel = Math.max(runnerProgress?.level ?? 1, typingProgress?.level ?? 1, astroProgress?.level ?? 1);
  const astroEligible = ageBand === "age_9_11" || ageBand === "age_12_14" || ageBand === "age_15_18";

  if (round && data?.selected) return <div className="nova-arcade">
    {round.game === "keyboard-ninja"
      ? <TurboType learnerName={data.selected.name} round={round} onComplete={(answers, telemetry) => void finishRound(answers, telemetry)} onExit={(answers, telemetry) => void exitRound(answers, telemetry)}/>
      : round.game === "force-motion-lab"
        ? <AstroLabDefender learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>
        : <NovaRunner learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRound(answers)} onExit={(answers) => void exitRound(answers)}/>} 
    {busy ? <div className="nova-arcade-message">Saving game progress…</div> : null}
    {error ? <div className="nova-arcade-alert" role="alert">{error}</div> : null}
  </div>;

  if (result) {
    const resultGame = result.game as LiveGame;
    const typingResult = resultGame === "keyboard-ninja";
    const astroResult = resultGame === "force-motion-lab";
    const unit = typingResult ? "typing checkpoints" : astroResult ? "science anomalies" : "Knowledge Gates";
    const kicker = typingResult ? "TURBOTYPE · RACE COMPLETE" : astroResult ? "ASTROLAB DEFENDER · LAB SECURED" : "NOVA RUNNER · MISSION COMPLETE";
    const replayLabel = typingResult ? "race" : astroResult ? "defence mission" : "mission";
    return <div className="nova-finish">
      <section className="nova-finish-card">
        <div className="nova-finish-top"><div className="nova-finish-mark"><Trophy size={34}/></div><span className="nova-arcade-kicker">{kicker}</span><h1>{result.stars === 3 ? (typingResult ? "Perfect precision!" : astroResult ? "Lab fully stabilised!" : "Legendary run!") : result.stars === 2 ? "Strong mission!" : "World cleared!"}</h1><p>{result.correct}/{result.roundLength} {unit} cleared correctly. The Adaptive Director will use this performance for the next game.</p><div className="nova-rewards"><div><strong>{result.stars}/3</strong><span>Stars</span></div><div><strong>+{result.xp}</strong><span>XP</span></div><div><strong>{result.score ?? 0}</strong><span>Score</span></div></div></div>
        <div className="nova-result-list">{result.questions.map((question, index) => <div className={`nova-result ${question.correct ? "good" : "bad"}`} key={question.id}><div className="nova-result-icon">{question.correct ? <Check size={18}/> : <X size={18}/>}</div><div><p>{question.prompt}</p><small>{question.correct ? `Correct — ${result.answers[index]}` : `You entered ${result.answers[index] || "—"}. Target: ${question.answer ?? "—"}. ${question.explanation ?? ""}`}</small></div></div>)}</div>
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
      <article className="nova-game-card primary"><ArcadeGameLogo game="math"/><h3>Nova Runner</h3><p>Race through an original sci-fi world. Jump hazards, collect Nova energy and enter Knowledge Gates where mathematics changes with the learner’s level and recent play.</p><div className="nova-game-tags"><span>Mathematics</span><span>Adaptive Director</span><span>Runner</span><span>Keyboard + touch</span><span>5–10 min</span></div><div className="nova-game-actions"><button className="nova-play-button" type="button" onClick={() => void startGame("math")} disabled={busy || loading || !data?.selected || !ageBand}><Play size={17} fill="currentColor"/>{busy ? "Preparing world…" : runnerProgress?.rounds ? "Continue Nova Runner" : "Play Nova Runner"}</button><button className="nova-rank-button" type="button" onClick={() => void loadLeaderboard("math")} disabled={busy || !data?.selected || !ageBand}><Medal size={16}/>Weekly ranking</button></div>{data?.allowedAgeBands?.length ? <div className="nova-game-actions"><label htmlFor="nova-age" className="nova-age-label">Learning band</label><select id="nova-age" className="nova-arcade-select" value={ageBand} onChange={(event) => setAgeBand(event.target.value as AgeBand)}>{data.allowedAgeBands.map((age) => <option key={age} value={age}>{ageLabels[age]}</option>)}</select></div> : null}</article>
      <article className="nova-game-card turbo-card"><span className="nova-coming live">LIVE</span><ArcadeGameLogo game="keyboard-ninja"/><h3>TurboType</h3><p>Race by typing exact targets. Every correct character moves your vehicle; accuracy, WPM and troublesome keys shape future practice.</p><div className="nova-game-tags"><span>ICT</span><span>Typing</span><span>Weak-key training</span><span>Adaptive</span></div><div className="nova-game-actions"><button className="nova-play-button" type="button" onClick={() => void startGame("keyboard-ninja")} disabled={busy || loading || !data?.selected || !ageBand}><Play size={17} fill="currentColor"/>{typingProgress?.rounds ? "Continue TurboType" : "Play TurboType"}</button><button className="nova-secondary-button" type="button" onClick={() => void loadLeaderboard("keyboard-ninja")} disabled={busy || !data?.selected || !ageBand}><Medal size={16}/>Ranking</button></div></article>
      <article className="nova-game-card astro-card"><span className={`nova-coming ${astroEligible ? "live" : ""}`}>{astroEligible ? "LIVE" : "AGE 9+"}</span><ArcadeGameLogo game="force-motion-lab"/><h3>AstroLab Defender</h3><p>Defend a living research station by reading real force-and-motion telemetry, choosing science responses and managing shields, reactor power and navigation.</p><div className="nova-game-tags"><span>Science</span><span>NovaCore physics</span><span>Systems strategy</span><span>Adaptive</span></div><div className="nova-game-actions"><button className="nova-play-button" type="button" onClick={() => void startGame("force-motion-lab")} disabled={busy || loading || !data?.selected || !ageBand || !astroEligible}><Play size={17} fill="currentColor"/>{astroEligible ? (astroProgress?.rounds ? "Continue AstroLab" : "Play AstroLab") : "Available from Age 9–11"}</button><button className="nova-secondary-button" type="button" onClick={() => void loadLeaderboard("force-motion-lab")} disabled={busy || !data?.selected || !ageBand || !astroEligible}><Medal size={16}/>Ranking</button></div></article>
    </div>

    {leaderboard ? <section className="nova-arcade-panel"><div className="nova-arcade-panel-head"><div><h3>{gameLabels[leaderboardGame]} · Weekly school-standard ranking</h3><p>Ranking stays inside the learner’s permitted school context.</p></div><Trophy size={22}/></div><div className="nova-leaderboard">{leaderboard.rows.length ? leaderboard.rows.map((row) => <div className="nova-leader-row" key={row.studentId}><b>#{row.rank}</b><strong>{row.displayName}</strong><span>{row.bestScore} best</span><span>{row.totalXp} XP · {row.rounds} runs</span></div>) : <div className="nova-empty">No ranked games yet. Be the first this week.</div>}</div></section> : null}

    <section className="nova-arcade-panel"><div className="nova-arcade-panel-head"><div><h3>Arcade foundation</h3><p>Three separate real game loops now share one adaptive learning director and one authoritative progression universe.</p></div><Gamepad2 size={22}/></div><div className="nova-game-tags"><span><Rocket size={12}/> real-time gameplay</span><span><Zap size={12}/> adaptive learning director</span><span>daily + weekly missions</span><span>achievement cabinet</span><span>NovaCore physics</span><span>typing telemetry</span><span>save/resume</span><span>school-scoped ranking</span><span>server-side grading</span></div></section>
  </div>;
}
